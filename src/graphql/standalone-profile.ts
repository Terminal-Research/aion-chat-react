import type { AionAgentProfileSource } from "../profile";
import {
  type AionAgentProfileGraphQLData,
  type AionAgentProfileGraphQLVariables,
  normalizeAionAgentProfile,
  toAionAgentProfileError,
} from "./profile";
import { AION_AGENT_PROFILE_QUERY_SOURCE } from "./profile-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

/** Options for profile reads using a standalone GraphQL client. */
export interface StandaloneAionAgentProfileSourceOptions {
  /** Caller-owned standalone Aion GraphQL client. */
  readonly client: AionStandaloneGraphQLClient;
  /** Optional compatible operation source override. */
  readonly operation?: string;
}

function assertIdentityId(value: string): string {
  const identityId = value.trim();
  if (!identityId) {
    throw new Error("identityId must not be empty.");
  }
  return identityId;
}

/** Creates lazy profile reads around a standalone GraphQL client. */
export function createStandaloneAionAgentProfileSource(
  options: StandaloneAionAgentProfileSourceOptions,
): AionAgentProfileSource {
  const query = options.operation ?? AION_AGENT_PROFILE_QUERY_SOURCE;
  return {
    async load(identityIdValue, loadOptions = {}) {
      const identityId = assertIdentityId(identityIdValue);
      loadOptions.signal?.throwIfAborted();
      try {
        const result = await options.client.execute<
          AionAgentProfileGraphQLData,
          AionAgentProfileGraphQLVariables
        >(
          {
            query,
            variables: { agentIdentityId: identityId },
            operationName: "AionChatAgentProfile",
          },
          loadOptions,
        );
        return normalizeAionAgentProfile(result, identityId);
      } catch (error) {
        throw toAionAgentProfileError(error);
      }
    },
  };
}
