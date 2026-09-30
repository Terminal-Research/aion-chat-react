import {
  type AionLinkPreviewSource,
  linkPreviewUrl,
  linkPreviewUrls,
  normalizeLinkPreview,
  normalizeLinkPreviews,
} from "../link-preview";
import { AION_LINK_PREVIEW_QUERY_SOURCE, AION_LINK_PREVIEWS_QUERY_SOURCE } from "./link-preview-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

/** Public metadata reads using the caller-owned standalone client. */
export interface StandaloneAionLinkPreviewSourceOptions {
  readonly client: AionStandaloneGraphQLClient;
  readonly operation?: string;
  /** Override the batch operation while retaining its urls input and list result. */
  readonly batchOperation?: string;
}

/** Creates cancelable metadata reads with ordinary-link fallback on failure. */
export function createStandaloneAionLinkPreviewSource(
  options: StandaloneAionLinkPreviewSourceOptions,
): AionLinkPreviewSource {
  async function request(
    query: string,
    operationName: string,
    variables: { url: string } | { urls: string[] },
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) return undefined;
    try {
      const result = await options.client.execute<{
        linkPreview?: unknown; linkPreviews?: unknown;
      }, typeof variables>({ query, variables, operationName }, { signal });
      return signal?.aborted ? undefined : result.data;
    } catch {
      return undefined;
    }
  }
  return {
    async loadMany(values, { signal } = {}) {
      const urls = linkPreviewUrls(values);
      if (!urls.length) return [];
      const data = await request(options.batchOperation ?? AION_LINK_PREVIEWS_QUERY_SOURCE,
        "AionChatLinkPreviews", { urls }, signal);
      return normalizeLinkPreviews(data?.linkPreviews);
    },
    async load(value, { signal } = {}) {
      const url = linkPreviewUrl(value);
      if (!url) return undefined;
      const data = await request(options.operation ?? AION_LINK_PREVIEW_QUERY_SOURCE,
        "AionChatLinkPreview", { url }, signal);
      return normalizeLinkPreview(data?.linkPreview);
    },
  };
}
