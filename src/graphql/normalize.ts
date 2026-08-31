import type { ChatTransportEvent } from "../events";
import type {
  ChatArtifact,
  ChatMessage,
  ChatPart,
  ChatTask,
  ChatTaskState,
} from "../model";
import type { ApolloAionChatSubscriptionData } from "./types";

const STREAM_ARTIFACT_IDS = new Set(["aion:stream-delta", "stream_delta"]);

/** Coordinates required to normalize one GraphQL response payload. */
export interface ApolloAionChatNormalizationContext {
  readonly requestId: string;
  readonly turnId: string;
  readonly occurredAt: string;
  readonly createEventId: () => string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function field(
  value: Record<string, unknown>,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (key in value) {
      return value[key];
    }
  }
  return undefined;
}

function stringField(
  value: Record<string, unknown>,
  ...keys: readonly string[]
): string {
  const result = field(value, ...keys);
  return typeof result === "string" ? result : "";
}

function booleanField(
  value: Record<string, unknown>,
  ...keys: readonly string[]
): boolean {
  return field(value, ...keys) === true;
}

function metadata(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return record(value);
}

function eventKind(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
  switch (normalized) {
    case "task-status-update-event":
    case "task-status-update":
    case "status-update-event":
      return "status-update";
    case "task-artifact-update-event":
    case "task-artifact-update":
    case "artifact-update-event":
      return "artifact-update";
    default:
      return normalized;
  }
}

function taskState(value: unknown): ChatTaskState {
  if (typeof value === "number") {
    switch (value) {
      case 2:
        return "working";
      case 3:
        return "completed";
      case 4:
        return "failed";
      case 5:
        return "canceled";
      case 6:
        return "input-required";
      case 7:
        return "rejected";
      case 8:
        return "auth-required";
      case 1:
        return "submitted";
      default:
        return "unknown";
    }
  }

  const normalized =
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/^task_state_/, "").replace(/_/g, "-")
      : "unknown";
  switch (normalized) {
    case "submitted":
    case "working":
    case "input-required":
    case "auth-required":
    case "completed":
    case "failed":
    case "canceled":
    case "rejected":
    case "unknown":
      return normalized;
    case "running":
      return "working";
    case "cancelled":
      return "canceled";
    default:
      return "unknown";
  }
}

function normalizePart(value: unknown): ChatPart | undefined {
  const part = record(value);
  if (!part) {
    return undefined;
  }
  const content = record(part.content);
  if (content) {
    return normalizePart({ ...content, metadata: part.metadata });
  }
  const kind = eventKind(part.kind ?? part.$case);
  const partMetadata = metadata(part.metadata);
  if ((kind === "text" || !kind) && typeof part.text === "string") {
    return { type: "text", text: part.text, metadata: partMetadata };
  }
  if (kind === "text" && typeof part.value === "string") {
    return { type: "text", text: part.value, metadata: partMetadata };
  }
  if (kind === "file") {
    const file = record(part.file ?? part.value);
    if (!file) {
      return undefined;
    }
    return {
      type: "file",
      file: {
        name: typeof file.name === "string" ? file.name : undefined,
        mediaType: stringField(file, "mimeType", "mime_type") || undefined,
        url: stringField(file, "uri", "url") || undefined,
        bytes: typeof file.bytes === "string" ? file.bytes : undefined,
      },
      metadata: partMetadata,
    };
  }
  if (kind === "data") {
    return {
      type: "data",
      data: part.data ?? part.value,
      metadata: partMetadata,
    };
  }
  return undefined;
}

function normalizeParts(value: unknown): readonly ChatPart[] {
  return Array.isArray(value)
    ? value.flatMap((part) => {
        const normalized = normalizePart(part);
        return normalized ? [normalized] : [];
      })
    : [];
}

