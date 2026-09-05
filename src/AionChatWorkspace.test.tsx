import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatWorkspace } from "./AionChatWorkspace";
import type { AionAgentCatalog } from "./catalog";
import {
  createInMemoryAionConversationStore,
} from "./conversations/memory-store";
import type { AionConversationDirectory } from "./conversations/directory";
import { createAionConversationSnapshot } from "./conversations/snapshot";
import { FakeAionChatTransport } from "./testing/fake-transport";

const CATALOG: AionAgentCatalog = {
  list: () =>
    Promise.resolve([
      {
        agent: {
          id: "distribution-1",
          title: "Status agent",
          availability: "available",
        },
        identityId: "identity-1",
        distributionId: "distribution-1",
        organizationId: "organization-1",
        identityType: "Principal",
      },
    ]),
};

function createIds(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

afterEach(cleanup);

describe("AionChatWorkspace", () => {
  it("selects an agent, creates a context, and persists the chat", async () => {
    const store = createInMemoryAionConversationStore();
    const transport = new FakeAionChatTransport(() => []);
    render(
      <AionChatWorkspace
        catalog={CATALOG}
        conversationStore={store}
        transport={transport}
        createId={createIds()}
        now={() => "2026-09-03T12:00:00.000Z"}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Status agent/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    const composer = screen.getByRole("textbox", { name: "Chat message" });
    fireEvent.change(composer, { target: { value: "What changed?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(transport.requests).toHaveLength(1));
    expect(transport.requests[0]).toMatchObject({
      contextId: "id-1",
      agent: { id: "distribution-1" },
      message: {
        parts: [{ type: "text", text: "What changed?" }],
      },
    });
    await waitFor(async () => {
      const saved = await store.load("distribution-1", "id-1");
      expect(saved?.title).toBe("What changed?");
    });
  });

  it("supports a fixed agent and context without navigation", async () => {
    render(
      <AionChatWorkspace
        fixedAgent={{
          id: "distribution-1",
          title: "Status agent",
          availability: "available",
        }}
        fixedContextId="context-fixed"
        transport={new FakeAionChatTransport(() => [])}
      />,
    );

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(
      await screen.findByRole("textbox", { name: "Chat message" }),
    ).toBeTruthy();
  });

  it("starts a new chat when remote history is unavailable", async () => {
    const directory: AionConversationDirectory = {
      list: () => Promise.reject(new Error("Unavailable")),
      load: () => Promise.reject(new Error("Unavailable")),
    };
    render(
      <AionChatWorkspace
        fixedAgent={{
          id: "distribution-1",
          title: "Status agent",
          availability: "available",
        }}
        conversationDirectory={directory}
        startNewConversation
        transport={new FakeAionChatTransport(() => [])}
        createId={() => "context-new"}
      />,
    );

    expect(
      await screen.findByRole("textbox", { name: "Chat message" }),
    ).toBeTruthy();
  });

  it("disables new conversations for a fixed unavailable agent", async () => {
    render(
      <AionChatWorkspace
        fixedAgent={{
          id: "distribution-1",
          title: "Status agent",
          availability: "unavailable",
        }}
        transport={new FakeAionChatTransport(() => [])}
      />,
    );

    expect(await screen.findByRole("button", { name: "New" }))
      .toHaveProperty("disabled", true);
  });

  it("confirms before removing local conversation history", async () => {
    const agent = {
      id: "distribution-1",
      title: "Status agent",
      availability: "available" as const,
    };
    const snapshot = createAionConversationSnapshot(
      {
        id: "context-1",
        agent,
        contextId: "context-1",
        turns: [],
        messages: [],
        transcript: [],
        tasks: {},
        artifacts: {},
        seenEventIds: {},
      },
      { updatedAt: "2026-09-03T12:00:00.000Z" },
    );
    const store = createInMemoryAionConversationStore([snapshot]);
    const confirmRemove = vi.fn().mockResolvedValue(false);
    render(
      <AionChatWorkspace
        fixedAgent={agent}
        conversationStore={store}
        transport={new FakeAionChatTransport(() => [])}
        confirmRemoveConversation={confirmRemove}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove New conversation",
      }),
    );

    await waitFor(() => expect(confirmRemove).toHaveBeenCalledTimes(1));
    expect(await store.load("distribution-1", "context-1")).not.toBeNull();
  });

  it("allows local history removal when a remote directory is present", async () => {
    const confirmRemove = vi.fn().mockResolvedValue(true);
    const directory: AionConversationDirectory = {
      list: () => Promise.resolve({ contextIds: [] }),
      load: () => Promise.reject(new Error("Not listed")),
    };
    render(
      <AionChatWorkspace
        fixedAgent={{
          id: "distribution-1",
          title: "Status agent",
          availability: "available",
        }}
        conversationDirectory={directory}
        transport={new FakeAionChatTransport(() => [])}
        confirmRemoveConversation={confirmRemove}
        createId={() => "context-new"}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "New" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove New conversation",
      }),
    );

    await waitFor(() => expect(confirmRemove).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByText("New conversation")).toBeNull();
    });
  });

  it("handles host commands without sending them to the agent", async () => {
    const transport = new FakeAionChatTransport(() => []);
    const onLocalCommand = vi.fn(({ text }: { text: string }) =>
      text === "/clear"
        ? { type: "new-conversation" as const }
        : { type: "message" as const, text: "Local help" },
    );
    render(
      <AionChatWorkspace
        catalog={CATALOG}
        transport={transport}
        onLocalCommand={onLocalCommand}
        createId={createIds()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Status agent/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    const composer = screen.getByRole("textbox", { name: "Chat message" });
    fireEvent.change(composer, { target: { value: "/help" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await within(screen.getByRole("log")).findByText("Local help"))
      .toBeTruthy();
    expect(transport.requests).toEqual([]);

    fireEvent.change(composer, { target: { value: "/clear" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onLocalCommand).toHaveBeenCalledTimes(2));
    expect(transport.requests).toEqual([]);
    expect(within(screen.getByRole("log")).queryByText("Local help"))
      .toBeNull();
  });
});
