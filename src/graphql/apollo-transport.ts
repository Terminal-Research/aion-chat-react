import type { DocumentNode } from "graphql";

import type { ChatAgent } from "../model";
import type { AionChatTransport } from "../transport";
import { observeApolloAionGraphQL } from "./apollo-observe";
import type { ApolloAionSubscriptionClient } from "./apollo-client";
import { createAionChatGraphQLTransport } from "./chat-transport";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION } from "./operation";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
  AionChatGraphQLVariables,
  AionChatJsonRpcError,
} from "./types";

/** Options for the caller-owned Apollo Aion chat transport. */
export interface ApolloAionChatTransportOptions {
  readonly client: ApolloAionSubscriptionClient;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly operation?: DocumentNode;
  readonly createEventId?: () => string;
  readonly now?: () => string;
  readonly unaryFallback?: boolean;
  /** Observes raw JSON-RPC errors without retaining them in chat state. */
  readonly onJsonRpcError?: (error: AionChatJsonRpcError) => void;
}

/** Creates an Aion chat transport around one caller-owned Apollo client. */
export function createApolloAionChatTransport(
  options: ApolloAionChatTransportOptions,
): AionChatTransport {
  const operation = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION;
  return createAionChatGraphQLTransport({
    observe: (variables, signal) =>
      observeApolloAionGraphQL<
        AionChatGraphQLSubscriptionData,
        AionChatGraphQLVariables
      >(options.client, operation, variables, signal),
    targetForAgent: options.targetForAgent,
    serviceParameters: options.serviceParameters,
    createEventId: options.createEventId,
    now: options.now,
    unaryFallback: options.unaryFallback,
    onJsonRpcError: options.onJsonRpcError,
  });
}
