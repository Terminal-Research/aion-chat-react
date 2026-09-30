import { parse, type DocumentNode } from "graphql";

import {
  type AionLinkPreviewSource,
  linkPreviewUrl,
  linkPreviewUrls,
  normalizeLinkPreview,
  normalizeLinkPreviews,
} from "../link-preview";
import { type ApolloAionQueryClient, asApolloQueryClient } from "./apollo-client";
import { AION_LINK_PREVIEW_QUERY_SOURCE, AION_LINK_PREVIEWS_QUERY_SOURCE } from "./link-preview-source";

/** Optional public metadata reads using the application's Apollo client. */
export interface ApolloAionLinkPreviewSourceOptions {
  readonly client: ApolloAionQueryClient;
  readonly operation?: DocumentNode;
  /** Override the batch operation while retaining its urls input and list result. */
  readonly batchOperation?: DocumentNode;
}

/** Current nullable link-preview operation. */
export const AION_LINK_PREVIEW_QUERY = parse(AION_LINK_PREVIEW_QUERY_SOURCE);

/** Metadata for an entire response in one GraphQL request. */
export const AION_LINK_PREVIEWS_QUERY = parse(AION_LINK_PREVIEWS_QUERY_SOURCE);

/** Creates cancelable single and batch preview reads, omitting unavailable metadata. */
export function createApolloAionLinkPreviewSource(
  options: ApolloAionLinkPreviewSourceOptions,
): AionLinkPreviewSource {
  const client = asApolloQueryClient(options.client);
  async function request(
    query: DocumentNode,
    variables: { url: string } | { urls: string[] },
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) return undefined;
    try {
      const result = await client.query<{
        linkPreview?: unknown; linkPreviews?: unknown;
      }, typeof variables>({
        query,
        variables,
        fetchPolicy: "cache-first",
        errorPolicy: "all",
        // Each mounted response owns cancellation of its reads.
        context: { queryDeduplication: false, fetchOptions: { signal } },
      });
      return signal?.aborted ? undefined : result.data;
    } catch {
      return undefined;
    }
  }
  return {
    async loadMany(values, { signal } = {}) {
      const urls = linkPreviewUrls(values);
      if (!urls.length) return [];
      const data = await request(options.batchOperation ?? AION_LINK_PREVIEWS_QUERY, { urls }, signal);
      return normalizeLinkPreviews(data?.linkPreviews);
    },
    async load(value, { signal } = {}) {
      const url = linkPreviewUrl(value);
      if (!url) return undefined;
      const data = await request(options.operation ?? AION_LINK_PREVIEW_QUERY, { url }, signal);
      return normalizeLinkPreview(data?.linkPreview);
    },
  };
}
