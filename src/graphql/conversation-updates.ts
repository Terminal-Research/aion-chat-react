import type {
  AionConversationUpdate,
  AionConversationUpdates,
  AionConversationUpdatesSource,
} from "../conversations/updates/types";
import type { AionGraphQLResult } from "./types";

/** Shared variables never broaden the server-resolved principal boundary. */
export interface ConversationUpdatesVariables {
  readonly organizationId?: string;
  readonly principal?: string;
}

/** Untrusted operation result validated before entering reactive state. */
export interface ConversationUpdatesData {
  readonly conversationUpdates?: unknown;
}

/** Shared scope/mapping options for caller-owned GraphQL adapters. */
export interface ConversationUpdatesSourceOptions
  extends ConversationUpdatesVariables {
  readonly scopeKey: string;
  readonly agentIdForUpdate?: AionConversationUpdatesSource["agentIdForUpdate"];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function invalid(): Error {
  return new Error(
    "The conversation updates subscription returned an invalid response.",
  );
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw invalid();
  return value;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw invalid();
  return value;
}

/** Validate the complete frame atomically; no partial reset on malformed input. */
export function normalizeConversationUpdates(
  result: AionGraphQLResult<ConversationUpdatesData>,
): AionConversationUpdates {
  if (result.errors?.length)
    throw new Error("Conversation updates are unavailable.");
  const frame = record(result.data?.conversationUpdates);
  if (
    typeof frame.reset !== "boolean" ||
    !Array.isArray(frame.updates) ||
    frame.updates.length > 1_000
  )
    throw invalid();
  const updates = frame.updates.map((value): AionConversationUpdate => {
    const row = record(value);
    const createdAt = optionalText(row.createdAt);
    if (createdAt !== null && !Number.isFinite(Date.parse(createdAt)))
      throw invalid();
    const scope = {
      organizationId: text(row.organizationId),
      agentEnvironmentId: text(row.agentEnvironmentId),
      distributionId: optionalText(row.distributionId) ?? undefined,
      contextId: text(row.contextId),
      updatedAt: text(row.updatedAt),
      ...(createdAt !== null ? { createdAt } : {}),
    };
    if (!Number.isFinite(Date.parse(scope.updatedAt))) throw invalid();
    if (row.kind === "ConversationSummaryUpdated") {
      if (
        typeof row.summarizedThroughTurn !== "number" ||
        !Number.isSafeInteger(row.summarizedThroughTurn) ||
        row.summarizedThroughTurn < 1
      )
        throw invalid();
      return {
        ...scope,
        kind: row.kind,
        title: optionalText(row.title),
        summary: optionalText(row.summary),
        summarizedThroughTurn: row.summarizedThroughTurn,
      };
    }
    if (row.kind === "TaskStatusUpdated") {
      const taskState = text(row.taskState);
      if (
        !/^TASK_STATE_(UNSPECIFIED|SUBMITTED|WORKING|INPUT_REQUIRED|AUTH_REQUIRED|COMPLETED|FAILED|REJECTED|CANCELLED|CANCELED)$/u.test(
          taskState,
        )
      )
        throw invalid();
      return { ...scope, kind: row.kind, taskId: text(row.taskId), taskState };
    }
    throw invalid();
  });
  return { reset: frame.reset, updates };
}

/** Adapt a caller-owned operation without creating another WebSocket connection. */
export function createConversationUpdatesSource(
  options: ConversationUpdatesSourceOptions,
  observe: (
    variables: ConversationUpdatesVariables,
    signal: AbortSignal,
  ) => AsyncIterable<AionGraphQLResult<ConversationUpdatesData>>,
): AionConversationUpdatesSource {
  return {
    scopeKey: options.scopeKey,
    agentIdForUpdate: options.agentIdForUpdate,
    async *subscribe({ signal }) {
      for await (const result of observe(
        {
          organizationId: options.organizationId,
          principal: options.principal,
        },
        signal,
      )) {
        if (signal.aborted) return;
        const frame = normalizeConversationUpdates(result);
        // Defense against accidentally supplying a mismatched custom operation.
        if (
          options.organizationId &&
          frame.updates.some(
            (update) => update.organizationId !== options.organizationId,
          )
        )
          throw invalid();
        yield frame;
      }
    },
  };
}
