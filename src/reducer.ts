import type { ChatTransportEvent } from "./events";
import type {
  ArtifactRecordId,
  ChatArtifact,
  ChatConversationState,
  ChatMessage,
  ChatTaskState,
  ChatTranscriptItem,
  ChatTurn,
  ChatTurnStatus,
  MessageId,
  TaskId,
  TurnId,
} from "./model";

const TERMINAL_RUN_STATUSES = new Set<ChatTurnStatus>([
  "completed",
  "failed",
  "canceled",
]);

function appendUnique<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values : [...values, value];
}

function appendTranscriptItem(
  items: readonly ChatTranscriptItem[],
  item: ChatTranscriptItem,
): readonly ChatTranscriptItem[] {
  return items.some(
    (candidate) => candidate.type === item.type && candidate.id === item.id,
  )
    ? items
    : [...items, item];
}

function appendMessageItems(
  items: readonly ChatTranscriptItem[],
  messages: readonly ChatMessage[],
): readonly ChatTranscriptItem[] {
  return messages.reduce<readonly ChatTranscriptItem[]>(
    (current, message) =>
      appendTranscriptItem(current, { type: "message", id: message.id }),
    items,
  );
}

function upsertById<T extends { readonly id: string }>(
  values: readonly T[],
  value: T,
): readonly T[] {
  const index = values.findIndex((candidate) => candidate.id === value.id);
  if (index < 0) {
    return [...values, value];
  }

  return values.map((candidate, candidateIndex) =>
    candidateIndex === index ? value : candidate,
  );
}

function upsertManyById<T extends { readonly id: string }>(
  values: readonly T[],
  incoming: readonly T[],
): readonly T[] {
  return incoming.reduce<readonly T[]>(upsertById, values);
}

function turnStatusForTask(state: ChatTaskState): ChatTurnStatus {
  switch (state) {
    case "input-required":
      return "input-required";
    case "auth-required":
      return "auth-required";
    case "completed":
      return "completed";
    case "failed":
    case "rejected":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return "running";
  }
}

function updateTurn(
  turns: readonly ChatTurn[],
  turnId: TurnId,
  update: (turn: ChatTurn) => ChatTurn,
): readonly ChatTurn[] {
  return turns.map((turn) => (turn.id === turnId ? update(turn) : turn));
}

function addAssistantMessage(
  turn: ChatTurn,
  message: ChatMessage,
  occurredAt: string,
): ChatTurn {
  if (message.role !== "assistant") {
    return { ...turn, updatedAt: occurredAt };
  }

  return {
    ...turn,
    assistantMessageIds: appendUnique(turn.assistantMessageIds, message.id),
    updatedAt: occurredAt,
  };
}

function addTask(
  turn: ChatTurn,
  taskId: TaskId,
  status: ChatTurnStatus,
  occurredAt: string,
): ChatTurn {
  return {
    ...turn,
    taskIds: appendUnique(turn.taskIds, taskId),
    status,
    updatedAt: occurredAt,
  };
}

function addArtifact(
  turn: ChatTurn,
  artifactId: ArtifactRecordId,
  occurredAt: string,
): ChatTurn {
  return {
    ...turn,
    artifactIds: appendUnique(turn.artifactIds, artifactId),
    updatedAt: occurredAt,
  };
}

