import { parse } from "graphql";
import type { ApolloAionSubscriptionClient } from "./apollo-client";
import { observeApolloAionGraphQL } from "./apollo-observe";
import {
  createConversationUpdatesSource,
  type ConversationUpdatesSourceOptions,
  type ConversationUpdatesData,
  type ConversationUpdatesVariables,
} from "./conversation-updates";
import { AION_CONVERSATION_UPDATES_SOURCE } from "./conversation-updates-source";

const operation = parse(AION_CONVERSATION_UPDATES_SOURCE);

/** Options for metadata on the application's existing authenticated Apollo client. */
export interface ApolloConversationUpdatesSourceOptions
  extends ConversationUpdatesSourceOptions {
  readonly client: ApolloAionSubscriptionClient;
}

/** One principal-wide operation, independent of selected agent or conversation. */
export function createApolloAionConversationUpdatesSource(
  options: ApolloConversationUpdatesSourceOptions,
) {
  return createConversationUpdatesSource(options, (variables, signal) =>
    observeApolloAionGraphQL<
      ConversationUpdatesData,
      ConversationUpdatesVariables
    >(options.client, operation, variables, signal),
  );
}
