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
import type { AionConversationDirectory } from "./directory";
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
  readonly directory?: AionConversationDirectory;
  readonly agent?: ChatAgent;
  readonly fixedContextId?: ContextId;
  readonly directoryPageSize?: number;
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
  readonly hasMoreConversations: boolean;
  readonly createConversation: () => ContextId | undefined;
  readonly selectConversation: (contextId: ContextId) => Promise<void>;
  readonly loadMoreConversations: () => Promise<void>;
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
  readonly remoteContextIds: readonly ContextId[];
  readonly nextRemoteOffset?: number;
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

function asError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error("The remote conversation history could not be loaded.");
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
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
  );
}

function remoteSummary(
  agent: ChatAgent,
  contextId: ContextId,
): AionConversationSummary {
  return {
    agentId: agent.id,
    contextId,
    title: "Conversation",
    preview: contextId,
  };
}

function mergeRemoteSummaries(
  agent: ChatAgent,
  remoteContextIds: readonly ContextId[],
  cached: readonly AionConversationSummary[],
  optimisticContextIds: ReadonlySet<ContextId>,
): readonly AionConversationSummary[] {
  const cachedById = new Map(
    cached.map((summary) => [summary.contextId, summary]),
  );
  const remoteIds = new Set(remoteContextIds);
  const optimistic = sortSummaries(
    cached.filter(
      (summary) =>
        optimisticContextIds.has(summary.contextId) &&
        !remoteIds.has(summary.contextId),
    ),
  );
  return [
    ...optimistic,
    ...remoteContextIds.map(
      (contextId) =>
        cachedById.get(contextId) ?? remoteSummary(agent, contextId),
    ),
  ];
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
  directory,
  agent,
  fixedContextId,
  directoryPageSize = 50,
  createId = defaultCreateId,
  now = defaultNow,
}: UseAionConversationsOptions): UseAionConversationsResult {
  const [reloadToken, setReloadToken] = useState(0);
  const loadGenerationRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());
  const activeRunContextsRef = useRef(new Set<string>());
  const optimisticContextsRef = useRef(new Map<string, Set<ContextId>>());
  const selectionAbortRef = useRef<AbortController>(undefined);
  const pageAbortRef = useRef<AbortController>(undefined);
  const nowRef = useRef(now);
  const mountedRef = useRef(true);
  const [state, setState] = useState<ConversationHookState>({
    agentId: agent?.id,
    summaries: [],
    remoteContextIds: [],
    status: agent ? "loading" : "idle",
  });
  const stateRef = useRef(state);
  nowRef.current = now;

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
      selectionAbortRef.current?.abort();
      pageAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    const abortController = new AbortController();
    selectionAbortRef.current?.abort();
    pageAbortRef.current?.abort();
    if (!agent) {
      updateState(() => ({
        agentId: undefined,
        summaries: [],
        remoteContextIds: [],
        status: "idle",
      }));
      return () => abortController.abort();
    }
    updateState(() => ({
      agentId: agent.id,
      summaries: [],
      remoteContextIds: [],
      status: "loading",
    }));
    void mutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const cached = await store.list(agent.id);
        let summaries: readonly AionConversationSummary[];
        let conversation: ChatConversationState | undefined;
        let remoteContextIds: readonly ContextId[] = [];
        let nextRemoteOffset: number | undefined;
        let directoryError: Error | undefined;

        if (directory) {
          try {
            if (fixedContextId) {
              conversation = await directory.load(
                agent,
                fixedContextId,
                { signal: abortController.signal },
              );
              try {
                await store.save(
                  agent.id,
                  createAionConversationSnapshot(conversation, {
                    updatedAt: nowRef.current(),
                  }),
                );
              } catch {
                directoryError = conversationError();
              }
              summaries = [];
            } else {
              const page = await directory.list(agent, {
                offset: 0,
                limit: directoryPageSize,
                signal: abortController.signal,
              });
              remoteContextIds = page.contextIds;
              nextRemoteOffset = page.nextOffset;
              summaries = mergeRemoteSummaries(
                agent,
                remoteContextIds,
                cached,
                optimisticContextsRef.current.get(agent.id) ?? new Set(),
              );
            }
          } catch (error) {
            if (abortController.signal.aborted) {
              return;
            }
            directoryError = asError(error);
            conversation = fixedContextId
              ? emptyConversation(agent, fixedContextId)
              : undefined;
            summaries = mergeRemoteSummaries(
              agent,
              [],
              cached,
              optimisticContextsRef.current.get(agent.id) ?? new Set(),
            );
          }
        } else {
          const snapshot = fixedContextId
            ? await store.load(agent.id, fixedContextId)
            : null;
          summaries = sortSummaries(cached);
          conversation = fixedContextId
            ? snapshot
              ? withAgent(snapshot.conversation, agent)
              : emptyConversation(agent, fixedContextId)
            : undefined;
        }
        if (
          !mountedRef.current ||
          loadGenerationRef.current !== generation
        ) {
          return;
        }
        updateState(() => ({
          agentId: agent.id,
          summaries,
          remoteContextIds,
          nextRemoteOffset,
          selectedContextId: fixedContextId,
          conversation,
          status:
            directoryError && !fixedContextId ? "error" : "ready",
          error: directoryError,
        }));
      })
      .catch((error: unknown) => {
        if (
          mountedRef.current &&
          loadGenerationRef.current === generation
        ) {
          updateState(() => ({
            agentId: agent.id,
            summaries: [],
            remoteContextIds: [],
            status: "error",
            error: directory ? asError(error) : conversationError(),
          }));
        }
      });
    return () => abortController.abort();
  }, [
    agent,
    directory,
    directoryPageSize,
    fixedContextId,
    reloadToken,
    store,
    updateState,
  ]);

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
    const optimistic =
      optimisticContextsRef.current.get(agent.id) ?? new Set<ContextId>();
    optimistic.add(contextId);
    optimisticContextsRef.current.set(agent.id, optimistic);
    ++loadGenerationRef.current;
    updateState((current) => ({
      agentId: agent.id,
      summaries: replaceSummary(current.summaries, summary),
      remoteContextIds: current.remoteContextIds,
      nextRemoteOffset: current.nextRemoteOffset,
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
      selectionAbortRef.current?.abort();
      const abortController = new AbortController();
      selectionAbortRef.current = abortController;
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
        const remoteConversation = directory
          ? await directory.load(agent, contextId, {
              signal: abortController.signal,
            })
          : undefined;
        const snapshot = remoteConversation
          ? createAionConversationSnapshot(remoteConversation, {
              updatedAt: now(),
            })
          : await store.load(agent.id, contextId);
        let cacheError: Error | undefined;
        if (remoteConversation && snapshot) {
          try {
            await enqueueMutation(() => store.save(agent.id, snapshot));
          } catch {
            cacheError = conversationError();
          }
        }
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
          summaries: remoteConversation
            ? replaceSummary(
                current.summaries,
                summarizeAionConversation(snapshot),
              )
            : current.summaries,
          selectedContextId: contextId,
          conversation: remoteConversation
            ? withAgent(remoteConversation, agent)
            : withAgent(snapshot.conversation, agent),
          status: cacheError ? "error" : "ready",
          error: cacheError,
        }));
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        if (
          mountedRef.current &&
          loadGenerationRef.current === generation
        ) {
          updateState((current) => ({
            ...current,
            status: "error",
            error: directory ? asError(error) : conversationError(),
          }));
        }
      }
    },
    [agent, directory, enqueueMutation, now, store, updateState],
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

  const loadMoreConversations = useCallback(async () => {
    const current = stateRef.current;
    if (!agent || !directory || current.nextRemoteOffset === undefined) {
      return;
    }
    pageAbortRef.current?.abort();
    const abortController = new AbortController();
    pageAbortRef.current = abortController;
    const offset = current.nextRemoteOffset;
    updateState((value) => ({
      ...value,
      status: "loading",
      error: undefined,
    }));
    try {
      const page = await directory.list(agent, {
        offset,
        limit: directoryPageSize,
        signal: abortController.signal,
      });
      const cached = await store.list(agent.id);
      if (
        abortController.signal.aborted ||
        !mountedRef.current ||
        stateRef.current.agentId !== agent.id ||
        stateRef.current.nextRemoteOffset !== offset
      ) {
        return;
      }
      updateState((value) => {
        const remoteContextIds = [
          ...value.remoteContextIds,
          ...page.contextIds.filter(
            (contextId) => !value.remoteContextIds.includes(contextId),
          ),
        ];
        return {
          ...value,
          summaries: mergeRemoteSummaries(
            agent,
            remoteContextIds,
            cached,
            optimisticContextsRef.current.get(agent.id) ?? new Set(),
          ),
          remoteContextIds,
          nextRemoteOffset: page.nextOffset,
          status: "ready",
          error: undefined,
        };
      });
    } catch (error) {
      if (
        !abortController.signal.aborted &&
        mountedRef.current &&
        stateRef.current.agentId === agent.id &&
        stateRef.current.nextRemoteOffset === offset
      ) {
        updateState((value) => ({
          ...value,
          status: "error",
          error: asError(error),
        }));
      }
    }
  }, [agent, directory, directoryPageSize, store, updateState]);

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
          summaries:
            directory && current.remoteContextIds.includes(contextId)
              ? replaceSummary(
                  current.summaries.filter(
                    (summary) => summary.contextId !== contextId,
                  ),
                  remoteSummary(agent, contextId),
                )
              : current.summaries.filter(
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
    [agent, directory, enqueueMutation, store, updateState],
  );

  const clearSelection = useCallback(() => {
    selectionAbortRef.current?.abort();
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
    hasMoreConversations: state.nextRemoteOffset !== undefined,
    createConversation,
    selectConversation,
    loadMoreConversations,
    saveConversation,
    removeConversation,
    clearSelection,
    reload,
  };
}
