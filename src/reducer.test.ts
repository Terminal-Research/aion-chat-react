import { describe, expect, it } from "vitest";

import type { ChatMessage, ChatTransportEvent } from "./index";
import {
  createChatConversationState,
  getChatText,
  reduceChatConversation,
} from "./index";

const STARTED_AT = "2026-08-31T12:00:00.000Z";
const UPDATED_AT = "2026-08-31T12:00:01.000Z";

function userMessage(): ChatMessage {
  return {
    id: "message-user-1",
    role: "user",
    parts: [{ type: "text", text: "Tell me the status." }],
    createdAt: STARTED_AT,
  };
}

function startedEvent(
  overrides: Partial<Extract<ChatTransportEvent, { type: "run.started" }>> = {},
): Extract<ChatTransportEvent, { type: "run.started" }> {
  return {
    type: "run.started",
    eventId: "event-start-1",
    requestId: "request-1",
    occurredAt: STARTED_AT,
    turnId: "turn-1",
    attempt: 1,
    userMessage: userMessage(),
    ...overrides,
  };
}

describe("reduceChatConversation", () => {
  it("reconstructs streamed artifacts without applying duplicate chunks", () => {
    const initial = reduceChatConversation(
      createChatConversationState("conversation-1"),
      startedEvent(),
    );
    const firstChunk: ChatTransportEvent = {
      type: "artifact.updated",
      eventId: "event-artifact-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
      turnId: "turn-1",
      append: false,
      artifact: {
        id: "task-1:aion:stream-delta",
        artifactId: "aion:stream-delta",
        taskId: "task-1",
        contextId: "context-1",
        name: "Stream delta",
        parts: [{ type: "text", text: "Daily " }],
        lastChunk: false,
      },
    };
    const secondChunk: ChatTransportEvent = {
      ...firstChunk,
      eventId: "event-artifact-2",
      append: true,
      artifact: {
        ...firstChunk.artifact,
        parts: [{ type: "text", text: "status" }],
        lastChunk: true,
      },
    };

    const afterFirst = reduceChatConversation(initial, firstChunk);
    const afterDuplicate = reduceChatConversation(afterFirst, firstChunk);
    const result = reduceChatConversation(afterDuplicate, secondChunk);

    expect(afterDuplicate).toBe(afterFirst);
    expect(
      getChatText(result.artifacts["task-1:aion:stream-delta"]!.parts),
    ).toBe(
      "Daily status",
    );
    expect(result.artifacts["task-1:aion:stream-delta"]?.parts).toHaveLength(1);
    expect(result.turns[0]?.artifactIds).toEqual([
      "task-1:aion:stream-delta",
    ]);
    expect(result.contextId).toBe("context-1");
  });

  it("preserves input-required task status and its assistant message", () => {
    const initial = reduceChatConversation(
      createChatConversationState("conversation-1"),
      startedEvent(),
    );
    const assistantMessage: ChatMessage = {
      id: "message-assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Which project?" }],
      contextId: "context-1",
      taskId: "task-1",
      createdAt: UPDATED_AT,
    };
    const result = reduceChatConversation(initial, {
      type: "task.status-changed",
      eventId: "event-status-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
      turnId: "turn-1",
      taskId: "task-1",
      contextId: "context-1",
      state: "input-required",
      final: true,
      message: assistantMessage,
    });

    expect(result.activeRun?.status).toBe("input-required");
    expect(result.turns[0]).toMatchObject({
      status: "input-required",
      taskIds: ["task-1"],
      assistantMessageIds: ["message-assistant-1"],
    });
    expect(result.tasks["task-1"]?.status).toMatchObject({
      state: "input-required",
      message: assistantMessage,
    });
  });

  it("derives the assistant transcript from a unary task snapshot", () => {
    const initial = reduceChatConversation(
      createChatConversationState("conversation-1"),
      startedEvent(),
    );
    const historyMessage: ChatMessage = {
      id: "message-history-1",
      role: "assistant",
      parts: [{ type: "text", text: "Earlier context" }],
      contextId: "context-1",
      taskId: "task-1",
      createdAt: UPDATED_AT,
    };
    const statusMessage: ChatMessage = {
      ...historyMessage,
      id: "message-status-1",
      parts: [{ type: "text", text: "Final answer" }],
    };
    const result = reduceChatConversation(initial, {
      type: "task.received",
      eventId: "event-task-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
      turnId: "turn-1",
      task: {
        id: "task-1",
        contextId: "context-1",
        status: {
          state: "completed",
          message: statusMessage,
          timestamp: UPDATED_AT,
        },
        history: [historyMessage],
        artifactIds: [],
      },
    });

    expect(result.turns[0]).toMatchObject({
      status: "completed",
      assistantMessageIds: ["message-history-1", "message-status-1"],
    });
    expect(result.messages.map((message) => message.id)).toEqual([
      "message-user-1",
      "message-history-1",
      "message-status-1",
    ]);
  });

  it("settles completed, failed, and canceled runs distinctly", () => {
    const cases = [
      {
        event: {
          type: "run.completed",
          eventId: "event-terminal",
          requestId: "request-1",
          occurredAt: UPDATED_AT,
        } satisfies ChatTransportEvent,
        status: "completed",
      },
      {
        event: {
          type: "run.failed",
          eventId: "event-terminal",
          requestId: "request-1",
          occurredAt: UPDATED_AT,
          error: {
            code: "transport_unavailable",
            message: "The agent could not be reached.",
            retryable: true,
          },
        } satisfies ChatTransportEvent,
        status: "failed",
      },
      {
        event: {
          type: "run.canceled",
          eventId: "event-terminal",
          requestId: "request-1",
          occurredAt: UPDATED_AT,
        } satisfies ChatTransportEvent,
        status: "canceled",
      },
    ] as const;

    for (const testCase of cases) {
      const running = reduceChatConversation(
        createChatConversationState("conversation-1"),
        startedEvent(),
      );
      const result = reduceChatConversation(running, testCase.event);

      expect(result.activeRun?.status).toBe(testCase.status);
      expect(result.activeRun?.completedAt).toBe(UPDATED_AT);
      expect(result.turns[0]?.status).toBe(testCase.status);
    }
  });

  it("starts a retry without duplicating its turn or user message", () => {
    const running = reduceChatConversation(
      createChatConversationState("conversation-1"),
      startedEvent(),
    );
    const failed = reduceChatConversation(running, {
      type: "run.failed",
      eventId: "event-failed-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
      error: {
        code: "network_error",
        message: "Connection lost.",
        retryable: true,
      },
    });
    const retry = reduceChatConversation(
      failed,
      startedEvent({
        eventId: "event-start-2",
        requestId: "request-2",
        occurredAt: "2026-08-31T12:00:02.000Z",
        attempt: 2,
      }),
    );
    const staleResult = reduceChatConversation(retry, {
      type: "message.delta",
      eventId: "event-late-1",
      requestId: "request-1",
      occurredAt: "2026-08-31T12:00:03.000Z",
      turnId: "turn-1",
      messageId: "message-late",
      text: "stale",
    });

    expect(retry.turns).toHaveLength(1);
    expect(retry.messages).toHaveLength(1);
    expect(retry.turns[0]?.requestIds).toEqual(["request-1", "request-2"]);
    expect(retry.activeRun).toMatchObject({
      requestId: "request-2",
      attempt: 2,
      status: "running",
    });
    expect(staleResult).toBe(retry);
  });

  it("reconciles a streamed message with a complete message snapshot", () => {
    const running = reduceChatConversation(
      createChatConversationState("conversation-1"),
      startedEvent(),
    );
    const partial = reduceChatConversation(running, {
      type: "message.delta",
      eventId: "event-delta-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
      turnId: "turn-1",
      messageId: "message-assistant-1",
      text: "Hel",
    });
    const result = reduceChatConversation(partial, {
      type: "message.received",
      eventId: "event-message-1",
      requestId: "request-1",
      occurredAt: "2026-08-31T12:00:02.000Z",
      turnId: "turn-1",
      message: {
        id: "message-assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
        contextId: "context-1",
        createdAt: "2026-08-31T12:00:02.000Z",
      },
    });

    const assistant = result.messages.find(
      (message) => message.id === "message-assistant-1",
    );
    expect(assistant && getChatText(assistant.parts)).toBe("Hello");
    expect(result.turns[0]?.assistantMessageIds).toEqual([
      "message-assistant-1",
    ]);
  });

  it("retains message and artifact order across multiple turns", () => {
    let state = reduceChatConversation(
      createChatConversationState("conversation-1"),
      startedEvent(),
    );
    state = reduceChatConversation(state, {
      type: "artifact.updated",
      eventId: "event-artifact-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
      turnId: "turn-1",
      append: false,
      artifact: {
        id: "task-1:aion:stream-delta",
        artifactId: "aion:stream-delta",
        taskId: "task-1",
        contextId: "context-1",
        parts: [{ type: "text", text: "First answer" }],
        lastChunk: true,
      },
    });
    state = reduceChatConversation(state, {
      type: "run.completed",
      eventId: "event-complete-1",
      requestId: "request-1",
      occurredAt: UPDATED_AT,
    });
    state = reduceChatConversation(
      state,
      startedEvent({
        eventId: "event-start-2",
        requestId: "request-2",
        turnId: "turn-2",
        userMessage: {
          ...userMessage(),
          id: "message-user-2",
          parts: [{ type: "text", text: "Second question" }],
        },
      }),
    );
    state = reduceChatConversation(state, {
      type: "artifact.updated",
      eventId: "event-artifact-2",
      requestId: "request-2",
      occurredAt: UPDATED_AT,
      turnId: "turn-2",
      append: false,
      artifact: {
        id: "task-2:aion:stream-delta",
        artifactId: "aion:stream-delta",
        taskId: "task-2",
        contextId: "context-1",
        parts: [{ type: "text", text: "Second answer" }],
        lastChunk: true,
      },
    });

    expect(state.transcript).toEqual([
      { type: "message", id: "message-user-1" },
      { type: "artifact", id: "task-1:aion:stream-delta" },
      { type: "message", id: "message-user-2" },
      { type: "artifact", id: "task-2:aion:stream-delta" },
    ]);
  });
});