function normalizeMessage(
  value: unknown,
  context: ApolloAionChatNormalizationContext,
): ChatMessage | undefined {
  const message = record(value);
  if (!message) {
    return undefined;
  }
  const parts = normalizeParts(message.parts);
  if (parts.length === 0) {
    return undefined;
  }
  const rawRole = stringField(message, "role").toLowerCase();
  const role = rawRole === "user" || rawRole === "role-user" || rawRole === "role_user"
    ? "user"
    : rawRole === "system" || rawRole === "role-system" || rawRole === "role_system"
      ? "system"
      : "assistant";
  return {
    id: stringField(message, "messageId", "message_id") || context.createEventId(),
    role,
    parts,
    contextId: stringField(message, "contextId", "context_id") || undefined,
    taskId: stringField(message, "taskId", "task_id") || undefined,
    createdAt: context.occurredAt,
    metadata: metadata(message.metadata),
  };
}

function normalizeArtifact(
  value: unknown,
  taskId: string,
  contextId: string,
  lastChunk: boolean,
  context: ApolloAionChatNormalizationContext,
): ChatArtifact | undefined {
  const artifact = record(value);
  if (!artifact) {
    return undefined;
  }
  const artifactId =
    stringField(artifact, "artifactId", "artifact_id") || context.createEventId();
  return {
    id: `${taskId}:${artifactId}`,
    artifactId,
    taskId,
    contextId,
    name: typeof artifact.name === "string" ? artifact.name : undefined,
    description:
      typeof artifact.description === "string" ? artifact.description : undefined,
    parts: normalizeParts(artifact.parts),
    lastChunk,
    metadata: metadata(artifact.metadata),
  };
}

function streamArtifactCompleted(artifact: ChatArtifact): boolean {
  if (!STREAM_ARTIFACT_IDS.has(artifact.artifactId)) {
    return false;
  }
  const rawStatus = artifact.metadata?.status;
  const rawReason =
    artifact.metadata?.statusReason ?? artifact.metadata?.status_reason;
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : "";
  const reason = typeof rawReason === "string" ? rawReason.toLowerCase() : "";
  return artifact.lastChunk || status === "finalized" || reason === "complete_message";
}

function messageEvent(
  message: ChatMessage,
  context: ApolloAionChatNormalizationContext,
): ChatTransportEvent {
  return {
    type: "message.received",
    eventId: context.createEventId(),
    requestId: context.requestId,
    occurredAt: context.occurredAt,
    turnId: context.turnId,
    message,
  };
}

function normalizeTask(
  value: Record<string, unknown>,
  context: ApolloAionChatNormalizationContext,
): readonly ChatTransportEvent[] {
  const taskId = stringField(value, "id", "taskId", "task_id") || context.requestId;
  const contextId =
    stringField(value, "contextId", "context_id") || context.requestId;
  const rawStatus = record(value.status) ?? {};
  const history = Array.isArray(value.history)
    ? value.history.flatMap((item) => {
        const message = normalizeMessage(item, context);
        return message ? [message] : [];
      })
    : [];
  const statusMessage = normalizeMessage(rawStatus.message, context);
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts.flatMap((item) => {
        const artifact = normalizeArtifact(item, taskId, contextId, true, context);
        return artifact ? [artifact] : [];
      })
    : [];
  const task: ChatTask = {
    id: taskId,
    contextId,
    status: {
      state: taskState(rawStatus.state),
      message: statusMessage,
      timestamp:
        stringField(rawStatus, "timestamp") || context.occurredAt,
    },
    history,
    artifactIds: artifacts.map((artifact) => artifact.id),
    metadata: metadata(value.metadata),
  };
  return [
    ...artifacts.map<ChatTransportEvent>((artifact) => ({
      type: "artifact.updated",
      eventId: context.createEventId(),
      requestId: context.requestId,
      occurredAt: context.occurredAt,
      turnId: context.turnId,
      artifact,
      append: false,
    })),
    {
      type: "task.received",
      eventId: context.createEventId(),
      requestId: context.requestId,
      occurredAt: context.occurredAt,
      turnId: context.turnId,
      task,
    },
  ];
}

