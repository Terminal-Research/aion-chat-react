import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type ChatAgent,
  type ChatConversationState,
  type ContextId,
  createChatConversationState,
} from "../model";
import type { AionNavigationLoadStatus } from "../useAionAgentCatalog";
import {
  createAionConversationSnapshot,
  summarizeAionConversation,
} from "./snapshot";
import type {
  AionConversationStore,
  AionConversationSummary,
} from "./types";

/** Configuration for local conversation navigation and persistence. */
export interface UseAionConversationsOptions {
  readonly store: AionConversationStore;
  readonly agent?: ChatAgent;
  readonly fixedContextId?: ContextId;
  readonly createId?: () => string;
  readonly now?: () => string;
}

/** Headless state and actions for one selected agent's conversations. */
export interface UseAionConversationsResult {
  readonly summaries: readonly AionConversationSummary[];
  readonly selectedContextId?: ContextId;
  readonly conversation?: ChatConversationState;
  readonly status: AionNavigationLoadStatus;
  readonly error?: Error;
  readonly createConversation: () => ContextId | undefined;
  readonly selectConversation: (contextId: ContextId) => Promise<void>;
  readonly saveConversation: (state: ChatConversationState) => void;
  readonly removeConversation: (contextId: ContextId) => Promise<void>;
  readonly clearSelection: () => void;
  readonly reload: () => void;
}

interface ConversationHookState {
  readonly agentId?: string;
  readonly summaries: readonly AionConversationSummary[];
  readonly selectedContextId?: ContextId;
  readonly conversation?: ChatConversationState;
  readonly status: AionNavigationLoadStatus;
  readonly error?: Error;
}

function defaultCreateId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function conversationError(): Error {
  return new Error("The local conversation history could not be loaded.");
}

function withAgent(
  conversation: ChatConversationState,
  agent: ChatAgent,
): ChatConversationState {
  return { ...conversation, agent };
}

function emptyConversation(
  agent: ChatAgent,
  contextId: ContextId,
): ChatConversationState {
  return {
    ...createChatConversationState(contextId, agent),
    contextId,
  };
}

