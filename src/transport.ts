import type { ChatTransportEvent } from "./events";
import type { ChatAgent, ChatMessage } from "./model";

/** One outbound request passed to an Aion chat transport. */
export interface AionChatRequest {
  readonly requestId: string;
  readonly turnId: string;
  readonly attempt: number;
  readonly agent: ChatAgent;
  readonly message: ChatMessage;
  readonly contextId?: string;
  readonly taskId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Options shared by every transport stream implementation. */
export interface AionChatStreamOptions {
  readonly signal: AbortSignal;
}

/**
 * Transport-neutral boundary between the React controller and an Aion chat
 * backend.
 */
export interface AionChatTransport {
  /**
   * Opens one response stream.
   *
   * @param request - Normalized outbound request.
   * @param options - Cancellation options owned by the controller.
   * @returns Normalized A2A-aware events for the request.
   */
  stream(
    request: AionChatRequest,
    options: AionChatStreamOptions,
  ): AsyncIterable<ChatTransportEvent>;

  /** Releases resources owned by the transport, when any exist. */
  dispose?(): void | Promise<void>;
}
