import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatTranscript } from "./AionChatTranscript";
import type { ChatArtifact, ChatMessage } from "./model";

afterEach(cleanup);

describe("AionChatTranscript", () => {
  it.each(["aion:stream-delta", "stream_delta"])(
    "grows %s in one response bubble and replaces it with its durable message",
    (artifactId) => {
      const artifact: ChatArtifact = {
        id: `task:${artifactId}`, artifactId, taskId: "task", contextId: "context",
        name: "Stream Delta", description: "streaming text chunk",
        parts: [{ type: "text", text: "Hello" }], lastChunk: false,
      };
      const view = render(<AionChatTranscript entries={[{ type: "artifact", artifact }]} />);
      const bubble = view.container.querySelector(".aion-chat__message--assistant");
      expect(bubble).toBeTruthy();
      expect(view.container.querySelector(".aion-chat__artifact")).toBeNull();
      expect(screen.queryByText("Stream Delta")).toBeNull();
      expect(screen.queryByText("streaming text chunk")).toBeNull();
      expect(screen.queryByRole("button", { name: "Copy response" })).toBeNull();

      const parts = [{ type: "text" as const, text: "Hello world" }];
      const accumulated = { ...artifact, parts };
      view.rerender(<AionChatTranscript entries={[{ type: "artifact", artifact: accumulated }]} />);
      expect(view.container.querySelector(".aion-chat__message--assistant")).toBe(bubble);
      expect(bubble?.textContent).toBe("Hello world");
      expect(screen.getByText("world").className).toBe("aion-chat__streaming-text-new");

      const message: ChatMessage = {
        id: "durable-response", role: "assistant",
        parts: [{ type: "text", text: "The final corrected answer." }],
        taskId: "task", contextId: "context", createdAt: "2026-10-22T12:00:00Z",
      };
      view.rerender(<AionChatTranscript entries={[
        { type: "artifact", artifact: accumulated }, { type: "message", message },
      ]} />);
      expect(view.container.querySelectorAll('[data-entry-type="message"]')).toHaveLength(1);
      expect(view.container.querySelector(".aion-chat__message--assistant")).toBe(bubble);
      expect(screen.getByText("The final corrected answer.")).toBeTruthy();
      expect(screen.queryByText("Hello world")).toBeNull();
      expect(screen.getByRole("button", { name: "Copy response" })).toBeTruthy();
      expect(view.container.querySelector('[data-entry-id="durable-response"]')).toBeTruthy();

      view.rerender(<AionChatTranscript entries={[{ type: "message", message }]} />);
      expect(view.container.querySelectorAll(".aion-chat__message--assistant")).toHaveLength(1);
      expect(screen.getByText("The final corrected answer.")).toBeTruthy();
    },
  );

  it.each([false, true])("coalesces a durable reply in either order (stream first=%s)", (streamFirst) => {
    const message: ChatMessage = {
      id: "reply", role: "assistant", taskId: "task", contextId: "context",
      parts: [{ type: "text", text: "Complete response" }], createdAt: "2026-10-22T12:00:00Z",
    };
    const artifact: ChatArtifact = {
      id: "task:stream", artifactId: "aion:stream-delta", taskId: "task", contextId: "context",
      parts: message.parts, lastChunk: true,
    };
    const entries = [
      { type: "message" as const, message }, { type: "artifact" as const, artifact },
    ];
    const view = render(<AionChatTranscript entries={streamFirst ? entries.toReversed() : entries} />);
    expect(screen.getAllByText("Complete response")).toHaveLength(1);
    expect(view.container.querySelectorAll(".aion-chat__message--assistant")).toHaveLength(1);
    expect(view.container.querySelector(".aion-chat__artifact")).toBeNull();
  });

  it("uses the message slot for streamed responses and retains artifact slots for thinking", () => {
    const artifact: ChatArtifact = {
      id: "task:stream", artifactId: "aion:stream-delta", taskId: "task", contextId: "context",
      parts: [{ type: "text", text: "Reply" }], lastChunk: false,
    };
    const messageSlot = vi.fn(() => <div>Response slot</div>);
    const artifactSlot = vi.fn(() => <div>Thinking slot</div>);
    render(<AionChatTranscript entries={[
      { type: "artifact", artifact },
      { type: "artifact", artifact: { ...artifact, id: "task:thinking", artifactId: "aion:thinking-delta" } },
    ]} slots={{ message: { component: messageSlot }, artifact: { component: artifactSlot } }} />);
    expect(messageSlot.mock.calls).toHaveLength(1);
    expect(artifactSlot.mock.calls).toHaveLength(1);
    expect(screen.getByText("Response slot")).toBeTruthy();
    expect(screen.getByText("Thinking slot")).toBeTruthy();
  });

  it("retains every long-history entry in the DOM", () => {
    const entries = Array.from({ length: 300 }, (_, index) => {
      const message: ChatMessage = {
        id: `message-${index}`,
        role: "assistant",
        parts: [{ type: "text", text: `Message ${index}` }],
        createdAt: "2026-09-03T12:00:00.000Z",
      };
      return { type: "message" as const, message };
    });

    const view = render(<AionChatTranscript entries={entries} />);

    expect(
      view.container.querySelectorAll(".aion-chat__transcript-entry"),
    ).toHaveLength(300);
    expect(screen.getByText("Message 0")).toBeTruthy();
    expect(screen.getByText("Message 299")).toBeTruthy();
    expect(view.container.querySelector('[data-entry-id="message-150"]'))
      .toBeTruthy();
  });

  it("keeps interactive content keyboard reachable inside wrappers", () => {
    const message: ChatMessage = {
      id: "message-file",
      role: "assistant",
      parts: [
        {
          type: "file",
          file: {
            name: "Report",
            url: "https://files.example/report.pdf",
          },
        },
      ],
      createdAt: "2026-09-03T12:00:00.000Z",
    };
    render(
      <AionChatTranscript entries={[{ type: "message", message }]} />,
    );
    const link = screen.getByRole("link", { name: "Report" });

    link.focus();

    expect(document.activeElement).toBe(link);
  });

  it("uses browser containment without windowing styles", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/aion-chat.css"),
      "utf8",
    );

    expect(css).toContain("content-visibility: auto");
    expect(css).toContain("contain-intrinsic-size: auto 6rem");
  });
});
