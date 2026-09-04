import type { DocumentNode } from "graphql";

import type { ChatAgent } from "../model";
import type { AionConversationDirectory } from "../conversations/directory";
import type { ApolloAionSubscriptionClient } from "./apollo-client";
import { observeApolloAionGraphQL } from "./apollo-observe";
import {
  createAionChatGraphQLConversationDirectory,
} from "./context-directory";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION } from "./operation";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
  AionChatGraphQLVariables,
} from "./types";

/** Options for a remote directory using a caller-owned Apollo client. */
export interface ApolloAionConversationDirectoryOptions {
  readonly client: ApolloAionSubscriptionClient;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly operation?: DocumentNode;
  readonly createRequestId?: () => string;
  readonly createModelId?: () => string;
  readonly now?: () => string;
}

/** Creates a caller-scoped directory around one Apollo client. */
export function createApolloAionConversationDirectory(
  options: ApolloAionConversationDirectoryOptions,
): AionConversationDirectory {
  const operation = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION;
  return createAionChatGraphQLConversationDirectory({
    observe: (variables, signal) =>
      observeApolloAionGraphQL<
        AionChatGraphQLSubscriptionData,
        AionChatGraphQLVariables
      >(options.client, operation, variables, signal),
    targetForAgent: options.targetForAgent,
    serviceParameters: options.serviceParameters,
    createRequestId: options.createRequestId,
    createModelId: options.createModelId,
    now: options.now,
  });
}
