import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, type PropsWithChildren } from "react";
import { WELCOME_MESSAGE_EXTENSION_URI as uri, WELCOME_REQUEST_SCHEMA as schema, isWelcomeRequest } from "./welcome";
import { useAionConversations } from "./conversations/useAionConversations";
import { createInMemoryAionConversationStore } from "./conversations/memory-store";
import { createAionConversationSnapshot } from "./conversations/snapshot";
import { AionChatTranscript } from "./AionChatTranscript";
import { reduceChatConversation } from "./reducer";
import type { ChatAgent, ChatMessage } from "./model";
import type { AionChatTransport, AionChatRequest } from "./transport";
import { createDirectAionA2ATransport } from "./a2a/direct-transport";
import { createAionChatGraphQLTransport } from "./graphql/chat-transport";
import type { AionChatGraphQLVariables } from "./graphql/types";

const agent: ChatAgent = { id: "selected", title: "Agent", availability: "available" };
const now = () => "2026-09-29T10:00:00Z";
const message: ChatMessage = {
  id: "trigger", role: "user", createdAt: now(), extensions: [uri],
  parts: [{ type: "data", data: { type: "welcome-request" }, metadata: { [uri]: { schema } } }],
};
const request: AionChatRequest = {
  requestId: "welcome-rpc", turnId: "welcome-turn", attempt: 1, agent,
  message, contextId: "context", operation: "SendMessage", extensions: [uri],
};
function ids() { let next = 0; return () => `id-${++next}`; }
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(cleanup);