function appendMessageDelta(
  messages: readonly ChatMessage[],
  messageId: MessageId,
  text: string,
  occurredAt: string,
): readonly ChatMessage[] {
  const existing = messages.find((message) => message.id === messageId);
  if (!existing) {
    return [
      ...messages,
      {
        id: messageId,
        role: "assistant",
        parts: [{ type: "text", text }],
        createdAt: occurredAt,
      },
    ];
  }

  const parts = [...existing.parts];
  const lastPart = parts.at(-1);
  if (lastPart?.type === "text") {
    parts[parts.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${text}`,
    };
  } else {
    parts.push({ type: "text", text });
  }

  return upsertById(messages, { ...existing, parts });
}

function mergeArtifact(
  existing: ChatArtifact | undefined,
  incoming: ChatArtifact,
  append: boolean,
): ChatArtifact {
  if (!append || !existing) {
    return incoming;
  }

  return {
    ...incoming,
    parts: [...existing.parts, ...incoming.parts],
  };
}

function withSeenEvent(
  state: ChatConversationState,
  event: ChatTransportEvent,
): ChatConversationState {
  return {
    ...state,
    seenEventIds: {
      ...state.seenEventIds,
      [event.eventId]: true,
    },
  };
}

function updateActiveRun(
  state: ChatConversationState,
  status: ChatTurnStatus,
  occurredAt: string,
): ChatConversationState {
  if (!state.activeRun) {
    return state;
  }

  return {
    ...state,
    activeRun: {
      ...state.activeRun,
      status,
      ...(TERMINAL_RUN_STATUSES.has(status)
        ? { completedAt: occurredAt }
        : {}),
    },
  };
}

/**
 * Reduces one normalized transport event into renderer-facing conversation
 * state. Duplicate events and events from superseded requests are ignored.
 */
export function reduceChatConversation(
  state: ChatConversationState,
  event: ChatTransportEvent,
): ChatConversationState {
  if (state.seenEventIds[event.eventId]) {
    return state;
  }

  if (event.type === "run.started") {
    const existingTurn = state.turns.find((turn) => turn.id === event.turnId);
    const turn: ChatTurn = existingTurn
      ? {
          ...existingTurn,
          requestIds: appendUnique(existingTurn.requestIds, event.requestId),
          status: "running",
          updatedAt: event.occurredAt,
          error: undefined,
        }
      : {
          id: event.turnId,
          userMessageId: event.userMessage.id,
          requestIds: [event.requestId],
          assistantMessageIds: [],
          taskIds: [],
          artifactIds: [],
          status: "running",
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
        };

    return withSeenEvent(
      {
        ...state,
        turns: upsertById(state.turns, turn),
        messages: upsertById(state.messages, event.userMessage),
        transcript: appendTranscriptItem(state.transcript, {
          type: "message",
          id: event.userMessage.id,
        }),
        activeRun: {
          requestId: event.requestId,
          turnId: event.turnId,
          attempt: event.attempt,
          status: "running",
          startedAt: event.occurredAt,
        },
      },
      event,
    );
  }

  if (state.activeRun?.requestId !== event.requestId) {
    return state;
  }

  if (TERMINAL_RUN_STATUSES.has(state.activeRun.status)) {
    return state;
  }

  let next = withSeenEvent(state, event);

  switch (event.type) {
    case "message.received":
      return {
        ...next,
        contextId: event.message.contextId ?? next.contextId,
        messages: upsertById(next.messages, event.message),
        transcript: appendTranscriptItem(next.transcript, {
          type: "message",
          id: event.message.id,
        }),
        turns: updateTurn(next.turns, event.turnId, (turn) =>
          addAssistantMessage(turn, event.message, event.occurredAt),
        ),
      };

    case "message.delta": {
      const message = next.messages.find(
        (candidate) => candidate.id === event.messageId,
      ) ?? {
        id: event.messageId,
        role: "assistant" as const,
        parts: [],
        createdAt: event.occurredAt,
      };

      return {
        ...next,
        messages: appendMessageDelta(
          next.messages,
          event.messageId,
          event.text,
          event.occurredAt,
        ),
        transcript: appendTranscriptItem(next.transcript, {
          type: "message",
          id: event.messageId,
        }),
        turns: updateTurn(next.turns, event.turnId, (turn) =>
          addAssistantMessage(turn, message, event.occurredAt),
        ),
      };
    }

    case "task.received": {
      const status = turnStatusForTask(event.task.status.state);
      const taskMessages = event.task.status.message
        ? [...event.task.history, event.task.status.message]
        : event.task.history;
      next = {
        ...next,
        contextId: event.task.contextId || next.contextId,
        tasks: { ...next.tasks, [event.task.id]: event.task },
        messages: upsertManyById(next.messages, taskMessages),
        transcript: appendMessageItems(next.transcript, taskMessages),
        turns: updateTurn(next.turns, event.turnId, (turn) => {
          const withTask = addTask(
            turn,
            event.task.id,
            status,
            event.occurredAt,
          );
          return taskMessages.reduce(
            (current, message) =>
              addAssistantMessage(current, message, event.occurredAt),
            withTask,
          );
        }),
      };
      return updateActiveRun(next, status, event.occurredAt);
    }

    case "task.status-changed": {
      const existingTask = next.tasks[event.taskId];
      const status = turnStatusForTask(event.state);
      const task = existingTask
        ? {
            ...existingTask,
            contextId: event.contextId,
            status: {
              ...existingTask.status,
              state: event.state,
              message: event.message ?? existingTask.status.message,
              timestamp: event.occurredAt,
            },
          }
        : {
            id: event.taskId,
            contextId: event.contextId,
            status: {
              state: event.state,
              message: event.message,
              timestamp: event.occurredAt,
            },
            history: [],
            artifactIds: [],
          };

      next = {
        ...next,
        contextId: event.contextId || next.contextId,
        tasks: { ...next.tasks, [event.taskId]: task },
        messages: event.message
          ? upsertById(next.messages, event.message)
          : next.messages,
        transcript: event.message
          ? appendTranscriptItem(next.transcript, {
              type: "message",
              id: event.message.id,
            })
          : next.transcript,
        turns: updateTurn(next.turns, event.turnId, (turn) => {
          const withTask = addTask(
            turn,
            event.taskId,
            status,
            event.occurredAt,
          );
          return event.message
            ? addAssistantMessage(withTask, event.message, event.occurredAt)
            : withTask;
        }),
      };
      return updateActiveRun(next, status, event.occurredAt);
    }

    case "artifact.updated": {
      const existing = next.artifacts[event.artifact.id];
      const artifactTask = next.tasks[event.artifact.taskId];
      const artifact = mergeArtifact(existing, event.artifact, event.append);
      return {
        ...next,
        contextId: event.artifact.contextId || next.contextId,
        artifacts: { ...next.artifacts, [artifact.id]: artifact },
        transcript: appendTranscriptItem(next.transcript, {
          type: "artifact",
          id: artifact.id,
        }),
        tasks: artifactTask
          ? {
              ...next.tasks,
              [event.artifact.taskId]: {
                ...artifactTask,
                artifactIds: appendUnique(
                  artifactTask.artifactIds,
                  artifact.id,
                ),
              },
            }
          : next.tasks,
        turns: updateTurn(next.turns, event.turnId, (turn) =>
          addArtifact(turn, artifact.id, event.occurredAt),
        ),
      };
    }

    case "run.completed":
      next = updateActiveRun(next, "completed", event.occurredAt);
      return {
        ...next,
        turns: updateTurn(next.turns, next.activeRun!.turnId, (turn) => ({
          ...turn,
          status: "completed",
          updatedAt: event.occurredAt,
        })),
      };

    case "run.failed":
      next = updateActiveRun(next, "failed", event.occurredAt);
      return {
        ...next,
        activeRun: { ...next.activeRun!, error: event.error },
        turns: updateTurn(next.turns, next.activeRun!.turnId, (turn) => ({
          ...turn,
          status: "failed",
          error: event.error,
          updatedAt: event.occurredAt,
        })),
      };

    case "run.canceled":
      next = updateActiveRun(next, "canceled", event.occurredAt);
      return {
        ...next,
        turns: updateTurn(next.turns, next.activeRun!.turnId, (turn) => ({
          ...turn,
          status: "canceled",
          updatedAt: event.occurredAt,
        })),
      };
  }
}
