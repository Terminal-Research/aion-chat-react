import {
  cloneAionConversationSnapshot,
  parseAionConversationSnapshot,
  summarizeAionConversation,
} from "../conversations/snapshot";
import {
  AION_CONVERSATION_SNAPSHOT_VERSION,
  type AionConversationSnapshot,
  type AionConversationStore,
} from "../conversations/types";

const DEFAULT_KEY_PREFIX = "aion-chat:conversations";

/** Configuration for one explicitly host-scoped browser cache. */
export interface BrowserAionConversationStoreOptions {
  readonly scopeKey: string;
  readonly storage?: Storage;
}

interface BrowserEnvelope {
  readonly version: typeof AION_CONVERSATION_SNAPSHOT_VERSION;
  readonly snapshots: readonly AionConversationSnapshot[];
}

function assertValue(value: string, name: string): string {
  const result = value.trim();
  if (!result) {
    throw new Error(`${name} must not be empty.`);
  }
  return result;
}

function storageError(action: string): Error {
  return new Error(`The browser conversation cache could not be ${action}.`);
}

function resolveStorage(explicit: Storage | undefined): Storage {
  if (explicit) {
    return explicit;
  }
  try {
    if (globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    throw storageError("accessed");
  }
  throw storageError("accessed");
}

function parseEnvelope(value: string): BrowserEnvelope | null {
  let raw: unknown;
  try {
    raw = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  if (
    candidate.version !== AION_CONVERSATION_SNAPSHOT_VERSION ||
    !Array.isArray(candidate.snapshots)
  ) {
    return null;
  }
  const snapshots = candidate.snapshots.map(parseAionConversationSnapshot);
  if (snapshots.some((snapshot) => snapshot === null)) {
    return null;
  }
  return {
    version: AION_CONVERSATION_SNAPSHOT_VERSION,
    snapshots: snapshots as readonly AionConversationSnapshot[],
  };
}

/** Creates a lazy browser store isolated by an opaque host scope key. */
export function createBrowserAionConversationStore(
  options: BrowserAionConversationStoreOptions,
): AionConversationStore {
  const scopeKey = assertValue(options.scopeKey, "scopeKey");
  const storageKey =
    `${DEFAULT_KEY_PREFIX}:v1:${encodeURIComponent(scopeKey)}`;

  const read = (): AionConversationSnapshot[] => {
    const storage = resolveStorage(options.storage);
    let serialized: string | null;
    try {
      serialized = storage.getItem(storageKey);
    } catch {
      throw storageError("read");
    }
    if (!serialized) {
      return [];
    }
    const envelope = parseEnvelope(serialized);
    if (envelope) {
      return [...envelope.snapshots];
    }
    try {
      storage.removeItem(storageKey);
    } catch {
      throw storageError("reset");
    }
    return [];
  };

  const write = (snapshots: readonly AionConversationSnapshot[]) => {
    const storage = resolveStorage(options.storage);
    const envelope: BrowserEnvelope = {
      version: AION_CONVERSATION_SNAPSHOT_VERSION,
      snapshots,
    };
    try {
      storage.setItem(storageKey, JSON.stringify(envelope));
    } catch {
      throw storageError("updated");
    }
  };

  return {
    list(agentId) {
      const summaries = read()
        .filter((snapshot) => snapshot.agentId === agentId)
        .map(summarizeAionConversation)
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        );
      return Promise.resolve(summaries);
    },
    load(agentId, contextId) {
      const snapshot = read().find(
        (candidate) =>
          candidate.agentId === agentId &&
          candidate.contextId === contextId,
      );
      return Promise.resolve(
        snapshot ? cloneAionConversationSnapshot(snapshot) : null,
      );
    },
    save(agentId, snapshot) {
      const copy = cloneAionConversationSnapshot(snapshot);
      if (copy.agentId !== agentId) {
        throw new Error("The conversation snapshot belongs to another agent.");
      }
      const snapshots = read().filter(
        (candidate) =>
          candidate.agentId !== agentId ||
          candidate.contextId !== copy.contextId,
      );
      write([...snapshots, copy]);
      return Promise.resolve();
    },
    remove(agentId, contextId) {
      const snapshots = read();
      const remaining = snapshots.filter(
        (candidate) =>
          candidate.agentId !== agentId ||
          candidate.contextId !== contextId,
      );
      if (remaining.length !== snapshots.length) {
        write(remaining);
      }
      return Promise.resolve();
    },
  };
}
