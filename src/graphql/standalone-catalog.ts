import type {
  AionAgentCatalog,
  AionAgentCatalogNetworkType,
} from "../catalog";
import {
  type AionAgentCatalogGraphQLData,
  type AionAgentCatalogGraphQLVariables,
  normalizeAionAgentCatalog,
  toAionAgentCatalogError,
} from "./catalog";
import { AION_AGENT_CATALOG_QUERY_SOURCE } from "./catalog-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

/** Options for a catalog using a caller-owned standalone GraphQL client. */
export interface StandaloneAionAgentCatalogOptions {
  /** Caller-owned standalone Aion GraphQL client. */
  readonly client: AionStandaloneGraphQLClient;
  /** Distribution network that agents must expose. */
  readonly networkType: AionAgentCatalogNetworkType;
  /** Optional compatible operation source override. */
  readonly operation?: string;
}

/** Creates an authenticated catalog around a standalone GraphQL client. */
export function createStandaloneAionAgentCatalog(
  options: StandaloneAionAgentCatalogOptions,
): AionAgentCatalog {
  const query = options.operation ?? AION_AGENT_CATALOG_QUERY_SOURCE;
  const { networkType } = options;
  return {
    async list(listOptions = {}) {
      try {
        const result = await options.client.execute<
          AionAgentCatalogGraphQLData,
          AionAgentCatalogGraphQLVariables
        >(
          {
            query,
            variables: {
              organizationId: options.client.organizationId,
              networkType,
            },
            operationName: "AionChatAgentCatalog",
          },
          listOptions,
        );
        return normalizeAionAgentCatalog(
          result,
          options.client.organizationId,
          networkType,
        );
      } catch (error) {
        throw toAionAgentCatalogError(error);
      }
    },
  };
}
