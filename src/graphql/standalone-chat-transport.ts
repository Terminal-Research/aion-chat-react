import {
  AION_AGENT_CARD_QUERY_SOURCE, loadAgentCardCapabilities,
  type AionAgentCardData, type AionAgentCardVariables,
} from "./agent-card";
import type { ChatAgent } from "../model";
import type { AionChatTransport } from "../transport";
import { createAionChatGraphQLTransport } from "./chat-transport";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE } from "./operation-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
  AionChatJsonRpcError,
} from "./types";

/** Options for chat over a caller-owned standalone GraphQL client. */
export interface StandaloneAionChatTransportOptions {
  readonly client: AionStandaloneGraphQLClient;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly operation?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly createEventId?: () => string;
  readonly now?: () => string;
  readonly unaryFallback?: boolean;
  /** Observes raw JSON-RPC errors without retaining them in chat state. */
  readonly onJsonRpcError?: (error: AionChatJsonRpcError) => void;
}

/** Creates chat transport over a caller-owned standalone GraphQL client. */
export function createStandaloneAionChatTransport(
  options: StandaloneAionChatTransportOptions,
): AionChatTransport {
  const query = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE;
  return createAionChatGraphQLTransport({
    async getAgentCapabilities(target, signal) {
      const result = await options.client.execute<
        AionAgentCardData, AionAgentCardVariables
      >({
        query: AION_AGENT_CARD_QUERY_SOURCE,
        variables: { target }, operationName: "AionChatAgentCard",
      }, { signal });
      return loadAgentCardCapabilities(result, signal, options.fetch);
    },
    observe: (variables, signal, { retry }) =>
      options.client.subscribe<AionChatGraphQLSubscriptionData>(
        {
          query,
          variables,
          operationName: "AionChatA2ARpc",
        },
        { signal, retry },
      ),
    targetForAgent: options.targetForAgent,
    serviceParameters: options.serviceParameters,
    createEventId: options.createEventId,
    now: options.now,
    unaryFallback: options.unaryFallback,
    onJsonRpcError: options.onJsonRpcError,
  });
}
