import { describe, expect, it, vi } from "vitest";
import { createApolloAionLinkPreviewSource } from "./apollo-link-preview";
import { createStandaloneAionLinkPreviewSource } from "./standalone-link-preview";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

const metadata = { url: "https://example.com/", title: "Example" };

describe("link preview adapters", () => {
  it("uses the host Apollo cache with independently cancelable requests", async () => {
    const query = vi.fn().mockResolvedValue({ data: { linkPreview: metadata } });
    const source = createApolloAionLinkPreviewSource({ client: { query } });
    const controller = new AbortController();
    await expect(source.load(metadata.url, { signal: controller.signal })).resolves.toMatchObject(metadata);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      variables: { url: metadata.url }, fetchPolicy: "cache-first", errorPolicy: "all",
      context: { queryDeduplication: false, fetchOptions: { signal: controller.signal } },
    }));
    controller.abort();
    await expect(source.load(metadata.url, { signal: controller.signal })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("falls back quietly when the server lacks the query or a request fails", async () => {
    const query = vi.fn().mockResolvedValue({ errors: [{ message: "Unknown field" }] });
    const source = createApolloAionLinkPreviewSource({ client: { query } });
    await expect(source.load(metadata.url)).resolves.toBeUndefined();
    query.mockRejectedValue(new Error("offline"));
    await expect(source.load(metadata.url)).resolves.toBeUndefined();
  });

  it("supports caller-owned standalone clients with the same nullable contract", async () => {
    const execute = vi.fn().mockResolvedValue({ data: { linkPreview: metadata } });
    const source = createStandaloneAionLinkPreviewSource({
      client: { execute } as unknown as AionStandaloneGraphQLClient,
    });
    await expect(source.load(metadata.url)).resolves.toMatchObject(metadata);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ operationName: "AionChatLinkPreview" }),
      expect.anything(),
    );
  });
});
