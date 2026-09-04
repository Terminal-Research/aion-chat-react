import type { ApolloClient } from "@apollo/client/core";
import type { DocumentNode } from "graphql";

import type { AionAgentCatalog } from "../catalog";
import {
  type AionAgentCatalogGraphQLData,
  type AionAgentCatalogGraphQLVariables,
  normalizeAionAgentCatalog,
  toAionAgentCatalogError,
} from "./catalog";
import { AION_AGENT_CATALOG_QUERY } from "./catalog-operation";

/** Options for a catalog using a caller-owned Apollo client. */
export interface ApolloAionAgentCatalogOptions {
  readonly client: ApolloClient<unknown>;
  readonly organizationId: string;
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
  const operation = options.operation ?? AION_AGENT_CATALOG_QUERY;
  return {
    async list(listOptions = {}) {
      listOptions.signal?.throwIfAborted();
      try {
        const result = await options.client.query<
          AionAgentCatalogGraphQLData,
          AionAgentCatalogGraphQLVariables
        >({
          query: operation,
          variables: { organizationId },
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
        );
      } catch (error) {
        throw toAionAgentCatalogError(error);
      }
    },
  };
}
