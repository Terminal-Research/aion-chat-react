import type { FetchResult } from "@apollo/client/core";
import { describe, expect, it, vi } from "vitest";

import { collectAionChatTransportTrace } from "../testing/transport-contract";
import type { AionChatRequest } from "../transport";
import { createApolloAionChatTransport } from "./apollo-transport";
import { createStandaloneAionChatTransport } from "./standalone-chat-transport";
import type {
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLVariables,
} from "./types";

const CARD_URL =
  "https://api.example/distributions/distribution-1/a2a/.well-known/agent-card.json";

const REQUEST: AionChatRequest = {
  requestId: "request-1",
  turnId: "turn-1",
  attempt: 1,
  agent: { id: "distribution-1", title: "Probe", availability: "available" },
  contextId: "context-1",
  message: {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "inert" }],
    createdAt: "2026-11-13T21:49:52.000Z",
  },
};

type Observer = {
  next: (value: FetchResult<AionChatGraphQLSubscriptionData>) => void;
  error: (error: unknown) => void;
  complete: () => void;
};

const UNARY_SUCCESS: FetchResult<AionChatGraphQLSubscriptionData> = {
  data: {
    a2aRpc: {
      __typename: "A2AJsonRpcSuccessResponseGQL",
      jsonrpc: "2.0",
      result: {
        message: {
          messageId: "assistant-1",
          role: "agent",
          parts: [{ kind: "text", text: "echo" }],
        },
      },
    },
  },
};

/** Shape produced by the API's generic GraphQL masking for unexpected errors. */
const MASKED_FAILURE = {
  data: null,
  errors: [{
    message: "An unexpected error occurred.",
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  }],
} as unknown as FetchResult<AionChatGraphQLSubscriptionData>;

