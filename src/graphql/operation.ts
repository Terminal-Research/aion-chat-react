import { parse } from "graphql";

import { AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE } from "./operation-source";

export { AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE } from "./operation-source";

/** Current Aion GraphQL subscription for streamed A2A JSON-RPC responses. */
export const AION_CHAT_A2A_RPC_SUBSCRIPTION = parse(
  AION_CHAT_A2A_RPC_SUBSCRIPTION_SOURCE,
);
