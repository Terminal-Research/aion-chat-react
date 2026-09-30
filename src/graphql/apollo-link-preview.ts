import { parse, type DocumentNode } from "graphql";

import { type AionLinkPreviewSource, linkPreviewUrl, normalizeLinkPreview } from "../link-preview";
import { type ApolloAionQueryClient, asApolloQueryClient } from "./apollo-client";
import { AION_LINK_PREVIEW_QUERY_SOURCE } from "./link-preview-source";

/** Optional public metadata reads using the application's Apollo client. */
export interface ApolloAionLinkPreviewSourceOptions {
  readonly client: ApolloAionQueryClient;
  readonly operation?: DocumentNode;
}

/** Current nullable link-preview operation. */
export const AION_LINK_PREVIEW_QUERY = parse(AION_LINK_PREVIEW_QUERY_SOURCE);

/** Creates cancelable preview reads; unavailable metadata returns undefined. */
export function createApolloAionLinkPreviewSource(
  options: ApolloAionLinkPreviewSourceOptions,
): AionLinkPreviewSource {
  const client = asApolloQueryClient(options.client);
  return {
    async load(value, { signal } = {}) {
      const url = linkPreviewUrl(value);
      if (!url || signal?.aborted) return undefined;
      try {
        const result = await client.query<{ linkPreview?: unknown }, { url: string }>({
          query: options.operation ?? AION_LINK_PREVIEW_QUERY,
          variables: { url },
          fetchPolicy: "cache-first",
          errorPolicy: "all",
          // Canceling a departed thread must not abort another thread's read.
          context: { queryDeduplication: false, fetchOptions: { signal } },
        });
        return signal?.aborted ? undefined : normalizeLinkPreview(result.data?.linkPreview);
      } catch {
        return undefined;
      }
    },
  };
}
