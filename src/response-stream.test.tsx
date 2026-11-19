import type { ApolloClient, FetchResult } from "@apollo/client/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatProvider } from "./AionChatProvider";
import { AionChatView } from "./AionChatView";
import { createDirectAionA2ATransport } from "./a2a/direct-transport";
import { normalizeAionResponse } from "./a2a/normalize";
import { createApolloAionChatTransport } from "./graphql/apollo-transport";
import type { AionChatGraphQLSubscriptionData } from "./graphql/types";
import { useAionChat } from "./hooks";
import { createAionConversationSnapshot, parseAionConversationSnapshot } from "./conversations/snapshot";
import { createChatConversationState, getChatText } from "./model";
import { reduceChatConversation } from "./reducer";
import type { AionChatController } from "./AionChatProvider";
import { welcomeEvents, WELCOME_MESSAGE_EXTENSION_URI } from "./welcome";

const AGENT = { id: "agent", title: "Agent", availability: "available" as const };
const TASK = { id: "task", contextId: "context" };
const DRAFT = "Draft-only streamed response.";
const MESSAGE_FALLBACK = "Final message fallback, superseded by the artifact.";
const ANSWER = "Final canonical answer from assistant artifact.";
const FINAL_TASK = {
  kind: "task", ...TASK, status: { state: "completed" }, history: [{
    kind: "message", messageId: "final-message", role: "agent", taskId: TASK.id,
    contextId: TASK.contextId, parts: [{ kind: "text", text: MESSAGE_FALLBACK }],
  }],
  artifacts: [
    { artifactId: "aion:stream-delta", parts: [{ kind: "text", text: DRAFT }] },
    { artifactId: "aion:assistant-answer", parts: [{ kind: "text", text: ANSWER }] },
  ],
};

function status(state: string) {
  return {
    kind: "status-update", taskId: TASK.id, contextId: TASK.contextId,
    status: { state }, final: true,
  };
}

function delta(text: string, lastChunk = false, metadata?: Record<string, unknown>) {
  return {
    kind: "artifact-update", taskId: TASK.id, contextId: TASK.contextId,
    append: true, lastChunk,
    artifact: { artifactId: "aion:stream-delta", parts: [{ kind: "text", text }], metadata },
  };
}

type Binding = "HTTP+JSON" | "JSONRPC" | "GraphQL";
type Observer = {
  next(value: FetchResult<AionChatGraphQLSubscriptionData>): void;
  complete(): void;
  error(error: Error): void;
};

/** A controllable response; delivering a terminal payload does not close it. */
function server(binding: Binding) {
  const released = vi.fn();
  const stopClient = vi.fn();
  let ready = false;
  let observer: Observer;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let requestId: string;
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel: released,
  });
  const transport = binding === "GraphQL"
    ? createApolloAionChatTransport({ client: {
      subscribe: () => ({ subscribe(value: Observer) {
        observer = value;
        ready = true;
        return { unsubscribe: released };
      } }),
      stop: stopClient,
    } as unknown as ApolloClient<unknown> })
    : createDirectAionA2ATransport({
      agentCard: {
        name: "Agent", capabilities: { streaming: true },
        supportedInterfaces: [{
          protocolBinding: binding, protocolVersion: "1.0",
          url: "https://agent.example/a2a",
        }],
      },
      fetch: vi.fn<typeof fetch>((_url, init) => {
        requestId = (JSON.parse(init!.body as string) as { id: string }).id;
        ready = true;
        return Promise.resolve(new Response(body, {
          headers: { "content-type": "text/event-stream" },
        }));
      }),
    });
  return {
    transport, released, stopClient,
    ready: () => ready,
    send(result: Record<string, unknown>) {
      if (binding === "GraphQL") {
        observer.next({ data: { a2aRpc: {
          __typename: "A2AJsonRpcSuccessResponseGQL", jsonrpc: "2.0", result,
        } } });
      } else {
        const field = result.kind === "artifact-update" ? "artifactUpdate"
          : result.kind === "status-update" ? "statusUpdate" : result.kind as string;
        const payload = binding === "JSONRPC"
          ? { jsonrpc: "2.0", id: requestId, result }
          : { [field]: result };
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
      }
    },
    close() {
      if (binding === "GraphQL") observer.complete();
      else controller.close();
    },
    fail() {
      if (binding === "GraphQL") observer.error(new Error("Connection lost"));
      else controller.error(new Error("Connection lost"));
    },
  };
}

async function client(binding: Binding) {
  const source = server(binding);
  let chat: AionChatController;
  const onRunEnd = vi.fn();
  function Chat() {
    chat = useAionChat();
    return <AionChatView />;
  }
  const view = render(<AionChatProvider transport={source.transport} defaultAgent={AGENT} onRunEnd={onRunEnd}>
    <Chat />
  </AionChatProvider>);
  let sending: Promise<void>;
  act(() => { sending = chat.actions.send({ parts: [{ type: "text", text: "Hello" }] }); });
  await waitFor(() => expect(source.ready()).toBe(true));
  return {
    ...source, onRunEnd, unmount: view.unmount,
    chat: () => chat,
    done: () => sending,
    async deliver(result: Record<string, unknown>) {
      await act(() => Promise.resolve(source.send(result)));
    },
    async finish() { await act(async () => { source.close(); await sending; }); },
  };
}

