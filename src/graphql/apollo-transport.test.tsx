import type { ApolloClient, FetchResult } from "@apollo/client/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatProvider } from "../AionChatProvider";
import { AionChatView } from "../AionChatView";
import { collectAionChatTransportTrace } from "../testing/transport-contract";
import type { AionChatRequest } from "../transport";
import {
  createApolloAionChatTransport,
} from "./apollo-transport";
import { buildAionChatGraphQLVariables } from "./chat-transport";
import type {
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLVariables,
} from "./types";

afterEach(cleanup);

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
  taskId: "task-1",
  message: {
    id: "message-1",
    role: "user",
    parts: [
      { type: "text", text: "Review this" },
      {
        type: "file",
        file: {
          name: "screen.png",
          mediaType: "image/png",
          url: "https://files.example/screen.png",
        },
      },
      { type: "data", data: { source: "extension" } },
    ],
    createdAt: "2026-08-31T12:00:00.000Z",
  },
};

type Observer = {
  next: (value: FetchResult<AionChatGraphQLSubscriptionData>) => void;
  error: (error: unknown) => void;
  complete: () => void;
};

function mockClient(
  run: (variables: AionChatGraphQLVariables, observer: Observer) => void,
) {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(
    (options: { variables: AionChatGraphQLVariables }) => ({
      subscribe(observer: Observer) {
        run(options.variables, observer);
        return { unsubscribe };
      },
    }),
  );
  const lifecycle = {
    clearStore: vi.fn(),
    resetStore: vi.fn(),
    stop: vi.fn(),
  };
  return {
    client: { subscribe, ...lifecycle } as unknown as ApolloClient<unknown>,
    subscribe,
    unsubscribe,
    lifecycle,
  };
}

