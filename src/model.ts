/** Stable identifier aliases used by the chat model. */
export type AgentId = string;
export type ArtifactId = string;
export type ArtifactRecordId = string;
export type AttachmentId = string;
export type ContextId = string;
export type ConversationId = string;
export type EventId = string;
export type MessageId = string;
export type RequestId = string;
export type TaskId = string;
export type TurnId = string;

/** Agent availability presented by a host application. */
export type ChatAgentAvailability = "available" | "unavailable";

/** An agent that can be selected as a chat target. */
export interface ChatAgent {
  readonly id: AgentId;
  readonly title: string;
  readonly description?: string;
  readonly availability: ChatAgentAvailability;
  readonly unavailableReason?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Roles supported by A2A chat messages. */
export type ChatMessageRole = "user" | "assistant" | "system";

/** A text-bearing message or artifact part. */
export interface ChatTextPart {
  readonly type: "text";
  readonly text: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A URL- or byte-backed file part from the A2A protocol. */
export interface ChatFilePart {
  readonly type: "file";
  readonly file: {
    readonly name?: string;
    readonly mediaType?: string;
    readonly url?: string;
    readonly bytes?: string;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Structured data retained without imposing a renderer-specific shape. */
export interface ChatDataPart {
  readonly type: "data";
  readonly data: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Lossless renderer-facing representation of an A2A part. */
export type ChatPart = ChatTextPart | ChatFilePart | ChatDataPart;

/** One normalized message in a conversation transcript. */
export interface ChatMessage {
  readonly id: MessageId;
  readonly role: ChatMessageRole;
  readonly parts: readonly ChatPart[];
  readonly contextId?: ContextId;
  readonly taskId?: TaskId;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Local and uploaded states for a user-selected attachment. */
export type ChatAttachment =
  | {
      readonly id: AttachmentId;
      readonly status: "selected" | "uploading";
      readonly file: File;
      readonly progress?: number;
    }
  | {
      readonly id: AttachmentId;
      readonly status: "uploaded";
      readonly file: File;
      readonly url: string;
      readonly mediaType?: string;
    }
  | {
      readonly id: AttachmentId;
      readonly status: "failed";
      readonly file: File;
      readonly error: ChatError;
    };

/** Task states defined by A2A, normalized to stable lowercase values. */
export type ChatTaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "auth-required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected"
  | "unknown";

/** The latest known status of an A2A task. */
export interface ChatTaskStatus {
  readonly state: ChatTaskState;
  readonly message?: ChatMessage;
  readonly timestamp?: string;
}

/** A normalized A2A task retained independently of transcript rendering. */
export interface ChatTask {
  readonly id: TaskId;
  readonly contextId: ContextId;
  readonly status: ChatTaskStatus;
  readonly history: readonly ChatMessage[];
  readonly artifactIds: readonly ArtifactRecordId[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A normalized artifact emitted by an A2A task. */
export interface ChatArtifact {
  readonly id: ArtifactRecordId;
  readonly artifactId: ArtifactId;
  readonly taskId: TaskId;
  readonly contextId: ContextId;
  readonly name?: string;
  readonly description?: string;
  readonly parts: readonly ChatPart[];
  readonly lastChunk: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A transport or protocol error safe to expose to a host UI. */
export interface ChatError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Renderer-facing lifecycle for one request/response turn. */
export type ChatTurnStatus =
  | "running"
  | "input-required"
  | "auth-required"
  | "completed"
  | "failed"
  | "canceled";

/** One user request and its related A2A attempts and responses. */
export interface ChatTurn {
  readonly id: TurnId;
  readonly userMessageId: MessageId;
  readonly requestIds: readonly RequestId[];
  readonly assistantMessageIds: readonly MessageId[];
  readonly taskIds: readonly TaskId[];
  readonly artifactIds: readonly ArtifactRecordId[];
  readonly status: ChatTurnStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: ChatError;
}

/** The active or most recently settled transport run. */
export interface ChatRun {
  readonly requestId: RequestId;
  readonly turnId: TurnId;
  readonly attempt: number;
  readonly status: ChatTurnStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly error?: ChatError;
}

/** Ordered reference to one renderer-visible conversation item. */
export type ChatTranscriptItem =
  | { readonly type: "message"; readonly id: MessageId }
  | { readonly type: "artifact"; readonly id: ArtifactRecordId };

/** Normalized state consumed by headless hooks and view components. */
export interface ChatConversationState {
  readonly id: ConversationId;
  readonly agent?: ChatAgent;
  readonly contextId?: ContextId;
  readonly turns: readonly ChatTurn[];
  readonly messages: readonly ChatMessage[];
  readonly transcript: readonly ChatTranscriptItem[];
  readonly tasks: Readonly<Record<TaskId, ChatTask>>;
  readonly artifacts: Readonly<Record<ArtifactRecordId, ChatArtifact>>;
  readonly attachments: readonly ChatAttachment[];
  readonly activeRun?: ChatRun;
  readonly seenEventIds: Readonly<Record<EventId, true>>;
}

/** Creates an empty normalized conversation for a stable local identifier. */
export function createChatConversationState(
  id: ConversationId,
  agent?: ChatAgent,
): ChatConversationState {
  return {
    id,
    agent,
    turns: [],
    messages: [],
    transcript: [],
    tasks: {},
    artifacts: {},
    attachments: [],
    seenEventIds: {},
  };
}

/** Returns the concatenated text content of renderer-facing parts. */
export function getChatText(parts: readonly ChatPart[]): string {
  return parts
    .filter((part): part is ChatTextPart => part.type === "text")
    .map((part) => part.text)
    .join("");
}
