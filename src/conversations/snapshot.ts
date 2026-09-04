import type {
  ChatAgent,
  ChatArtifact,
  ChatConversationState,
  ChatError,
  ChatMessage,
  ChatPart,
  ChatTask,
  ChatTaskStatus,
  ChatTranscriptItem,
  ChatTurn,
} from "../model";
import {
  AION_CONVERSATION_SNAPSHOT_VERSION,
  type AionConversationSnapshot,
  type AionConversationSnapshotOptions,
  type AionConversationSummary,
} from "./types";

type UnknownRecord = Record<string, unknown>;
type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const SENSITIVE_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "bearer",
  "credential",
  "credentials",
  "jwt",
  "password",
  "refreshtoken",
  "secret",
  "token",
]);

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function stringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function sensitiveKey(value: string): boolean {
  const normalized = value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return SENSITIVE_KEYS.has(normalized);
}

function toJsonValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (depth >= 32 || !value || typeof value !== "object" || seen.has(value)) {
    return null;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => toJsonValue(item, seen, depth + 1));
    seen.delete(value);
    return result;
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      sensitiveKey(key) ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      continue;
    }
    result[key] = toJsonValue(item, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

function safeAgent(agent: ChatAgent): ChatAgent {
  return {
    id: agent.id,
    title: agent.title,
    description: agent.description,
    availability: agent.availability,
    unavailableReason: agent.unavailableReason,
  };
}

function safeError(error: ChatError | undefined): ChatError | undefined {
  return error
    ? {
        code: error.code,
        message: error.message
          .replaceAll(/\bBearer\s+\S+/giu, "Bearer [redacted]")
          .replaceAll(
            /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
            "[redacted]",
          ),
        retryable: error.retryable,
      }
    : undefined;
}

function safePart(part: ChatPart): ChatPart {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }
  if (part.type === "file") {
    return {
      type: "file",
      file: {
        name: part.file.name,
        mediaType: part.file.mediaType,
      },
    };
  }
  return { type: "data", data: toJsonValue(part.data) };
}

function safeMessage(message: ChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map(safePart),
    contextId: message.contextId,
    taskId: message.taskId,
    createdAt: message.createdAt,
  };
}

function safeTaskStatus(status: ChatTaskStatus): ChatTaskStatus {
  return {
    state: status.state,
    message: status.message ? safeMessage(status.message) : undefined,
    timestamp: status.timestamp,
  };
}

function safeTurn(turn: ChatTurn): ChatTurn {
  return {
    id: turn.id,
    userMessageId: turn.userMessageId,
    requestIds: [...turn.requestIds],
    assistantMessageIds: [...turn.assistantMessageIds],
    taskIds: [...turn.taskIds],
    artifactIds: [...turn.artifactIds],
    status: turn.status,
    createdAt: turn.createdAt,
    updatedAt: turn.updatedAt,
    error: safeError(turn.error),
  };
}

function safeTask(task: ChatTask): ChatTask {
  return {
    id: task.id,
    contextId: task.contextId,
    status: safeTaskStatus(task.status),
    history: task.history.map(safeMessage),
    artifactIds: [...task.artifactIds],
  };
}

function safeArtifact(artifact: ChatArtifact): ChatArtifact {
  return {
    id: artifact.id,
    artifactId: artifact.artifactId,
    taskId: artifact.taskId,
    contextId: artifact.contextId,
    name: artifact.name,
    description: artifact.description,
    parts: artifact.parts.map(safePart),
    lastChunk: artifact.lastChunk,
  };
}

function safeConversation(
  conversation: ChatConversationState,
): ChatConversationState {
  return {
    id: conversation.id,
    agent: conversation.agent ? safeAgent(conversation.agent) : undefined,
    contextId: conversation.contextId,
    turns: conversation.turns.map(safeTurn),
    messages: conversation.messages.map(safeMessage),
    transcript: conversation.transcript.map((item) => ({ ...item })),
    tasks: Object.fromEntries(
      Object.entries(conversation.tasks).map(([id, task]) => [
        id,
        safeTask(task),
      ]),
    ),
    artifacts: Object.fromEntries(
      Object.entries(conversation.artifacts).map(([id, artifact]) => [
        id,
        safeArtifact(artifact),
      ]),
    ),
    seenEventIds: { ...conversation.seenEventIds },
  };
}

