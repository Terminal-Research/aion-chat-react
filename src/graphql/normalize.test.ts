import { describe, expect, it } from "vitest";

import { normalizeAionChatGraphQLResponse } from "./normalize";

function context() {
  let id = 0;
  return {
    requestId: "request-1",
    turnId: "turn-1",
    occurredAt: "2026-08-31T12:00:00.000Z",
    createEventId: () => `event-${++id}`,
  };
}

describe("normalizeAionChatGraphQLResponse", () => {
  it("normalizes and completes a final Aion stream-delta artifact", () => {
    const events = normalizeAionChatGraphQLResponse(
      {
        a2aRpc: {
          __typename: "A2AJsonRpcSuccessResponseGQL",
          jsonrpc: "2.0",
          result: {
            kind: "TaskArtifactUpdateEvent",
            contextId: "context-1",
            taskId: "task-1",
            append: true,
            lastChunk: true,
            artifact: {
              artifactId: "aion:stream-delta",
              parts: [{ kind: "text", text: "**done**" }],
            },
          },
        },
      },
      context(),
    );

    expect(events).toEqual([
      {
        type: "artifact.updated",
        eventId: "event-1",
        requestId: "request-1",
        occurredAt: "2026-08-31T12:00:00.000Z",
        turnId: "turn-1",
        append: true,
        artifact: {
          id: "task-1:aion:stream-delta",
          artifactId: "aion:stream-delta",
          taskId: "task-1",
          contextId: "context-1",
          parts: [{ type: "text", text: "**done**", metadata: undefined }],
          lastChunk: true,
          metadata: undefined,
          name: undefined,
          description: undefined,
        },
      },
      {
        type: "run.completed",
        eventId: "event-2",
        requestId: "request-1",
        occurredAt: "2026-08-31T12:00:00.000Z",
      },
    ]);
  });

  it("retains status messages and authentication-required task state", () => {
    const events = normalizeAionChatGraphQLResponse(
      {
        a2aRpc: {
          __typename: "A2AJsonRpcSuccessResponseGQL",
          jsonrpc: "2.0",
          result: {
            kind: "TaskStatusUpdateEvent",
            contextId: "context-1",
            taskId: "task-1",
            final: true,
            status: {
              state: "TASK_STATE_AUTH_REQUIRED",
              message: {
                messageId: "message-1",
                role: "ROLE_AGENT",
                parts: [{ kind: "text", text: "Sign in to continue." }],
              },
            },
          },
        },
      },
      context(),
    );

    expect(events[0]).toMatchObject({
      type: "task.status-changed",
      contextId: "context-1",
      taskId: "task-1",
      state: "auth-required",
      final: true,
      message: {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text: "Sign in to continue." }],
      },
    });
  });

  it("maps Aion authentication and authorization errors distinctly", () => {
    for (const [code, expected] of [
      [-32010, "authentication_required"],
      [-32011, "access_denied"],
    ] as const) {
      const events = normalizeAionChatGraphQLResponse(
        {
          a2aRpc: {
            __typename: "A2AJsonRpcErrorResponseGQL",
            jsonrpc: "2.0",
            error: { code, message: "Request rejected" },
          },
        },
        context(),
      );

      expect(events[0]).toMatchObject({
        type: "run.failed",
        error: { code: expected, retryable: false },
      });
    }
  });
});
