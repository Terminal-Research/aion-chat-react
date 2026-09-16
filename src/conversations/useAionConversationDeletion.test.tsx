import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createChatConversationState, type ChatAgent } from "../model";
import {
  AionConversationDirectoryError,
  type AionConversationDirectory,
} from "./directory";
import { createInMemoryAionConversationStore } from "./memory-store";
import { createAionConversationSnapshot } from "./snapshot";
import { useAionConversations } from "./useAionConversations";

const AGENT: ChatAgent = {
  id: "agent-1",
  title: "Agent",
  availability: "available",
};
const ACTIVITY = "2026-09-16T12:00:00Z";
const CONTEXT = "context-1";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const conversation = {
    ...createChatConversationState(CONTEXT, AGENT),
    contextId: CONTEXT,
  };
  const store = createInMemoryAionConversationStore([
    createAionConversationSnapshot(conversation, { updatedAt: ACTIVITY }),
  ]);
  const deletion = deferred<void>();
  const remove = vi
    .fn<NonNullable<AionConversationDirectory["delete"]>>()
    .mockReturnValue(deletion.promise);
  const list = vi.fn<AionConversationDirectory["list"]>().mockResolvedValue({
    contexts: [{ contextId: CONTEXT, lastActivityAt: ACTIVITY }],
    nextOffset: 1,
  });
  const load = vi
    .fn<AionConversationDirectory["load"]>()
    .mockImplementation((agent) =>
      Promise.resolve({
        conversation: { ...conversation, agent },
        lastActivityAt: ACTIVITY,
      }),
    );
  const directory: AionConversationDirectory = { list, load, delete: remove };
  const hook = renderHook(
    ({ agent, conversationStore }) =>
      useAionConversations({
        store: conversationStore,
        directory,
        agent,
        directoryPageSize: 1,
      }),
    { initialProps: { agent: AGENT, conversationStore: store } },
  );
  return {
    ...hook,
    store,
    directory,
    deletion,
    remove,
    list,
    load,
    conversation,
  };
}

