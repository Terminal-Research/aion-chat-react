import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  AionChatProvider,
  type AionChatProviderProps,
} from "./AionChatProvider";
import { useAionChat } from "./hooks";
import type { AionChatRequest } from "./transport";
import { FakeAionChatTransport } from "./testing/fake-transport";

const AGENT = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available" as const,
};

function createIds(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

function createWrapper(
  transport: AionChatProviderProps["transport"],
  overrides: Partial<AionChatProviderProps> = {},
) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <AionChatProvider
        transport={transport}
        defaultAgent={AGENT}
        createId={createIds()}
        now={() => "2026-08-31T12:00:00.000Z"}
        {...overrides}
      >
        {children}
      </AionChatProvider>
    );
  };
}

describe("AionChatProvider", () => {
  it("allows a controlled host to clear the selected agent", () => {
    const transport = new FakeAionChatTransport(() => []);
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, {
        agent: null,
        defaultDraft: "Hello",
      }),
    });

    expect(result.current.state.agent).toBeUndefined();
    expect(result.current.meta.canSend).toBe(false);
  });

  it("streams a draft through the transport into normalized state", async () => {
    const transport = new FakeAionChatTransport((request) => [
      {
        event: {
          type: "message.delta",
          eventId: "event-delta-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:01.000Z",
          turnId: request.turnId,
          messageId: "assistant-1",
          text: "Daily status",
        },
      },
      {
        event: {
          type: "task.status-changed",
          eventId: "event-status-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:02.000Z",
          turnId: request.turnId,
          taskId: "task-1",
          contextId: "context-1",
          state: "completed",
          final: true,
        },
      },
    ]);
    const onRunEnd = vi.fn();
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, { onRunEnd }),
    });

    act(() => result.current.actions.setDraft("Tell me the status."));
    await act(async () => result.current.actions.send());

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]).toMatchObject({
      agent: AGENT,
      attempt: 1,
      message: {
        role: "user",
        parts: [{ type: "text", text: "Tell me the status." }],
      },
    });
    expect(result.current.state.draft).toBe("");
    expect(result.current.state.conversation.activeRun?.status).toBe(
      "completed",
    );
    expect(result.current.state.conversation.turns[0]).toMatchObject({
      status: "completed",
      assistantMessageIds: ["assistant-1"],
      taskIds: ["task-1"],
    });
    expect(onRunEnd).toHaveBeenCalledWith(
      result.current.state.conversation,
    );
  });

  it("aborts a pending stream and records cancellation", async () => {
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
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, { defaultDraft: "Wait for it." }),
    });

    let sendPromise: Promise<void> | undefined;
    act(() => {
      sendPromise = result.current.actions.send();
    });
    await waitFor(() => expect(transport.requests).toHaveLength(1));
    act(() => result.current.actions.stop());
    await act(async () => sendPromise);

    expect(result.current.state.conversation.activeRun?.status).toBe(
      "canceled",
    );
    expect(result.current.meta.isRunning).toBe(false);
  });

  it("retries a retryable failure on the same turn", async () => {
    let attempt = 0;
    const transport = new FakeAionChatTransport((request) => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("Connection lost.");
      }
      return [
        {
          event: {
            type: "run.completed",
            eventId: "event-complete-2",
            requestId: request.requestId,
            occurredAt: "2026-08-31T12:00:02.000Z",
          },
        },
      ];
    });
    const onError = vi.fn();
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, {
        defaultDraft: "Try this.",
        onError,
      }),
    });

    await act(async () => result.current.actions.send());
    expect(result.current.meta.canRetry).toBe(true);

    await act(async () => result.current.actions.retry());

    expect(transport.requests.map((request) => request.attempt)).toEqual([1, 2]);
    expect(transport.requests[1]?.turnId).toBe(transport.requests[0]?.turnId);
    expect(result.current.state.conversation.turns).toHaveLength(1);
    expect(result.current.state.conversation.messages).toHaveLength(1);
    expect(result.current.state.conversation.activeRun?.status).toBe(
      "completed",
    );
    expect(onError).toHaveBeenCalledWith({
      code: "transport_error",
      message: "Connection lost.",
      retryable: true,
    });
  });

  it("passes input-required task coordinates into the next request", async () => {
    const requests: AionChatRequest[] = [];
    const transport = new FakeAionChatTransport((request) => {
      requests.push(request);
      if (requests.length === 1) {
        return [
          {
            event: {
              type: "task.status-changed",
              eventId: "event-input-1",
              requestId: request.requestId,
              occurredAt: "2026-08-31T12:00:01.000Z",
              turnId: request.turnId,
              taskId: "task-1",
              contextId: "context-1",
              state: "input-required",
              final: true,
            },
          },
        ];
      }
      return [];
    });
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, { defaultDraft: "Start." }),
    });

    await act(async () => result.current.actions.send());
    act(() => result.current.actions.setDraft("Project A"));
    await act(async () => result.current.actions.send());

    expect(requests[1]).toMatchObject({
      contextId: "context-1",
      taskId: "task-1",
    });
  });

  it("stops observing a transport after unmount", async () => {
    let release: (() => void) | undefined;
    const transport = {
      async *stream(request: AionChatRequest) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        yield {
          type: "run.completed" as const,
          eventId: "event-complete-late",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:01.000Z",
        };
      },
    };
    const onConversationChange = vi.fn();
    const { result, unmount } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, {
        defaultDraft: "Start.",
        onConversationChange,
      }),
    });

    act(() => {
      void result.current.actions.send();
    });
    await waitFor(() => expect(onConversationChange).toHaveBeenCalledTimes(1));
    unmount();
    release?.();
    await Promise.resolve();

    expect(onConversationChange).toHaveBeenCalledTimes(1);
  });

  it("aborts an in-flight attachment upload when its draft is removed", async () => {
    let uploadSignal: AbortSignal | undefined;
    const uploader = {
      upload: vi.fn(
        (_file: File, { signal }: { signal: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            uploadSignal = signal;
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    };
    const transport = new FakeAionChatTransport(() => []);
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, { attachmentUploader: uploader }),
    });

    act(() => {
      result.current.actions.addAttachments?.([
        new File(["draft"], "draft.txt", { type: "text/plain" }),
      ]);
    });
    await waitFor(() => {
      expect(result.current.state.attachments).toHaveLength(1);
    });
    const attachmentId = result.current.state.attachments[0]?.id;
    expect(attachmentId).toBeDefined();
    if (!attachmentId) {
      throw new Error("Expected an attachment draft.");
    }

    act(() => result.current.actions.removeAttachment(attachmentId));

    expect(uploadSignal?.aborted).toBe(true);
    expect(result.current.state.attachments).toHaveLength(0);
  });

  it("does not carry attachment drafts to a different agent", async () => {
    let uploadSignal: AbortSignal | undefined;
    const uploader = {
      upload: vi.fn(
        (_file: File, { signal }: { signal: AbortSignal }) =>
          new Promise<never>(() => {
            uploadSignal = signal;
          }),
      ),
    };
    const transport = new FakeAionChatTransport(() => []);
    const { result } = renderHook(() => useAionChat(), {
      wrapper: createWrapper(transport, { attachmentUploader: uploader }),
    });

    act(() => {
      result.current.actions.addAttachments?.([
        new File(["draft"], "draft.txt", { type: "text/plain" }),
      ]);
    });
    await waitFor(() => expect(result.current.state.attachments).toHaveLength(1));

    act(() => {
      result.current.actions.setAgent({
        id: "distribution-2",
        title: "Another agent",
        availability: "available",
      });
    });

    await waitFor(() => expect(result.current.state.attachments).toHaveLength(0));
    expect(uploadSignal?.aborted).toBe(true);
  });
});
