import { ApolloClient, InMemoryCache, gql } from "@apollo/client/core";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AionChatRequest, AionChatTransport } from "../transport";
import type { ChatTransportEvent } from "../events";
import { WELCOME_MESSAGE_EXTENSION_URI as uri } from "../welcome";
import { createApolloAionChatTransport } from "./apollo-transport";
import { createStandaloneAionChatTransport } from "./standalone-chat-transport";
import { createStandaloneAionGraphQLClient } from "./standalone-client";

const request: AionChatRequest = {
  requestId: "welcome", turnId: "turn", attempt: 1, contextId: "context",
  agent: { id: "agent", title: "Agent", availability: "available" },
  operation: "SendMessage", extensions: [uri],
  message: { id: "trigger", role: "user", createdAt: "2026-09-29T10:00:00Z",
    extensions: [uri], parts: [{ type: "data", data: { type: "welcome-request" },
      metadata: { [uri]: { schema: `${uri}#WelcomeRequestPayload` } } }] },
};

function socketPeer(closeCode: number, acceptBeforeClose = 1) {
  const submissions: string[] = [];
  class Socket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = Socket.CONNECTING;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code: number; reason: string; wasClean: boolean }) => void;
    onerror?: (error: unknown) => void;
    constructor() {
      queueMicrotask(() => { this.readyState = Socket.OPEN; this.onopen?.(); });
    }
    send(raw: string) {
      const message = JSON.parse(raw) as { type: string; id: string };
      if (message.type === "connection_init") {
        this.receive({ type: "connection_ack" });
      } else if (message.type === "subscribe") {
        submissions.push(message.id);
        if (submissions.length <= acceptBeforeClose) {
          if (submissions.length === acceptBeforeClose) {
            queueMicrotask(() => this.close(closeCode, "Lost after acceptance"));
          }
        } else {
          this.receive({ type: "next", id: message.id, payload: { data: {
            a2aRpc: { __typename: "A2AJsonRpcSuccessResponseGQL", jsonrpc: "2.0",
              result: { kind: "message", messageId: "greeting", role: "agent",
                contextId: "context", parts: [{ kind: "text", text: "Hello" }],
                extensions: [uri] } },
          } } });
        }
      }
    }
    receive(value: unknown) {
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(value) }));
    }
    close(code = 1000, reason = "") {
      if (this.readyState === Socket.CLOSED) return;
      this.readyState = Socket.CLOSED;
      queueMicrotask(() => this.onclose?.({ code, reason, wasClean: code === 1000 }));
    }
  }
  return { Socket, submissions };
}

const dispose: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of dispose.splice(0)) await close();
});

async function events(transport: AionChatTransport, value = request) {
  const result: ChatTransportEvent[] = [];
  for await (const event of transport.stream(value, {
    signal: new AbortController().signal,
  })) result.push(event);
  return result;
}

function standalone(Socket: unknown) {
  const client = createStandaloneAionGraphQLClient({
    organizationId: "org", httpUrl: "https://example.invalid/graphql",
    webSocketUrl: "wss://example.invalid/graphql", getBearerToken: () => Promise.resolve("token"),
    webSocket: { webSocketImpl: Socket, retryWait: async () => {} },
  });
  dispose.push(() => client.dispose());
  return createStandaloneAionChatTransport({ client });
}

function apollo(Socket: unknown) {
  const client = createClient({ url: "wss://example.invalid/graphql",
    webSocketImpl: Socket, retryWait: async () => {} });
  const listen = client.on.bind(client);
  const removals: ReturnType<typeof vi.fn>[] = [];
  const on = vi.spyOn(client, "on").mockImplementation((event, listener) => {
    const remove = vi.fn(listen(event, listener));
    removals.push(remove);
    return remove;
  });
  const apolloClient = new ApolloClient({
    link: new GraphQLWsLink(client), cache: new InMemoryCache(),
  });
  const subscribe = vi.spyOn(apolloClient, "subscribe");
  dispose.push(async () => { apolloClient.stop(); await client.dispose(); });
  const transport = createApolloAionChatTransport({
    client: apolloClient, getWebSocketClient: () => client,
  });
  return { transport, subscribe, on, removals, client, apolloClient };
}

