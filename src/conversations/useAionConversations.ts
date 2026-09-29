import { welcomeEvents, mergeWelcomeConversation } from "../welcome";
import type { AionChatTransport } from "../transport";
import type { ChatError } from "../model";
import {
  useCallback,
  useEffect,
  useMemo,
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
import { reduceChatConversation } from "../reducer";
import type {
  AionConversationDirectory,
  AionRemoteContextSummary,
} from "./directory";
import { AionConversationDirectoryError } from "./directory-error";
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
  readonly transport?: AionChatTransport;
  readonly onError?: (error: ChatError) => void;
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
  /** Delete remotely before clearing the cache, or remove local-only history. */
  readonly removeConversation: (contextId: ContextId) => Promise<void>;
  /** Whether the selected conversation is waiting for deletion confirmation. */
  readonly removalStatus?: "pending" | "in_progress";
  /** Sanitized deletion failure for the selected conversation. */
  readonly removalError?: Error;
  /** False for read-only remote directories and while a request is pending. */
  readonly canRemoveConversation: boolean;
  readonly clearSelection: () => void;
  readonly reload: () => void;
  /**
   * Refresh metadata after pending pagination, preserving selection and chat.
   * A newer pagination request or scope change cancels an obsolete refresh.
   */
  readonly refreshMetadata: () => Promise<void>;
}

interface ConversationHookState {
  readonly agentId?: string;
  readonly summaries: readonly AionConversationSummary[];
  readonly selectedContextId?: ContextId;
  readonly conversation?: ChatConversationState;
  readonly status: AionNavigationLoadStatus;
  readonly error?: Error;
  readonly remoteContexts: readonly AionRemoteContextSummary[];
  readonly nextRemoteOffset?: number;
}

interface ConversationRemoval {
  readonly status: "pending" | "in_progress" | "deleted" | "failed";
  readonly error?: Error;
}

function conversationKey(agentId: string, contextId: ContextId): string {
  return `${agentId}\u0000${contextId}`;
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
  remote: AionRemoteContextSummary,
): AionConversationSummary {
  return {
    agentId: agent.id,
    contextId: remote.contextId,
    title: "Conversation",
    updatedAt: remote.lastActivityAt,
  };
}

