import { normalizeAionResponse } from "../a2a/normalize";
import type {
  ChatAgent,
  ChatArtifact,
  ChatConversationState,
  ChatMessage,
  ChatTranscriptItem,
  ContextId,
} from "../model";
import {
  AionConversationDirectoryError,
} from "./directory-error";

export {
  AionConversationDirectoryError,
  type AionConversationDirectoryErrorCode,
} from "./directory-error";

/** Options for one ordered page of remote contexts. */
export interface AionConversationDirectoryListOptions {
  readonly offset?: number;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

/** Options for loading one remote context. */
export interface AionConversationDirectoryLoadOptions {
  readonly signal?: AbortSignal;
}

/** One most-recent-first page returned by the remote directory. */
export interface AionConversationDirectoryPage {
  readonly contextIds: readonly ContextId[];
  readonly nextOffset?: number;
}

/** Caller-scoped remote context listing and hydration boundary. */
export interface AionConversationDirectory {
  /** Lists one ordered page of contexts visible for the selected agent. */
  list(
    agent: ChatAgent,
    options?: AionConversationDirectoryListOptions,
  ): Promise<AionConversationDirectoryPage>;

  /** Loads one caller-visible remote conversation. */
  load(
    agent: ChatAgent,
    contextId: ContextId,
    options?: AionConversationDirectoryLoadOptions,
  ): Promise<ChatConversationState>;
}

/** Validated paging values sent to Aion's GetContexts extension. */
export interface AionConversationDirectoryPageRequest {
  readonly offset: number;
  readonly limit: number;
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function field(
  value: UnknownRecord,
  camelCase: string,
  snakeCase: string,
): unknown {
  return camelCase in value ? value[camelCase] : value[snakeCase];
}

function invalidResponse(): AionConversationDirectoryError {
  return new AionConversationDirectoryError(
    "invalid_response",
    "The Aion conversation directory returned an invalid response.",
    false,
  );
}

function errorForCode(
  code: string | number,
  retryable?: boolean,
): AionConversationDirectoryError {
  if (code === -32010 || code === "authentication_required") {
    return new AionConversationDirectoryError(
      "authentication_required",
      "Authentication is required to load remote conversations.",
      false,
    );
  }
  if (code === -32011 || code === "access_denied") {
    return new AionConversationDirectoryError(
      "access_denied",
      "Access to the remote conversation was denied.",
      false,
    );
  }
  if (
    code === -32601 ||
    code === -32004 ||
    code === "unsupported_operation"
  ) {
    return new AionConversationDirectoryError(
      "unsupported",
      "The selected agent does not support remote conversation history.",
      false,
    );
  }
  return new AionConversationDirectoryError(
    "directory_failed",
    "The remote conversation could not be loaded.",
    retryable ??
      (code === "directory_failed" || code === -32603 || code === -32012),
  );
}

function abortError(value: unknown): value is DOMException {
  return (
    value instanceof DOMException &&
    value.name === "AbortError"
  );
}

/** Converts adapter failures into the shared redaction-safe error contract. */
export function toAionConversationDirectoryError(
  value: unknown,
): Error | DOMException {
  if (value instanceof AionConversationDirectoryError || abortError(value)) {
    return value;
  }
  if (value instanceof SyntaxError) {
    return invalidResponse();
  }
  const candidate = record(value);
  const chatError = record(candidate?.chatError);
  const code = chatError?.code;
  if (typeof code === "string" || typeof code === "number") {
    return errorForCode(
      code,
      typeof chatError?.retryable === "boolean"
        ? chatError.retryable
        : undefined,
    );
  }
  const candidateCode = candidate?.code;
  if (
    typeof candidateCode === "string" ||
    typeof candidateCode === "number"
  ) {
    return errorForCode(candidateCode);
  }
  const message =
    typeof candidate?.message === "string"
      ? candidate.message.toLowerCase()
      : "";
  if (/authentication|required|unauthenticated|\b401\b|jwt/u.test(message)) {
    return errorForCode("authentication_required");
  }
  if (/access[_ -]?denied|forbidden|\b403\b/u.test(message)) {
    return errorForCode("access_denied");
  }
  if (/unsupported|method not found/u.test(message)) {
    return errorForCode("unsupported_operation");
  }
  return errorForCode("directory_failed");
}

/** Validates and defaults one remote-directory page request. */
export function normalizeAionConversationDirectoryPageRequest(
  options: AionConversationDirectoryListOptions = {},
): AionConversationDirectoryPageRequest {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    throw new Error(
      "Conversation directory paging requires offset >= 0 and limit 1-100.",
    );
  }
  return { offset, limit };
}

/** Normalizes the raw GetContexts result into one ordered page. */
export function normalizeAionContextIds(
  value: unknown,
  page: AionConversationDirectoryPageRequest,
): AionConversationDirectoryPage {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.length > 0) ||
    new Set(value).size !== value.length
  ) {
    throw invalidResponse();
  }
  return {
    contextIds: value,
    nextOffset:
      value.length === page.limit
        ? page.offset + value.length
        : undefined,
  };
}

