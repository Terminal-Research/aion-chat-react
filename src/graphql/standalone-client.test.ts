import type {
  ClientOptions,
  FormattedExecutionResult,
  SubscribePayload,
} from "graphql-ws";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { collectAionChatTransportTrace } from "../testing/transport-contract";
import type { AionChatRequest } from "../transport";
import { createStandaloneAionChatTransport } from "./standalone-chat-transport";
import {
  AionStandaloneGraphQLClientError,
  createStandaloneAionGraphQLClient,
} from "./standalone-client";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("graphql-ws", async (importOriginal) => ({
  ...(await importOriginal<typeof import("graphql-ws")>()),
  createClient: createClientMock,
}));

const REQUEST: AionChatRequest = {
  requestId: "request-1",
  turnId: "turn-1",
  attempt: 1,
  agent: {
    id: "distribution-1",
    title: "Status agent",
    availability: "available",
  },
  contextId: "context-1",
  message: {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "Review this" }],
    createdAt: "2026-09-03T12:00:00.000Z",
  },
};

interface FakeClient {
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly iterate: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  createClientMock.mockReset();
});

describe("createStandaloneAionGraphQLClient", () => {
  it("executes authenticated HTTP operations without opening a socket", async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { currentUser: { id: "user-1" } } }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const token = vi.fn<() => Promise<string>>();
    token.mockResolvedValue("jwt-secret");
    const client = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "https://api.example/api/graphql",
      webSocketUrl: "wss://api.example/ws/graphql",
      getBearerToken: token,
      fetch: fetchMock,
    });

    const result = await client.execute<{ currentUser: { id: string } }>({
      query: "query CurrentUser { currentUser { id } }",
      operationName: "CurrentUser",
    });

    expect(client.organizationId).toBe("organization-1");
    expect(result.data?.currentUser.id).toBe("user-1");
    expect(createClientMock).not.toHaveBeenCalled();
    expect(token).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example/api/graphql");
    if (!request) {
      throw new Error("Expected fetch request options.");
    }
    expect(request).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
    });
    expect(request.headers).toMatchObject({
      authorization: "Bearer jwt-secret",
    });
    expect(JSON.parse(request.body as string)).toEqual({
      query: "query CurrentUser { currentUser { id } }",
      operationName: "CurrentUser",
    });
  });

  it("keeps socket creation lazy and shares current Aion authentication", async () => {
    const fake = fakeClient(() => emptyIterator());
    createClientMock.mockReturnValue(fake);
    const token = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("refreshed-token");
    const client = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "/api/graphql",
      webSocketUrl: "https://api.example/ws/graphql?source=chat",
      getBearerToken: token,
      webSocket: { retryAttempts: 2, lazyCloseTimeout: 100 },
    });

    expect(createClientMock).not.toHaveBeenCalled();
    await collect(client.subscribe({ query: "subscription First { event }" }));

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const firstOptions = createClientMock.mock.calls[0]?.[0] as ClientOptions;
    expect(firstOptions).toMatchObject({
      lazy: true,
      retryAttempts: 2,
      lazyCloseTimeout: 100,
    });
    await expect(resolveUrl(firstOptions)).resolves.toBe(
      "wss://api.example/ws/graphql?source=chat&token=first-token",
    );
    await expect(resolveConnectionParams(firstOptions)).resolves.toEqual({
      authorization: "Bearer first-token",
    });
    expect(token).toHaveBeenCalledTimes(1);

    await client.reconnect();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await collect(client.subscribe({ query: "subscription Second { event }" }));
    expect(createClientMock).toHaveBeenCalledTimes(2);
    const secondOptions = createClientMock.mock.calls[1]?.[0] as ClientOptions;
    await expect(resolveUrl(secondOptions)).resolves.toContain(
      "token=refreshed-token",
    );
  });

  it("cancels a pending subscription and closes its iterator", async () => {
    let resolveNext:
      | ((value: IteratorResult<FormattedExecutionResult>) => void)
      | undefined;
    const iterator = {
      next: vi.fn(
        () =>
          new Promise<IteratorResult<FormattedExecutionResult>>((resolve) => {
            resolveNext = resolve;
          }),
      ),
      return: vi.fn(() => {
        resolveNext?.({ done: true, value: undefined });
        return Promise.resolve({ done: true as const, value: undefined });
      }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    const fake = fakeClient(() => iterator);
    createClientMock.mockReturnValue(fake);
    const client = standaloneClient();
    const controller = new AbortController();
    const collecting = collect(
      client.subscribe(
        { query: "subscription Pending { event }" },
        { signal: controller.signal },
      ),
    );
    await Promise.resolve();

    controller.abort();

    await expect(collecting).resolves.toEqual([]);
    expect(iterator.return).toHaveBeenCalledTimes(1);
  });

  it("does not start HTTP or socket work for an already-canceled call", async () => {
    const token = vi.fn<() => Promise<string>>();
    token.mockResolvedValue("test-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    const client = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "/api/graphql",
      webSocketUrl: "wss://api.example/ws/graphql",
      getBearerToken: token,
      fetch: fetchMock,
    });
    const controller = new AbortController();
    controller.abort(new DOMException("Canceled", "AbortError"));

    await expect(
      client.execute(
        { query: "query Canceled { value }" },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      collect(
        client.subscribe(
          { query: "subscription Canceled { event }" },
          { signal: controller.signal },
        ),
      ),
    ).resolves.toEqual([]);
    expect(token).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("disposes once and rejects later operations", async () => {
    const fake = fakeClient(() => emptyIterator());
    createClientMock.mockReturnValue(fake);
    const client = standaloneClient();
    await collect(client.subscribe({ query: "subscription One { event }" }));

    const firstDispose = client.dispose();
    const secondDispose = client.dispose();

    expect(firstDispose).toBe(secondDispose);
    await Promise.all([firstDispose, secondDispose]);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await expect(
      client.execute({ query: "query One { value }" }),
    ).rejects.toMatchObject({ code: "disposed" });
    expect(() =>
      client.subscribe({ query: "subscription Two { event }" }),
    ).toThrow(expect.objectContaining({ code: "disposed" }));
    await expect(client.reconnect()).rejects.toMatchObject({
      code: "disposed",
    });
  });

  it("returns redaction-safe typed authentication and HTTP failures", async () => {
    const noCredential = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "/api/graphql",
      webSocketUrl: "wss://api.example/ws/graphql",
      getBearerToken: () => Promise.resolve(undefined),
      fetch: vi.fn(),
    });
    await expect(
      noCredential.execute({ query: "query One { value }" }),
    ).rejects.toMatchObject({
      code: "authentication_required",
      retryable: false,
    });

    const forbidden = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "/api/graphql",
      webSocketUrl: "wss://api.example/ws/graphql",
      getBearerToken: () => Promise.resolve("never-print-this"),
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        new Response(null, { status: 403 }),
      ),
    });
    let failure: unknown;
    try {
      await forbidden.execute({ query: "query Secret { value }" });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AionStandaloneGraphQLClientError);
    expect(failure).toMatchObject({ code: "access_denied", status: 403 });
    expect(JSON.stringify(failure)).not.toContain("never-print-this");

    const failedFetch = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "/api/graphql",
      webSocketUrl: "wss://api.example/ws/graphql",
      getBearerToken: () => Promise.resolve("network-secret"),
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(new Error("network-secret connection failed")),
    });
    await expect(
      failedFetch.execute({ query: "query Network { value }" }),
    ).rejects.toMatchObject({
      code: "graphql_http_error",
      message: "The Aion GraphQL HTTP request failed.",
      retryable: true,
    });
  });
});

