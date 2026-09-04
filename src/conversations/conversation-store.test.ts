import { describe, expect, it } from "vitest";

import type { ChatConversationState } from "../model";
import { createInMemoryAionConversationStore } from "./memory-store";
import {
  createAionConversationSnapshot,
  parseAionConversationSnapshot,
} from "./snapshot";

const AGENT = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available" as const,
  metadata: { authorization: "Bearer hidden-agent-token" },
};

function conversation(
  contextId = "context-1",
  text = "Review the status",
): ChatConversationState {
  return {
    id: contextId,
    agent: AGENT,
    contextId,
    turns: [
      {
        id: "turn-1",
        userMessageId: "message-1",
        requestIds: ["request-1"],
        assistantMessageIds: [],
        taskIds: [],
        artifactIds: [],
        status: "failed",
        createdAt: "2026-09-03T12:00:00.000Z",
        updatedAt: "2026-09-03T12:00:01.000Z",
        error: {
          code: "transport_error",
          message: "Bearer secret-value eyJabc.def.ghi failed",
          retryable: true,
          details: { token: "hidden-error-token" },
        },
      },
    ],
    messages: [
      {
        id: "message-1",
        role: "user",
        contextId,
        createdAt: "2026-09-03T12:00:00.000Z",
        metadata: { apiKey: "hidden-message-key" },
        parts: [
          { type: "text", text },
          {
            type: "file",
            file: {
              name: "screen.png",
              mediaType: "image/png",
              url: "https://files.example/grant?token=temporary",
              bytes: "encoded-image",
            },
            metadata: { credential: "hidden-file-credential" },
          },
          {
            type: "data",
            data: {
              status: "visible",
              accessToken: "hidden-data-token",
            },
          },
        ],
      },
    ],
    transcript: [{ type: "message", id: "message-1" }],
    tasks: {},
    artifacts: {},
    activeRun: {
      requestId: "request-1",
      turnId: "turn-1",
      attempt: 1,
      status: "running",
      startedAt: "2026-09-03T12:00:00.000Z",
    },
    seenEventIds: { "event-1": true },
  };
}

describe("Aion conversation snapshots", () => {
  it("preserves conversation meaning without transient or secret data", () => {
    const snapshot = createAionConversationSnapshot(conversation(), {
      updatedAt: "2026-09-03T12:00:02.000Z",
    });
    const serialized = JSON.stringify(snapshot);
    const filePart = snapshot.conversation.messages[0]?.parts[1];
    const dataPart = snapshot.conversation.messages[0]?.parts[2];

    expect(snapshot).toMatchObject({
      version: 1,
      agentId: "distribution-1",
      contextId: "context-1",
      title: "Review the status screen.png",
      createdAt: "2026-09-03T12:00:00.000Z",
      updatedAt: "2026-09-03T12:00:02.000Z",
    });
    expect(snapshot.conversation.activeRun).toBeUndefined();
    expect(snapshot.conversation.agent?.metadata).toBeUndefined();
    expect(snapshot.conversation.messages[0]?.metadata).toBeUndefined();
    expect(filePart).toEqual({
      type: "file",
      file: { name: "screen.png", mediaType: "image/png" },
    });
    expect(dataPart).toEqual({
      type: "data",
      data: { status: "visible" },
    });
    expect(snapshot.conversation.turns[0]?.error).toEqual({
      code: "transport_error",
      message: "Bearer [redacted] [redacted] failed",
      retryable: true,
    });
    expect(serialized).not.toContain("temporary");
    expect(serialized).not.toContain("hidden-");
    expect(serialized).not.toContain("encoded-image");
  });

  it("rejects malformed or URL-bearing persisted snapshots", () => {
    const snapshot = createAionConversationSnapshot(conversation());
    const malformed = {
      ...snapshot,
      conversation: {
        ...snapshot.conversation,
        messages: [
          {
            ...snapshot.conversation.messages[0],
            parts: [
              {
                type: "file",
                file: {
                  name: "unsafe.png",
                  url: "https://files.example/temporary-grant",
                },
              },
            ],
          },
        ],
      },
    };

    expect(parseAionConversationSnapshot(malformed)).toBeNull();
    expect(parseAionConversationSnapshot({ version: 1 })).toBeNull();
  });
});

describe("createInMemoryAionConversationStore", () => {
  it("partitions snapshots and orders them by recent activity", async () => {
    const newest = createAionConversationSnapshot(
      conversation("context-new", "Newest"),
      { updatedAt: "2026-09-03T12:00:03.000Z" },
    );
    const oldest = createAionConversationSnapshot(
      conversation("context-old", "Oldest"),
      { updatedAt: "2026-09-03T12:00:01.000Z" },
    );
    const otherAgent = createAionConversationSnapshot(
      {
        ...conversation("context-other", "Other"),
        agent: { ...AGENT, id: "distribution-2" },
      },
      { updatedAt: "2026-09-03T12:00:04.000Z" },
    );
    const store = createInMemoryAionConversationStore([
      oldest,
      otherAgent,
      newest,
    ]);

    const summaries = await store.list("distribution-1");

    expect(summaries.map((summary) => summary.contextId)).toEqual([
      "context-new",
      "context-old",
    ]);
    expect(await store.list("distribution-2")).toHaveLength(1);
    expect(await store.load("distribution-1", "context-other")).toBeNull();
    await store.remove("distribution-1", "context-new");
    expect(await store.load("distribution-1", "context-new")).toBeNull();
  });

  it("does not retain caller-owned snapshot objects", async () => {
    const snapshot = createAionConversationSnapshot(conversation());
    const store = createInMemoryAionConversationStore();

    await store.save("distribution-1", snapshot);
    const loaded = await store.load("distribution-1", "context-1");

    expect(loaded).toEqual(snapshot);
    expect(loaded).not.toBe(snapshot);
    expect(loaded?.conversation).not.toBe(snapshot.conversation);
  });
});