function normalizeResult(
  value: unknown,
  context: ApolloAionChatNormalizationContext,
): readonly ChatTransportEvent[] {
  const result = record(value);
  if (!result) {
    return [];
  }
  const statusUpdate = record(field(result, "statusUpdate", "status_update"));
  if (statusUpdate) {
    return normalizeResult({ ...statusUpdate, kind: "status-update" }, context);
  }
  const artifactUpdate = record(
    field(result, "artifactUpdate", "artifact_update"),
  );
  if (artifactUpdate) {
    return normalizeResult(
      { ...artifactUpdate, kind: "artifact-update" },
      context,
    );
  }
  const unaryTask = record(result.task);
  if (unaryTask) {
    return normalizeTask(unaryTask, context);
  }
  const unaryMessage = normalizeMessage(result.message, context);
  if (unaryMessage) {
    return [
      messageEvent(unaryMessage, context),
      {
        type: "run.completed",
        eventId: context.createEventId(),
        requestId: context.requestId,
        occurredAt: context.occurredAt,
      },
    ];
  }

  const kind = eventKind(result.kind);
  if (kind === "task") {
    return normalizeTask(result, context);
  }
  if (kind === "message") {
    const message = normalizeMessage(result, context);
    return message
      ? [
          messageEvent(message, context),
          {
            type: "run.completed",
            eventId: context.createEventId(),
            requestId: context.requestId,
            occurredAt: context.occurredAt,
          },
        ]
      : [];
  }
  if (kind === "status-update") {
    const status = record(result.status) ?? {};
    return [
      {
        type: "task.status-changed",
        eventId: context.createEventId(),
        requestId: context.requestId,
        occurredAt: context.occurredAt,
        turnId: context.turnId,
        taskId: stringField(result, "taskId", "task_id") || context.requestId,
        contextId:
          stringField(result, "contextId", "context_id") || context.requestId,
        state: taskState(status.state),
        final: booleanField(result, "final"),
        message: normalizeMessage(status.message, context),
      },
    ];
  }
  if (kind === "artifact-update") {
    const taskId =
      stringField(result, "taskId", "task_id") || context.requestId;
    const contextId =
      stringField(result, "contextId", "context_id") || context.requestId;
    const artifact = normalizeArtifact(
      result.artifact,
      taskId,
      contextId,
      booleanField(result, "lastChunk", "last_chunk"),
      context,
    );
    if (!artifact) {
      return [];
    }
    const update: ChatTransportEvent = {
      type: "artifact.updated",
      eventId: context.createEventId(),
      requestId: context.requestId,
      occurredAt: context.occurredAt,
      turnId: context.turnId,
      artifact,
      append: booleanField(result, "append"),
    };
    return streamArtifactCompleted(artifact)
      ? [
          update,
          {
            type: "run.completed",
            eventId: context.createEventId(),
            requestId: context.requestId,
            occurredAt: context.occurredAt,
          },
        ]
      : [update];
  }
  return [];
}

function errorCode(code: number): {
  readonly code: string;
  readonly retryable: boolean;
} {
  switch (code) {
    case -32010:
      return { code: "authentication_required", retryable: false };
    case -32011:
      return { code: "access_denied", retryable: false };
    case -32012:
      return { code: "agent_unavailable", retryable: true };
    case -32603:
      return { code: "a2a_internal_error", retryable: true };
    default:
      return { code: "a2a_json_rpc_error", retryable: false };
  }
}

/** Normalizes one selected GraphQL response into core transport events. */
export function normalizeApolloAionChatResponse(
  data: ApolloAionChatSubscriptionData,
  context: ApolloAionChatNormalizationContext,
): readonly ChatTransportEvent[] {
  const response = data.a2aRpc;
  if (!response) {
    return [];
  }
  if (response.__typename === "A2AJsonRpcErrorResponseGQL") {
    const classification = errorCode(response.error.code);
    return [
      {
        type: "run.failed",
        eventId: context.createEventId(),
        requestId: context.requestId,
        occurredAt: context.occurredAt,
        error: {
          ...classification,
          message: response.error.message,
          details: { jsonRpcCode: response.error.code },
        },
      },
    ];
  }
  return normalizeResult(response.result, context);
}
