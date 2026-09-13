/** Caller-visible routing; environment IDs and catalog IDs are not interchangeable. */
export interface AionConversationUpdateScope {
  readonly organizationId: string;
  readonly agentEnvironmentId: string;
  readonly distributionId?: string;
  readonly contextId: string;
  /** Persisted task/summary version; compare this rather than arrival time. */
  readonly updatedAt: string;
  /** Notification construction time; optional for custom/older sources. */
  readonly createdAt?: string;
}

/** Absolute metadata changes, separate from the active conversation transport. */
export type AionConversationUpdate = AionConversationUpdateScope &
  (
    | {
        readonly kind: "ConversationSummaryUpdated";
        readonly title: string | null;
        readonly summary: string | null;
        readonly summarizedThroughTurn: number;
      }
    | {
        readonly kind: "TaskStatusUpdated";
        readonly taskId: string;
        readonly taskState: string;
      }
  );

/** A reset is current task state, not historical completion events or replay. */
export interface AionConversationUpdates {
  readonly reset: boolean;
  readonly updates: readonly AionConversationUpdate[];
}

/** One authenticated principal-wide feed using a caller-owned connection. */
export interface AionConversationUpdatesSource {
  /** Stable identity/organization key; changing it discards all transient state. */
  readonly scopeKey: string;
  /** Open one operation; cancellation must dispose its subscription. */
  subscribe(options: {
    readonly signal: AbortSignal;
  }): AsyncIterable<AionConversationUpdates>;
  /** Override mapping for custom catalogs; default is distributionId, then environment. */
  agentIdForUpdate?(update: AionConversationUpdateScope): string | undefined;
}
