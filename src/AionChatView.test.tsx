import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatProvider } from "./AionChatProvider";
import { AionChatTranscript } from "./AionChatTranscript";
import { AionChatView } from "./AionChatView";
import type { AionChatMessageProps } from "./AionChatMessage";
import type { ChatArtifact, ChatConversationState, ChatMessage } from "./model";
import { FakeAionChatTransport } from "./testing/fake-transport";
import { createAionChatGraphQLTransport } from "./graphql/chat-transport";

const AGENT = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available" as const,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createIds(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

describe("AionChatView", () => {
  it("keeps task activity out of chat while retaining response details", () => {
    const message: ChatMessage = {
      id: "message-assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Current status" }],
      createdAt: "2026-08-31T12:00:01.000Z",
    };
    const conversation: ChatConversationState = {
      id: "conversation-1",
      agent: AGENT,
      contextId: "context-1",
      turns: [
        {
          id: "turn-1",
          userMessageId: "message-user-1",
          requestIds: ["request-1"],
          assistantMessageIds: [message.id],
          taskIds: ["task-1"],
          artifactIds: [],
          status: "running",
          createdAt: "2026-08-31T12:00:00.000Z",
          updatedAt: "2026-08-31T12:00:01.000Z",
        },
      ],
      messages: [message],
      transcript: [
        { type: "message", id: message.id },
        { type: "task", id: "task-1" },
        { type: "task", id: "task-input" },
      ],
      tasks: {
        "task-1": {
          id: "task-1",
          contextId: "context-1",
          status: { state: "working" },
          history: [],
          artifactIds: [],
        },
        "task-input": {
          id: "task-input",
          contextId: "context-1",
          status: { state: "input-required" },
          history: [],
          artifactIds: [],
        },
      },
      artifacts: {},
      seenEventIds: {},
    };
    render(
      <AionChatProvider
        transport={new FakeAionChatTransport(() => [])}
        conversation={conversation}
      >
        <AionChatView />
      </AionChatProvider>,
    );

    expect(screen.queryByText("Agent is working")).toBeNull();
    expect(screen.getByText("More information needed")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "View response details" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain("task-1");
    expect(screen.getByRole("dialog").textContent).toContain("context-1");
  });

  it.each([
    "user-message", "different-task", "different-context", "structured-message",
    "regular-artifact",
  ])("retains distinct content alongside a stream artifact (%s)", (variant) => {
    const message: ChatMessage = {
      id: "message", role: variant === "user-message" ? "user" : "assistant",
      taskId: variant === "different-task" ? "other-task" : "task",
      contextId: variant === "different-context" ? "other-context" : "context",
      createdAt: "2026-09-29T13:00:00Z",
      parts: [{ type: "text", text: "Hello" },
        ...(variant === "structured-message" ? [{ type: "data" as const, data: { result: 42 } }] : [])],
    };
    const artifact: ChatArtifact = {
      id: "task:artifact", taskId: "task", contextId: "context",
      artifactId: variant === "regular-artifact" ? "report" : "aion:stream-delta",
      parts: [{ type: "text", text: "Hello" }],
      lastChunk: true,
    };
    const view = render(<AionChatTranscript entries={[
      { type: "message", message }, { type: "artifact", artifact },
    ]} />);

    expect(view.container.querySelectorAll("[data-entry-type]")).toHaveLength(2);
  });

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
    expect(screen.getByRole("button", { name: "Copy response" }))
      .toBeTruthy();
    expect(screen.getByText("What changed?")).toBeTruthy();
    expect(transport.requests[0]?.message.parts).toEqual([
      { type: "text", text: "What changed?" },
    ]);
  });

  it.each([undefined, "Stream Delta"])(
    "replaces live SDK deltas with the final response (name=%s)",
    async (name) => {
      let append = () => {};
      let complete = () => {};
      let settle = () => {};
      const appended = new Promise<void>((resolve) => { append = resolve; });
      const completed = new Promise<void>((resolve) => { complete = resolve; });
      const settled = new Promise<void>((resolve) => { settle = resolve; });
      const wrap = (result: Record<string, unknown>) => ({ data: { a2aRpc: {
        __typename: "A2AJsonRpcSuccessResponseGQL" as const,
        jsonrpc: "2.0", result,
      } } });
      const transport = createAionChatGraphQLTransport({
        async *observe() {
          const stream = (text: string, isAppend: boolean) => wrap({
            kind: "TaskArtifactUpdateEvent", taskId: "task", contextId: "context",
            append: isAppend, lastChunk: false,
            artifact: { artifactId: "aion:stream-delta", name,
              parts: [{ kind: "text", text }] },
          });
          yield stream("Hello", false);
          await appended;
          yield stream(" world", true);
          await completed;
          yield wrap({
            kind: "TaskStatusUpdateEvent", taskId: "task", contextId: "context",
            status: { state: "working", message: {
              messageId: "final-message", role: "agent", taskId: "task", contextId: "context",
              parts: [{ kind: "text", text: "The final corrected answer." }],
            } },
          });
          await settled;
          yield wrap({
            kind: "TaskStatusUpdateEvent", taskId: "task", contextId: "context",
            final: true, status: { state: "completed" },
          });
        },
      });
      const view = render(<AionChatProvider transport={transport} defaultAgent={AGENT} defaultDraft="Begin">
        <AionChatView />
      </AionChatProvider>);
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByText("Hello");
      const bubble = view.container.querySelector(".aion-chat__message--assistant");
      expect(bubble).toBeTruthy();
      expect(screen.queryByText("Stream Delta")).toBeNull();

      act(append);
      await screen.findByText("world");
      expect(bubble?.textContent).toBe("Hello world");
      expect(view.container.querySelectorAll(".aion-chat__message--assistant")).toHaveLength(1);

      act(complete);
      await screen.findByText("The final corrected answer.");
      await waitFor(() => {
        expect(view.container.querySelectorAll(".aion-chat__message--assistant")).toHaveLength(1);
      });
      expect(view.container.querySelector(".aion-chat__message--assistant")).toBe(bubble);
      expect(bubble?.textContent).not.toContain("Hello world");
      expect(view.container.querySelector(".aion-chat__artifact")).toBeNull();
      act(settle);
      await screen.findByRole("button", { name: "Send" });
    },
  );

  it("marks only appended assistant message deltas for motion", async () => {
    const transport = new FakeAionChatTransport((request) => [
      {
        event: {
          type: "message.delta",
          eventId: "event-delta-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:01.000Z",
          turnId: request.turnId,
          messageId: "message-assistant-1",
          text: "Hello",
        },
      },
      {
        delayMs: 25,
        event: {
          type: "message.delta",
          eventId: "event-delta-2",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:02.000Z",
          turnId: request.turnId,
          messageId: "message-assistant-1",
          text: " world",
        },
      },
      {
        delayMs: 1_000,
        event: {
          type: "run.completed",
          eventId: "event-complete-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:03.000Z",
        },
      },
    ]);
    const view = render(
      <AionChatProvider
        transport={transport}
        defaultAgent={AGENT}
        defaultDraft="Begin"
        createId={createIds()}
      >
        <AionChatView />
      </AionChatProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Hello");
    const appended = await screen.findByText("world");

    expect(appended.className).toBe("aion-chat__streaming-text-new");
    expect(view.container.textContent).toContain("Hello world");
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
    // Supply layout before mount, as a browser does. Changing clientHeight in
    // the scroll event would represent a viewport resize rather than user input.
    const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(200);
    const extent = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1_000);
    const { rerender } = render(
      <AionChatTranscript entries={[{ type: "message", message: first }]} />,
    );
    const transcript = screen.getByRole("log");
    transcript.scrollTop = 100;
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
    height.mockRestore();
    extent.mockRestore();
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

  it("supports component replacement and default props through slots", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      parts: [{ type: "text", text: "Original response" }],
      createdAt: "2026-08-31T12:00:00.000Z",
    };
    const CustomMessage = ({
      message: currentMessage,
      className,
    }: AionChatMessageProps) => (
      <article className={className}>{`Custom ${currentMessage.id}`}</article>
    );

    render(
      <AionChatTranscript
        entries={[{ type: "message", message }]}
        slots={{
          message: {
            component: CustomMessage,
            props: { className: "host-message" },
          },
        }}
      />,
    );

    expect(screen.getByText("Custom message-1").className).toBe("host-message");
  });

  it("uploads selected attachments before including them in a message", async () => {
    const transport = new FakeAionChatTransport(() => []);
    let finishUpload: ((value: { url: string; mediaType: string }) => void) |
      undefined;
    const uploader = {
      upload: vi.fn(
        () =>
          new Promise<{ url: string; mediaType: string }>((resolve) => {
            finishUpload = resolve;
          }),
      ),
    };
    const view = render(
      <AionChatProvider
        transport={transport}
        attachmentUploader={uploader}
        defaultAgent={AGENT}
        createId={createIds()}
      >
        <AionChatView />
      </AionChatProvider>,
    );
    const file = new File(["image"], "report.png", { type: "image/png" });
    const fileInput = view.container.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    expect(fileInput).not.toBeNull();
    if (!fileInput) {
      throw new Error("Expected the attachment file input.");
    }

    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByText("Uploading");
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Uploading…",
      }).disabled,
    ).toBe(true);
    finishUpload?.({
      url: "https://files.example/report.png",
      mediaType: "image/png",
    });
    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(transport.requests).toHaveLength(1));
    expect(transport.requests[0]?.message.parts).toEqual([
      {
        type: "file",
        file: {
          name: "report.png",
          mediaType: "image/png",
          url: "https://files.example/report.png",
        },
      },
    ]);
    expect(screen.queryByRole("list", { name: "Attachments" })).toBeNull();
  });

  it("customizes default composer props without replacing its behavior", () => {
    const transport = new FakeAionChatTransport(() => []);
    render(
      <AionChatProvider transport={transport} defaultAgent={AGENT}>
        <AionChatView
          slots={{
            composer: { props: { placeholder: "Ask the status agent" } },
          }}
        />
      </AionChatProvider>,
    );

    expect(
      screen.getByPlaceholderText("Ask the status agent"),
    ).toBeTruthy();
  });

  it("does not repeat transcript scroll work when only the draft changes", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLDivElement.prototype,
      "scrollTop",
    );
    let scrollWrites = 0;
    const extent = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(1_000);
    Object.defineProperty(HTMLDivElement.prototype, "scrollTop", {
      configurable: true,
      get: () => 0,
      set: () => {
        scrollWrites += 1;
      },
    });

    const transport = new FakeAionChatTransport(() => []);
    const view = render(
      <AionChatProvider transport={transport} defaultAgent={AGENT}>
        <AionChatView />
      </AionChatProvider>,
    );

    try {
      const initialScrollWrites = scrollWrites;
      expect(initialScrollWrites).toBeGreaterThan(0);
      fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
        target: { value: "Draft only" },
      });

      expect(scrollWrites).toBe(initialScrollWrites);
    } finally {
      view.unmount();
      extent.mockRestore();
      if (descriptor) {
        Object.defineProperty(HTMLDivElement.prototype, "scrollTop", descriptor);
      } else {
        Reflect.deleteProperty(HTMLDivElement.prototype, "scrollTop");
      }
    }
  });
});
