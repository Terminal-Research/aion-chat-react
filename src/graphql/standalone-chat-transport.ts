import type { ChatAgent } from "../model";
import type { AionChatTransport } from "../transport";
import { createAionChatGraphQLTransport } from "./chat-transport";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE } from "./operation-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
} from "./types";

/** Options for chat over a caller-owned standalone GraphQL client. */
export interface StandaloneAionChatTransportOptions {
  readonly client: AionStandaloneGraphQLClient;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly operation?: string;
  readonly createEventId?: () => string;
  readonly now?: () => string;
  readonly unaryFallback?: boolean;
}

/** Creates chat transport over a caller-owned standalone GraphQL client. */
export function createStandaloneAionChatTransport(
  options: StandaloneAionChatTransportOptions,
): AionChatTransport {
  const query = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE;
  return createAionChatGraphQLTransport({
    observe: (variables, signal) =>
      options.client.subscribe<AionChatGraphQLSubscriptionData>(
        {
          query,
          variables,
          operationName: "AionChatA2ARpc",
        },
        { signal },
      ),
    targetForAgent: options.targetForAgent,
    serviceParameters: options.serviceParameters,
    createEventId: options.createEventId,
    now: options.now,
    unaryFallback: options.unaryFallback,
  });
}