describe("createApolloAionChatTransport", () => {
  it("encodes v0.3 text, URL file, and data parts", () => {
    const variables = buildAionChatGraphQLVariables(
      REQUEST,
      "SendStreamingMessage",
      { distributionId: "distribution-1" },
    );

    expect(variables).toMatchObject({
      request: {
        jsonrpc: "2.0",
        id: "request-1",
        method: "SendStreamingMessage",
        params: {
          message: {
            kind: "message",
            messageId: "message-1",
            role: "user",
            contextId: "context-1",
            taskId: "task-1",
            parts: [
              { kind: "text", text: "Review this" },
              {
                kind: "file",
                file: {
                  name: "screen.png",
                  mimeType: "image/png",
                  uri: "https://files.example/screen.png",
                },
              },
              { kind: "data", data: { source: "extension" } },
            ],
          },
        },
      },
      target: { distributionId: "distribution-1" },
      serviceParameters: { version: "0.3" },
    });
  });

  it("uses and only unsubscribes the caller-owned client", async () => {
    const mock = mockClient((_variables, observer) => {
      observer.next({
        data: {
          a2aRpc: {
            __typename: "A2AJsonRpcSuccessResponseGQL",
            jsonrpc: "2.0",
            result: {
              kind: "message",
              messageId: "assistant-1",
              role: "agent",
              parts: [{ kind: "text", text: "Done" }],
            },
          },
        },
      });
      observer.complete();
    });
    const transport = createApolloAionChatTransport({
      client: mock.client,
      createEventId: createIds(),
      now: () => "2026-08-31T12:00:01.000Z",
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events.map((event) => event.type)).toEqual([
      "message.received",
      "run.completed",
    ]);
    expect(mock.subscribe).toHaveBeenCalledTimes(1);
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
    expect(mock.lifecycle.clearStore).not.toHaveBeenCalled();
    expect(mock.lifecycle.resetStore).not.toHaveBeenCalled();
    expect(mock.lifecycle.stop).not.toHaveBeenCalled();
    expect("dispose" in transport).toBe(false);
  });

  it("falls back to unary SendMessage when streaming is unsupported", async () => {
    const methods: string[] = [];
    const mock = mockClient((variables, observer) => {
      methods.push(variables.request.method);
      if (variables.request.method === "SendStreamingMessage") {
        observer.next({
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
      } else {
        observer.next({
          data: {
            a2aRpc: {
              __typename: "A2AJsonRpcSuccessResponseGQL",
              jsonrpc: "2.0",
              result: {
                message: {
                  messageId: "assistant-1",
                  role: "agent",
                  parts: [{ kind: "text", text: "Unary response" }],
                },
              },
            },
          },
        });
      }
      observer.complete();
    });
    const transport = createApolloAionChatTransport({
      client: mock.client,
      createEventId: createIds(),
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(methods).toEqual(["SendStreamingMessage", "SendMessage"]);
    expect(trace.events.map((event) => event.type)).toEqual([
      "message.received",
      "run.completed",
    ]);
    expect(mock.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it("falls back when unsupported streaming arrives as a GraphQL error", async () => {
    const methods: string[] = [];
    const mock = mockClient((variables, observer) => {
      methods.push(variables.request.method);
      if (variables.request.method === "SendStreamingMessage") {
        observer.next({
          errors: [{ message: "Unsupported method: SendStreamingMessage" }],
        });
      } else {
        observer.next({
          data: {
            a2aRpc: {
              __typename: "A2AJsonRpcSuccessResponseGQL",
              jsonrpc: "2.0",
              result: {
                kind: "message",
                messageId: "assistant-1",
                role: "agent",
                parts: [{ kind: "text", text: "Unary response" }],
              },
            },
          },
        });
      }
      observer.complete();
    });
    const transport = createApolloAionChatTransport({ client: mock.client });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(methods).toEqual(["SendStreamingMessage", "SendMessage"]);
    expect(trace.events.map((event) => event.type)).toEqual([
      "message.received",
      "run.completed",
    ]);
  });

  it("reports unsupported streaming when unary fallback is disabled", async () => {
    const mock = mockClient((_variables, observer) => {
      observer.next({
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
      observer.complete();
    });
    const transport = createApolloAionChatTransport({
      client: mock.client,
      unaryFallback: false,
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(mock.subscribe).toHaveBeenCalledTimes(1);
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      type: "run.failed",
      error: { code: "a2a_json_rpc_error", retryable: false },
    });
  });

  it("unsubscribes immediately when the controller aborts", async () => {
    const mock = mockClient(() => undefined);
    const transport = createApolloAionChatTransport({ client: mock.client });
    const abortController = new AbortController();
    const tracePromise = collectAionChatTransportTrace(
      transport,
      REQUEST,
      abortController.signal,
    );
    await Promise.resolve();
    abortController.abort();

    await expect(tracePromise).resolves.toEqual({
      events: [],
      requestIdsMatch: true,
    });
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("surfaces authentication failures without exposing transport details", async () => {
    const mock = mockClient((_variables, observer) => {
      observer.error(new Error("401 JWT token=secret"));
    });
    const transport = createApolloAionChatTransport({
      client: mock.client,
      createEventId: createIds(),
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events[0]).toMatchObject({
      type: "run.failed",
      error: {
        code: "authentication_required",
        message: "Authentication is required to use this agent.",
        retryable: false,
      },
    });
    expect(JSON.stringify(trace)).not.toContain("secret");
  });

  it("drives the inline view through the injected client", async () => {
    const mock = mockClient((variables, observer) => {
      observer.next({
        data: {
          a2aRpc: {
            __typename: "A2AJsonRpcSuccessResponseGQL",
            jsonrpc: "2.0",
            result: {
              kind: "TaskArtifactUpdateEvent",
              contextId: "context-1",
              taskId: "task-1",
              append: false,
              lastChunk: true,
              artifact: {
                artifactId: "aion:stream-delta",
                parts: [{ kind: "text", text: "Authenticated response" }],
              },
            },
          },
        },
      });
      observer.complete();
      expect(variables.target).toEqual({ distributionId: "distribution-1" });
    });
    const transport = createApolloAionChatTransport({
      client: mock.client,
      createEventId: createIds(),
    });
    function Wrapper({ children }: PropsWithChildren) {
      return (
        <AionChatProvider transport={transport} defaultAgent={REQUEST.agent}>
          {children}
        </AionChatProvider>
      );
    }
    render(<AionChatView />, { wrapper: Wrapper });

    fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Authenticated response")).toBeTruthy();
    expect(mock.subscribe).toHaveBeenCalledTimes(1);
  });
});

function createIds(): () => string {
  let id = 0;
  return () => `event-${++id}`;
}
