import type { ChatTransportEvent } from "../events";
import type { AionChatRequest, AionChatTransport } from "../transport";

/** Result returned by the transport conformance collector. */
export interface AionChatTransportTrace {
  readonly events: readonly ChatTransportEvent[];
  readonly requestIdsMatch: boolean;
}

/**
 * Collects a transport stream and reports protocol invariants shared by fake,
 * direct A2A, and GraphQL adapters.
 */
export async function collectAionChatTransportTrace(
  transport: AionChatTransport,
  request: AionChatRequest,
  signal: AbortSignal = new AbortController().signal,
): Promise<AionChatTransportTrace> {
  const events: ChatTransportEvent[] = [];
  for await (const event of transport.stream(request, { signal })) {
    events.push(event);
  }

  return {
    events,
    requestIdsMatch: events.every(
      (event) => event.requestId === request.requestId,
    ),
  };
}
