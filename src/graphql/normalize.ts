import {
  type AionResponseNormalizationContext,
  normalizeAionJsonRpcError,
  normalizeAionResponse,
} from "../a2a/normalize";
import type { ChatTransportEvent } from "../events";
import type { AionChatGraphQLSubscriptionData } from "./types";

/** Coordinates required to normalize one GraphQL response payload. */
export type AionChatGraphQLNormalizationContext =
  AionResponseNormalizationContext;

/** Normalizes one selected GraphQL response into core transport events. */
export function normalizeAionChatGraphQLResponse(
  data: AionChatGraphQLSubscriptionData,
  context: AionChatGraphQLNormalizationContext,
): readonly ChatTransportEvent[] {
  const response = data.a2aRpc;
  if (!response) {
    return [];
  }
  return response.__typename === "A2AJsonRpcErrorResponseGQL"
    ? normalizeAionJsonRpcError(response.error, context)
    : normalizeAionResponse(response.result, context);
}
