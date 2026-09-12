import { createStore } from "zustand/vanilla";

import type { AionRemoteContextSummary } from "../directory";
import type {
  AionConversationUpdates,
  AionConversationUpdateScope,
} from "./types";

/** Transient authorized text; never written into browser conversation snapshots. */
export interface ConversationMetadata {
  readonly title: string | null;
  readonly summary: string | null;
  readonly revision: number;
  readonly revealUntil: number;
}

/** Latest absolute status for one caller-visible task. */
export interface ConversationTask {
  readonly state: string;
  readonly updatedAt: string;
}

/** Canonical state is keyed by environment/context, not by catalog position. */
export interface ConversationThread {
  readonly tasks: Readonly<Record<string, ConversationTask>>;
  readonly completedUntil: number;
  readonly summaryCheckpoint?: number;
  readonly metadata?: ConversationMetadata;
}

/** Session-local reactive state and synchronous update/reconciliation actions. */
export interface ConversationUpdatesState {
  readonly revision: number;
  readonly resetRevision: number;
  readonly threads: Readonly<Record<string, ConversationThread>>;
  readonly routes: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, ConversationMetadata>>;
  readonly refresh: Readonly<Record<string, number>>;
  /** Order overlapping directory reads against one another and live events. */
  beginRead(): number;
  apply(
    frame: AionConversationUpdates,
    agentId: (scope: AionConversationUpdateScope) => string | undefined,
    now?: number,
  ): void;
  hydrate(
    agentId: string,
    rows: readonly AionRemoteContextSummary[],
    startedAtRevision: number,
  ): void;
  expire(now: number): void;
}

/** Collision-free keys for both canonical scopes and their catalog aliases. */
export function conversationKey(owner: string, contextId: string): string {
  return JSON.stringify([owner, contextId]);
}

/** Canonical A2A terminal outcomes; needs-input/auth remain active. */
export function isTerminalTask(state: string): boolean {
  return [
    "TASK_STATE_COMPLETED",
    "TASK_STATE_FAILED",
    "TASK_STATE_REJECTED",
    "TASK_STATE_CANCELLED",
    "TASK_STATE_CANCELED",
  ].includes(state);
}

/** Creates one non-persisted store per workspace/authentication scope. */
export function createConversationUpdatesStore() {
  return createStore<ConversationUpdatesState>()((set, get) => ({
    revision: 0,
    resetRevision: 0,
    threads: {},
    routes: {},
    metadata: {},
    refresh: {},
    beginRead() {
      const revision = get().revision + 1;
      set({ revision });
      return revision;
    },
    apply(frame, agentId, now = Date.now()) {
      set((state) => {
        const revision = state.revision + 1;
        const threads: Record<string, ConversationThread> = frame.reset
          ? Object.fromEntries(
              Object.entries(state.threads).map(([key, thread]) => [
                key,
                { ...thread, tasks: {}, completedUntil: 0 },
              ]),
            )
          : { ...state.threads };
        const routes = { ...state.routes };
        const metadata = { ...state.metadata };
        const refresh = { ...state.refresh };
        for (const update of frame.updates) {
          const key = conversationKey(
            update.agentEnvironmentId,
            update.contextId,
          );
          const agent = agentId(update);
          const route = agent && conversationKey(agent, update.contextId);
          if (route) {
            if (!routes[route]) refresh[agent] = revision;
            routes[route] = key;
          }
          const thread: ConversationThread = threads[key] ?? {
            tasks: {},
            completedUntil: 0,
          };
          if (update.kind === "ConversationSummaryUpdated") {
            if (
              thread.summaryCheckpoint !== undefined &&
              update.summarizedThroughTurn <= thread.summaryCheckpoint
            )
              continue;
            const read = route ? metadata[route] : undefined;
            const prior =
              read &&
              (!thread.metadata || read.revision >= thread.metadata.revision)
                ? read
                : thread.metadata;
            const changed = prior?.title !== update.title;
            threads[key] = {
              ...thread,
              summaryCheckpoint: update.summarizedThroughTurn,
              metadata: {
                title: update.title,
                summary: update.summary,
                revision,
                revealUntil: !frame.reset && changed ? now + 600 : 0,
              },
            };
          } else {
            const prior = thread.tasks[update.taskId];
            const older =
              prior &&
              Date.parse(update.updatedAt) < Date.parse(prior.updatedAt);
            const duplicate =
              prior &&
              prior.state === update.taskState &&
              prior.updatedAt === update.updatedAt;
            // Terminal tasks cannot regress when equal-time deliveries reorder.
            if (older || duplicate || (prior && isTerminalTask(prior.state)))
              continue;
            threads[key] = {
              ...thread,
              tasks: {
                ...thread.tasks,
                [update.taskId]: {
                  state: update.taskState,
                  updatedAt: update.updatedAt,
                },
              },
              completedUntil:
                !frame.reset && update.taskState === "TASK_STATE_COMPLETED"
                  ? now + 1_200
                  : thread.completedUntil,
            };
          }
        }
        return {
          revision,
          threads,
          routes,
          metadata,
          refresh,
          resetRevision: frame.reset ? revision : state.resetRevision,
        };
      });
    },
    hydrate(agentId, rows, startedAtRevision) {
      set((state) => {
        const metadata = { ...state.metadata };
        for (const row of rows) {
          const key = conversationKey(agentId, row.contextId);
          // A read started before a live update must not erase that newer text.
          const route = state.routes[key];
          const thread = route ? state.threads[route] : undefined;
          if (
            Math.max(
              metadata[key]?.revision ?? 0,
              thread?.metadata?.revision ?? 0,
            ) > startedAtRevision
          )
            continue;
          metadata[key] = {
            title: row.title ?? null,
            summary: row.summary ?? null,
            revision: startedAtRevision,
            revealUntil: 0,
          };
        }
        return { metadata };
      });
    },
    expire(now) {
      set((state) => ({
        threads: Object.fromEntries(
          Object.entries(state.threads).map(([key, value]) => [
            key,
            {
              ...value,
              completedUntil:
                value.completedUntil <= now ? 0 : value.completedUntil,
              metadata:
                value.metadata?.revealUntil && value.metadata.revealUntil <= now
                  ? { ...value.metadata, revealUntil: 0 }
                  : value.metadata,
            },
          ]),
        ),
        metadata: Object.fromEntries(
          Object.entries(state.metadata).map(([key, value]) => [
            key,
            value.revealUntil && value.revealUntil <= now
              ? { ...value, revealUntil: 0 }
              : value,
          ]),
        ),
      }));
    },
  }));
}

/** Vanilla store handle consumed through the workspace's React provider. */
export type ConversationUpdatesStore = ReturnType<
  typeof createConversationUpdatesStore
>;
