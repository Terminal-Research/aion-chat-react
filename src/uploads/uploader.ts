import type {
  AionAttachmentUploadOptions,
  AionAttachmentUploader,
  AionUploadedAttachment,
} from "../attachments";

/** Current Aion Files ingest maximum for one browser upload. */
export const AION_FILES_MAXIMUM_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Maximum lifetime accepted by the Aion exact-version grant route. */
export const AION_FILES_MAXIMUM_GRANT_SECONDS = 60 * 60;

/** Supported descriptive association for one chat attachment. */
export interface AionFilesAttachmentAssociation {
  readonly kind: "AgentIdentity" | "Distribution";
  readonly id: string;
}

/** Configuration for the authenticated Aion Files attachment uploader. */
export interface AionFilesAttachmentUploaderOptions {
  readonly organizationId: string;
  readonly association: AionFilesAttachmentAssociation;
  readonly getBearerToken: () => Promise<string | null | undefined>;
  readonly filesUrl?: string;
  readonly grantTtlSeconds?: number;
  readonly fetch?: typeof globalThis.fetch;
  readonly createOperationId?: () => string;
  readonly now?: () => number;
}

/** Stable error codes emitted by the Aion Files attachment uploader. */
export type AionFilesAttachmentUploadErrorCode =
  | "access_denied"
  | "authentication_required"
  | "credential_error"
  | "file_too_large"
  | "grant_failed"
  | "invalid_file_response"
  | "upload_failed";

/** Redaction-safe Aion Files upload failure. */
export class AionFilesAttachmentUploadError extends Error {
  readonly name = "AionFilesAttachmentUploadError";

