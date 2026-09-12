import type { AionStandaloneGraphQLClient } from "./standalone-client";
import {
  createConversationUpdatesSource,
  type ConversationUpdatesSourceOptions,
  type ConversationUpdatesData,
} from "./conversation-updates";
import { AION_CONVERSATION_UPDATES_SOURCE } from "./conversation-updates-source";

/** Options using a caller-owned standalone GraphQL client and authentication. */
export interface StandaloneConversationUpdatesSourceOptions
  extends ConversationUpdatesSourceOptions {
  readonly client: AionStandaloneGraphQLClient;
}

/** Subscribe over the existing standalone client's shared WebSocket connection. */
export function createStandaloneAionConversationUpdatesSource(
  options: StandaloneConversationUpdatesSourceOptions,
) {
  return createConversationUpdatesSource(options, (variables, signal) =>
    options.client.subscribe<ConversationUpdatesData>(
      {
        query: AION_CONVERSATION_UPDATES_SOURCE,
        variables,
        operationName: "AionConversationUpdates",
      },
      { signal },
    ),
  );
}