function sortSummaries(
  summaries: readonly AionConversationSummary[],
): readonly AionConversationSummary[] {
  return [...summaries].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function replaceSummary(
  summaries: readonly AionConversationSummary[],
  summary: AionConversationSummary,
): readonly AionConversationSummary[] {
  return sortSummaries([
    summary,
    ...summaries.filter(
      (candidate) => candidate.contextId !== summary.contextId,
    ),
  ]);
}

/** Coordinates local summaries, selection, and safe snapshot persistence. */
export function useAionConversations({
  store,
  agent,
  fixedContextId,
  createId = defaultCreateId,
  now = defaultNow,
}: UseAionConversationsOptions): UseAionConversationsResult {
  const [reloadToken, setReloadToken] = useState(0);
  const loadGenerationRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());
  const activeRunContextsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const [state, setState] = useState<ConversationHookState>({
    agentId: agent?.id,
    summaries: [],
    status: agent ? "loading" : "idle",
  });
  const stateRef = useRef(state);

  const updateState = useCallback(
    (
      update: (
        current: ConversationHookState,
      ) => ConversationHookState,
    ) => {
      setState((current) => {
        const next = update(current);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const enqueueMutation = useCallback((mutation: () => Promise<void>) => {
    const result = mutationQueueRef.current
      .catch(() => undefined)
      .then(mutation);
    mutationQueueRef.current = result.catch(() => undefined);
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    if (!agent) {
      updateState(() => ({
        agentId: undefined,
        summaries: [],
        status: "idle",
      }));
      return;
    }
    updateState(() => ({
      agentId: agent.id,
      summaries: [],
      status: "loading",
    }));
    void mutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const [summaries, snapshot] = await Promise.all([
          store.list(agent.id),
          fixedContextId
            ? store.load(agent.id, fixedContextId)
            : Promise.resolve(null),
        ]);
        if (
          !mountedRef.current ||
          loadGenerationRef.current !== generation
        ) {
          return;
        }
        const conversation = fixedContextId
          ? snapshot
            ? withAgent(snapshot.conversation, agent)
            : emptyConversation(agent, fixedContextId)
          : undefined;
        updateState(() => ({
          agentId: agent.id,
          summaries: sortSummaries(summaries),
          selectedContextId: fixedContextId,
          conversation,
          status: "ready",
        }));
      })
      .catch(() => {
        if (
          mountedRef.current &&
          loadGenerationRef.current === generation
        ) {
          updateState(() => ({
            agentId: agent.id,
            summaries: [],
            status: "error",
            error: conversationError(),
          }));
        }
      });
  }, [agent, fixedContextId, reloadToken, store, updateState]);

  const createConversation = useCallback(() => {
    if (!agent) {
      return undefined;
    }
    const contextId = createId();
    const conversation = emptyConversation(agent, contextId);
    const timestamp = now();
    const snapshot = createAionConversationSnapshot(conversation, {
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const summary = summarizeAionConversation(snapshot);
    ++loadGenerationRef.current;
    updateState((current) => ({
      agentId: agent.id,
      summaries: replaceSummary(current.summaries, summary),
      selectedContextId: contextId,
      conversation,
      status: "ready",
    }));
    void enqueueMutation(() => store.save(agent.id, snapshot)).catch(() => {
      if (mountedRef.current) {
        updateState((current) => ({
          ...current,
          status: "error",
          error: conversationError(),
        }));
      }
    });
    return contextId;
  }, [agent, createId, enqueueMutation, now, store, updateState]);

  const selectConversation = useCallback(
    async (contextId: ContextId) => {
      if (!agent) {
        return;
      }
      const generation = ++loadGenerationRef.current;
      updateState((current) => ({
        ...current,
        selectedContextId: contextId,
        conversation: undefined,
        status: "loading",
        error: undefined,
      }));
      try {
        await mutationQueueRef.current.catch(() => undefined);
        const snapshot = await store.load(agent.id, contextId);
        if (
          !mountedRef.current ||
          loadGenerationRef.current !== generation
        ) {
          return;
        }
        if (!snapshot) {
          updateState((current) => ({
            ...current,
            summaries: current.summaries.filter(
              (summary) => summary.contextId !== contextId,
            ),
            selectedContextId: undefined,
            conversation: undefined,
            status: "error",
            error: conversationError(),
          }));
          return;
        }
        updateState((current) => ({
          ...current,
          selectedContextId: contextId,
          conversation: withAgent(snapshot.conversation, agent),
          status: "ready",
          error: undefined,
        }));
      } catch {
        if (
          mountedRef.current &&
          loadGenerationRef.current === generation
        ) {
          updateState((current) => ({
            ...current,
            status: "error",
            error: conversationError(),
          }));
        }
      }
    },
    [agent, store, updateState],
  );

  const saveConversation = useCallback(
    (conversation: ChatConversationState) => {
      if (
        !agent ||
        conversation.agent?.id !== agent.id ||
        !conversation.contextId
      ) {
        return;
      }
      const existing = stateRef.current.summaries.find(
        (summary) => summary.contextId === conversation.contextId,
      );
      const snapshot = createAionConversationSnapshot(conversation, {
        createdAt: existing?.createdAt,
        updatedAt: now(),
      });
      const summary = summarizeAionConversation(snapshot);
      const runKey = `${agent.id}\u0000${snapshot.contextId}`;
      const running = conversation.activeRun?.status === "running";
      const persist = !running || !activeRunContextsRef.current.has(runKey);
      if (running) {
        activeRunContextsRef.current.add(runKey);
      } else {
        activeRunContextsRef.current.delete(runKey);
      }
      updateState((current) => ({
        ...current,
        summaries: replaceSummary(current.summaries, summary),
        selectedContextId: snapshot.contextId,
        conversation,
        status: "ready",
        error: undefined,
      }));
      if (persist) {
        void enqueueMutation(() => store.save(agent.id, snapshot)).catch(
          () => {
            if (mountedRef.current) {
              updateState((current) => ({
                ...current,
                status: "error",
                error: conversationError(),
              }));
            }
          },
        );
      }
    },
    [agent, enqueueMutation, now, store, updateState],
  );

  const removeConversation = useCallback(
    async (contextId: ContextId) => {
      if (!agent) {
        return;
      }
      try {
        await enqueueMutation(() => store.remove(agent.id, contextId));
        if (
          !mountedRef.current ||
          agent.id !== stateRef.current.agentId
        ) {
          return;
        }
        updateState((current) => ({
          ...current,
          summaries: current.summaries.filter(
            (summary) => summary.contextId !== contextId,
          ),
          selectedContextId:
            current.selectedContextId === contextId
              ? undefined
              : current.selectedContextId,
          conversation:
            current.selectedContextId === contextId
              ? undefined
              : current.conversation,
          status: "ready",
          error: undefined,
        }));
      } catch {
        if (mountedRef.current) {
          updateState((current) => ({
            ...current,
            status: "error",
            error: conversationError(),
          }));
        }
      }
    },
    [agent, enqueueMutation, store, updateState],
  );

  const clearSelection = useCallback(() => {
    ++loadGenerationRef.current;
    updateState((current) => ({
      ...current,
      selectedContextId: undefined,
      conversation: undefined,
    }));
  }, [updateState]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return {
    summaries: state.summaries,
    selectedContextId: state.selectedContextId,
    conversation: state.conversation,
    status: state.status,
    error: state.error,
    createConversation,
    selectConversation,
    saveConversation,
    removeConversation,
    clearSelection,
    reload,
  };
}