function partText(part: ChatPart): string | undefined {
  if (part.type === "text") {
    return part.text;
  }
  if (part.type === "file") {
    return part.file.name;
  }
  return undefined;
}

function summarize(value: string, fallback: string): string {
  const normalized = value.trim().replaceAll(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 80
    ? `${normalized.slice(0, 77)}…`
    : normalized;
}

function snapshotTitle(conversation: ChatConversationState): string {
  const text = conversation.messages
    .find((message) => message.role === "user")
    ?.parts.map(partText)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return summarize(text ?? "", "New conversation");
}

function snapshotPreview(
  conversation: ChatConversationState,
): string | undefined {
  const message = conversation.messages.at(-1);
  const messageText = message?.parts
    .map(partText)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (messageText) {
    return summarize(messageText, "");
  }
  const artifact = Object.values(conversation.artifacts).at(-1);
  const artifactText = artifact?.parts
    .map(partText)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return artifactText ? summarize(artifactText, "") : undefined;
}

function initialTimestamp(
  conversation: ChatConversationState,
): string | undefined {
  return (
    conversation.turns[0]?.createdAt ??
    conversation.messages[0]?.createdAt
  );
}

function validTimestamp(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function optionalTimestamp(value: unknown): value is string | undefined {
  return value === undefined || validTimestamp(value);
}

/** Creates the persistence-safe projection of live conversation state. */
export function createAionConversationSnapshot(
  conversation: ChatConversationState,
  options: AionConversationSnapshotOptions = {},
): AionConversationSnapshot {
  const agentId = conversation.agent?.id;
  const contextId = conversation.contextId;
  if (!agentId || !contextId) {
    throw new Error("A conversation snapshot requires an agent and context.");
  }
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  return {
    version: AION_CONVERSATION_SNAPSHOT_VERSION,
    agentId,
    contextId,
    title: snapshotTitle(conversation),
    preview: snapshotPreview(conversation),
    createdAt: options.createdAt ?? initialTimestamp(conversation) ?? updatedAt,
    updatedAt,
    conversation: safeConversation(conversation),
  };
}

/** Returns the lightweight list projection of a safe snapshot. */
export function summarizeAionConversation(
  snapshot: AionConversationSnapshot,
): AionConversationSummary {
  return {
    agentId: snapshot.agentId,
    contextId: snapshot.contextId,
    title: snapshot.title,
    preview: snapshot.preview,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

function validAgent(value: unknown): value is ChatAgent {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.id) &&
      nonEmpty(candidate.title) &&
      (candidate.availability === "available" ||
        candidate.availability === "unavailable") &&
      optionalString(candidate.description) &&
      optionalString(candidate.unavailableReason),
  );
}

function validPart(value: unknown): value is ChatPart {
  const candidate = record(value);
  if (candidate?.type === "text") {
    return typeof candidate.text === "string";
  }
  if (candidate?.type === "file") {
    const file = record(candidate.file);
    return Boolean(
      file &&
        optionalString(file.name) &&
        optionalString(file.mediaType) &&
        file.url === undefined &&
        file.bytes === undefined,
    );
  }
  return candidate?.type === "data" && "data" in candidate;
}

function validMessage(value: unknown): value is ChatMessage {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.id) &&
      ["user", "assistant", "system"].includes(candidate.role as string) &&
      Array.isArray(candidate.parts) &&
      candidate.parts.every(validPart) &&
      optionalString(candidate.contextId) &&
      optionalString(candidate.taskId) &&
      validTimestamp(candidate.createdAt),
  );
}

function validError(value: unknown): value is ChatError {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.code) &&
      typeof candidate.message === "string" &&
      typeof candidate.retryable === "boolean",
  );
}

function validTurn(value: unknown): value is ChatTurn {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.id) &&
      nonEmpty(candidate.userMessageId) &&
      stringArray(candidate.requestIds) &&
      stringArray(candidate.assistantMessageIds) &&
      stringArray(candidate.taskIds) &&
      stringArray(candidate.artifactIds) &&
      [
        "running",
        "input-required",
        "auth-required",
        "completed",
        "failed",
        "canceled",
      ].includes(candidate.status as string) &&
      validTimestamp(candidate.createdAt) &&
      validTimestamp(candidate.updatedAt) &&
      (candidate.error === undefined || validError(candidate.error)),
  );
}

