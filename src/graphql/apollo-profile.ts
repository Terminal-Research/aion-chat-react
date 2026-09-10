import type { DocumentNode } from "graphql";

import type { AionAgentProfileSource } from "../profile";
import {
  type ApolloAionQueryClient,
  asApolloQueryClient,
} from "./apollo-client";
import {
  type AionAgentProfileGraphQLData,
  type AionAgentProfileGraphQLVariables,
  normalizeAionAgentProfile,
  toAionAgentProfileError,
} from "./profile";
import { AION_AGENT_PROFILE_QUERY } from "./profile-operation";

/** Options for profile reads using a caller-owned Apollo client. */
export interface ApolloAionAgentProfileSourceOptions {
  /** Application-owned Apollo query client. */
  readonly client: ApolloAionQueryClient;
  /** Optional compatible operation override. */
  readonly operation?: DocumentNode;
}

function assertIdentityId(value: string): string {
  const identityId = value.trim();
  if (!identityId) {
    throw new Error("identityId must not be empty.");
  }
  return identityId;
}

/** Creates lazy profile reads around a caller-owned Apollo client. */
export function createApolloAionAgentProfileSource(
  options: ApolloAionAgentProfileSourceOptions,
): AionAgentProfileSource {
  const operation = options.operation ?? AION_AGENT_PROFILE_QUERY;
  const client = asApolloQueryClient(options.client);
  return {
    async load(identityIdValue, loadOptions = {}) {
      const identityId = assertIdentityId(identityIdValue);
      loadOptions.signal?.throwIfAborted();
      try {
        const result = await client.query<
          AionAgentProfileGraphQLData,
          AionAgentProfileGraphQLVariables
        >({
          query: operation,
          variables: { agentIdentityId: identityId },
          fetchPolicy: "cache-first",
          errorPolicy: "all",
          context: loadOptions.signal
            ? { fetchOptions: { signal: loadOptions.signal } }
            : undefined,
        });
        return normalizeAionAgentProfile(
          {
            data: result.data,
            errors: result.errors?.map((error) => ({
              ...error,
              message: error.message,
            })),
          },
          identityId,
        );
      } catch (error) {
        throw toAionAgentProfileError(error);
      }
    },
  };
}
