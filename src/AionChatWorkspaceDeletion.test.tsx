import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatTheme } from "./AionChatTheme";
import { AionChatWorkspace } from "./AionChatWorkspace";
import {
  AionConversationDirectoryError,
  type AionConversationDirectory,
} from "./conversations/directory";
import { createInMemoryAionConversationStore } from "./conversations/memory-store";
import { createAionConversationSnapshot } from "./conversations/snapshot";
import { createChatConversationState, type ChatAgent } from "./model";
import { FakeAionChatTransport } from "./testing/fake-transport";

const AGENT: ChatAgent = {
  id: "agent-1", title: "Status agent", availability: "available",
};

function fixture() {
  const conversation = {
    ...createChatConversationState("context-1", AGENT),
    contextId: "context-1",
  };
  const snapshot = {
    ...createAionConversationSnapshot(conversation, {
      updatedAt: "2026-09-03T12:00:00Z",
    }),
    title: "Project notes",
  };
  const store = createInMemoryAionConversationStore([snapshot]);
  const remove = vi.fn<NonNullable<AionConversationDirectory["delete"]>>()
    .mockResolvedValue(undefined);
  const directory: AionConversationDirectory = {
    list: () => Promise.resolve({ contexts: [{
      contextId: "context-1", title: "Project notes",
      lastActivityAt: "2026-09-03T12:00:00Z",
    }] }),
    load: () => Promise.resolve({
      conversation, title: "Project notes", lastActivityAt: "2026-09-03T12:00:00Z",
    }),
    delete: remove,
  };
  const transport = new FakeAionChatTransport(() => []);
  return { store, directory, remove, transport };
}

async function openConfirmation(title = /^Project notes/u) {
  fireEvent.click(await screen.findByRole("button", { name: title }));
  await screen.findByRole("textbox", { name: "Chat message" });
  fireEvent.click(screen.getByLabelText("Conversation options"));
  fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
  return screen.findByRole("dialog");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("workspace deletion confirmation", () => {
  it("names the thread using its generated title rather than the cached fallback", async () => {
    const { store, directory, transport } = fixture();
    render(<AionChatWorkspace
      fixedAgent={AGENT}
      conversationStore={store}
      conversationDirectory={{
        ...directory,
        list: () => Promise.resolve({ contexts: [{
          contextId: "context-1", title: "Generated title",
          lastActivityAt: "2026-09-03T12:00:00Z",
        }] }),
        load: async (...args) => ({
          ...await directory.load(...args), title: "Generated title",
        }),
      }}
      transport={transport}
    />);
    const dialog = await openConfirmation(/^Generated title/u);
    expect(within(dialog).getByText("Generated title")).toBeTruthy();
  });

  it.each(["cancel", "close", "escape", "backdrop"])(
    "dismisses with %s without invoking deletion or browser confirmation",
    async (dismissal) => {
      const { store, directory, remove, transport } = fixture();
      const browserConfirm = vi.spyOn(globalThis, "confirm");
      render(
        <AionChatTheme>
          <AionChatWorkspace
            fixedAgent={AGENT}
            conversationStore={store}
            conversationDirectory={directory}
            transport={transport}
          />
        </AionChatTheme>,
      );
      const dialog = await openConfirmation();
      expect(dialog.closest("[data-aion-chat-portal]")).not.toBeNull();
      expect(within(dialog).getByRole("heading", { name: "Delete Thread" }))
        .toBeTruthy();
      expect(dialog.textContent).toContain("Active tasks will be canceled.");
      expect(remove).not.toHaveBeenCalled();
      if (dismissal === "escape") {
        fireEvent(dialog, new Event("cancel", { cancelable: true }));
      } else if (dismissal === "backdrop") {
        fireEvent.click(dialog);
      } else {
        fireEvent.click(within(dialog).getByRole("button", {
          name: dismissal === "cancel" ? "Cancel" : "Cancel thread deletion",
        }));
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(remove).not.toHaveBeenCalled();
      expect(browserConfirm).not.toHaveBeenCalled();
      expect(await store.load(AGENT.id, "context-1")).not.toBeNull();
      expect(transport.requests).toEqual([]);
    },
  );

  it("deletes only after confirmation and keeps the cache until success", async () => {
    const { store, directory, remove, transport } = fixture();
    let finish!: () => void;
    remove.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    render(<AionChatWorkspace
      fixedAgent={AGENT}
      conversationStore={store}
      conversationDirectory={directory}
      transport={transport}
    />);
    const dialog = await openConfirmation();
    const confirm = within(dialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(AGENT, "context-1"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Deleting conversation…");
    expect(await store.load(AGENT.id, "context-1")).not.toBeNull();
    act(() => { finish(); });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Project notes/u })).toBeNull());
    expect(await store.load(AGENT.id, "context-1")).toBeNull();
  });

  it("explains local-only removal and removes the local thread after confirmation", async () => {
    const { store, transport } = fixture();
    render(<AionChatWorkspace
      fixedAgent={AGENT}
      conversationStore={store}
      transport={transport}
    />);
    const dialog = await openConfirmation();
    expect(within(dialog).getByRole("heading", { name: "Remove Thread" })).toBeTruthy();
    expect(dialog.textContent).toContain("This does not delete history on the server.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(async () => expect(await store.load(AGENT.id, "context-1")).toBeNull());
  });

  it("preserves the thread and existing retry UI when deletion fails", async () => {
    const { store, directory, remove, transport } = fixture();
    remove.mockRejectedValueOnce(new AionConversationDirectoryError(
      "deletion_in_progress", "Deletion is still in progress.", true,
    ));
    render(<AionChatWorkspace
      fixedAgent={AGENT}
      conversationStore={store}
      conversationDirectory={directory}
      transport={transport}
    />);
    const dialog = await openConfirmation();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent)
      .toContain("Deletion is still in progress.");
    expect(await store.load(AGENT.id, "context-1")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry deletion" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Project notes/u })).toBeNull());
  });

  it.each(["agent", "context", "store", "directory"])(
    "discards the confirmation when the host changes %s",
    async (change) => {
      const { store, directory, remove, transport } = fixture();
      const props = {
        fixedAgent: AGENT,
        fixedContextId: "context-1",
        conversationStore: store,
        conversationDirectory: directory,
        transport,
      };
      const view = render(<AionChatWorkspace {...props} />);
      await screen.findByRole("textbox", { name: "Chat message" });
      fireEvent.click(screen.getByLabelText("Conversation options"));
      fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
      await screen.findByRole("dialog");
      view.rerender(<AionChatWorkspace {...props}
        fixedAgent={change === "agent" ? { ...AGENT, id: "other" } : AGENT}
        fixedContextId={change === "context" ? "other-context" : "context-1"}
        conversationStore={change === "store" ? createInMemoryAionConversationStore() : store}
        conversationDirectory={change === "directory" ? { ...directory } : directory}
      />);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      view.rerender(<AionChatWorkspace {...props} />);
      await screen.findByRole("textbox", { name: "Chat message" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(remove).not.toHaveBeenCalled();
    },
  );
});