function validTaskStatus(value: unknown): value is ChatTaskStatus {
  const candidate = record(value);
  return Boolean(
    candidate &&
      [
        "submitted",
        "working",
        "input-required",
        "auth-required",
        "completed",
        "failed",
        "canceled",
        "rejected",
        "unknown",
      ].includes(candidate.state as string) &&
      (candidate.message === undefined || validMessage(candidate.message)) &&
      optionalTimestamp(candidate.timestamp),
  );
}

function validTask(value: unknown): value is ChatTask {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.id) &&
      nonEmpty(candidate.contextId) &&
      validTaskStatus(candidate.status) &&
      Array.isArray(candidate.history) &&
      candidate.history.every(validMessage) &&
      stringArray(candidate.artifactIds),
  );
}

function validArtifact(value: unknown): value is ChatArtifact {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.id) &&
      nonEmpty(candidate.artifactId) &&
      nonEmpty(candidate.taskId) &&
      nonEmpty(candidate.contextId) &&
      optionalString(candidate.name) &&
      optionalString(candidate.description) &&
      Array.isArray(candidate.parts) &&
      candidate.parts.every(validPart) &&
      typeof candidate.lastChunk === "boolean",
  );
}

function validTranscriptItem(value: unknown): value is ChatTranscriptItem {
  const candidate = record(value);
  return Boolean(
    candidate &&
      ["message", "artifact", "task"].includes(candidate.type as string) &&
      nonEmpty(candidate.id),
  );
}

function validRecordValues(
  value: unknown,
  validate: (candidate: unknown) => boolean,
): value is Readonly<Record<string, unknown>> {
  const candidate = record(value);
  return Boolean(candidate && Object.values(candidate).every(validate));
}

function validConversation(value: unknown): value is ChatConversationState {
  const candidate = record(value);
  return Boolean(
    candidate &&
      nonEmpty(candidate.id) &&
      validAgent(candidate.agent) &&
      nonEmpty(candidate.contextId) &&
      Array.isArray(candidate.turns) &&
      candidate.turns.every(validTurn) &&
      Array.isArray(candidate.messages) &&
      candidate.messages.every(validMessage) &&
      Array.isArray(candidate.transcript) &&
      candidate.transcript.every(validTranscriptItem) &&
      validRecordValues(candidate.tasks, validTask) &&
      validRecordValues(candidate.artifacts, validArtifact) &&
      validRecordValues(candidate.seenEventIds, (item) => item === true),
  );
}

/** @internal Parses an untrusted browser-storage snapshot. */
export function parseAionConversationSnapshot(
  value: unknown,
): AionConversationSnapshot | null {
  const candidate = record(value);
  if (
    candidate?.version !== AION_CONVERSATION_SNAPSHOT_VERSION ||
    !nonEmpty(candidate.agentId) ||
    !nonEmpty(candidate.contextId) ||
    !nonEmpty(candidate.title) ||
    !optionalString(candidate.preview) ||
    !validTimestamp(candidate.createdAt) ||
    !validTimestamp(candidate.updatedAt) ||
    !validConversation(candidate.conversation) ||
    candidate.conversation.agent?.id !== candidate.agentId ||
    candidate.conversation.contextId !== candidate.contextId
  ) {
    return null;
  }
  const snapshot = createAionConversationSnapshot(candidate.conversation, {
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
  return {
    ...snapshot,
    title: summarize(candidate.title, "New conversation"),
    preview: candidate.preview
      ? summarize(candidate.preview, "") || undefined
      : undefined,
  };
}

/** @internal Returns an isolated validated copy of one snapshot. */
export function cloneAionConversationSnapshot(
  snapshot: AionConversationSnapshot,
): AionConversationSnapshot {
  const parsed = parseAionConversationSnapshot(
    JSON.parse(JSON.stringify(snapshot)) as unknown,
  );
  if (!parsed) {
    throw new Error("The conversation snapshot is invalid.");
  }
  return parsed;
}
