import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ChatConversationState,
  ChatTurnStatus,
} from "../model";
import {
  AionActivityIndicator,
  type AionActivityIconProps,
  AionResponseActivity,
} from "./AionActivityIndicator";
import { AionShimmerText } from "./AionShimmerText";
import { AionStreamingText } from "./AionStreamingText";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function conversation(
  status: ChatTurnStatus,
  output = false,
): ChatConversationState {
  return {
    id: "conversation-1",
    turns: [
      {
        id: "turn-1",
        userMessageId: "message-user-1",
        requestIds: ["request-1"],
        assistantMessageIds: output ? ["message-assistant-1"] : [],
        taskIds: [],
        artifactIds: [],
        status,
        createdAt: "2026-09-03T12:00:00.000Z",
        updatedAt: "2026-09-03T12:00:01.000Z",
      },
    ],
    messages: output
      ? [
          {
            id: "message-assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "Started" }],
            createdAt: "2026-09-03T12:00:01.000Z",
          },
        ]
      : [],
    transcript: [],
    tasks: {},
    artifacts: {},
    activeRun: {
      requestId: "request-1",
      turnId: "turn-1",
      attempt: 1,
      status,
      startedAt: "2026-09-03T12:00:00.000Z",
    },
    seenEventIds: {},
  };
}

describe("Aion interaction motion", () => {
  it("resolves waiting only after observing meaningful output", async () => {
    vi.useFakeTimers();
    const view = render(
      <AionResponseActivity
        conversation={conversation("running")}
        settleDurationMs={500}
      />,
    );

    expect(screen.getByText("Waiting for the agent")).toBeTruthy();
    expect(view.container.querySelector("svg")?.ariaHidden).toBe("true");

    view.rerender(
      <AionResponseActivity
        conversation={conversation("running", true)}
        settleDurationMs={500}
      />,
    );

    expect(screen.getByText("Response started")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByText("Response started")).toBeNull();
  });

  it("does not animate a successful state restored from history", () => {
    render(
      <AionResponseActivity conversation={conversation("completed", true)} />,
    );

    expect(screen.queryByText("Response complete")).toBeNull();
  });

  it("does not combine generic waiting with active thinking", () => {
    const state = conversation("running");
    const withThinking: ChatConversationState = {
      ...state,
      turns: [{ ...state.turns[0]!, artifactIds: ["thinking-1"] }],
      artifacts: {
        "thinking-1": {
          id: "thinking-1",
          artifactId: "aion:thinking-delta",
          taskId: "task-1",
          contextId: "context-1",
          parts: [{ type: "text", text: "Reviewing" }],
          lastChunk: false,
        },
      },
    };

    render(<AionResponseActivity conversation={withThinking} />);

    expect(screen.queryByText("Waiting for the agent")).toBeNull();
  });

  it.each([
    ["input-required", "The agent needs more information"],
    ["auth-required", "Authentication is required to continue"],
    ["failed", "Response failed"],
  ] as const)("renders %s without a success phase", (status, label) => {
    render(<AionResponseActivity conversation={conversation(status)} />);

    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(/Response (started|complete)/)).toBeNull();
  });

  it("removes pending feedback immediately after cancellation", () => {
    const view = render(
      <AionResponseActivity conversation={conversation("running")} />,
    );

    view.rerender(
      <AionResponseActivity conversation={conversation("canceled")} />,
    );

    expect(screen.queryByText("Waiting for the agent")).toBeNull();
  });

  it("cleans up a pending success timer when unmounted", () => {
    vi.useFakeTimers();
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const view = render(
      <AionResponseActivity conversation={conversation("running")} />,
    );
    view.rerender(
      <AionResponseActivity conversation={conversation("running", true)} />,
    );

    view.unmount();

    expect(clearTimeout).toHaveBeenCalled();
  });

  it("accepts package-neutral icon replacements", () => {
    const PendingIcon = (props: AionActivityIconProps) => (
      <span data-testid="pending-icon" {...props} />
    );

    render(
      <AionActivityIndicator
        phase="pending"
        label="Waiting"
        icons={{ pending: PendingIcon }}
      />,
    );

    expect(screen.getByTestId("pending-icon").ariaHidden).toBe("true");
  });

  it("animates only a safely isolated appended plain-text range", () => {
    const view = render(<AionStreamingText text="Hello" />);

    expect(view.container.querySelector(".aion-chat__streaming-text-new"))
      .toBeNull();

    view.rerender(<AionStreamingText text="Hello world" />);

    expect(view.container.textContent).toBe("Hello world");
    expect(
      view.container.querySelector(".aion-chat__streaming-text-new")
        ?.textContent,
    ).toBe(" world");

    view.rerender(<AionStreamingText text="Hello **world**" />);

    expect(screen.getByText("world").tagName).toBe("STRONG");
    expect(view.container.querySelector(".aion-chat__streaming-text-new"))
      .toBeNull();
  });

  it("keeps shimmer text as the single accessible label", () => {
    render(<AionShimmerText text="Reviewing context" active />);

    expect(screen.getAllByText("Reviewing context")).toHaveLength(1);
    expect(screen.getByText("Reviewing context").dataset.active).toBe("true");
  });

  it("provides a static reduced-motion path", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/aion-chat.css"),
      "utf8",
    );

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".aion-chat__streaming-text-new");
    expect(css).toContain("animation: none");
  });
});