afterEach(cleanup);

describe.each<Binding>(["HTTP+JSON", "JSONRPC", "GraphQL"])("%s response completion", (binding) => {
  it.each([
    ["lastChunk", true, undefined],
    ["finalized metadata", false, { status: "finalized" }],
    ["statusReason metadata", false, { statusReason: "complete_message" }],
    ["status_reason metadata", false, { status_reason: "complete_message" }],
  ] as const)("reads the final answer after %s and a terminal status", async (_name, lastChunk, metadata) => {
    const source = await client(binding);
    // SDK delivery: draft chunks, an empty closing chunk, then a final Task.
    await source.deliver(delta("Draft-only "));
    await source.deliver(delta("streamed response."));
    expect(screen.getByRole("log").textContent).toContain(DRAFT);
    await source.deliver(delta("", lastChunk, metadata));
    expect(source.chat().meta.isRunning).toBe(true);
    expect(source.released).not.toHaveBeenCalled();
    await source.deliver(status("completed"));
    expect(source.chat().meta.isRunning).toBe(true);
    expect(source.chat().state.conversation.tasks.task?.status.state).toBe("completed");
    expect(source.onRunEnd).not.toHaveBeenCalled();
    await source.deliver(FINAL_TASK);
    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(screen.queryByText(DRAFT)).toBeNull();
    expect(screen.queryByText(MESSAGE_FALLBACK)).toBeNull();
    expect(source.chat().meta.isRunning).toBe(true);
    await source.finish();
    expect(source.chat().state.conversation.activeRun?.status).toBe("completed");
    expect(source.onRunEnd).toHaveBeenCalledOnce();
    expect(source.stopClient).not.toHaveBeenCalled();
  });

  it("reads the SDK final Task without an intervening status event", async () => {
    const source = await client(binding);
    await source.deliver(delta(DRAFT));
    await source.deliver(delta("", true));
    await source.deliver(FINAL_TASK);
    await source.finish();
    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(screen.getByRole("log").textContent).not.toContain(DRAFT);
    expect(source.chat().state.conversation.activeRun?.status).toBe("completed");
  });

  it("rejects closure after only a last artifact chunk", async () => {
    const source = await client(binding);
    await source.deliver(delta(DRAFT, true));
    await source.finish();
    expect(source.chat().state.conversation.activeRun).toMatchObject({
      status: "failed", error: { code: "incomplete_a2a_stream" },
    });
  });

  it.each([
    ["failed", "failed"], ["rejected", "failed"], ["canceled", "canceled"],
    ["input-required", "input-required"], ["auth-required", "auth-required"],
  ])("preserves the %s outcome at response completion", async (state, expected) => {
    const source = await client(binding);
    await source.deliver(status(state));
    expect(source.chat().meta.isRunning).toBe(true);
    await source.finish();
    expect(source.chat().state.conversation.activeRun?.status).toBe(expected);
  });

  it("can cancel while awaiting the final snapshot", async () => {
    const source = await client(binding);
    await source.deliver(delta(DRAFT, true));
    await source.deliver(status("completed"));
    await act(async () => { source.chat().actions.stop(); await source.done(); });
    expect(source.chat().state.conversation.activeRun?.status).toBe("canceled");
    expect(source.released).toHaveBeenCalledOnce();
    expect(source.stopClient).not.toHaveBeenCalled();
  });

  it("reports a connection failure while draining a terminal response", async () => {
    const source = await client(binding);
    await source.deliver(status("completed"));
    await act(async () => { source.fail(); await source.done(); });
    expect(source.chat().state.conversation.activeRun?.status).toBe("failed");
  });

  it("settles a message response only when the response ends", async () => {
    const source = await client(binding);
    await source.deliver({ kind: "message", role: "agent", messageId: "answer",
      parts: [{ kind: "text", text: ANSWER }] });
    expect(await screen.findByText(ANSWER)).toBeTruthy();
    expect(source.chat().meta.isRunning).toBe(true);
    await source.finish();
    expect(source.chat().state.conversation.activeRun?.status).toBe("completed");
  });
});

