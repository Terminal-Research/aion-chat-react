import type { DocumentNode } from "graphql";

import type {
  AionAgentCatalog,
  AionAgentCatalogNetworkType,
} from "../catalog";
import {
  type ApolloAionQueryClient,
  asApolloQueryClient,
} from "./apollo-client";
import {
  type AionAgentCatalogGraphQLData,
  type AionAgentCatalogGraphQLVariables,
  normalizeAionAgentCatalog,
  toAionAgentCatalogError,
} from "./catalog";
import { AION_AGENT_CATALOG_QUERY } from "./catalog-operation";

/** Options for a catalog using a caller-owned Apollo client. */
export interface ApolloAionAgentCatalogOptions {
  /** Application-owned Apollo query client. */
  readonly client: ApolloAionQueryClient;
  /** Organization whose caller-visible identities should be listed. */
  readonly organizationId: string;
  /** Distribution network that agents must expose. */
  readonly networkType: AionAgentCatalogNetworkType;
  /** Optional compatible operation override. */
  readonly operation?: DocumentNode;
}

function assertOrganizationId(value: string): string {
  const organizationId = value.trim();
  if (!organizationId) {
    throw new Error("organizationId must not be empty.");
  }
  return organizationId;
}

/** Creates an authenticated catalog around a caller-owned Apollo client. */
export function createApolloAionAgentCatalog(
  options: ApolloAionAgentCatalogOptions,
): AionAgentCatalog {
  const organizationId = assertOrganizationId(options.organizationId);
  const { networkType } = options;
  const operation = options.operation ?? AION_AGENT_CATALOG_QUERY;
  const client = asApolloQueryClient(options.client);
  return {
    async list(listOptions = {}) {
      listOptions.signal?.throwIfAborted();
      try {
        const result = await client.query<
          AionAgentCatalogGraphQLData,
          AionAgentCatalogGraphQLVariables
        >({
          query: operation,
          variables: { organizationId, networkType },
          fetchPolicy: "network-only",
          errorPolicy: "all",
          context: listOptions.signal
            ? { fetchOptions: { signal: listOptions.signal } }
            : undefined,
        });
        return normalizeAionAgentCatalog(
          {
            data: result.data,
            errors: result.errors?.map((error) => ({
              ...error,
              message: error.message,
            })),
          },
          organizationId,
          networkType,
        );
      } catch (error) {
        throw toAionAgentCatalogError(error);
      }
    },
  };
}
