import type { AionAgentCatalog } from "../catalog";
import {
  type AionAgentCatalogGraphQLData,
  normalizeAionAgentCatalog,
  toAionAgentCatalogError,
} from "./catalog";
import { AION_AGENT_CATALOG_QUERY_SOURCE } from "./catalog-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

/** Options for a catalog using a caller-owned standalone GraphQL client. */
export interface StandaloneAionAgentCatalogOptions {
  readonly client: AionStandaloneGraphQLClient;
  readonly operation?: string;
}

/** Creates an authenticated catalog around a standalone GraphQL client. */
export function createStandaloneAionAgentCatalog(
  options: StandaloneAionAgentCatalogOptions,
): AionAgentCatalog {
  const query = options.operation ?? AION_AGENT_CATALOG_QUERY_SOURCE;
  return {
    async list(listOptions = {}) {
      try {
        const result = await options.client.execute<
          AionAgentCatalogGraphQLData,
          { readonly organizationId: string }
        >(
          {
            query,
            variables: { organizationId: options.client.organizationId },
            operationName: "AionChatAgentCatalog",
          },
          listOptions,
        );
        return normalizeAionAgentCatalog(
          result,
          options.client.organizationId,
        );
      } catch (error) {
        throw toAionAgentCatalogError(error);
      }
    },
  };
}
