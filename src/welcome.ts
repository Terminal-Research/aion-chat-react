import { isTerminalChatTransportEvent, type ChatTransportEvent } from "./events";
import type { ChatConversationState, ChatMessage } from "./model";
import type { AionChatRequest, AionChatTransport } from "./transport";

/** Versioned request intent and payload ownership marker. */
export const WELCOME_MESSAGE_EXTENSION_URI =
  "https://docs.aion.to/a2a/extensions/aion/welcome-message/1.0.0";
export const WELCOME_REQUEST_SCHEMA = `${WELCOME_MESSAGE_EXTENSION_URI}#WelcomeRequestPayload`;

/** Identifies synthetic triggers while preserving actual user text. */
export function isWelcomeRequest(message: ChatMessage): boolean {
  return message.role === "user"
    && !message.parts.some((part) => part.type === "text" && part.text.trim())
    && message.parts.some((part) => {
      if (part.type !== "data") return false;
      const data = part.data as { type?: unknown } | null;
      const marker = part.metadata?.[WELCOME_MESSAGE_EXTENSION_URI] as
        { schema?: unknown } | undefined;
      return data?.type === "welcome-request" && marker?.schema === WELCOME_REQUEST_SCHEMA;
    });
}

/** @internal A new-thread request, independent of the ordinary send lifecycle. */
export async function* welcomeEvents(
  transport: AionChatTransport,
  conversation: ChatConversationState,
  signal: AbortSignal,
  createId: () => string,
  now: () => string,
  canDispatch: () => boolean,
): AsyncIterable<ChatTransportEvent> {
  const agent = conversation.agent;
  if (!agent || !conversation.contextId || !transport.getAgentCapabilities) return;
  const capabilities = await transport.getAgentCapabilities(agent, { signal });
  signal.throwIfAborted();
  // Discovery can outlive first input or navigation. Check live state only
  // before dispatch; an in-flight welcome remains independent of user work.
  if (!canDispatch()) return;
  if (!capabilities.extensions?.some(({ uri }) => uri === WELCOME_MESSAGE_EXTENSION_URI)) return;
  const message: ChatMessage = {
    id: createId(), role: "user", createdAt: now(),
    contextId: conversation.contextId,
    extensions: [WELCOME_MESSAGE_EXTENSION_URI],
    parts: [{ type: "data", data: { type: "welcome-request" }, metadata: {
      [WELCOME_MESSAGE_EXTENSION_URI]: { schema: WELCOME_REQUEST_SCHEMA },
    } }],
  };
  const request: AionChatRequest = {
    requestId: createId(), turnId: createId(), attempt: 1, agent, message,
    contextId: conversation.contextId, operation: "SendMessage",
    extensions: [WELCOME_MESSAGE_EXTENSION_URI],
  };
  yield {
    type: "run.started", eventId: createId(), occurredAt: now(),
    requestId: request.requestId, turnId: request.turnId, attempt: 1,
    userMessage: message,
  };
  try {
    for await (const event of transport.stream(request, { signal })) {
      if (signal.aborted) return;
      if (event.requestId !== request.requestId) continue;
      yield event.type === "run.failed"
        ? { ...event, error: { ...event.error, retryable: false } } : event;
      if (isTerminalChatTransportEvent(event)) return;
    }
    if (signal.aborted) return;
    throw new Error("The welcome request ended before its response completed.");
  } catch (error) {
    if (signal.aborted) return;
    yield {
      type: "run.failed", eventId: createId(), occurredAt: now(),
      requestId: request.requestId,
      error: { code: "welcome_failed", message: error instanceof Error
        ? error.message : "The welcome request failed.", retryable: false },
    };
  }
}

/** @internal Merge an independently reduced welcome without replacing a user run. */
export function mergeWelcomeConversation(
  current: ChatConversationState,
  welcome: ChatConversationState,
): ChatConversationState {
  if (current.contextId !== welcome.contextId) return current;
  const merge = <T extends { readonly id: string }>(left: readonly T[], right: readonly T[]) => {
    const values = new Map(left.map((item) => [item.id, item]));
    for (const item of right) values.set(item.id, item);
    return [...values.values()];
  };
  const transcript = new Map(current.transcript.map((item) => [`${item.type}:${item.id}`, item]));
  for (const item of welcome.transcript) transcript.set(`${item.type}:${item.id}`, item);
  return {
    ...current,
    turns: merge(current.turns, welcome.turns),
    messages: merge(current.messages, welcome.messages),
    tasks: { ...current.tasks, ...welcome.tasks },
    artifacts: { ...current.artifacts, ...welcome.artifacts },
    transcript: [...transcript.values()],
    seenEventIds: { ...current.seenEventIds, ...welcome.seenEventIds },
  };
}
