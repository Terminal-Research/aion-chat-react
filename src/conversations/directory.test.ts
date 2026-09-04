import { describe, expect, it } from "vitest";

import type { ChatAgent } from "../model";
import {
  AionConversationDirectoryError,
  aionConversationDirectoryResult,
  normalizeAionContextIds,
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

    expect(normalizeAionContextIds(["context-3", "context-2"], page))
      .toEqual({
        contextIds: ["context-3", "context-2"],
        nextOffset: 22,
      });
    expect(() => normalizeAionContextIds(["context-3", "context-3"], page))
      .toThrow(AionConversationDirectoryError);
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
      },
      AGENT,
      "context-1",
      "2026-09-03T12:00:00.000Z",
      () => `generated-${++id}`,
    );

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.tasks["aion-context:context-1"]).toMatchObject({
      contextId: "context-1",
      status: { state: "completed" },
      artifactIds: ["aion-context:context-1:artifact-1"],
    });
    expect(conversation.artifacts).toHaveProperty(
      "aion-context:context-1:artifact-1",
    );
    expect(conversation.transcript.map((item) => item.type)).toEqual([
      "message",
      "artifact",
      "task",
    ]);
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
