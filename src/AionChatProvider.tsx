import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ChatTransportEvent } from "./events";
import { AionChatContext } from "./controller-context";
import {
  type ChatAgent,
  type ChatConversationState,
  type ChatError,
  type ChatMessage,
  type ChatPart,
  createChatConversationState,
} from "./model";
import { reduceChatConversation } from "./reducer";
import type { AionChatRequest, AionChatTransport } from "./transport";

/** State exposed by the headless Aion chat controller. */
export interface AionChatControllerState {
  readonly agent?: ChatAgent;
  readonly conversation: ChatConversationState;
  readonly draft: string;
}

/** Derived controller metadata used by chat views. */
export interface AionChatControllerMeta {
  readonly isRunning: boolean;
  readonly canSend: boolean;
  readonly canRetry: boolean;
}

/** Optional message input supplied to the controller send action. */
export interface AionChatSendInput {
  readonly parts?: readonly ChatPart[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Commands exposed by the headless Aion chat controller. */
export interface AionChatControllerActions {
  readonly setAgent: (agent: ChatAgent | undefined) => void;
  readonly setDraft: (draft: string) => void;
  readonly send: (input?: AionChatSendInput) => Promise<void>;
  readonly stop: () => void;
  readonly retry: () => Promise<void>;
}

/** Complete headless controller consumed by hooks and views. */
export interface AionChatController {
  readonly state: AionChatControllerState;
  readonly actions: AionChatControllerActions;
  readonly meta: AionChatControllerMeta;
}

/** Configuration for the shared Aion chat controller provider. */
export interface AionChatProviderProps {
  readonly transport: AionChatTransport;
  readonly agent?: ChatAgent | null;
  readonly defaultAgent?: ChatAgent;
  readonly conversation?: ChatConversationState;
  readonly defaultConversationId?: string;
  readonly draft?: string;
  readonly defaultDraft?: string;
  readonly onAgentChange?: (agent: ChatAgent | undefined) => void;
  readonly onConversationChange?: (state: ChatConversationState) => void;
  readonly onDraftChange?: (draft: string) => void;
  readonly onRunStart?: (request: AionChatRequest) => void;
  readonly onRunEnd?: (state: ChatConversationState) => void;
  readonly onError?: (error: ChatError) => void;
  readonly createId?: () => string;
  readonly now?: () => string;
}

function defaultCreateId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function isTerminalEvent(event: ChatTransportEvent): boolean {
  if (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.canceled"
  ) {
    return true;
  }

  if (
    event.type === "task.received" ||
    event.type === "task.status-changed"
  ) {
    const state =
      event.type === "task.received" ? event.task.status.state : event.state;
    return [
      "input-required",
      "auth-required",
      "completed",
      "failed",
      "canceled",
      "rejected",
    ].includes(state);
  }

  return false;
}

function toChatError(error: unknown): ChatError {
  if (error instanceof Error) {
    return {
      code: "transport_error",
      message: error.message || "The chat request failed.",
      retryable: true,
    };
  }

  return {
    code: "transport_error",
    message: "The chat request failed.",
    retryable: true,
  };
}

function findContinuationTaskId(
  state: ChatConversationState,
): string | undefined {
  return [...state.turns]
    .reverse()
    .flatMap((turn) => [...turn.taskIds].reverse())
    .find((taskId) => {
      const taskState = state.tasks[taskId]?.status.state;
      return taskState === "input-required" || taskState === "auth-required";
    });
}

/** Provides transport-backed normalized state to headless chat consumers. */
export function AionChatProvider({
  children,
  transport,
  agent: controlledAgent,
  defaultAgent,
  conversation: controlledConversation,
  defaultConversationId = "default",
  draft: controlledDraft,
  defaultDraft = "",
  onAgentChange,
  onConversationChange,
  onDraftChange,
  onRunStart,
  onRunEnd,
  onError,
  createId = defaultCreateId,
  now = defaultNow,
}: PropsWithChildren<AionChatProviderProps>) {
  const selectedControlledAgent = controlledAgent ?? undefined;
  const [localAgent, setLocalAgent] = useState(defaultAgent);
  const [localConversation, setLocalConversation] = useState(() =>
    controlledConversation ??
    createChatConversationState(
      defaultConversationId,
      controlledAgent === null ? undefined : controlledAgent ?? defaultAgent,
    ),
  );
  const [localDraft, setLocalDraft] = useState(defaultDraft);
  const conversationRef = useRef(localConversation);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const mountedRef = useRef(true);
  const agent =
    controlledAgent === undefined ? localAgent : selectedControlledAgent;
  const conversation = controlledConversation ?? localConversation;
  const draft = controlledDraft ?? localDraft;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (controlledConversation) {
      conversationRef.current = controlledConversation;
    }
  }, [controlledConversation]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = undefined;
    };
  }, [transport]);

  const updateConversation = useCallback(
    (update: (state: ChatConversationState) => ChatConversationState) => {
      const next = update(conversationRef.current);
      conversationRef.current = next;
      if (mountedRef.current) {
        setLocalConversation(next);
        onConversationChange?.(next);
      }
      return next;
    },
    [onConversationChange],
  );

  const setAgent = useCallback(
    (nextAgent: ChatAgent | undefined) => {
      if (controlledAgent === undefined) {
        setLocalAgent(nextAgent);
      }
      onAgentChange?.(nextAgent);
    },
    [controlledAgent, onAgentChange],
  );

  const setDraft = useCallback(
    (nextDraft: string) => {
      if (controlledDraft === undefined) {
        setLocalDraft(nextDraft);
      }
      onDraftChange?.(nextDraft);
    },
    [controlledDraft, onDraftChange],
  );

  const execute = useCallback(
    async (
      turnId: string,
      message: ChatMessage,
      attempt: number,
      metadata?: Readonly<Record<string, unknown>>,
    ) => {
      if (!agent || abortRef.current) {
        return;
      }

      const requestId = createId();
      const occurredAt = now();
      const request: AionChatRequest = {
        requestId,
        turnId,
        attempt,
        agent,
        message,
        contextId: conversationRef.current.contextId,
        taskId: findContinuationTaskId(conversationRef.current),
        metadata,
      };
      const abortController = new AbortController();
      abortRef.current = abortController;

      updateConversation((state) =>
        reduceChatConversation(state, {
          type: "run.started",
          eventId: createId(),
          requestId,
          occurredAt,
          turnId,
          attempt,
          userMessage: message,
        }),
      );
      onRunStart?.(request);

      try {
        let terminal = false;
        for await (const event of transport.stream(request, {
          signal: abortController.signal,
        })) {
          if (!mountedRef.current || abortController.signal.aborted) {
            break;
          }
          if (event.requestId !== requestId) {
            continue;
          }

          updateConversation((state) => reduceChatConversation(state, event));
          if (event.type === "run.failed") {
            onError?.(event.error);
          }
          terminal = isTerminalEvent(event);
          if (terminal) {
            break;
          }
        }

        if (!mountedRef.current) {
          return;
        }

        if (abortController.signal.aborted) {
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.canceled",
              eventId: createId(),
              requestId,
              occurredAt: now(),
            }),
          );
        } else if (!terminal) {
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.completed",
              eventId: createId(),
              requestId,
              occurredAt: now(),
            }),
          );
        }
      } catch (error) {
        if (!mountedRef.current) {
          return;
        }

        if (abortController.signal.aborted) {
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.canceled",
              eventId: createId(),
              requestId,
              occurredAt: now(),
            }),
          );
        } else {
          const chatError = toChatError(error);
          updateConversation((state) =>
            reduceChatConversation(state, {
              type: "run.failed",
              eventId: createId(),
              requestId,
              occurredAt: now(),
              error: chatError,
            }),
          );
          onError?.(chatError);
        }
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = undefined;
        }
      }

      if (mountedRef.current) {
        onRunEnd?.(conversationRef.current);
      }
    },
    [agent, createId, now, onError, onRunEnd, onRunStart, transport, updateConversation],
  );

  const send = useCallback(
    async (input?: AionChatSendInput) => {
      const parts = input?.parts ??
        (draft.trim() ? [{ type: "text" as const, text: draft.trim() }] : []);
      if (!agent || parts.length === 0 || abortRef.current) {
        return;
      }

      const createdAt = now();
      const message: ChatMessage = {
        id: createId(),
        role: "user",
        parts,
        contextId: conversationRef.current.contextId,
        createdAt,
      };
      setDraft("");
      await execute(createId(), message, 1, input?.metadata);
    },
    [agent, createId, draft, execute, now, setDraft],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(async () => {
    const activeRun = conversationRef.current.activeRun;
    if (
      !activeRun ||
      activeRun.status !== "failed" ||
      !activeRun.error?.retryable
    ) {
      return;
    }

    const turn = conversationRef.current.turns.find(
      (candidate) => candidate.id === activeRun.turnId,
    );
    const message = conversationRef.current.messages.find(
      (candidate) => candidate.id === turn?.userMessageId,
    );
    if (!turn || !message) {
      return;
    }

    await execute(turn.id, message, activeRun.attempt + 1);
  }, [execute]);

  const isRunning = conversation.activeRun?.status === "running";
  const value = useMemo<AionChatController>(
    () => ({
      state: { agent, conversation, draft },
      actions: { setAgent, setDraft, send, stop, retry },
      meta: {
        isRunning,
        canSend: Boolean(agent && draft.trim() && !isRunning),
        canRetry: Boolean(
          conversation.activeRun?.status === "failed" &&
          conversation.activeRun.error?.retryable,
        ),
      },
    }),
    [agent, conversation, draft, isRunning, retry, send, setAgent, setDraft, stop],
  );

  return (
    <AionChatContext.Provider value={value}>
      {children}
    </AionChatContext.Provider>
  );
}
