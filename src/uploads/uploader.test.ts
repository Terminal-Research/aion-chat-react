import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AION_FILES_MAXIMUM_UPLOAD_BYTES,
  AionFilesAttachmentUploadError,
  createAionFilesAttachmentUploader,
} from "./uploader";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION_ID = "33333333-3333-4333-8333-333333333333";
const DISTRIBUTION_ID = "44444444-4444-4444-8444-444444444444";
const OPERATION_ID = "55555555-5555-4555-8555-555555555555";
const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const EXPIRES_AT = "2026-09-03T13:00:00.000Z";

let fetchMock: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

beforeEach(() => {
  fetchMock = vi.fn<typeof globalThis.fetch>();
});

describe("createAionFilesAttachmentUploader", () => {
  it(
    "uploads MessagingMedia and returns only an exact-version grant",
    async () => {
      fetchMock
        .mockResolvedValueOnce(
          createResponse("https://api.example/protected"),
        )
        .mockResolvedValueOnce(grantResponse());
      const uploader = createUploader();
      const file = new File(["image"], "screen.png", {
        type: "image/png",
      });

      const uploaded = await uploader.upload(file, {
        signal: new AbortController().signal,
      });

      expect(uploaded).toEqual({
        url: "https://api.example/exact?grant=temporary-secret",
        name: "screen-normalized.png",
        mediaType: "image/png",
        size: file.size,
        expiresAt: EXPIRES_AT,
      });
      expect(uploaded.url).not.toContain("protected");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const [createUrl, createRequest] = fetchCall(0);
      const parsedCreateUrl = new URL(createUrl);
      expect(parsedCreateUrl.pathname).toBe("/files");
      expect(Object.fromEntries(parsedCreateUrl.searchParams)).toEqual({
        operationId: OPERATION_ID,
        organizationId: ORGANIZATION_ID,
        purpose: "MessagingMedia",
        byteSize: file.size.toString(),
        associationKind: "Distribution",
        associationId: DISTRIBUTION_ID,
      });
      expect(createRequest).toMatchObject({
        method: "POST",
        credentials: "omit",
        redirect: "error",
        headers: { authorization: "Bearer user-jwt" },
      });
      expect(createRequest.headers).not.toHaveProperty("content-type");
      const form = createRequest.body as FormData;
      expect(form.get("file")).toMatchObject({
        name: "screen.png",
        size: file.size,
        type: "image/png",
      });

      const [grantUrl, grantRequest] = fetchCall(1);
      const parsedGrantUrl = new URL(grantUrl);
      expect(parsedGrantUrl.pathname).toBe(
        `/files/${FILE_ID}/versions/${VERSION_ID}/grants`,
      );
      expect(parsedGrantUrl.searchParams.get("ttlSeconds")).toBe("3600");
      expect(grantRequest.body).toBeUndefined();
      expect(grantRequest.headers).toEqual({
        authorization: "Bearer user-jwt",
      });
    },
  );

  it("rejects an oversized file before resolving credentials", async () => {
    const token = vi.fn<() => Promise<string>>();
    token.mockResolvedValue("user-jwt");
    const uploader = createUploader({ getBearerToken: token });
    const file = new File(["x"], "large.bin");
    Object.defineProperty(file, "size", {
      value: AION_FILES_MAXIMUM_UPLOAD_BYTES + 1,
    });

    await expect(
      uploader.upload(file, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: "file_too_large",
      retryable: false,
    });
    expect(token).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops after create when the upload is canceled", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      controller.abort(new DOMException("Canceled", "AbortError"));
      return Promise.resolve(createResponse());
    });
    const uploader = createUploader();

    await expect(
      uploader.upload(new File(["x"], "draft.txt"), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires a user credential before uploading", async () => {
    const uploader = createUploader({
      getBearerToken: () => Promise.resolve(undefined),
    });

    await expect(
      uploader.upload(new File(["x"], "draft.txt"), {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "authentication_required",
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps one operation ID when the same File is retried", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("user-jwt network detail"))
      .mockResolvedValueOnce(createResponse())
      .mockResolvedValueOnce(grantResponse());
    const uploader = createUploader();
    const file = new File(["retry"], "retry.txt", {
      type: "text/plain",
    });

    await expect(
      uploader.upload(file, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      code: "upload_failed",
      message: "The attachment could not be uploaded to Aion.",
      retryable: true,
    });
    await expect(
      uploader.upload(file, { signal: new AbortController().signal }),
    ).resolves.toMatchObject({
      url: "https://api.example/exact?grant=temporary-secret",
    });

    const firstOperation = new URL(fetchCall(0)[0]).searchParams.get(
      "operationId",
    );
    const retryOperation = new URL(fetchCall(1)[0]).searchParams.get(
      "operationId",
    );
    expect(firstOperation).toBe(OPERATION_ID);
    expect(retryOperation).toBe(firstOperation);
  });

  it.each([
    ["mismatched", { versionId: "different-version" }],
    ["expired", { accessExpiresAt: "2026-09-03T11:59:59.000Z" }],
  ])(
    "rejects %s grants without exposing their URL",
    async (_case, overrides) => {
      fetchMock
        .mockResolvedValueOnce(createResponse())
        .mockResolvedValueOnce(grantResponse(overrides));
      const uploader = createUploader();
      let failure: unknown;

      try {
        await uploader.upload(new File(["x"], "draft.txt"), {
          signal: new AbortController().signal,
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(AionFilesAttachmentUploadError);
      expect(failure).toMatchObject({
        code: "invalid_file_response",
        retryable: false,
      });
      expect(JSON.stringify(failure)).not.toContain("temporary-secret");
    },
  );

  it("rejects grants over the server's one-hour maximum", () => {
    expect(() => createUploader({ grantTtlSeconds: 3601 })).toThrow(
      "grantTtlSeconds must be between 1 and 3600.",
    );
  });
});

function createUploader(
  overrides: Partial<
    Parameters<typeof createAionFilesAttachmentUploader>[0]
  > = {},
) {
  return createAionFilesAttachmentUploader({
    organizationId: ORGANIZATION_ID,
    association: { kind: "Distribution", id: DISTRIBUTION_ID },
    getBearerToken: () => Promise.resolve("user-jwt"),
    filesUrl: "https://api.example/files",
    fetch: fetchMock,
    createOperationId: () => OPERATION_ID,
    now: () => NOW,
    ...overrides,
  });
}

function createResponse(
  url = "https://api.example/files/protected",
): Response {
  return jsonResponse({
    id: FILE_ID,
    versionId: VERSION_ID,
    revision: 1,
    url,
    purpose: "MessagingMedia",
    metadata: {
      fileName: "screen-normalized.png",
      mediaType: "image/png",
      byteSize: 5,
      createdAt: "2026-09-03T12:00:00.000Z",
      retentionExpiresAt: EXPIRES_AT,
    },
    replayed: false,
  });
}

function grantResponse(
  overrides: Partial<{
    versionId: string;
    accessExpiresAt: string;
  }> = {},
): Response {
  return jsonResponse({
    id: FILE_ID,
    versionId: VERSION_ID,
    url: "https://api.example/exact?grant=temporary-secret",
    accessExpiresAt: EXPIRES_AT,
    retentionExpiresAt: EXPIRES_AT,
    ...overrides,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fetchCall(index: number): [string, RequestInit] {
  const call = fetchMock.mock.calls[index];
  if (typeof call?.[0] !== "string" || !call[1]) {
    throw new Error(`Expected fetch call ${index}.`);
  }
  return [call[0], call[1]];
}