function appendUniqueMessages(
  history: readonly ChatMessage[],
  statusMessage: ChatMessage | undefined,
): readonly ChatMessage[] {
  return statusMessage &&
    !history.some((message) => message.id === statusMessage.id)
    ? [...history, statusMessage]
    : history;
}

/** Normalizes the raw GetContext result into renderer-ready chat state. */
export function normalizeAionRemoteConversation(
  value: unknown,
  agent: ChatAgent,
  requestedContextId: ContextId,
  occurredAt: string,
  createId: () => string,
): ChatConversationState {
  const conversation = record(value);
  const contextId = conversation
    ? field(conversation, "contextId", "context_id")
    : undefined;
  const history = conversation?.history;
  const artifacts = conversation?.artifacts;
  const status = conversation?.status;
  if (
    contextId !== requestedContextId ||
    !Array.isArray(history) ||
    !Array.isArray(artifacts) ||
    !record(status)
  ) {
    throw invalidResponse();
  }

  const taskId = `aion-context:${contextId}`;
  const events = normalizeAionResponse(
    {
      kind: "task",
      id: taskId,
      contextId,
      history,
      artifacts,
      status,
    },
    {
      requestId: taskId,
      turnId: taskId,
      occurredAt,
      createEventId: createId,
    },
  );
  const task = events.flatMap((event) =>
    event.type === "task.received" ? [event.task] : [],
  )[0];
  if (!task) {
    throw invalidResponse();
  }
  const normalizedArtifacts = events.flatMap((event) =>
    event.type === "artifact.updated" ? [event.artifact] : [],
  );
  const messages = appendUniqueMessages(task.history, task.status.message);
  const transcript: ChatTranscriptItem[] = [
    ...messages.map((message) => ({
      type: "message" as const,
      id: message.id,
    })),
    ...normalizedArtifacts.map((artifact) => ({
      type: "artifact" as const,
      id: artifact.id,
    })),
    { type: "task", id: task.id },
  ];

  return {
    id: contextId,
    agent,
    contextId,
    turns: [],
    messages,
    transcript,
    tasks: { [task.id]: task },
    artifacts: Object.fromEntries(
      normalizedArtifacts.map((artifact: ChatArtifact) => [
        artifact.id,
        artifact,
      ]),
    ),
    seenEventIds: {},
  };
}

/** Unwraps a JSON-RPC directory response or throws a typed failure. */
export function aionConversationDirectoryResult(
  value: unknown,
  requestId: string,
): unknown {
  const response = record(value);
  if (!response || response.id !== requestId) {
    throw invalidResponse();
  }
  const error = record(response.error);
  if (error) {
    const code = error.code;
    if (typeof code !== "number") {
      throw invalidResponse();
    }
    throw errorForCode(code);
  }
  if (!("result" in response)) {
    throw invalidResponse();
  }
  return response.result;
}