  constructor(
    readonly code: AionFilesAttachmentUploadErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

interface FileCreateResponse {
  readonly id: string;
  readonly versionId: string;
  readonly metadata: {
    readonly fileName?: string | null;
    readonly mediaType: string;
    readonly byteSize: number;
  };
}

interface FileGrantResponse {
  readonly id: string;
  readonly versionId: string;
  readonly url: string;
  readonly accessExpiresAt: string;
}

function uploadError(
  code: AionFilesAttachmentUploadErrorCode,
  message: string,
  retryable: boolean,
  status?: number,
): AionFilesAttachmentUploadError {
  return new AionFilesAttachmentUploadError(
    code,
    message,
    retryable,
    status,
  );
}

function assertConfigured(value: string, name: string): void {
  if (!value.trim()) {
    throw new Error(`${name} must not be empty.`);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseCreateResponse(value: unknown): FileCreateResponse {
  const response = record(value);
  const metadata = record(response?.metadata);
  if (
    typeof response?.id !== "string" ||
    typeof response.versionId !== "string" ||
    !metadata ||
    typeof metadata.mediaType !== "string" ||
    typeof metadata.byteSize !== "number" ||
    (metadata.fileName !== undefined &&
      metadata.fileName !== null &&
      typeof metadata.fileName !== "string")
  ) {
    throw uploadError(
      "invalid_file_response",
      "Aion Files returned an invalid upload response.",
      false,
    );
  }
  return {
    id: response.id,
    versionId: response.versionId,
    metadata: {
      fileName: metadata.fileName,
      mediaType: metadata.mediaType,
      byteSize: metadata.byteSize,
    },
  };
}

function parseGrantResponse(
  value: unknown,
  expectedFileId: string,
  expectedVersionId: string,
  now: number,
): FileGrantResponse {
  const response = record(value);
  if (
    response?.id !== expectedFileId ||
    response.versionId !== expectedVersionId ||
    typeof response.url !== "string" ||
    typeof response.accessExpiresAt !== "string" ||
    !isHttpUrl(response.url) ||
    !isFutureTimestamp(response.accessExpiresAt, now)
  ) {
    throw uploadError(
      "invalid_file_response",
      "Aion Files returned an invalid read grant.",
      false,
    );
  }
  return {
    id: response.id,
    versionId: response.versionId,
    url: response.url,
    accessExpiresAt: response.accessExpiresAt,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isFutureTimestamp(value: string, now: number): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

function responseError(
  phase: "grant" | "upload",
  status: number,
): AionFilesAttachmentUploadError {
  if (status === 401) {
    return uploadError(
      "authentication_required",
      "Authentication is required to upload an attachment.",
      false,
      status,
    );
  }
  if (status === 403) {
    return uploadError(
      "access_denied",
      "Access to the Aion Files operation was denied.",
      false,
      status,
    );
  }
  if (phase === "upload" && status === 413) {
    return uploadError(
      "file_too_large",
      "The attachment exceeds the Aion Files upload limit.",
      false,
      status,
    );
  }
  const grant = phase === "grant";
  return uploadError(
    grant ? "grant_failed" : "upload_failed",
    grant
      ? "Aion could not create an attachment read grant."
      : "The attachment could not be uploaded to Aion.",
    status === 429 || status >= 500,
    status,
  );
}

function requestUrl(
  filesUrl: string,
  path: string,
  parameters: URLSearchParams,
): string {
  const root = filesUrl.replace(/\/+$/u, "");
  return `${root}${path}?${parameters.toString()}`;
}

async function readJson(
  response: Response,
  phase: "grant" | "upload",
  signal: AbortSignal,
): Promise<unknown> {
  signal.throwIfAborted();
  if (!response.ok) {
    throw responseError(phase, response.status);
  }
  try {
    return await response.json();
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw uploadError(
      "invalid_file_response",
      "Aion Files returned an invalid response.",
      false,
    );
  }
}

async function bearerToken(
  provider: AionFilesAttachmentUploaderOptions["getBearerToken"],
): Promise<string> {
  let token: string | null | undefined;
  try {
    token = await provider();
  } catch {
    throw uploadError(
      "credential_error",
      "The Aion bearer credential could not be resolved.",
      true,
    );
  }
  if (!token?.trim()) {
    throw uploadError(
      "authentication_required",
      "Authentication is required to upload an attachment.",
      false,
    );
  }
  return token;
}

async function request(
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  token: string,
  signal: AbortSignal,
  phase: "grant" | "upload",
  body?: BodyInit,
): Promise<Response> {
  try {
    return await fetchImplementation(url, {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      signal,
      headers: { authorization: `Bearer ${token}` },
      body,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw uploadError(
      phase === "upload" ? "upload_failed" : "grant_failed",
      phase === "upload"
        ? "The attachment could not be uploaded to Aion."
        : "Aion could not create an attachment read grant.",
      true,
    );
  }
}

/** Creates an authenticated uploader backed by the Aion Files HTTP API. */
export function createAionFilesAttachmentUploader(
  options: AionFilesAttachmentUploaderOptions,
): AionAttachmentUploader {
  assertConfigured(options.organizationId, "organizationId");
  assertConfigured(options.association.id, "association.id");
  const filesUrl = options.filesUrl ?? "/files";
  assertConfigured(filesUrl, "filesUrl");
  if (filesUrl.includes("?") || filesUrl.includes("#")) {
    throw new Error("filesUrl must not include a query or fragment.");
  }
  const grantTtlSeconds =
    options.grantTtlSeconds ?? AION_FILES_MAXIMUM_GRANT_SECONDS;
  if (
    !Number.isInteger(grantTtlSeconds) ||
    grantTtlSeconds <= 0 ||
    grantTtlSeconds > AION_FILES_MAXIMUM_GRANT_SECONDS
  ) {
    throw new Error("grantTtlSeconds must be between 1 and 3600.");
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const createOperationId =
    options.createOperationId ?? (() => globalThis.crypto.randomUUID());
  const operationIds = new WeakMap<File, string>();
  const now = options.now ?? Date.now;

  return {
    async upload(
      file: File,
      uploadOptions: AionAttachmentUploadOptions,
    ): Promise<AionUploadedAttachment> {
      uploadOptions.signal.throwIfAborted();
      if (file.size > AION_FILES_MAXIMUM_UPLOAD_BYTES) {
        throw uploadError(
          "file_too_large",
          "The attachment exceeds the 20 MiB Aion Files upload limit.",
          false,
        );
      }
      const token = await bearerToken(options.getBearerToken);
      const operationId =
        operationIds.get(file) ?? createOperationId();
      operationIds.set(file, operationId);
      const createParameters = new URLSearchParams({
        operationId,
        organizationId: options.organizationId,
        purpose: "MessagingMedia",
        byteSize: file.size.toString(),
        associationKind: options.association.kind,
        associationId: options.association.id,
      });
      const form = new FormData();
      form.set("file", file, file.name);
      const createResponse = await request(
        fetchImplementation,
        requestUrl(filesUrl, "", createParameters),
        token,
        uploadOptions.signal,
        "upload",
        form,
      );
      const createResult = await readJson(
        createResponse,
        "upload",
        uploadOptions.signal,
      );
      uploadOptions.signal.throwIfAborted();
      const created = parseCreateResponse(createResult);
      if (created.metadata.byteSize !== file.size) {
        throw uploadError(
          "invalid_file_response",
          "Aion Files returned inconsistent attachment metadata.",
          false,
        );
      }
      const grantParameters = new URLSearchParams({
        ttlSeconds: grantTtlSeconds.toString(),
      });
      const grantResponse = await request(
        fetchImplementation,
        requestUrl(
          filesUrl,
          `/${encodeURIComponent(created.id)}/versions/` +
            `${encodeURIComponent(created.versionId)}/grants`,
          grantParameters,
        ),
        token,
        uploadOptions.signal,
        "grant",
      );
      const grantResult = await readJson(
        grantResponse,
        "grant",
        uploadOptions.signal,
      );
      uploadOptions.signal.throwIfAborted();
      const grant = parseGrantResponse(
        grantResult,
        created.id,
        created.versionId,
        now(),
      );
      return {
        url: grant.url,
        name: created.metadata.fileName ?? file.name,
        mediaType: created.metadata.mediaType || file.type || undefined,
        size: created.metadata.byteSize,
        expiresAt: grant.accessExpiresAt,
      };
    },
  };
}
