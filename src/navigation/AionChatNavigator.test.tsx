import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AionAgentCatalogEntry } from "../catalog";
import type { AionConversationSummary } from "../conversations/types";
import {
  AionChatNavigator,
  type AionChatNavigatorView,
} from "./AionChatNavigator";
import { AionAgentList } from "./AionAgentList";

const AGENT: AionAgentCatalogEntry = {
  agent: {
    id: "distribution-1",
    title: "Status agent",
    availability: "available",
  },
  identityId: "identity-1",
  distributionId: "distribution-1",
  organizationId: "organization-1",
  identityType: "Principal",
};

const SUMMARY: AionConversationSummary = {
  agentId: "distribution-1",
  contextId: "context-1",
  title: "Daily status",
  preview: "Summarize the team update",
  createdAt: "2026-09-03T12:00:00.000Z",
  updatedAt: "2026-09-03T12:00:01.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AionChatNavigator", () => {
  it("keys unsaved agents by their stable catalog identity", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <AionAgentList
        entries={[
          { ...AGENT, distributionId: "" },
          {
            ...AGENT,
            agent: {
              ...AGENT.agent,
              id: "distribution-2",
              title: "Writing agent",
            },
            identityId: "identity-2",
            distributionId: "",
          },
        ]}
        onSelectAgent={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: /Status agent/u }))
      .toBeTruthy();
    expect(screen.getByRole("button", { name: /Writing agent/u }))
      .toBeTruthy();
    expect(
      consoleError.mock.calls.flat().some((value) =>
        String(value).includes("same key"),
      ),
    ).toBe(false);
  });

  it("explains unavailable agents while allowing history selection", () => {
    const onSelectAgent = vi.fn();
    const unavailableReason = "The Playground distribution is inactive.";
    render(
      <AionAgentList
        entries={[
          {
            ...AGENT,
            agent: {
              ...AGENT.agent,
              availability: "unavailable",
              unavailableReason,
            },
          },
        ]}
        onSelectAgent={onSelectAgent}
      />,
    );

    const agentButton = screen.getByRole("button", {
      name: /Status agent.*Unavailable.*inactive/u,
    });
    expect(agentButton.getAttribute("data-availability"))
      .toBe("unavailable");
    expect(agentButton.getAttribute("title")).toBe(unavailableReason);

    fireEvent.click(agentButton);

    expect(onSelectAgent).toHaveBeenCalledOnce();
  });

  it("moves through one panel and restores focus on Back", () => {
    function Harness() {
      const [view, setView] = useState<AionChatNavigatorView>("agents");
      return (
        <AionChatNavigator
          view={view}
          agents={[AGENT]}
          conversations={[SUMMARY]}
          selectedAgentId={
            view === "conversations" ? AGENT.agent.id : undefined
          }
          agentTitle={AGENT.agent.title}
          onSelectAgent={() => setView("conversations")}
          onBack={() => setView("agents")}
          onNewConversation={() => undefined}
          onSelectConversation={() => undefined}
        />
      );
    }
    render(<Harness />);

    const agentButton = screen.getByRole("button", { name: /Status agent/u });
    fireEvent.click(agentButton);

    const back = screen.getByRole("button", { name: "Back to agents" });
    expect(back).toBe(document.activeElement);
    expect(
      screen.getByRole("navigation").getAttribute("data-view"),
    ).toBe(
      "conversations",
    );
    fireEvent.click(back);

    expect(agentButton).toBe(document.activeElement);
    expect(
      screen.getByRole("navigation").getAttribute("data-view"),
    ).toBe(
      "agents",
    );
  });

  it("forwards new, select, remove, and retry actions", () => {
    const onNew = vi.fn();
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    render(
      <AionChatNavigator
        view="conversations"
        agents={[AGENT]}
        conversations={[SUMMARY]}
        selectedAgentId={AGENT.agent.id}
        agentTitle={AGENT.agent.title}
        conversationsError={new Error("hidden storage detail")}
        onSelectAgent={() => undefined}
        onBack={() => undefined}
        onNewConversation={onNew}
        onSelectConversation={onSelect}
        onRemoveConversation={onRemove}
        onRetryConversations={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Daily status/u }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Daily status" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("context-1");
    expect(onRemove).toHaveBeenCalledWith("context-1");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("hidden storage detail")).toBeNull();
  });
});
