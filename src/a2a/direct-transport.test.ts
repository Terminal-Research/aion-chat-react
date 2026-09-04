import { describe, expect, it, vi } from "vitest";

import { collectAionChatTransportTrace } from "../testing";
import type { AionChatRequest } from "../transport";
import { createDirectAionA2ATransport } from "./direct-transport";
import type { DirectAionAgentCard } from "./types";

const REQUEST: AionChatRequest = {
  requestId: "request-1",
  turnId: "turn-1",
  attempt: 1,
  agent: {
    id: "agent-1",
    title: "Direct agent",
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
    createdAt: "2026-09-03T12:00:00.000Z",
  },
};

const PUBLIC_CARD: DirectAionAgentCard = {
  name: "Direct agent",
  supportedInterfaces: [
    {
      url: "https://agent.example/a2a/rest",
      protocolBinding: "HTTP+JSON",
      protocolVersion: "1.0",
    },
    {
      url: "https://agent.example/a2a/rpc",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  capabilities: { streaming: true },
};

const SECURE_JSON_RPC_CARD: DirectAionAgentCard = {
  ...PUBLIC_CARD,
  supportedInterfaces: [
    {
      url: "https://agent.example/a2a/grpc",
      protocolBinding: "GRPC",
      protocolVersion: "1.0",
    },
    {
      url: "https://agent.example/a2a/rpc",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  securitySchemes: {
    aionBearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    },
  },
  securityRequirements: [
    { schemes: { aionBearerAuth: { list: [] } } },
  ],
};

function responseStream(
  chunks: readonly string[],
  close = true,
  onCancel?: () => void,
): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        if (close) {
          controller.close();
        }
      },
      cancel: onCancel,
    }),
    { headers: { "Content-Type": "text/event-stream; charset=UTF-8" } },
  );
}

function ids() {
  let value = 0;
  return () => `event-${++value}`;
}

function transportOptions(fetcher: typeof fetch) {
  return {
    fetch: fetcher,
    createEventId: ids(),
    now: () => "2026-09-03T12:00:01.000Z",
  };
}