describe("new-thread welcome lifecycle", () => {
  it.each(["welcome-first", "user-first"])(
    "persists both concurrent replies without resending on restore (%s)", async (order) => {
    const pending = deferred();
    const sent: AionChatRequest[] = [];
    const transport: AionChatTransport = {
      getAgentCapabilities: vi.fn().mockResolvedValue({ extensions: [{ uri }] }),
      async *stream(value) {
        sent.push(value);
        await pending.promise;
        yield { type: "message.received", eventId: "welcome-message-event", requestId: value.requestId,
          turnId: value.turnId, occurredAt: now(), message: {
            id: "greeting", role: "assistant", parts: [{ type: "text", text: "Hello!" }],
            createdAt: now(), contextId: value.contextId, extensions: [uri],
          } };
        yield { type: "run.completed", eventId: "welcome-complete", requestId: value.requestId, occurredAt: now() };
      },
    };
    const store = createInMemoryAionConversationStore();
    const createId = ids();
    const options = { store, transport, agent, createId, now };
    const { result, rerender, unmount } = renderHook(() => useAionConversations(options), {
      wrapper: ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(sent).toHaveLength(0);
    act(() => { result.current.createConversation(); });
    await waitFor(() => expect(sent).toHaveLength(1));
    const contextId = result.current.selectedContextId!;
    expect(sent[0]).toMatchObject({ operation: "SendMessage", contextId, extensions: [uri] });
    expect(sent[0]!.message.parts).toEqual(message.parts);
    expect(result.current.conversation!.activeRun).toBeUndefined();
    let foreground = reduceChatConversation(result.current.conversation!, {
      type: "run.started", eventId: "user-start", requestId: "user-rpc", turnId: "user-turn",
      attempt: 1, occurredAt: now(), userMessage: { id: "user", role: "user", parts: [{ type: "text", text: "Question" }], createdAt: now() },
    });
    act(() => result.current.saveConversation(foreground));
    const finishForeground = () => {
      foreground = reduceChatConversation(foreground, {
        type: "message.received", eventId: "answer-received", requestId: "user-rpc",
        turnId: "user-turn", occurredAt: now(),
        message: { id: "answer", role: "assistant", createdAt: now(),
          parts: [{ type: "text", text: "Your answer" }] },
      });
      foreground = reduceChatConversation(foreground, {
        type: "run.completed", eventId: "user-done", requestId: "user-rpc", occurredAt: now(),
      });
      act(() => result.current.saveConversation(foreground));
    };
    if (order === "user-first") finishForeground();
    await act(async () => { pending.resolve(); await pending.promise; });
    await waitFor(() => expect(result.current.conversation!.messages.some((m) => m.id === "greeting")).toBe(true));
    expect(result.current.conversation!.activeRun?.requestId).toBe("user-rpc");
    expect(result.current.conversation!.activeRun?.status)
      .toBe(order === "user-first" ? "completed" : "running");
    if (order === "welcome-first") finishForeground();
    // A stale foreground callback still cannot erase the independent welcome.
    act(() => result.current.saveConversation(foreground));
    expect(result.current.conversation!.messages.some((m) => m.id === "greeting")).toBe(true);
    expect(result.current.conversation!.messages.some((m) => m.id === "answer")).toBe(true);
    rerender();
    expect(sent).toHaveLength(1);
    await waitFor(async () => expect((await store.load(agent.id, contextId))?.conversation.messages.some((m) => m.id === "greeting")).toBe(true));
    unmount();
    const restored = renderHook(() => useAionConversations({ ...options, fixedContextId: contextId }));
    await waitFor(() => expect(restored.result.current.conversation).toBeDefined());
    expect(sent).toHaveLength(1);
    expect(restored.result.current.conversation!.messages.find((m) => m.id === "greeting")?.extensions).toEqual([uri]);
    expect(restored.result.current.conversation!.messages.some((m) => m.id === "answer")).toBe(true);
  });

  it("keeps a late welcome on its original thread after navigation", async () => {
    const pending = deferred();
    const sent: AionChatRequest[] = [];
    const transport: AionChatTransport = {
      getAgentCapabilities: vi.fn().mockResolvedValueOnce({ extensions: [{ uri }] }).mockResolvedValue({}),
      async *stream(value) {
        sent.push(value); await pending.promise;
        yield { type: "message.received", eventId: "late", requestId: value.requestId, turnId: value.turnId,
          occurredAt: now(), message: { id: "late-message", role: "assistant", parts: [{ type: "text", text: "Late greeting" }], createdAt: now(), contextId: value.contextId } };
        yield { type: "run.completed", eventId: "late-done", requestId: value.requestId, occurredAt: now() };
      },
    };
    const store = createInMemoryAionConversationStore();
    const createId = ids();
    const { result } = renderHook(() => useAionConversations({ store, transport, agent, createId, now }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.createConversation(); });
    await waitFor(() => expect(sent).toHaveLength(1));
    const first = sent[0]!.contextId!;
    act(() => { result.current.createConversation(); });
    const second = result.current.selectedContextId;
    expect(second).not.toBe(first);
    await act(async () => { pending.resolve(); await pending.promise; });
    await waitFor(async () => expect((await store.load(agent.id, first))?.conversation.messages.some((m) => m.id === "late-message")).toBe(true));
    expect(result.current.selectedContextId).toBe(second);
    expect(result.current.conversation!.messages).toHaveLength(0);
  });

  it("does not retry failed welcomes or dispatch without confirmed support", async () => {
    const onError = vi.fn();
    let sends = 0;
    const getAgentCapabilities = vi.fn().mockResolvedValueOnce({ extensions: [{ uri }] }).mockResolvedValue({});
    const transport: AionChatTransport = {
      getAgentCapabilities,
      async *stream() { sends++; yield* await Promise.reject<never[]>(new Error("lost response")); },
    };
    const store = createInMemoryAionConversationStore();
    const createId = ids();
    const { result, rerender } = renderHook(() => useAionConversations({ store, transport, agent, createId, now, onError }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.createConversation(); });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(result.current.conversation!.activeRun).toBeUndefined();
    rerender();
    act(() => { result.current.reload(); });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(sends).toBe(1);
    act(() => { result.current.createConversation(); });
    await waitFor(() => expect(getAgentCapabilities).toHaveBeenCalledTimes(2));
    expect(sends).toBe(1);
  });

  it("skips a pending welcome when user text arrives during discovery", async () => {
    const pending = deferred();
    const stream = vi.fn<AionChatTransport["stream"]>();
    const transport: AionChatTransport = {
      getAgentCapabilities: vi.fn(async () => {
        await pending.promise;
        return { extensions: [{ uri }] };
      }),
      stream,
    };
    const store = createInMemoryAionConversationStore();
    const createId = ids();
    const { result } = renderHook(() => useAionConversations({
      store, transport, agent, createId, now,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.createConversation(); });
    const contextId = result.current.selectedContextId!;
    act(() => result.current.saveConversation(reduceChatConversation(
      result.current.conversation!, {
        type: "run.started", eventId: "user-start", requestId: "user-rpc",
        turnId: "user-turn", attempt: 1, occurredAt: now(),
        userMessage: { id: "user", role: "user", createdAt: now(),
          parts: [{ type: "text", text: "Actual question" }] },
      },
    )));
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(stream).not.toHaveBeenCalled();
    expect(result.current.conversation!.activeRun?.requestId).toBe("user-rpc");
    expect(result.current.conversation!.messages.map((item) => item.id)).toEqual(["user"]);
    act(() => result.current.saveConversation(reduceChatConversation(
      reduceChatConversation(result.current.conversation!, {
        type: "message.received", eventId: "answer-event", requestId: "user-rpc",
        turnId: "user-turn", occurredAt: now(), message: {
          id: "answer", role: "assistant", createdAt: now(),
          parts: [{ type: "text", text: "Your answer" }],
        },
      }), {
        type: "run.completed", eventId: "user-done", requestId: "user-rpc", occurredAt: now(),
      },
    )));
    await waitFor(async () => expect(
      (await store.load(agent.id, contextId))?.conversation.messages.map((item) => item.id),
    ).toEqual(["user", "answer"]));
  });

  it("ignores capability discovery for a thread that is no longer selected", async () => {
    const pending = deferred();
    const stream = vi.fn<AionChatTransport["stream"]>();
    const transport: AionChatTransport = {
      getAgentCapabilities: vi.fn()
        .mockImplementationOnce(async () => {
          await pending.promise;
          return { extensions: [{ uri }] };
        }).mockResolvedValue({}),
      stream,
    };
    const store = createInMemoryAionConversationStore();
    const createId = ids();
    const { result } = renderHook(() => useAionConversations({
      store, transport, agent, createId, now,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => { result.current.createConversation(); });
    act(() => { result.current.createConversation(); });
    const selected = result.current.selectedContextId;
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(stream).not.toHaveBeenCalled();
    expect(result.current.selectedContextId).toBe(selected);
    expect(result.current.conversation!.messages).toEqual([]);
  });

  it("hides persisted triggers while retaining real text and welcome response markers", () => {
    expect(isWelcomeRequest(message)).toBe(true);
    const actual = { ...message, id: "actual", parts: [...message.parts, { type: "text" as const, text: "Actual input" }] };
    expect(isWelcomeRequest(actual)).toBe(false);
    expect(isWelcomeRequest({ ...message, parts: [{ type: "data", data: { type: "welcome-request" } }] })).toBe(false);
    const stored = createAionConversationSnapshot({ id: "context", contextId: "context", agent, turns: [], messages: [message, actual], transcript: [], tasks: {}, artifacts: {}, seenEventIds: {} });
    const view = render(<AionChatTranscript entries={stored.conversation.messages.map((value) => ({ type: "message", message: value }))} />);
    expect(view.container.querySelectorAll(".aion-chat__transcript-entry")).toHaveLength(1);
    expect(view.container.textContent).toContain("Actual input");
  });
});

describe("unary welcome transports", () => {
  it.each(["HTTP+JSON", "JSONRPC"])("selects unary directly for %s without streaming capability", async (binding) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      const body = JSON.parse(init!.body as string) as { method?: string };
      if (binding === "JSONRPC") expect(body.method).toBe("SendMessage");
      expect(init!.headers).toMatchObject({ "A2A-Extensions": uri, Accept: "application/json" });
      const greeting = { messageId: "greeting", role: "ROLE_AGENT", contextId: "context", parts: [{ text: "Hello" }], extensions: [uri] };
      return Promise.resolve(new Response(JSON.stringify(binding === "JSONRPC" ? { jsonrpc: "2.0", id: request.requestId, result: { message: greeting } } : { message: greeting })));
    });
    const transport = createDirectAionA2ATransport({ fetch: fetcher, agentCard: {
      name: "Agent", capabilities: { streaming: false, extensions: [{ uri }] },
      supportedInterfaces: [{ url: "https://example.com/a2a", protocolBinding: binding, protocolVersion: "1.0" }],
    } });
    const events = [];
    for await (const event of transport.stream(request, { signal: new AbortController().signal })) events.push(event);
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (binding === "HTTP+JSON") expect(fetcher.mock.calls[0]![0]).toBe("https://example.com/a2a/message:send");
    expect(events.find((event) => event.type === "message.received")).toMatchObject({ message: { extensions: [uri] } });
  });

  it("selects unary in the shared GraphQL adapter and preserves unrelated activation", async () => {
    const sent: AionChatGraphQLVariables[] = [];
    const transport = createAionChatGraphQLTransport({
      serviceParameters: { version: "0.3", extensions: ["distribution-extension"] },
      async *observe(variables) {
        sent.push(variables); await Promise.resolve();
        yield { data: { a2aRpc: { __typename: "A2AJsonRpcSuccessResponseGQL", jsonrpc: "2.0", result: {
          kind: "task", id: "welcome-task", contextId: "context", status: { state: "completed" }, history: [],
        } } } };
      },
    });
    for await (const event of transport.stream(request, { signal: new AbortController().signal })) expect(event.type).not.toBe("run.failed");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ request: { method: "SendMessage", params: { message: { extensions: [uri] } } }, serviceParameters: { extensions: ["distribution-extension", uri] } });
  });
});
