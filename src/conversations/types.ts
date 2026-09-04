import type { ChatConversationState, ContextId } from "../model";

/** Current persisted conversation-snapshot schema version. */
export const AION_CONVERSATION_SNAPSHOT_VERSION = 1 as const;

/** Safe, serializable state for one agent and A2A context. */
export interface AionConversationSnapshot {
  readonly version: typeof AION_CONVERSATION_SNAPSHOT_VERSION;
  readonly agentId: string;
  readonly contextId: ContextId;
  readonly title: string;
  readonly preview?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly conversation: ChatConversationState;
}

/** Lightweight list projection for one locally known conversation. */
export interface AionConversationSummary {
  readonly agentId: string;
  readonly contextId: ContextId;
  readonly title: string;
  readonly preview?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/** Local persistence boundary keyed by agent and A2A context. */
export interface AionConversationStore {
  /**
   * Lists cached conversations for one agent, newest first.
   *
   * @param agentId Selected chat-agent identifier.
   * @return Safe summaries ordered by latest activity.
   */
  list(agentId: string): Promise<readonly AionConversationSummary[]>;

  /**
   * Loads one cached conversation.
   *
   * @param agentId Selected chat-agent identifier.
   * @param contextId A2A context identifier.
   * @return The snapshot, or `null` when it is not cached.
   */
  load(
    agentId: string,
    contextId: ContextId,
  ): Promise<AionConversationSnapshot | null>;

  /**
   * Saves one safe conversation snapshot.
   *
   * @param agentId Selected chat-agent identifier.
   * @param snapshot Safe snapshot for that agent.
   * @return Completion after the snapshot is durable in this store.
   */
  save(
    agentId: string,
    snapshot: AionConversationSnapshot,
  ): Promise<void>;

  /**
   * Removes only the locally cached conversation.
   *
   * @param agentId Selected chat-agent identifier.
   * @param contextId A2A context identifier.
   * @return Completion after the local cache entry is removed.
   */
  remove(agentId: string, contextId: ContextId): Promise<void>;
}

/** Options used when deriving a safe snapshot from live chat state. */
export interface AionConversationSnapshotOptions {
  readonly createdAt?: string;
  readonly updatedAt?: string;
}