describe("server-confirmed conversation deletion", () => {
  it("stops the local run on failure without claiming the remote task was canceled", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    act(() =>
      f.result.current.saveConversation({
        ...f.conversation,
        activeRun: {
          requestId: "request-1",
          turnId: "turn-1",
          attempt: 1,
          status: "running",
          startedAt: ACTIVITY,
        },
        tasks: {
          "task-1": {
            id: "task-1",
            contextId: CONTEXT,
            status: { state: "working" },
            history: [],
            artifactIds: [],
          },
        },
      }),
    );
    f.deletion.reject(new Error("Connection interrupted"));
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.result.current.conversation?.activeRun?.status).toBe("canceled");
    expect(f.result.current.conversation?.tasks["task-1"]?.status.state).toBe(
      "working",
    );
    expect(f.result.current.removalStatus).toBeUndefined();
  });

  it("keeps confirmed server deletion even when local cache cleanup fails", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    vi.spyOn(f.store, "remove").mockRejectedValue(
      new Error("Storage unavailable"),
    );
    f.deletion.resolve();
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.result.current.summaries).toHaveLength(0);
    expect(f.result.current.conversation).toBeUndefined();
    expect(f.result.current.error?.message).toContain(
      "local cache could not be cleared",
    );
  });

  it("keeps history until confirmation, deduplicates clicks, and fences stale saves", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    let request!: Promise<void>;
    act(() => {
      request = f.result.current.removeConversation(CONTEXT);
    });
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.result.current.removalStatus).toBe("pending");
    expect(f.result.current.summaries).toHaveLength(1);
    expect(await f.store.load(AGENT.id, CONTEXT)).not.toBeNull();

    await act(async () => {
      f.deletion.resolve();
      await request;
    });
    expect(f.result.current.summaries).toHaveLength(0);
    expect(f.result.current.selectedContextId).toBeUndefined();
    act(() => f.result.current.saveConversation(f.conversation));
    await act(() => f.result.current.refreshMetadata()); // stale directory snapshot
    expect(f.result.current.summaries).toHaveLength(0);
    expect(await f.store.load(AGENT.id, CONTEXT)).toBeNull();
  });

  it("preserves history after an error and allows an explicit retry", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    f.deletion.reject(
      new AionConversationDirectoryError("access_denied", "Denied", false),
    );
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.result.current.removalError).toMatchObject({
      code: "access_denied",
    });
    expect(f.result.current.conversation?.contextId).toBe(CONTEXT);
    expect(await f.store.load(AGENT.id, CONTEXT)).not.toBeNull();
    f.remove.mockResolvedValueOnce();
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.result.current.summaries).toHaveLength(0);
  });

  it("retains the deletion fence on in-progress, including after reselection", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    f.deletion.reject(
      new AionConversationDirectoryError(
        "deletion_in_progress",
        "In progress",
        true,
      ),
    );
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.result.current.removalStatus).toBe("in_progress");
    act(() => f.result.current.clearSelection());
    await act(() => f.result.current.selectConversation(CONTEXT));
    expect(f.result.current.removalStatus).toBe("in_progress");
    expect(f.load).toHaveBeenCalledTimes(1);
    f.remove.mockResolvedValueOnce();
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(await f.store.load(AGENT.id, CONTEXT)).toBeNull();
  });

  it("does not hydrate or cache a load that finishes after deletion", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    const loading =
      deferred<Awaited<ReturnType<AionConversationDirectory["load"]>>>();
    f.load.mockReturnValueOnce(loading.promise);
    let selection!: Promise<void>;
    act(() => {
      selection = f.result.current.selectConversation(CONTEXT);
    });
    await waitFor(() => expect(f.load).toHaveBeenCalled());
    f.deletion.resolve();
    await act(() => f.result.current.removeConversation(CONTEXT));
    await act(async () => {
      loading.resolve({
        conversation: f.conversation,
        lastActivityAt: ACTIVITY,
      });
      await selection;
    });
    expect(f.result.current.conversation).toBeUndefined();
    expect(await f.store.load(AGENT.id, CONTEXT)).toBeNull();
  });

  it("corrects the next offset and discards a page fetched before deletion", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    const page =
      deferred<Awaited<ReturnType<AionConversationDirectory["list"]>>>();
    f.list.mockReturnValueOnce(page.promise);
    let paging!: Promise<void>;
    act(() => {
      paging = f.result.current.loadMoreConversations();
    });
    f.deletion.resolve();
    await act(() => f.result.current.removeConversation(CONTEXT));
    await act(async () => {
      page.resolve({
        contexts: [{ contextId: CONTEXT, lastActivityAt: ACTIVITY }],
        nextOffset: 2,
      });
      await paging;
    });
    f.list.mockResolvedValueOnce({ contexts: [] });
    await act(() => f.result.current.loadMoreConversations());
    expect(f.list).toHaveBeenLastCalledWith(
      AGENT,
      expect.objectContaining({ offset: 0 }),
    );
    expect(f.result.current.summaries).toHaveLength(0);
  });

  it("does not clear another agent's selected context when deletion finishes", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    let request!: Promise<void>;
    act(() => {
      request = f.result.current.removeConversation(CONTEXT);
    });
    f.rerender({
      agent: { ...AGENT, id: "agent-2" },
      conversationStore: f.store,
    });
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    await act(async () => {
      f.deletion.resolve();
      await request;
    });
    expect(f.result.current.selectedContextId).toBe(CONTEXT);
    expect(f.result.current.summaries).toHaveLength(1);
  });

  it("treats not-found as confirmed absence without masking authorization errors", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    f.deletion.reject(
      new AionConversationDirectoryError("context_not_found", "Absent", false),
    );
    await act(() => f.result.current.removeConversation(CONTEXT));
    expect(f.result.current.summaries).toHaveLength(0);
    expect(await f.store.load(AGENT.id, CONTEXT)).toBeNull();
  });

  it("isolates a late deletion completion from a replacement user cache", async () => {
    const f = fixture();
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    let request!: Promise<void>;
    act(() => {
      request = f.result.current.removeConversation(CONTEXT);
    });
    const replacement = createInMemoryAionConversationStore();
    f.rerender({ agent: AGENT, conversationStore: replacement });
    await waitFor(() => expect(f.result.current.status).toBe("ready"));
    await act(() => f.result.current.selectConversation(CONTEXT));
    await act(async () => {
      f.deletion.resolve();
      await request;
    });
    expect(f.result.current.selectedContextId).toBe(CONTEXT);
    expect(f.result.current.summaries).toHaveLength(1);
    expect(await replacement.load(AGENT.id, CONTEXT)).not.toBeNull();
    expect(await f.store.load(AGENT.id, CONTEXT)).toBeNull();
  });
});
