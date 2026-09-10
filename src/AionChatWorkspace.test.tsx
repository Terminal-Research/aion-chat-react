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
import {
  type ChatAgent,
  type ChatConversationState,
  createChatConversationState,
} from "./model";
import type { AionAgentProfileSource } from "./profile";
import { FakeAionChatTransport } from "./testing/fake-transport";

const CATALOG: AionAgentCatalog = {
  list: () =>
    Promise.resolve([
      {
        agent: {
          id: "distribution-1",
          title: "Status agent",
          avatarImageUrl: "https://images.example/status.png",
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

function conversationWithMessage(
  contextId: string,
  agent: ChatAgent,
  text: string,
): ChatConversationState {
  return {
    ...createChatConversationState(contextId, agent),
    contextId,
    messages: [
      {
        id: `${contextId}-message`,
        role: "user",
        parts: [{ type: "text", text }],
        contextId,
        createdAt: "2026-09-03T12:00:00.000Z",
      },
    ],
    transcript: [{ type: "message", id: `${contextId}-message` }],
  };
}

afterEach(cleanup);

describe("AionChatWorkspace", () => {
  it("exposes selected-Aion header actions to the host", async () => {
    const onViewAgentProfile = vi.fn();
    const view = render(
      <AionChatWorkspace
        catalog={CATALOG}
        transport={new FakeAionChatTransport(() => [])}
        onViewAgentProfile={onViewAgentProfile}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Status agent/u }),
    );

    expect(screen.getByRole("heading", { name: "Status agent" }))
      .toBeTruthy();
    const avatar = view.container.querySelector(
      ".aion-chat__agent-avatar.aion-chat__workspace-avatar",
    );
    expect(avatar?.querySelector("img")?.getAttribute("src"))
      .toBe("https://images.example/status.png");
    expect(view.container.querySelector(".aion-chat__message-avatar"))
      .toBeNull();
    expect(screen.getByRole("button", { name: "Start audio call" }))
      .toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Email Aion" }))
      .toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Conversation options"));
    const deleteChat = screen.getByRole("button", { name: "Delete chat" });
    expect(
      deleteChat.classList.contains("aion-chat__workspace-menu-danger"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "View profile" }));

    expect(onViewAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: "identity-1" }),
    );
  });

  it("loads the built-in identity profile only after it is opened", async () => {
    const load = vi.fn<AionAgentProfileSource["load"]>(() =>
      Promise.resolve({
        identity: {
          id: "identity-1",
          agentType: "Principal" as const,
          organizationId: "organization-1",
          name: "Status agent",
          biography: "Summarizes project status.",
        },
        channels: [
          {
            distributionId: "distribution-1",
            networkType: "Slack" as const,
            projectId: "project-1",
            projectName: "Status",
          },
        ],
      }),
    );
    const source: AionAgentProfileSource = { load };
    render(
      <AionChatWorkspace
        catalog={CATALOG}
        transport={new FakeAionChatTransport(() => [])}
        agentProfileSource={source}
      />,
    );

    expect(load).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole("button", { name: /Status agent/u }),
    );
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Conversation options"));
    fireEvent.click(screen.getByRole("button", { name: "View profile" }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load.mock.calls[0]?.[0]).toBe("identity-1");
    expect(load.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    const dialog = await screen.findByRole("dialog", {
      name: "Aion Profile",
    });
    expect(within(dialog).getByText("Summarizes project status."))
      .toBeTruthy();
    expect(within(dialog).getByText("Slack")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close Aion profile" }),
    );
    await waitFor(() => expect(document.body.contains(dialog)).toBe(false));
  });

  it("selects the available distribution for a controlled identity", async () => {
    const unavailableEntry = {
      agent: {
        id: "distribution-unavailable",
        title: "Unavailable status agent",
        availability: "unavailable" as const,
      },
      identityId: "identity-1",
      distributionId: "distribution-unavailable",
      organizationId: "organization-1",
      identityType: "Principal" as const,
    };
    const availableEntry = {
      ...unavailableEntry,
      agent: {
        id: "distribution-available",
        title: "Available status agent",
        availability: "available" as const,
      },
      distributionId: "distribution-available",
    };
    const list = vi.fn(() => Promise.resolve({ contextIds: [] }));
    const directory: AionConversationDirectory = {
      list,
      load: () => Promise.reject(new Error("Not listed")),
    };
    const transport = new FakeAionChatTransport(() => []);
    const onAgentChange = vi.fn();

    render(
      <AionChatWorkspace
        catalog={{
          list: () => Promise.resolve([
            unavailableEntry,
            availableEntry,
          ]),
        }}
        conversationDirectory={directory}
        selectedAgentIdentityId="identity-1"
        transport={transport}
        onAgentChange={onAgentChange}
      />,
    );

    expect(await screen.findByRole("heading", {
      name: "Available status agent",
    })).toBeTruthy();
    expect(list).toHaveBeenCalledWith(
      availableEntry.agent,
      expect.any(Object),
    );
    expect(onAgentChange).toHaveBeenCalledWith(
      availableEntry.agent,
      availableEntry,
    );
    expect(transport.requests).toEqual([]);
  });

  it("keeps catalog order when a controlled identity is unavailable", async () => {
    const firstAgent: ChatAgent = {
      id: "distribution-first",
      title: "First unavailable agent",
      availability: "unavailable",
    };
    const secondAgent: ChatAgent = {
      ...firstAgent,
      id: "distribution-second",
      title: "Second unavailable agent",
    };

    render(
      <AionChatWorkspace
        catalog={{
          list: () => Promise.resolve([
            {
              agent: firstAgent,
              identityId: "identity-1",
              distributionId: firstAgent.id,
              organizationId: "organization-1",
              identityType: "Principal",
            },
            {
              agent: secondAgent,
              identityId: "identity-1",
              distributionId: secondAgent.id,
              organizationId: "organization-1",
              identityType: "Principal",
            },
          ]),
        }}
        selectedAgentIdentityId="identity-1"
        transport={new FakeAionChatTransport(() => [])}
      />,
    );

    expect(await screen.findByRole("heading", {
      name: "First unavailable agent",
    })).toBeTruthy();
  });

  it("reports controlled selection and return requests to the host", async () => {
    const onAgentChange = vi.fn();
    const view = render(
      <AionChatWorkspace
        catalog={CATALOG}
        selectedAgentIdentityId={null}
        transport={new FakeAionChatTransport(() => [])}
        onAgentChange={onAgentChange}
      />,
    );

    const agentButton = await screen.findByRole("button", {
      name: /Status agent/u,
    });
    fireEvent.click(agentButton);
    expect(onAgentChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "distribution-1" }),
      expect.objectContaining({ identityId: "identity-1" }),
    );
    expect(screen.queryByRole("heading", { name: "Status agent" }))
      .toBeNull();

    view.rerender(
      <AionChatWorkspace
        catalog={CATALOG}
        selectedAgentIdentityId="identity-1"
        transport={new FakeAionChatTransport(() => [])}
        onAgentChange={onAgentChange}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Status agent" }))
      .toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to Aions" }));
    expect(onAgentChange).toHaveBeenLastCalledWith(undefined);

    view.rerender(
      <AionChatWorkspace
        catalog={CATALOG}
        selectedAgentIdentityId="missing-identity"
        transport={new FakeAionChatTransport(() => [])}
        onAgentChange={onAgentChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Aions" })).toBeTruthy();
      expect(onAgentChange).toHaveBeenLastCalledWith(undefined, undefined);
    });
  });

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
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
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

    expect(await screen.findByRole("button", { name: "New thread" }))
      .toHaveProperty("disabled", true);
  });

  it("loads unavailable-agent history without invoking transport", async () => {
    const unavailableReason =
      "This Playground distribution is not active.";
    const agent: ChatAgent = {
      id: "distribution-1",
      title: "Status agent",
      availability: "unavailable",
      unavailableReason,
    };
    const cachedConversation = conversationWithMessage(
      "context-cached",
      agent,
      "Cached history",
    );
    const remoteConversation = conversationWithMessage(
      "context-remote",
      agent,
      "Remote history",
    );
    const store = createInMemoryAionConversationStore([
      createAionConversationSnapshot(cachedConversation, {
        updatedAt: "2026-09-03T12:00:00.000Z",
      }),
    ]);
    const list = vi.fn(() =>
      Promise.resolve({
        contextIds: ["context-cached", "context-remote"],
      }),
    );
    const load = vi.fn(() => Promise.resolve(remoteConversation));
    const directory: AionConversationDirectory = { list, load };
    const catalog: AionAgentCatalog = {
      list: () =>
        Promise.resolve([
          {
            agent,
            identityId: "identity-1",
            distributionId: "distribution-1",
            organizationId: "organization-1",
            identityType: "Principal",
          },
        ]),
    };
    const transport = new FakeAionChatTransport(() => []);
    const uploader = {
      upload: vi.fn(() =>
        Promise.resolve({ url: "https://example.com/image.png" }),
      ),
    };
    const onLocalCommand = vi.fn();

    render(
      <AionChatWorkspace
        catalog={catalog}
        conversationStore={store}
        conversationDirectory={directory}
        transport={transport}
        attachmentUploader={uploader}
        onLocalCommand={onLocalCommand}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Status agent/u }),
    );

    expect(await screen.findAllByText("Cached history")).toHaveLength(2);
    expect(screen.getByText("context-remote")).toBeTruthy();
    expect(list).toHaveBeenCalledWith(agent, expect.any(Object));
    expect(load).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Conversation.*context-remote/u,
      }),
    );

    const transcript = await screen.findByRole("log");
    expect(await within(transcript).findByText("Remote history")).toBeTruthy();
    expect(load).toHaveBeenCalledWith(
      agent,
      "context-remote",
      expect.any(Object),
    );

    const composer = screen.getByRole("textbox", { name: "Chat message" });
    expect(composer).toHaveProperty("readOnly", true);
    expect(screen.getAllByText(unavailableReason)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "New thread" }))
      .toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Attach files" }))
      .toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Send" }))
      .toHaveProperty("disabled", true);

    fireEvent.change(composer, { target: { value: "/help" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onLocalCommand).not.toHaveBeenCalled();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(transport.requests).toEqual([]);
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
      await screen.findByRole("button", { name: /^New conversation/u }),
    );
    fireEvent.click(
      await screen.findByLabelText("Conversation options"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));

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

    fireEvent.click(
      await screen.findByRole("button", { name: "New thread" }),
    );
    fireEvent.click(
      await screen.findByLabelText("Conversation options"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));

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
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
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
