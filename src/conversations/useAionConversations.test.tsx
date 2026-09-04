import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ChatAgent, ChatConversationState } from "../model";
import { createInMemoryAionConversationStore } from "./memory-store";
import { useAionConversations } from "./useAionConversations";

const FIRST_AGENT: ChatAgent = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available",
};

const SECOND_AGENT: ChatAgent = {
  ...FIRST_AGENT,
  id: "distribution-2",
  title: "Writing agent",
};

function withMessage(
  conversation: ChatConversationState,
): ChatConversationState {
  return {
    ...conversation,
    messages: [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "Daily status" }],
        contextId: conversation.contextId,
        createdAt: "2026-09-03T12:00:00.000Z",
      },
    ],
    transcript: [{ type: "message", id: "message-1" }],
  };
}

describe("useAionConversations", () => {
  it("creates a context before use and persists updates", async () => {
    const store = createInMemoryAionConversationStore();
    const { result } = renderHook(() =>
      useAionConversations({
        store,
        agent: FIRST_AGENT,
        createId: () => "context-1",
        now: () => "2026-09-03T12:00:00.000Z",
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => {
      result.current.createConversation();
    });

    expect(result.current.selectedContextId).toBe("context-1");
    expect(result.current.conversation?.contextId).toBe("context-1");
    expect(result.current.conversation?.agent).toBe(FIRST_AGENT);
    act(() => {
      const current = result.current.conversation;
      if (!current) {
        throw new Error("Expected a selected conversation.");
      }
      result.current.saveConversation(withMessage(current));
    });
    await waitFor(async () => {
      const saved = await store.load("distribution-1", "context-1");
      expect(saved?.title).toBe("Daily status");
    });
  });

  it("partitions history when the selected agent changes", async () => {
    const store = createInMemoryAionConversationStore();
    const { result, rerender } = renderHook(
      ({ agent }: { agent: ChatAgent }) =>
        useAionConversations({
          store,
          agent,
          createId: () => "context-1",
        }),
      { initialProps: { agent: FIRST_AGENT } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      result.current.createConversation();
    });
    await waitFor(() => expect(result.current.summaries).toHaveLength(1));

    rerender({ agent: SECOND_AGENT });

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.summaries).toEqual([]);
    expect(result.current.conversation).toBeUndefined();
  });

  it("restores and removes a selected context through the store", async () => {
    const store = createInMemoryAionConversationStore();
    const { result } = renderHook(() =>
      useAionConversations({
        store,
        agent: FIRST_AGENT,
        createId: () => "context-1",
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      result.current.createConversation();
    });
    await waitFor(async () => {
      expect(
        await store.load("distribution-1", "context-1"),
      ).not.toBeNull();
    });
    act(() => result.current.clearSelection());

    await act(async () => result.current.selectConversation("context-1"));
    expect(result.current.conversation?.contextId).toBe("context-1");

    await act(async () => result.current.removeConversation("context-1"));
    expect(result.current.summaries).toEqual([]);
    expect(result.current.conversation).toBeUndefined();
  });
});
