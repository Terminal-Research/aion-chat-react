import { type AionLinkPreviewSource, linkPreviewUrl, normalizeLinkPreview } from "../link-preview";
import { AION_LINK_PREVIEW_QUERY_SOURCE } from "./link-preview-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

/** Public metadata reads using the caller-owned standalone client. */
export interface StandaloneAionLinkPreviewSourceOptions {
  readonly client: AionStandaloneGraphQLClient;
  readonly operation?: string;
}

/** Creates cancelable metadata reads with ordinary-link fallback on failure. */
export function createStandaloneAionLinkPreviewSource(
  options: StandaloneAionLinkPreviewSourceOptions,
): AionLinkPreviewSource {
  return {
    async load(value, { signal } = {}) {
      const url = linkPreviewUrl(value);
      if (!url || signal?.aborted) return undefined;
      try {
        const result = await options.client.execute<{ linkPreview?: unknown }, { url: string }>(
          {
            query: options.operation ?? AION_LINK_PREVIEW_QUERY_SOURCE,
            variables: { url },
            operationName: "AionChatLinkPreview",
          },
          { signal },
        );
        return signal?.aborted ? undefined : normalizeLinkPreview(result.data?.linkPreview);
      } catch {
        return undefined;
      }
    },
  };
}
