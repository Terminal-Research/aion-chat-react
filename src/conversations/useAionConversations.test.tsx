import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  type ChatAgent,
  type ChatConversationState,
  createChatConversationState,
} from "../model";
import type {
  AionConversationDirectory,
  AionConversationDirectoryListOptions,
} from "./directory";
import { createInMemoryAionConversationStore } from "./memory-store";
import { createAionConversationSnapshot } from "./snapshot";
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

function remoteConversation(contextId: string): ChatConversationState {
  return withMessage({
    ...createChatConversationState(contextId, FIRST_AGENT),
    contextId,
  });
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

  it("revalidates cache and hydrates only after selection", async () => {
    const cachedConversation = remoteConversation("context-1");
    const staleConversation = remoteConversation("context-stale");
    const store = createInMemoryAionConversationStore([
      createAionConversationSnapshot(cachedConversation, {
        updatedAt: "2026-09-03T12:00:00.000Z",
      }),
      createAionConversationSnapshot(staleConversation, {
        updatedAt: "2026-09-02T12:00:00.000Z",
      }),
    ]);
    const load = vi.fn((_: ChatAgent, contextId: string) =>
      Promise.resolve(remoteConversation(contextId)),
    );
    const directory: AionConversationDirectory = {
      list: () =>
        Promise.resolve({ contextIds: ["context-1", "context-2"] }),
      load,
    };
    const { result } = renderHook(() =>
      useAionConversations({ store, directory, agent: FIRST_AGENT }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.summaries.map((summary) => summary.contextId))
      .toEqual(["context-1", "context-2"]);
    expect(result.current.summaries[0]?.title).toBe("Daily status");
    expect(result.current.summaries[1]).toMatchObject({
      title: "Conversation",
      preview: "context-2",
    });
    expect(load).not.toHaveBeenCalled();

    await act(async () => result.current.selectConversation("context-2"));

    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.conversation?.contextId).toBe("context-2");
    expect(await store.load("distribution-1", "context-2")).not.toBeNull();
  });

  it("loads remote context pages in order", async () => {
    const store = createInMemoryAionConversationStore();
    const list = vi.fn(
      (_: ChatAgent, options: AionConversationDirectoryListOptions = {}) => {
        const offset = options.offset ?? 0;
        return Promise.resolve(
          offset === 0
            ? { contextIds: ["context-2"], nextOffset: 1 }
            : { contextIds: ["context-1"] },
        );
      },
    );
    const directory: AionConversationDirectory = {
      list,
      load: (_agent, contextId) =>
        Promise.resolve(remoteConversation(contextId)),
    };
    const { result } = renderHook(() =>
      useAionConversations({
        store,
        directory,
        agent: FIRST_AGENT,
        directoryPageSize: 1,
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.hasMoreConversations).toBe(true);
    await act(async () => result.current.loadMoreConversations());

    expect(result.current.summaries.map((summary) => summary.contextId))
      .toEqual(["context-2", "context-1"]);
    expect(result.current.hasMoreConversations).toBe(false);
    expect(list).toHaveBeenLastCalledWith(
      FIRST_AGENT,
      expect.objectContaining({ offset: 1, limit: 1 }),
    );
  });

  it("keeps a fixed context usable when history is unavailable", async () => {
    const store = createInMemoryAionConversationStore();
    const directory: AionConversationDirectory = {
      list: () => Promise.resolve({ contextIds: [] }),
      load: () => Promise.reject(new Error("Unavailable")),
    };
    const { result } = renderHook(() =>
      useAionConversations({
        store,
        directory,
        agent: FIRST_AGENT,
        fixedContextId: "context-fixed",
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.conversation?.contextId).toBe("context-fixed");
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
