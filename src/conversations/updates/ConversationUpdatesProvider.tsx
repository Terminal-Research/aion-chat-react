import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { AionConversationDirectory } from "../directory";
import {
  ConversationUpdatesContext,
  useConversationUpdatesContext,
} from "./context";
import { trackConversationDirectory } from "./directory";
import {
  createConversationUpdatesStore,
  type ConversationUpdatesStore,
} from "./store";
import type {
  AionConversationUpdatesSource,
  AionConversationUpdateScope,
} from "./types";

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 2_000);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

function scheduleExpiry(store: ConversationUpdatesStore): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduled = 0;
  const schedule = () => {
    const state = store.getState();
    const deadlines = Object.values(state.threads).flatMap((thread) => [
      thread.completedUntil,
      thread.metadata?.revealUntil ?? 0,
    ]);
    const next = Math.min(...deadlines.filter((time) => time > 0));
    if (next === scheduled) return;
    clearTimeout(timer);
    scheduled = next;
    if (Number.isFinite(next))
      timer = setTimeout(
        () => {
          scheduled = 0;
          store.getState().expire(Date.now());
        },
        Math.max(1, next - Date.now()),
      );
  };
  const unsubscribe = store.subscribe(schedule);
  schedule();
  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}

/** Own one feed above thread selection, with cancellable retries and transient timers. */
export function ConversationUpdatesProvider({
  source,
  directory,
  children,
}: {
  readonly source?: AionConversationUpdatesSource;
  readonly directory?: AionConversationDirectory;
  readonly children: ReactNode;
}) {
  const scopeKey = source?.scopeKey;
  const { store } = useMemo(
    () => ({ scopeKey, store: createConversationUpdatesStore() }),
    [scopeKey],
  );
  const [connection, setConnection] = useState(0);
  const value = useMemo(
    () => ({
      store,
      directory:
        source && directory
          ? trackConversationDirectory(directory, store)
          : directory,
    }),
    [directory, store, source],
  );

  useEffect(() => scheduleExpiry(store), [store]);
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    const { signal } = controller;
    const agentId = (update: AionConversationUpdateScope) =>
      source.agentIdForUpdate
        ? source.agentIdForUpdate(update)
        : (update.distributionId ?? update.agentEnvironmentId);
    void (async () => {
      while (!signal.aborted) {
        try {
          for await (const frame of source.subscribe({ signal })) {
            if (signal.aborted) return;
            store.getState().apply(frame, agentId);
          }
        } catch {
          // Best-effort metadata failure never stops the active chat transport.
        }
        if (!signal.aborted) await pause(signal);
      }
    })();
    return () => controller.abort();
  }, [source, store, connection]);

  useEffect(() => {
    if (!source) return;
    const focus = () => setConnection((value) => value + 1);
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [source]);

  return (
    <ConversationUpdatesContext.Provider value={value}>
      {children}
    </ConversationUpdatesContext.Provider>
  );
}

/** Coalesce resets/new contexts into directory refreshes without changing selection. */
export function ConversationMetadataRefresh({
  agentId,
  refresh,
}: {
  readonly agentId?: string;
  readonly refresh: () => Promise<void>;
}) {
  const context = useConversationUpdatesContext();
  if (!context) return null;
  return (
    <ScopedMetadataRefresh
      store={context.store}
      agentId={agentId}
      refresh={refresh}
    />
  );
}

function ScopedMetadataRefresh({
  store,
  agentId,
  refresh,
}: {
  readonly store: ConversationUpdatesStore;
  readonly agentId?: string;
  readonly refresh: () => Promise<void>;
}) {
  const revision = useStore(store, (state) =>
    Math.max(state.resetRevision, agentId ? (state.refresh[agentId] ?? 0) : 0),
  );
  useEffect(() => {
    if (!revision || !agentId) return;
    const timer = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(timer);
  }, [agentId, refresh, revision]);
  return null;
}