describe("welcome delivery across real graphql-ws reconnects", () => {
  it.each([1000, 1006, 4499])("never replays standalone welcomes after close %s", async (code) => {
    const { Socket, submissions } = socketPeer(code);
    const result = await events(standalone(Socket));
    expect(submissions).toHaveLength(1);
    expect(result.at(-1)?.type).toBe("run.failed");
  });

  it.each([1000, 1006, 4499])("never replays Apollo welcomes after close %s", async (code) => {
    const { Socket, submissions } = socketPeer(code);
    const { transport, subscribe, on, removals } = apollo(Socket);
    const result = await events(transport);
    expect(submissions).toHaveLength(1);
    expect(result.at(-1)?.type).toBe("run.failed");
    expect(subscribe).not.toHaveBeenCalled();
    expect(on).toHaveBeenCalledWith("closed", expect.any(Function));
    expect(removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  });

  it("preserves ordinary standalone reconnection", async () => {
    const { Socket, submissions } = socketPeer(1006);
    const result = await events(standalone(Socket), {
      ...request, operation: undefined,
    });
    expect(submissions).toHaveLength(2);
    expect(result.at(-1)?.type).toBe("run.completed");
  });

  it("drops only the welcome while an ordinary operation on the same socket reconnects", async () => {
    const { Socket, submissions } = socketPeer(1006, 2);
    const { transport, apolloClient } = apollo(Socket);
    let unsubscribe = () => {};
    const nextOrdinary = new Promise((resolve, reject) => {
      const subscription = apolloClient.subscribe({
        query: gql`subscription Ordinary { a2aRpc }`,
      }).subscribe({ next: resolve, error: reject });
      unsubscribe = () => subscription.unsubscribe();
    });
    try {
      const result = await events(transport);
      expect(result.at(-1)?.type).toBe("run.failed");
      expect(await nextOrdinary).toHaveProperty("data.a2aRpc");
      expect(submissions).toHaveLength(3);
      expect(submissions.filter((id) => id === submissions[0])).toHaveLength(2);
      expect(submissions.filter((id) => id === submissions[1])).toHaveLength(1);
    } finally {
      unsubscribe();
    }
  });

  it("cancels a welcome and removes its close listener without closing the host client", async () => {
    const { Socket, submissions } = socketPeer(1006, Number.POSITIVE_INFINITY);
    const { transport, client, removals } = apollo(Socket);
    const closeClient = vi.spyOn(client, "dispose");
    const controller = new AbortController();
    const pending = (async () => {
      for await (const event of transport.stream(request, { signal: controller.signal })) {
        expect(event.type).not.toBe("run.completed");
      }
    })();
    await vi.waitFor(() => expect(submissions).toHaveLength(1));
    controller.abort();
    await pending;
    expect(removals).toHaveLength(1);
    expect(removals[0]).toHaveBeenCalledOnce();
    expect(closeClient).not.toHaveBeenCalled();
  });

  it("does not dispatch through a retrying Apollo client when the socket is absent", async () => {
    const subscribe = vi.fn();
    const result = await events(createApolloAionChatTransport({ client: { subscribe } }));
    expect(result.at(-1)?.type).toBe("run.failed");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("can send a later independent welcome after a failed attempt", async () => {
    const { Socket, submissions } = socketPeer(1006);
    const { transport, removals } = apollo(Socket);
    expect((await events(transport)).at(-1)?.type).toBe("run.failed");
    expect((await events(transport, { ...request, requestId: "next-thread" })).at(-1)?.type)
      .toBe("run.completed");
    expect(submissions).toHaveLength(2);
    expect(removals).toHaveLength(2);
    expect(removals.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  });
});
