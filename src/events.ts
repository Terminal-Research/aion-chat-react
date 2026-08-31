import type {
  ChatArtifact,
  ChatError,
  ChatMessage,
  ChatTask,
  ChatTaskState,
  ContextId,
  EventId,
  MessageId,
  RequestId,
  TaskId,
  TurnId,
} from "./model";

interface ChatTransportEventBase {
  readonly eventId: EventId;
  readonly requestId: RequestId;
  readonly occurredAt: string;
}

/** Starts a new request or a retry for an existing turn. */
export interface ChatRunStartedEvent extends ChatTransportEventBase {
  readonly type: "run.started";
  readonly turnId: TurnId;
  readonly attempt: number;
  readonly userMessage: ChatMessage;
}

/** Upserts a complete message snapshot from a transport. */
export interface ChatMessageReceivedEvent extends ChatTransportEventBase {
  readonly type: "message.received";
  readonly turnId: TurnId;
  readonly message: ChatMessage;
}

/** Appends text to a message while preserving the streamed event boundary. */
export interface ChatMessageDeltaEvent extends ChatTransportEventBase {
  readonly type: "message.delta";
  readonly turnId: TurnId;
  readonly messageId: MessageId;
  readonly text: string;
}

/** Upserts a complete A2A task snapshot. */
export interface ChatTaskReceivedEvent extends ChatTransportEventBase {
  readonly type: "task.received";
  readonly turnId: TurnId;
  readonly task: ChatTask;
}

/** Applies an A2A task status update without discarding task history. */
export interface ChatTaskStatusChangedEvent extends ChatTransportEventBase {
  readonly type: "task.status-changed";
  readonly turnId: TurnId;
  readonly taskId: TaskId;
  readonly contextId: ContextId;
  readonly state: ChatTaskState;
  readonly final: boolean;
  readonly message?: ChatMessage;
}

/** Upserts or appends one A2A artifact update. */
export interface ChatArtifactUpdatedEvent extends ChatTransportEventBase {
  readonly type: "artifact.updated";
  readonly turnId: TurnId;
  readonly artifact: ChatArtifact;
  readonly append: boolean;
}

/** Marks the active run complete after its stream settles successfully. */
export interface ChatRunCompletedEvent extends ChatTransportEventBase {
  readonly type: "run.completed";
}

/** Marks the active run failed with a renderer-safe error. */
export interface ChatRunFailedEvent extends ChatTransportEventBase {
  readonly type: "run.failed";
  readonly error: ChatError;
}

/** Marks the active run canceled by the host or user. */
export interface ChatRunCanceledEvent extends ChatTransportEventBase {
  readonly type: "run.canceled";
}

/** Lossless normalized event boundary implemented by chat transports. */
export type ChatTransportEvent =
  | ChatRunStartedEvent
  | ChatMessageReceivedEvent
  | ChatMessageDeltaEvent
  | ChatTaskReceivedEvent
  | ChatTaskStatusChangedEvent
  | ChatArtifactUpdatedEvent
  | ChatRunCompletedEvent
  | ChatRunFailedEvent
  | ChatRunCanceledEvent;
