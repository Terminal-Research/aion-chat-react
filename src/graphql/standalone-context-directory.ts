import type { ChatAgent } from "../model";
import type { AionConversationDirectory } from "../conversations/directory";
import {
  createAionChatGraphQLConversationDirectory,
} from "./context-directory";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE } from "./operation-source";
import type { AionStandaloneGraphQLClient } from "./standalone-client";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
} from "./types";

/** Options for a directory using a caller-owned standalone client. */
export interface StandaloneAionConversationDirectoryOptions {
  readonly client: AionStandaloneGraphQLClient;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly operation?: string;
  readonly createRequestId?: () => string;
  readonly createModelId?: () => string;
  readonly now?: () => string;
}

/** Creates a caller-scoped directory around one standalone client. */
export function createStandaloneAionConversationDirectory(
  options: StandaloneAionConversationDirectoryOptions,
): AionConversationDirectory {
  const query = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE;
  return createAionChatGraphQLConversationDirectory({
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
    createRequestId: options.createRequestId,
    createModelId: options.createModelId,
    now: options.now,
  });
}