function mergeRemoteSummaries(
  agent: ChatAgent,
  remoteContexts: readonly AionRemoteContextSummary[],
  cached: readonly AionConversationSummary[],
  optimisticContextIds: ReadonlySet<ContextId>,
): readonly AionConversationSummary[] {
  const cachedById = new Map(
    cached.map((summary) => [summary.contextId, summary]),
  );
  const remoteIds = new Set(
    remoteContexts.map(({ contextId }) => contextId),
  );
  const optimistic = sortSummaries(
    cached.filter(
      (summary) =>
        optimisticContextIds.has(summary.contextId) &&
        !remoteIds.has(summary.contextId),
    ),
  );
  return [
    ...optimistic,
    ...remoteContexts.map((remote) => ({
      ...(cachedById.get(remote.contextId) ?? remoteSummary(agent, remote)),
      updatedAt: remote.lastActivityAt,
      generatedTitle: remote.title ?? null,
      generatedSummary: remote.summary ?? null,
    })),
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

function acknowledgeRemoteContexts(
  optimisticByAgent: Map<string, Set<ContextId>>,
  agentId: string,
  contexts: readonly AionRemoteContextSummary[],
): void {
  const optimistic = optimisticByAgent.get(agentId);
  if (!optimistic) {
    return;
  }
  for (const context of contexts) {
    optimistic.delete(context.contextId);
  }
  if (optimistic.size === 0) {
    optimisticByAgent.delete(agentId);
  }
}

/** Coordinates local summaries, selection, and safe snapshot persistence. */
export function useAionConversations({
  store,
  transport,
  onError,
  directory,
  agent,
  fixedContextId,
  directoryPageSize = 50,
  createId = defaultCreateId,
  now = defaultNow,
}: UseAionConversationsOptions): UseAionConversationsResult {
  const welcomeResultsRef = useRef(new Map<string, ChatConversationState>());
  const welcomeAbortsRef = useRef(new Set<AbortController>());
  const [reloadToken, setReloadToken] = useState(0);
  const loadGenerationRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());
  const activeRunContextsRef = useRef(new Set<string>());
  const optimisticContextsRef = useRef(new Map<string, Set<ContextId>>());
  const selectionAbortRef = useRef<AbortController>(undefined);
  const pageAbortRef = useRef<AbortController>(undefined);
  const pageRequestRef = useRef<Promise<number | undefined>>(undefined);
  const metadataAbortRef = useRef<AbortController>(undefined);
  const mountedRef = useRef(true);
  // A different cache/directory is a different authentication/storage scope.
  const removalScope = useMemo(() => ({ store, directory }), [store, directory]);
  const removalScopeRef = useRef(removalScope);
  const [removals, setRemovals] = useState(new Map<string, ConversationRemoval>());
  const removalsRef = useRef(removals);
  const updateRemoval = useCallback(
    (key: string, removal: ConversationRemoval) => {
      if (removalScopeRef.current !== removalScope) return;
      const next = new Map(removalsRef.current).set(key, removal);
      removalsRef.current = next;
      if (mountedRef.current) setRemovals(next);
    },
    [removalScope],
  );
  const isContextBlocked = useCallback((agentId: string, contextId: string) => {
    const removal = removalsRef.current.get(conversationKey(agentId, contextId));
    return removal !== undefined && removal.status !== "failed";
  }, []);
  const [state, setState] = useState<ConversationHookState>({
    agentId: agent?.id,
    summaries: [],
    remoteContexts: [],
    status: agent ? "loading" : "idle",
  });
  const stateRef = useRef(state);
  const updateState = useCallback(
    (
      update: (
        current: ConversationHookState,
      ) => ConversationHookState,
    ) => {
      const next = update(stateRef.current);
      stateRef.current = next;
      setState(next);
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
    removalScopeRef.current = removalScope;
    const next = new Map<string, ConversationRemoval>();
    removalsRef.current = next;
    setRemovals(next);
  }, [removalScope]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      selectionAbortRef.current?.abort();
      pageAbortRef.current?.abort();
      metadataAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    const abortController = new AbortController();
    selectionAbortRef.current?.abort();
    pageAbortRef.current?.abort();
    pageRequestRef.current = undefined;
    metadataAbortRef.current?.abort();
    if (!agent) {
      updateState(() => ({
        agentId: undefined,
        summaries: [],
        remoteContexts: [],
        status: "idle",
      }));
      return () => abortController.abort();
    }
    if (fixedContextId && isContextBlocked(agent.id, fixedContextId)) {
      updateState(() => ({
        agentId: agent.id,
        selectedContextId: fixedContextId,
        summaries: [],
        remoteContexts: [],
        status: "ready",
      }));
      return () => abortController.abort();
    }
    updateState(() => ({
      agentId: agent.id,
      summaries: [],
      remoteContexts: [],
      status: "loading",
    }));
    void mutationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const cached = await store.list(agent.id);
        let summaries: readonly AionConversationSummary[];
        let conversation: ChatConversationState | undefined;
        let remoteContexts: readonly AionRemoteContextSummary[] = [];
        let nextRemoteOffset: number | undefined;
        let directoryError: Error | undefined;

        if (directory) {
          try {
            if (fixedContextId) {
              const remote = await directory.load(
                agent,
                fixedContextId,
                { signal: abortController.signal },
              );
              conversation = remote.conversation;
              if (
                abortController.signal.aborted ||
                isContextBlocked(agent.id, fixedContextId)
              ) return;
              try {
                const snapshot = createAionConversationSnapshot(conversation, {
                  updatedAt: remote.lastActivityAt,
                });
                await enqueueMutation(async () => {
                  if (!isContextBlocked(agent.id, fixedContextId)) {
                    await store.save(agent.id, snapshot);
                  }
                });
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
              remoteContexts = page.contexts;
              nextRemoteOffset = page.nextOffset;
              summaries = mergeRemoteSummaries(
                agent,
                remoteContexts,
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
        acknowledgeRemoteContexts(
          optimisticContextsRef.current,
          agent.id,
          remoteContexts,
        );
        updateState(() => ({
          agentId: agent.id,
          summaries,
          remoteContexts,
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
            remoteContexts: [],
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
    isContextBlocked,
    enqueueMutation,
  ]);

  useEffect(() => {
    const aborts = welcomeAbortsRef.current;
    const results = welcomeResultsRef.current;
    return () => {
      for (const controller of aborts) controller.abort();
      aborts.clear();
      results.clear();
    };
  }, [store, directory, transport, agent?.id]);

  const startWelcome = useCallback(async (initial: ChatConversationState) => {
    if (!transport || !initial.agent || !initial.contextId) return;
    const selectedAgent = initial.agent;
    const contextId = initial.contextId;
    const key = conversationKey(selectedAgent.id, contextId);
    const controller = new AbortController();
    welcomeAbortsRef.current.add(controller);
    let welcome = initial;
    try {
      for await (const event of welcomeEvents(
        transport, initial, controller.signal, createId, now,
      )) {
        if (controller.signal.aborted || !mountedRef.current
          || isContextBlocked(selectedAgent.id, contextId)) break;
        welcome = reduceChatConversation(welcome, event);
        welcomeResultsRef.current.set(key, welcome);
        const current = stateRef.current;
        const selected = current.agentId === selectedAgent.id
          && current.selectedContextId === contextId;
        const merged = mergeWelcomeConversation(
          selected && current.conversation ? current.conversation : initial,
          welcome,
        );
        const snapshot = createAionConversationSnapshot(merged, {
          updatedAt: now(),
        });
        updateState((state) => ({
          ...state,
          ...(state.agentId === selectedAgent.id ? {
            summaries: replaceSummary(state.summaries, summarizeAionConversation(snapshot)),
          } : {}),
          ...(selected ? { conversation: merged } : {}),
        }));
        const received = welcome;
        void enqueueMutation(async () => {
          if (controller.signal.aborted || isContextBlocked(selectedAgent.id, contextId)) return;
          const cached = await store.load(selectedAgent.id, contextId);
          await store.save(selectedAgent.id, createAionConversationSnapshot(
            mergeWelcomeConversation(cached?.conversation ?? initial, received),
            { createdAt: cached?.createdAt, updatedAt: now() },
          ));
        }).catch(() => onError?.({
          code: "conversation_save_failed", message: "The welcome could not be saved.", retryable: false,
        }));
        if (event.type === "run.failed") onError?.(event.error);
      }
    } catch {
      if (!controller.signal.aborted) onError?.({
        code: "welcome_failed", message: "The welcome could not be loaded.", retryable: false,
      });
    } finally {
      welcomeAbortsRef.current.delete(controller);
    }
  }, [transport, createId, now, isContextBlocked, updateState, enqueueMutation, store, onError]);

  const createConversation = useCallback(() => {
    if (!agent || agent.availability !== "available") {
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
      remoteContexts: current.remoteContexts,
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
    void startWelcome(conversation);
    return contextId;
  }, [agent, createId, enqueueMutation, now, store, updateState, startWelcome]);

  const selectConversation = useCallback(
    async (contextId: ContextId) => {
      if (!agent) return;
      if (isContextBlocked(agent.id, contextId)) {
        const removal = removalsRef.current.get(
          conversationKey(agent.id, contextId),
        );
        if (removal?.status !== "deleted") {
          updateState((current) => ({
            ...current,
            selectedContextId: contextId,
            conversation: undefined,
            status: "ready",
            error: undefined,
          }));
        }
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
        const optimistic = optimisticContextsRef.current
          .get(agent.id)
          ?.has(contextId);
        const listedRemotely = stateRef.current.remoteContexts
          .some((context) => context.contextId === contextId);
        const remote =
          directory && (!optimistic || listedRemotely)
            ? await directory.load(agent, contextId, {
                signal: abortController.signal,
              })
            : undefined;
        const snapshot = remote
          ? createAionConversationSnapshot(remote.conversation, {
              updatedAt: remote.lastActivityAt,
            })
          : await store.load(agent.id, contextId);
        if (
          abortController.signal.aborted ||
          isContextBlocked(agent.id, contextId)
        ) return;
        let cacheError: Error | undefined;
        if (remote && snapshot) {
          try {
            await enqueueMutation(async () => {
              if (!isContextBlocked(agent.id, contextId)) {
                await store.save(agent.id, snapshot);
              }
            });
          } catch {
            cacheError = conversationError();
          }
        }
        if (
          !mountedRef.current ||
          loadGenerationRef.current !== generation ||
          isContextBlocked(agent.id, contextId)
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
          summaries: remote
            ? replaceSummary(current.summaries, {
                ...summarizeAionConversation(snapshot),
                generatedTitle: remote.title ?? null,
                generatedSummary: remote.summary ?? null,
              })
            : current.summaries,
          selectedContextId: contextId,
          conversation: remote
            ? withAgent(remote.conversation, agent)
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
    [agent, directory, enqueueMutation, isContextBlocked, store, updateState],
  );

  const saveConversation = useCallback(
    (incoming: ChatConversationState) => {
      const welcome = incoming.contextId && incoming.agent
        ? welcomeResultsRef.current.get(conversationKey(incoming.agent.id, incoming.contextId))
        : undefined;
      const conversation = welcome ? mergeWelcomeConversation(incoming, welcome) : incoming;
      if (
        !agent ||
        conversation.agent?.id !== agent.id ||
        !conversation.contextId ||
        isContextBlocked(agent.id, conversation.contextId)
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
        summaries: replaceSummary(current.summaries, {
          ...summary,
          generatedTitle: existing?.generatedTitle,
          generatedSummary: existing?.generatedSummary,
        }),
        selectedContextId: snapshot.contextId,
        conversation,
        status: "ready",
        error: undefined,
      }));
      if (persist) {
        void enqueueMutation(async () => {
          if (!isContextBlocked(agent.id, snapshot.contextId)) {
            await store.save(agent.id, snapshot);
          }
        }).catch(
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
    [agent, enqueueMutation, isContextBlocked, now, store, updateState],
  );

  const loadNextPage = useCallback(async () => {
    const current = stateRef.current;
    if (!agent || !directory || current.nextRemoteOffset === undefined) {
      return;
    }
    pageAbortRef.current?.abort();
    metadataAbortRef.current?.abort();
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
      acknowledgeRemoteContexts(
        optimisticContextsRef.current,
        agent.id,
        page.contexts,
      );
      updateState((value) => {
        const remoteContexts = [
          ...value.remoteContexts,
          ...page.contexts.filter(
            (context) => !value.remoteContexts.some(
              (existing) => existing.contextId === context.contextId,
            ),
          ),
        ];
        return {
          ...value,
          summaries: mergeRemoteSummaries(
            agent,
            remoteContexts,
            cached,
            optimisticContextsRef.current.get(agent.id) ?? new Set(),
          ),
          remoteContexts,
          nextRemoteOffset: page.nextOffset,
          status: "ready",
          error: undefined,
        };
      });
      // React may not have rendered this range when a waiting refresh resumes.
      return offset + page.contexts.length;
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

  const loadMoreConversations = useCallback(async () => {
    // Refresh waits for the whole operation, including the cache/state update.
    const request = loadNextPage();
    pageRequestRef.current = request;
    await request;
  }, [loadNextPage]);

  const removeConversation = useCallback(
    async (contextId: ContextId) => {
      if (
        !agent || stateRef.current.agentId !== agent.id ||
        removalScopeRef.current !== removalScope
      ) return;
      const key = conversationKey(agent.id, contextId);
      const previous = removalsRef.current.get(key);
      if (previous?.status === "pending" || previous?.status === "deleted") return;
      updateRemoval(key, { status: "pending" });
      const interrupted = stateRef.current.conversation;
      if (interrupted?.contextId === contextId &&
        interrupted.activeRun?.status === "running") {
        // The workspace unmounts its stream, not necessarily the remote task.
        const stopped = reduceChatConversation(interrupted, {
          type: "run.canceled",
          eventId: createId(),
          requestId: interrupted.activeRun.requestId,
          occurredAt: now(),
        });
        updateState((current) => current.conversation === interrupted
          ? { ...current, conversation: stopped } : current);
      }
      // Cancel stale reads before they can repopulate this context or its cache.
      selectionAbortRef.current?.abort();
      pageAbortRef.current?.abort();
      metadataAbortRef.current?.abort();
      ++loadGenerationRef.current;
      try {
        if (directory) {
          if (!directory.delete) {
            throw new AionConversationDirectoryError(
              "unsupported",
              "This directory does not support deletion.",
              false,
            );
          }
          try {
            await directory.delete(agent, contextId);
          } catch (error) {
            // A lost successful response may leave a retry with no context.
            if (
              !(error instanceof AionConversationDirectoryError) ||
              error.code !== "context_not_found"
            ) throw error;
          }
        }
        if (!directory) {
          await enqueueMutation(() => store.remove(agent.id, contextId));
        }
        updateRemoval(key, { status: "deleted" });
        if (removalScopeRef.current === removalScope) {
          optimisticContextsRef.current.get(agent.id)?.delete(contextId);
        }
        let cacheError: Error | undefined;
        try {
          if (directory) {
            await enqueueMutation(() => store.remove(agent.id, contextId));
          }
        } catch {
          cacheError = new Error(
            "The conversation was deleted, but its local cache could not be cleared.",
          );
        }
        if (
          !mountedRef.current ||
          agent.id !== stateRef.current.agentId ||
          removalScopeRef.current !== removalScope
        ) {
          return;
        }
        pageAbortRef.current?.abort();
        metadataAbortRef.current?.abort();
        updateState((current) => {
          const wasListed = current.remoteContexts.some(
            (context) => context.contextId === contextId,
          );
          return {
            ...current,
            summaries: current.summaries.filter(
              (summary) => summary.contextId !== contextId,
            ),
            remoteContexts: current.remoteContexts.filter(
              (context) => context.contextId !== contextId,
            ),
            nextRemoteOffset: current.nextRemoteOffset === undefined
              ? undefined
              : Math.max(0, current.nextRemoteOffset - (wasListed ? 1 : 0)),
            selectedContextId:
              current.selectedContextId === contextId
                ? undefined
                : current.selectedContextId,
            conversation:
              current.selectedContextId === contextId
                ? undefined
                : current.conversation,
            status: cacheError ? "error" : "ready",
            error: cacheError,
          };
        });
      } catch (error) {
        const safeError = error instanceof AionConversationDirectoryError
          ? error
          : new Error(directory
            ? "The conversation could not be deleted. Please try again."
            : "The local conversation could not be removed.");
        updateRemoval(key, {
          status: safeError instanceof AionConversationDirectoryError &&
            safeError.code === "deletion_in_progress" ? "in_progress" : "failed",
          error: safeError,
        });
        if (
          mountedRef.current && stateRef.current.agentId === agent.id &&
          removalScopeRef.current === removalScope
        ) {
          updateState((current) => ({
            ...current,
            status: "ready",
          }));
        }
      }
    },
    [
      agent, createId, directory, enqueueMutation, now, removalScope, store,
      updateRemoval, updateState,
    ],
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

  const refreshMetadata = useCallback(async () => {
    if (!agent || !directory || fixedContextId) return;
    const controller = new AbortController();
    metadataAbortRef.current?.abort();
    metadataAbortRef.current = controller;
    try {
      // User pagination takes priority; refresh its expanded range afterward.
      const loadedThrough = await pageRequestRef.current;
      if (controller.signal.aborted) return;
      const required = Math.max(
        directoryPageSize,
        stateRef.current.remoteContexts.length,
        loadedThrough ?? 0,
      );
      const remoteContexts: AionRemoteContextSummary[] = [];
      let nextOffset: number | undefined = 0;
      do {
        const page = await directory.list(agent, {
          offset: nextOffset,
          limit: directoryPageSize,
          signal: controller.signal,
        });
        remoteContexts.push(...page.contexts);
        nextOffset = page.nextOffset;
      } while (
        !controller.signal.aborted &&
        nextOffset !== undefined &&
        remoteContexts.length < required
      );
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        stateRef.current.agentId !== agent.id
      )
        return;
      updateState((current) => {
        return {
          ...current,
          remoteContexts,
          summaries: mergeRemoteSummaries(
            agent,
            remoteContexts,
            current.summaries,
            optimisticContextsRef.current.get(agent.id) ?? new Set(),
          ),
          nextRemoteOffset: nextOffset,
        };
      });
    } catch {
      // Metadata refresh failure must not interrupt a selected/running conversation.
    }
  }, [agent, directory, directoryPageSize, fixedContextId, updateState]);

  const selectedRemoval = state.agentId && state.selectedContextId
    ? removals.get(conversationKey(state.agentId, state.selectedContextId))
    : undefined;
  const summaries = useMemo(() => state.summaries.filter((summary) => {
    const key = conversationKey(summary.agentId, summary.contextId);
    return removals.get(key)?.status !== "deleted";
  }), [state.summaries, removals]);
  return {
    summaries,
    selectedContextId: state.selectedContextId,
    conversation: selectedRemoval?.status === "deleted"
      ? undefined : state.conversation,
    removalStatus: selectedRemoval?.status === "pending" ||
      selectedRemoval?.status === "in_progress" ? selectedRemoval.status : undefined,
    removalError: selectedRemoval?.error,
    canRemoveConversation: Boolean(state.selectedContextId) &&
      (!directory || typeof directory.delete === "function") &&
      selectedRemoval?.status !== "pending" && selectedRemoval?.status !== "deleted",
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
    refreshMetadata,
  };
}
