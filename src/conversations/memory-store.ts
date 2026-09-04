import type {
  AionConversationSnapshot,
  AionConversationStore,
  AionConversationSummary,
} from "./types";
import {
  cloneAionConversationSnapshot,
  summarizeAionConversation,
} from "./snapshot";

function sortSummaries(
  summaries: readonly AionConversationSummary[],
): readonly AionConversationSummary[] {
  return [...summaries].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

/** Creates a provider-lifetime conversation store with isolated snapshots. */
export function createInMemoryAionConversationStore(
  initialSnapshots: readonly AionConversationSnapshot[] = [],
): AionConversationStore {
  const snapshots = new Map<string, Map<string, AionConversationSnapshot>>();

  const saveSnapshot = (
    agentId: string,
    snapshot: AionConversationSnapshot,
  ) => {
    const copy = cloneAionConversationSnapshot(snapshot);
    if (agentId !== copy.agentId) {
      throw new Error("The conversation snapshot belongs to another agent.");
    }
    const agentSnapshots =
      snapshots.get(agentId) ??
      new Map<string, AionConversationSnapshot>();
    agentSnapshots.set(copy.contextId, copy);
    snapshots.set(agentId, agentSnapshots);
  };

  for (const snapshot of initialSnapshots) {
    saveSnapshot(snapshot.agentId, snapshot);
  }

  return {
    list(agentId) {
      const summaries = Array.from(
        snapshots.get(agentId)?.values() ?? [],
        summarizeAionConversation,
      );
      return Promise.resolve(sortSummaries(summaries));
    },
    load(agentId, contextId) {
      const snapshot = snapshots.get(agentId)?.get(contextId);
      return Promise.resolve(
        snapshot ? cloneAionConversationSnapshot(snapshot) : null,
      );
    },
    save(agentId, snapshot) {
      saveSnapshot(agentId, snapshot);
      return Promise.resolve();
    },
    remove(agentId, contextId) {
      const agentSnapshots = snapshots.get(agentId);
      agentSnapshots?.delete(contextId);
      if (agentSnapshots?.size === 0) {
        snapshots.delete(agentId);
      }
      return Promise.resolve();
    },
  };
}
