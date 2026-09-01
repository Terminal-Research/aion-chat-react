import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionChatProvider } from "./AionChatProvider";
import { AionChatTranscript } from "./AionChatTranscript";
import { AionChatView } from "./AionChatView";
import type { ChatMessage } from "./model";
import { FakeAionChatTransport } from "./testing/fake-transport";

const AGENT = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available" as const,
};

afterEach(cleanup);

function createIds(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

describe("AionChatView", () => {
  it("sends from the composer and renders a streamed response", async () => {
    const transport = new FakeAionChatTransport((request) => [
      {
        event: {
          type: "artifact.updated",
          eventId: "event-artifact-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:01.000Z",
          turnId: request.turnId,
          append: false,
          artifact: {
            id: "task-1:aion:stream-delta",
            artifactId: "aion:stream-delta",
            taskId: "task-1",
            contextId: "context-1",
            parts: [{ type: "text", text: "Here is the status." }],
            lastChunk: true,
          },
        },
      },
    ]);
    render(
      <AionChatProvider
        transport={transport}
        defaultAgent={AGENT}
        createId={createIds()}
        now={() => "2026-08-31T12:00:00.000Z"}
      >
        <AionChatView />
      </AionChatProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("Here is the status.");
    expect(screen.getByText("What changed?")).toBeTruthy();
    expect(transport.requests[0]?.message.parts).toEqual([
      { type: "text", text: "What changed?" },
    ]);
  });

  it("does not submit from Enter while an IME composition is active", async () => {
    const transport = new FakeAionChatTransport(() => []);
    render(
      <AionChatProvider
        transport={transport}
        defaultAgent={AGENT}
        defaultDraft="Composed message"
        createId={createIds()}
      >
        <AionChatView />
      </AionChatProvider>,
    );
    const composer = screen.getByRole("textbox", { name: "Chat message" });

    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    fireEvent.keyDown(composer, { key: "Enter", keyCode: 229 });
    expect(transport.requests).toHaveLength(0);

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(transport.requests).toHaveLength(1));
  });

  it("offers stop while a response is pending", async () => {
    const transport = new FakeAionChatTransport((request) => [
      {
        delayMs: 10_000,
        event: {
          type: "run.completed",
          eventId: "event-complete-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:01.000Z",
        },
      },
    ]);
    render(
      <AionChatProvider
        transport={transport}
        defaultAgent={AGENT}
        defaultDraft="Wait"
        createId={createIds()}
      >
        <AionChatView />
      </AionChatProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(transport.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await screen.findByRole("button", { name: "Send" });
  });

  it("keeps manual scroll position until the reader requests the latest message", () => {
    const first: ChatMessage = {
      id: "message-1",
      role: "assistant",
      parts: [{ type: "text", text: "First" }],
      createdAt: "2026-08-31T12:00:00.000Z",
    };
    const second: ChatMessage = {
      ...first,
      id: "message-2",
      parts: [{ type: "text", text: "Second" }],
    };
    const { rerender } = render(
      <AionChatTranscript entries={[{ type: "message", message: first }]} />,
    );
    const transcript = screen.getByRole("log");
    Object.defineProperties(transcript, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });

    fireEvent.scroll(transcript);
    rerender(
      <AionChatTranscript
        entries={[
          { type: "message", message: first },
          { type: "message", message: second },
        ]}
      />,
    );

    expect(transcript.scrollTop).toBe(100);
    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Scroll to latest message" }),
      );
    });
    expect(transcript.scrollTop).toBe(1_000);
  });

  it("does not create executable links for unsafe file-part URLs", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      parts: [
        {
          type: "file",
          file: { name: "unsafe.txt", url: "javascript:alert(1)" },
        },
      ],
      createdAt: "2026-08-31T12:00:00.000Z",
    };

    render(
      <AionChatTranscript entries={[{ type: "message", message }]} />,
    );

    expect(screen.getByText("unsafe.txt").tagName).toBe("SPAN");
  });
});