describe("createDirectAionA2ATransport", () => {
  it("streams through the first supported REST interface", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const getBearerToken = vi.fn(() => Promise.resolve("unused-token"));
    const discoveredCard = {
      ...PUBLIC_CARD,
      securitySchemes: null,
      securityRequirements: null,
    };
    fetcher
      .mockResolvedValueOnce(
        new Response(JSON.stringify(discoveredCard), {
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        responseStream([
          ": heartbeat\r\n\r\n",
          "data: {\"task\":{\"id\":\"task-1\",\n",
          "data: \"contextId\":\"context-1\",\n",
          "data: \"status\":{\"state\":\"TASK_STATE_WORKING\"}}}\r\n\r\n",
          "data: {\"artifactUpdate\":{\"taskId\":\"task-1\",\n",
          "data: \"contextId\":\"context-1\",\"lastChunk\":true,\n",
          "data: \"artifact\":{\"artifactId\":\"fixture-file\",\n",
          "data: \"parts\":[{\"file\":{\"fileWithUri\":",
          "\"https://files.example/result.txt\",\n",
          "data: \"name\":\"result.txt\",\n",
          "data: \"mediaType\":\"text/plain\"}}]}}}\r\n\r\n",
          "data: {\"statusUpdate\":{\"taskId\":\"task-1\",\n",
          "data: \"contextId\":\"context-1\",\"final\":true,\n",
          "data: \"status\":{\"state\":\"TASK_STATE_COMPLETED\"}}}\r\n\r\n",
        ]),
      );
    const transport = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCardUrl: "https://agent.example/.well-known/agent-card.json",
      credentials: { getBearerToken },
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events.map((event) => event.type)).toEqual([
      "task.received",
      "artifact.updated",
      "task.status-changed",
    ]);
    expect(trace.requestIdsMatch).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
    });
    const [url, init] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe("https://agent.example/a2a/rest/message:stream");
    const headers = new Headers(init?.headers);
    expect(headers.get("A2A-Version")).toBe("1.0");
    expect(headers.has("Authorization")).toBe(false);
    expect(getBearerToken).not.toHaveBeenCalled();
    expect(trace.events[1]).toMatchObject({
      type: "artifact.updated",
      artifact: {
        parts: [
          {
            type: "file",
            file: {
              name: "result.txt",
              mediaType: "text/plain",
              url: "https://files.example/result.txt",
            },
          },
        ],
      },
    });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      message: {
        messageId: "message-1",
        contextId: "context-1",
        taskId: "task-1",
        role: "ROLE_USER",
        parts: [
          { text: "Review this" },
          {
            file: {
              fileWithUri: "https://files.example/screen.png",
              name: "screen.png",
              mediaType: "image/png",
            },
          },
          { data: { source: "extension" } },
        ],
      },
    });
  });

  it("uses bearer credentials for a secured JSON-RPC interface", async () => {
    let streamCanceled = false;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      responseStream(
        [
          "data: {\"jsonrpc\":\"2.0\",\"id\":\"request-1\",\n",
          "data: \"result\":{\"kind\":\"message\",\n",
          "data: \"messageId\":\"assistant-1\",\n",
          "data: \"role\":\"ROLE_AGENT\",\n",
          "data: \"parts\":[{\"text\":\"Done\"}]}}\n\n",
        ],
        false,
        () => {
          streamCanceled = true;
        },
      ),
    );
    const getBearerToken = vi.fn(() => Promise.resolve("current-token"));
    const transport = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: SECURE_JSON_RPC_CARD,
      credentials: { getBearerToken },
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events.map((event) => event.type)).toEqual([
      "message.received",
      "run.completed",
    ]);
    expect(getBearerToken).toHaveBeenCalledWith(
      expect.objectContaining({ schemeName: "aionBearerAuth" }),
    );
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://agent.example/a2a/rpc");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer current-token",
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      jsonrpc: "2.0",
      id: "request-1",
      method: "SendStreamingMessage",
    });
    expect(streamCanceled).toBe(true);
  });

  it("does not dispatch without required credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const transport = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: SECURE_JSON_RPC_CARD,
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events).toHaveLength(1);
    expect(trace.events[0]).toMatchObject({
      type: "run.failed",
      error: { code: "authentication_required", retryable: false },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, "authentication_required"],
    [403, "access_denied"],
    [503, "a2a_request_failed"],
  ])("maps HTTP %i to %s", async (status, code) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    const transport = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: PUBLIC_CARD,
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events[0]).toMatchObject({
      type: "run.failed",
      error: { code },
    });
  });

  it("rejects unsupported cards before dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const nonStreaming = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: {
        ...PUBLIC_CARD,
        capabilities: { streaming: false },
      },
    });
    const unsupported = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: {
        ...PUBLIC_CARD,
        supportedInterfaces: [
          {
            url: "https://agent.example/a2a/grpc",
            protocolBinding: "GRPC",
            protocolVersion: "1.0",
          },
        ],
      },
    });

    const nonStreamingTrace = await collectAionChatTransportTrace(
      nonStreaming,
      REQUEST,
    );
    const unsupportedTrace = await collectAionChatTransportTrace(
      unsupported,
      REQUEST,
    );

    expect(nonStreamingTrace.events[0]).toMatchObject({
      type: "run.failed",
      error: { code: "streaming_not_supported" },
    });
    expect(unsupportedTrace.events[0]).toMatchObject({
      type: "run.failed",
      error: { code: "unsupported_agent_interface" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels the response reader when the browser aborts", async () => {
    let streamCanceled = false;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      responseStream([], false, () => {
        streamCanceled = true;
      }),
    );
    const transport = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: PUBLIC_CARD,
    });
    const abortController = new AbortController();
    const stream = transport.stream(REQUEST, {
      signal: abortController.signal,
    });
    const iterator = stream[Symbol.asyncIterator]();

    const pending = iterator.next();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    abortController.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(streamCanceled).toBe(true);
  });

  it("maps JSON-RPC access errors without exposing response data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      responseStream([
        "data: {\"jsonrpc\":\"2.0\",\"id\":\"request-1\",\n",
        "data: \"error\":{\"code\":-32011,\n",
        "data: \"message\":\"Request rejected\"}}\n\n",
      ]),
    );
    const transport = createDirectAionA2ATransport({
      ...transportOptions(fetcher),
      agentCard: {
        ...PUBLIC_CARD,
        supportedInterfaces: [SECURE_JSON_RPC_CARD.supportedInterfaces[1]!],
      },
    });

    const trace = await collectAionChatTransportTrace(transport, REQUEST);

    expect(trace.events[0]).toMatchObject({
      type: "run.failed",
      error: {
        code: "access_denied",
        retryable: false,
        details: { jsonRpcCode: -32011 },
      },
    });
  });
});