function harness({
  card,
  cardStatus = 200,
  cardUrl = CARD_URL,
  queryFails = false,
  unaryFallback,
  targetForAgent,
}: {
  card?: unknown;
  cardStatus?: number;
  cardUrl?: string | null;
  queryFails?: boolean;
  unaryFallback?: boolean;
  targetForAgent?: () => Record<string, string>;
}) {
  const methods: string[] = [];
  const query = vi.fn(() => Promise.resolve(
    queryFails
      ? { data: undefined, errors: [{ message: "card lookup failed" }] }
      : { data: { a2aAgentCardUrl: cardUrl } }));
  const subscribe = vi.fn((options: { variables: AionChatGraphQLVariables }) => ({
    subscribe(observer: Observer) {
      methods.push(options.variables.request.method);
      queueMicrotask(() => {
        observer.next(
          options.variables.request.method === "SendMessage"
            ? UNARY_SUCCESS
            : MASKED_FAILURE,
        );
        observer.complete();
      });
      return { unsubscribe: vi.fn() };
    },
  }));
  const fetch = vi.fn(() => Promise.resolve(
    cardStatus === 200
      ? new Response(JSON.stringify(card), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : new Response("Resource not found", { status: cardStatus })));
  const transport = createApolloAionChatTransport({
    client: { query, subscribe },
    fetch,
    unaryFallback,
    targetForAgent,
  });
  return { transport, methods, query, fetch, subscribe };
}

describe("createApolloAionChatTransport route streaming before dispatch", () => {
  it("sends unary SendMessage first when the route card disables streaming", async () => {
    const h = harness({ card: { capabilities: { streaming: false } } });

    const trace = await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendMessage"]);
    expect(trace.events.map((event) => event.type)).toEqual([
      "message.received",
      "run.completed",
    ]);
  });

  it("treats a route card without a streaming flag as non-streaming", async () => {
    const h = harness({ card: { capabilities: {} } });

    await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendMessage"]);
  });

  it("treats a missing public card (404) as non-streaming", async () => {
    const h = harness({ cardStatus: 404 });

    const trace = await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendMessage"]);
    expect(trace.events.at(-1)?.type).toBe("run.completed");
  });

  it("keeps streaming first and never retries a masked failure when the card streams", async () => {
    const h = harness({ card: { capabilities: { streaming: true } } });

    const trace = await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendStreamingMessage"]);
    expect(trace.events.at(-1)).toMatchObject({
      type: "run.failed",
      error: { message: "The Aion GraphQL chat stream failed." },
    });
  });

  it("keeps streaming first without retry when the card lookup fails", async () => {
    const h = harness({ queryFails: true });

    const trace = await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendStreamingMessage"]);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(trace.events.at(-1)?.type).toBe("run.failed");
  });

  it("keeps streaming first without retry when the card endpoint errors", async () => {
    const h = harness({ cardStatus: 500 });

    const trace = await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendStreamingMessage"]);
    expect(trace.events.at(-1)?.type).toBe("run.failed");
  });

  it("keeps streaming first when the target has no route card URL", async () => {
    const h = harness({ cardUrl: null });

    await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendStreamingMessage"]);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("does not dispatch when the send is aborted during discovery", async () => {
    const h = harness({ card: { capabilities: { streaming: false } } });
    const controller = new AbortController();
    h.query.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ data: { a2aAgentCardUrl: CARD_URL } });
    });

    const events: unknown[] = [];
    for await (const event of h.transport.stream(REQUEST, {
      signal: controller.signal,
    })) {
      events.push(event);
    }

    expect(h.subscribe).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("still unsubscribes when a send is aborted after dispatch", async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => ({
      subscribe: () => ({ unsubscribe }),
    }));
    const transport = createApolloAionChatTransport({
      client: {
        query: () => Promise.resolve({ data: { a2aAgentCardUrl: CARD_URL } }),
        subscribe,
      },
      fetch: () => Promise.resolve(new Response(
        JSON.stringify({ capabilities: { streaming: false } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )),
    });
    const controller = new AbortController();
    const trace = collectAionChatTransportTrace(
      transport,
      REQUEST,
      controller.signal,
    );

    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(trace).resolves.toEqual({ events: [], requestIdsMatch: true });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not attempt discovery when the Apollo client cannot query", async () => {
    const h = harness({ card: { capabilities: { streaming: false } } });
    const transport = createApolloAionChatTransport({
      client: { subscribe: h.subscribe },
      fetch: h.fetch,
    });

    await collectAionChatTransportTrace(transport, REQUEST);

    expect(h.methods).toEqual(["SendStreamingMessage"]);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("respects a host that disables unary fallback without discovery", async () => {
    const h = harness({
      card: { capabilities: { streaming: false } },
      unaryFallback: false,
    });

    await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(h.methods).toEqual(["SendStreamingMessage"]);
    expect(h.query).not.toHaveBeenCalled();
  });

  it("reads the route card fresh for each send", async () => {
    const h = harness({ card: { capabilities: { streaming: false } } });

    await collectAionChatTransportTrace(h.transport, REQUEST);
    await collectAionChatTransportTrace(h.transport, {
      ...REQUEST,
      requestId: "request-2",
      turnId: "turn-2",
      message: { ...REQUEST.message, id: "message-2" },
    });

    expect(h.methods).toEqual(["SendMessage", "SendMessage"]);
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not add discovery to an explicit SendMessage request", async () => {
    const h = harness({ card: { capabilities: { streaming: true } } });

    await collectAionChatTransportTrace(h.transport, {
      ...REQUEST,
      operation: "SendMessage",
    });

    // Explicit unary requests keep their existing non-retry socket path.
    expect(h.query).not.toHaveBeenCalled();
  });

  it("fails an invalid target as before, without discovery", async () => {
    const h = harness({
      card: { capabilities: { streaming: false } },
      targetForAgent: () => ({}),
    });

    const trace = await collectAionChatTransportTrace(h.transport, REQUEST);

    expect(trace.events.at(-1)?.type).toBe("run.failed");
    expect(h.query).not.toHaveBeenCalled();
    expect(h.subscribe).not.toHaveBeenCalled();
  });
});

describe("createStandaloneAionChatTransport route streaming before dispatch", () => {
  function standalone({ cardStatus = 200, card }: { cardStatus?: number; card?: unknown }) {
    const methods: string[] = [];
    const execute = vi.fn(() =>
      Promise.resolve({ data: { a2aAgentCardUrl: CARD_URL } }));
    const subscribe = vi.fn((payload: { variables: AionChatGraphQLVariables }) => {
      methods.push(payload.variables.request.method);
      return (async function* () {
        await Promise.resolve();
        yield payload.variables.request.method === "SendMessage"
          ? UNARY_SUCCESS
          : MASKED_FAILURE;
      })();
    });
    const fetch = vi.fn(() => Promise.resolve(
      cardStatus === 200
        ? new Response(JSON.stringify(card), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("Resource not found", { status: cardStatus })));
    const transport = createStandaloneAionChatTransport({
      client: {
        execute, subscribe, organizationId: "org", reconnect: vi.fn(), dispose: vi.fn(),
      } as never,
      fetch,
    });
    return { transport, methods, execute, subscribe };
  }

  it("treats a missing public card (404) as non-streaming", async () => {
    const s = standalone({ cardStatus: 404 });

    const trace = await collectAionChatTransportTrace(s.transport, REQUEST);

    expect(s.methods).toEqual(["SendMessage"]);
    expect(trace.events.at(-1)?.type).toBe("run.completed");
  });

  it("does not dispatch when the send is aborted during discovery", async () => {
    const s = standalone({ card: { capabilities: { streaming: false } } });
    const controller = new AbortController();
    s.execute.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ data: { a2aAgentCardUrl: CARD_URL } });
    });

    const events: unknown[] = [];
    for await (const event of s.transport.stream(REQUEST, {
      signal: controller.signal,
    })) {
      events.push(event);
    }

    expect(s.subscribe).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("keeps public getAgentCapabilities rejecting a 404 card", async () => {
    const s = standalone({ cardStatus: 404 });

    await expect(s.transport.getAgentCapabilities!(REQUEST.agent, {
      signal: new AbortController().signal,
    })).rejects.toThrow("The selected agent card could not be loaded.");
  });
});

describe("public getAgentCapabilities is unchanged", () => {
  it("still rejects a 404 card through the Apollo transport", async () => {
    const h = harness({ cardStatus: 404 });

    await expect(h.transport.getAgentCapabilities!(REQUEST.agent, {
      signal: new AbortController().signal,
    })).rejects.toThrow("The selected agent card could not be loaded.");
  });

  it("still reports a card without a streaming flag as unknown", async () => {
    const h = harness({ card: { capabilities: {} } });

    expect(await h.transport.getAgentCapabilities!(REQUEST.agent, {
      signal: new AbortController().signal,
    })).toEqual({});
  });
});
