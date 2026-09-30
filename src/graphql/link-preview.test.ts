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
    await expect(source.loadMany!([metadata.url])).resolves.toEqual([]);
    query.mockRejectedValue(new Error("offline"));
    await expect(source.load(metadata.url)).resolves.toBeUndefined();
    await expect(source.loadMany!([metadata.url])).resolves.toEqual([]);
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

  it("sends an entire deduplicated batch through Apollo and skips unavailable entries", async () => {
    const urls = Array.from({ length: 25 }, (_, index) => `https://example.com/${index}`);
    const results = urls.map((url, index) => index === 3 ? null : { ...metadata, url });
    const query = vi.fn().mockResolvedValue({ data: { linkPreviews: results } });
    const source = createApolloAionLinkPreviewSource({ client: { query } });
    const controller = new AbortController();
    const previews = await source.loadMany!([...urls, `${urls[0]}#section`, "javascript:alert(1)"], {
      signal: controller.signal,
    });
    expect(previews.map((preview) => preview.url)).toEqual(urls.filter((_, index) => index !== 3));
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      variables: { urls }, fetchPolicy: "cache-first", errorPolicy: "all",
      context: { queryDeduplication: false, fetchOptions: { signal: controller.signal } },
    }));
    controller.abort();
    await expect(source.loadMany!(urls, { signal: controller.signal })).resolves.toEqual([]);
    await expect(source.loadMany!([])).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not expose a canceled batch even when the request ignores its signal", async () => {
    const controller = new AbortController();
    const query = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.resolve({ data: { linkPreviews: [metadata] } });
    });
    const source = createApolloAionLinkPreviewSource({ client: { query } });
    await expect(source.loadMany!([metadata.url], { signal: controller.signal })).resolves.toEqual([]);
  });

  it("supports the same ordered batch contract through standalone clients", async () => {
    const second = { ...metadata, url: "https://example.com/second" };
    const urls = [metadata.url, "https://example.com/missing", second.url];
    const execute = vi.fn().mockResolvedValue({ data: { linkPreviews: [metadata, null, second] } });
    const source = createStandaloneAionLinkPreviewSource({
      client: { execute } as unknown as AionStandaloneGraphQLClient,
    });
    await expect(source.loadMany!(urls)).resolves.toMatchObject([metadata, second]);
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operationName: "AionChatLinkPreviews", variables: { urls } }),
      expect.anything(),
    );
    execute.mockRejectedValue(new Error("offline"));
    await expect(source.loadMany!(urls)).resolves.toEqual([]);
  });
});
