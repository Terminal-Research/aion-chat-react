import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatError } from "./AionChatActivity";
import {
  type AionChatDataPartProps,
  AionChatMessage,
} from "./AionChatMessage";
import { AionChatTranscript } from "./AionChatTranscript";
import type { ChatArtifact, ChatMessage, ChatTask } from "./model";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CREATED_AT = "2026-09-03T12:00:00.000Z";

describe("Aion chat renderers", () => {
  it("renders task states as diagnosable transcript activity", () => {
    const task: ChatTask = {
      id: "task-1",
      contextId: "context-1",
      status: { state: "unknown" },
      history: [],
      artifactIds: [],
    };

    render(
      <AionChatTranscript entries={[{ type: "task", task }]} />,
    );

    expect(screen.getByText("Unknown task status")).toBeTruthy();
    expect(screen.getByText("task-1")).toBeTruthy();
  });

  it("discloses live thinking and collapses finalized reasoning", () => {
    const artifact: ChatArtifact = {
      id: "task-1:aion:thinking-delta",
      artifactId: "aion:thinking-delta",
      taskId: "task-1",
      contextId: "context-1",
      parts: [{ type: "text", text: "Checking **current** status." }],
      lastChunk: false,
    };
    const view = render(
      <AionChatTranscript entries={[{ type: "artifact", artifact }]} />,
    );
    const disclosure = screen.getByText("Thinking").closest("details");

    expect(disclosure?.open).toBe(true);
    expect(screen.getByText("current").tagName).toBe("STRONG");

    view.rerender(
      <AionChatTranscript
        entries={[
          { type: "artifact", artifact: { ...artifact, lastChunk: true } },
        ]}
      />,
    );

    expect(disclosure?.open).toBe(false);
  });

  it("dispatches typed data while preserving an unknown fallback", () => {
    const ToolActivity = ({ part }: AionChatDataPartProps) => (
      <div>{`Tool: ${(part.data as { name: string }).name}`}</div>
    );
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      parts: [
        {
          type: "data",
          data: { kind: "tool-call", name: "Search", status: "working" },
        },
        {
          type: "data",
          data: { kind: "future-activity", value: 42 },
        },
      ],
      createdAt: CREATED_AT,
    };

    render(
      <AionChatMessage
        message={message}
        dataRenderers={{ "tool-call": ToolActivity }}
      />,
    );

    expect(screen.getByText("Tool: Search")).toBeTruthy();
    expect(screen.getByText("future-activity")).toBeTruthy();
    expect(screen.getByText(/"value": 42/)).toBeTruthy();
  });

  it("copies assistant text and discloses response identifiers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      parts: [{ type: "text", text: "**Current** status" }],
      contextId: "context-1",
      taskId: "task-1",
      createdAt: CREATED_AT,
    };
    const view = render(
      <AionChatMessage message={message} streaming />,
    );
    expect(
      screen.queryByRole("button", { name: "Copy response" }),
    ).toBeNull();
    view.rerender(<AionChatMessage message={message} />);

    const copy = screen.getByRole("button", { name: "Copy response" });
    const copyIcon = copy.innerHTML;
    fireEvent.click(copy);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copied response" }),
      ).toBeTruthy(),
    );
    expect(writeText).toHaveBeenCalledWith("**Current** status");
    expect(copy.innerHTML).not.toBe(copyIcon);

    const details = screen.getByRole("button", {
      name: "View response details",
    });
    expect(details.getAttribute("title")).toBeNull();
    fireEvent.click(details);

    const dialog = screen.getByRole("dialog", { name: "Response Details" });
    expect(within(dialog).getByText("task-1")).toBeTruthy();
    expect(within(dialog).getByText("context-1")).toBeTruthy();
  });

  it("does not expose error details through the default renderer", () => {
    render(
      <AionChatError
        error={{
          code: "transport_failed",
          message: "The request failed.",
          retryable: true,
          details: { grantUrl: "https://secret.example/grant" },
        }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("The request failed.");
    expect(screen.queryByText(/secret\.example/)).toBeNull();
  });
});