describe("createStandaloneAionChatTransport", () => {
  it("reuses shared fallback and response normalization", async () => {
    const methods: string[] = [];
    const fake = fakeClient((payload) => {
      const variables = payload.variables as {
        request: { method: string };
      };
      methods.push(variables.request.method);
      if (variables.request.method === "SendStreamingMessage") {
        return iteratorOf({
          data: {
            a2aRpc: {
              __typename: "A2AJsonRpcErrorResponseGQL",
              jsonrpc: "2.0",
              error: {
                code: -32601,
                message: "Unsupported method: SendStreamingMessage",
              },
            },
          },
        });
      }
      return iteratorOf({
        data: {
          a2aRpc: {
            __typename: "A2AJsonRpcSuccessResponseGQL",
            jsonrpc: "2.0",
            result: {
              kind: "message",
              messageId: "assistant-1",
              role: "agent",
              parts: [{ kind: "text", text: "Fallback response" }],
            },
          },
        },
      });
    });
    createClientMock.mockReturnValue(fake);
    const client = standaloneClient();
    const transport = createStandaloneAionChatTransport({
      client,
      createEventId: createIds(),
      now: () => "2026-09-03T12:00:01.000Z",
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(methods).toEqual(["SendStreamingMessage", "SendMessage"]);
    expect(trace.events.map((event) => event.type)).toEqual([
      "message.received",
      "run.completed",
    ]);
    expect(trace.events[0]).toMatchObject({
      message: {
        parts: [{ type: "text", text: "Fallback response" }],
      },
    });
  });

  it("maps missing WebSocket credentials to an authentication event", async () => {
    createClientMock.mockImplementation((options: ClientOptions) =>
      fakeClient(() => authenticatedIterator(options)),
    );
    const client = createStandaloneAionGraphQLClient({
      organizationId: "organization-1",
      httpUrl: "/api/graphql",
      webSocketUrl: "wss://api.example/ws/graphql",
      getBearerToken: () => Promise.resolve(undefined),
    });
    const transport = createStandaloneAionChatTransport({
      client,
      createEventId: createIds(),
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      type: "run.failed",
      error: { code: "authentication_required", retryable: false },
    });
  });
});

function fakeClient(
  iterate: (payload: SubscribePayload) => AsyncIterableIterator<unknown>,
): FakeClient {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    iterate: vi.fn(iterate),
  };
}

function emptyIterator(): AsyncIterableIterator<never> {
  return iteratorOf();
}

function standaloneClient() {
  return createStandaloneAionGraphQLClient({
    organizationId: "organization-1",
    httpUrl: "/api/graphql",
    webSocketUrl: "wss://api.example/ws/graphql",
    getBearerToken: () => Promise.resolve("test-token"),
    fetch: vi.fn(),
  });
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of source) {
    values.push(value);
  }
  return values;
}

async function resolveUrl(options: ClientOptions): Promise<string> {
  return typeof options.url === "function"
    ? options.url()
    : options.url;
}

async function resolveConnectionParams(
  options: ClientOptions,
): Promise<Record<string, unknown> | undefined> {
  const params = options.connectionParams;
  if (typeof params === "function") {
    return await params();
  }
  return params;
}

function iteratorOf<T>(...values: T[]): AsyncIterableIterator<T> {
  let index = 0;
  return {
    next: () =>
      Promise.resolve(
        index < values.length
          ? { done: false as const, value: values[index++] as T }
          : { done: true as const, value: undefined },
      ),
    return: () =>
      Promise.resolve({ done: true as const, value: undefined }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function authenticatedIterator(
  options: ClientOptions,
): AsyncIterableIterator<{ data: null }> {
  let read = false;
  return {
    async next() {
      if (read) {
        return { done: true, value: undefined };
      }
      read = true;
      await resolveUrl(options);
      return { done: false, value: { data: null } };
    },
    return: () =>
      Promise.resolve({ done: true as const, value: undefined }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function createIds(): () => string {
  let id = 0;
  return () => `event-${++id}`;
}