it("retains the final welcome snapshot after a terminal task status", async () => {
  let exhausted = false;
  let eventId = 0;
  const createId = () => `welcome-${++eventId}`;
  const now = () => "2026-11-19T12:00:00Z";
  const initial = { ...createChatConversationState("conversation", AGENT), contextId: TASK.contextId };
  let state = initial;
  for await (const event of welcomeEvents({
    getAgentCapabilities: () => Promise.resolve({
      extensions: [{ uri: WELCOME_MESSAGE_EXTENSION_URI }],
    }),
    async *stream(request) {
      for (const payload of [delta(DRAFT, true), status("completed"), FINAL_TASK]) {
        await Promise.resolve();
        yield* normalizeAionResponse(payload, {
          requestId: request.requestId, turnId: request.turnId,
          occurredAt: now(), createEventId: createId,
        });
      }
      exhausted = true;
    },
  }, initial, new AbortController().signal, createId, now, () => true)) {
    state = reduceChatConversation(state, event) as typeof initial;
  }
  expect(exhausted).toBe(true);
  expect(getChatText(state.artifacts["task:aion:assistant-answer"]!.parts)).toBe(ANSWER);
  expect(state.activeRun?.status).toBe("completed");
});


it.each([false, true])("preserves separate output through snapshots and restoration (linked status=%s)", async (linkedStatus) => {
  const source = await client("HTTP+JSON");
  const progress = {
    kind: "message", messageId: "progress", role: "agent", ...TASK, taskId: TASK.id,
    parts: [{ kind: "text", text: "Checking the records." }],
  };
  const event = {
    ...progress, messageId: "internal-event",
    parts: [{ kind: "text", text: "Separate event output." }],
    metadata: { "aion:messageType": "event", secret: "must-not-persist" },
  };
  await source.deliver({
    ...status("working"), final: false,
    status: { state: "working", message: progress },
  });
  const final = {
    ...FINAL_TASK, history: [progress, event, ...FINAL_TASK.history],
    artifacts: FINAL_TASK.artifacts.map((artifact) => ({
      ...artifact,
      metadata: linkedStatus && artifact.artifactId === "aion:assistant-answer"
        ? { "aion:sourceMessageId": progress.messageId } : undefined,
    })),
  };
  await source.deliver(final);
  await source.deliver(final);
  await source.finish();
  const verify = () => {
    expect(screen.queryAllByText("Checking the records.")).toHaveLength(linkedStatus ? 0 : 1);
    expect(screen.getAllByText("Separate event output.")).toHaveLength(1);
    expect(screen.getAllByText(ANSWER)).toHaveLength(1);
    expect(screen.queryByText(MESSAGE_FALLBACK)).toBeNull();
    expect(screen.queryByText(DRAFT)).toBeNull();
  };
  verify();
  const snapshot = createAionConversationSnapshot(source.chat().state.conversation);
  const serialized = JSON.stringify(snapshot);
  expect(serialized).not.toContain("must-not-persist");
  const restored = parseAionConversationSnapshot(JSON.parse(serialized));
  expect(restored).not.toBeNull();
  source.unmount();
  render(<AionChatProvider transport={source.transport} conversation={restored!.conversation}>
    <AionChatView />
  </AionChatProvider>);
  verify();
});

it.each(["input-required", "auth-required", "failed", "canceled", "rejected"])(
  "keeps the %s status message separate from Assistant Answer", async (state) => {
    const source = await client("GraphQL");
    const prompt = {
      kind: "message", messageId: "status-message", role: "agent", taskId: TASK.id,
      contextId: TASK.contextId, parts: [{ kind: "text", text: "Separate status prompt." }],
    };
    await source.deliver({
      ...FINAL_TASK, status: { state, message: prompt },
      history: [...FINAL_TASK.history, prompt],
    });
    await source.finish();
    expect(screen.getAllByText("Separate status prompt.")).toHaveLength(1);
    expect(screen.getAllByText(ANSWER)).toHaveLength(1);
    expect(screen.queryByText(MESSAGE_FALLBACK)).toBeNull();
  },
);

it("keeps Assistant Answer authoritative through append, empty append, reset, and repeated snapshots", async () => {
  const source = await client("HTTP+JSON");
  await source.deliver(delta(DRAFT));
  await source.deliver({ ...FINAL_TASK.history[0] });
  const answer = (text: string, append: boolean) => ({
    kind: "artifact-update", taskId: TASK.id, contextId: TASK.contextId, append,
    lastChunk: false,
    artifact: { artifactId: "aion:assistant-answer", parts: [{ kind: "text", text }] },
  });
  await source.deliver(answer("Canonical", false));
  await source.deliver(answer(" answer", true));
  await source.deliver(answer("", true));
  expect(screen.getByRole("log").textContent).toContain("Canonical answer");
  expect(screen.getByRole("log").textContent).not.toContain(MESSAGE_FALLBACK);
  await source.deliver(answer("Replacement", false));
  expect(screen.getByRole("log").textContent).toContain("Replacement");
  expect(screen.getByRole("log").textContent).not.toContain("Canonical answer");
  const empty = { ...FINAL_TASK, artifacts: [{ artifactId: "aion:assistant-answer", parts: [] }] };
  await source.deliver(empty);
  await source.deliver(empty);
  await source.finish();
  const text = screen.getByRole("log").textContent;
  for (const excluded of ["Replacement", "Canonical answer", MESSAGE_FALLBACK, DRAFT]) {
    expect(text).not.toContain(excluded);
  }
});
