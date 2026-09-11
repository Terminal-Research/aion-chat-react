import { describe, expect, it } from "vitest";

import type { ChatAgent } from "../model";
import {
  AionConversationDirectoryError,
  aionConversationDirectoryResult,
  normalizeAionContextSummaries,
  normalizeAionConversationDirectoryPageRequest,
  normalizeAionRemoteConversation,
  toAionConversationDirectoryError,
} from "./directory";

const AGENT: ChatAgent = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available",
};

describe("Aion conversation directory normalization", () => {
  it("validates ordered pages and derives the next offset", () => {
    const page = normalizeAionConversationDirectoryPageRequest({
      offset: 20,
      limit: 2,
    });

    const contexts = [
      {
        contextId: "context-3",
        lastActivityAt: "2026-09-03T13:00:00.000Z",
      },
      {
        contextId: "context-2",
        lastActivityAt: "2026-09-03T12:00:00.000Z",
      },
    ];

    expect(normalizeAionContextSummaries(contexts, page)).toEqual({
      contexts,
      nextOffset: 22,
    });
    expect(() =>
      normalizeAionContextSummaries(
        [contexts[0], contexts[0]],
        page,
      ),
    ).toThrow(AionConversationDirectoryError);
    expect(() =>
      normalizeAionContextSummaries(["context-3"], page),
    ).toThrow(AionConversationDirectoryError);
  });

  it("normalizes a remote conversation without duplicate messages", () => {
    let id = 0;
    const conversation = normalizeAionRemoteConversation(
      {
        contextId: "context-1",
        history: [
          {
            messageId: "message-1",
            role: "ROLE_USER",
            parts: [{ text: "Review this" }],
          },
        ],
        artifacts: [
          {
            artifactId: "artifact-1",
            parts: [{ text: "Result" }],
          },
        ],
        status: {
          state: "TASK_STATE_COMPLETED",
          message: {
            messageId: "message-1",
            role: "ROLE_AGENT",
            parts: [{ text: "Review this" }],
          },
        },
        lastActivityAt: "2026-09-03T12:00:00.000Z",
      },
      AGENT,
      "context-1",
      () => `generated-${++id}`,
    );

    expect(conversation.lastActivityAt)
      .toBe("2026-09-03T12:00:00.000Z");
    expect(conversation.conversation.messages).toHaveLength(1);
    expect(
      conversation.conversation.tasks["aion-context:context-1"],
    ).toMatchObject({
      contextId: "context-1",
      status: { state: "completed" },
      artifactIds: ["aion-context:context-1:artifact-1"],
    });
    expect(conversation.conversation.artifacts).toHaveProperty(
      "aion-context:context-1:artifact-1",
    );
    expect(
      conversation.conversation.transcript.map((item) => item.type),
    ).toEqual(["message", "artifact", "task"]);
  });

  it("uses a persisted message task ID for a resumable context", () => {
    const conversation = normalizeAionRemoteConversation(
      {
        contextId: "context-1",
        history: [],
        artifacts: [],
        status: {
          state: "TASK_STATE_INPUT_REQUIRED",
          message: {
            messageId: "message-1",
            taskId: "task-1",
            role: "ROLE_AGENT",
            parts: [{ text: "Which project?" }],
          },
        },
        lastActivityAt: "2026-09-03T12:00:00.000Z",
      },
      AGENT,
      "context-1",
      () => "generated-1",
    );

    expect(conversation.conversation.tasks["task-1"]).toMatchObject({
      id: "task-1",
      contextId: "context-1",
      status: { state: "input-required" },
    });
    expect(
      conversation.conversation.tasks["aion-context:context-1"],
    ).toBeUndefined();
  });

  it("marks fallback task IDs as unsuitable for continuation", () => {
    const conversation = normalizeAionRemoteConversation(
      {
        contextId: "context-1",
        history: [],
        artifacts: [],
        status: { state: "TASK_STATE_INPUT_REQUIRED" },
        lastActivityAt: "2026-09-03T12:00:00.000Z",
      },
      AGENT,
      "context-1",
      () => "generated-1",
    );

    expect(
      conversation.conversation.tasks["aion-context:context-1"]?.metadata,
    )
      .toEqual({ aionChatSyntheticTaskId: true });
  });

  it("maps protocol and transport failures to redaction-safe errors", () => {
    expect(() =>
      aionConversationDirectoryResult(
        { id: "request-1", error: { code: -32011 } },
        "request-1",
      ),
    ).toThrow(
      expect.objectContaining({ code: "access_denied", retryable: false }),
    );
    expect(toAionConversationDirectoryError(new Error("HTTP 503")))
      .toMatchObject({ code: "directory_failed", retryable: true });
    expect(
      toAionConversationDirectoryError({
        chatError: { code: "a2a_request_failed", retryable: true },
      }),
    ).toMatchObject({ code: "directory_failed", retryable: true });
    expect(
      toAionConversationDirectoryError(
        new Error("Bearer secret-value was forbidden"),
      ),
    ).toMatchObject({ code: "access_denied", retryable: false });
  });
});
