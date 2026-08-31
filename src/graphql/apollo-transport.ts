import type { ApolloClient, FetchResult } from "@apollo/client/core";
import type { DocumentNode } from "graphql";

import type { ChatTransportEvent } from "../events";
import type { ChatAgent, ChatError, ChatPart } from "../model";
import type {
  AionChatRequest,
  AionChatStreamOptions,
  AionChatTransport,
} from "../transport";
import { normalizeApolloAionChatResponse } from "./normalize";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION } from "./operation";
import type {
  ApolloAionChatServiceParameters,
  ApolloAionChatSubscriptionData,
  ApolloAionChatTarget,
  ApolloAionChatVariables,
} from "./types";

const UNSUPPORTED_STREAM_PATTERN = /Unsupported method:\s*SendStreamingMessage\b/i;

/** Options for the caller-owned Apollo Aion chat transport. */
export interface ApolloAionChatTransportOptions {
  readonly client: ApolloClient<unknown>;
  readonly targetForAgent?: (agent: ChatAgent) => ApolloAionChatTarget;
  readonly serviceParameters?: ApolloAionChatServiceParameters;
  readonly operation?: DocumentNode;
  readonly createEventId?: () => string;
  readonly now?: () => string;
  readonly unaryFallback?: boolean;
}

type ApolloNotification =
  | {
      readonly type: "next";
      readonly value: FetchResult<ApolloAionChatSubscriptionData>;
    }
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "complete" };

function createEventId(): string {
  return globalThis.crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function outboundPart(part: ChatPart): Readonly<Record<string, unknown>> {
  switch (part.type) {
    case "text":
      return { kind: "text", text: part.text, metadata: part.metadata };
    case "data":
      return { kind: "data", data: part.data, metadata: part.metadata };
    case "file": {
      const file = part.file.url
        ? {
            name: part.file.name,
            mimeType: part.file.mediaType,
            uri: part.file.url,
          }
        : part.file.bytes
          ? {
              name: part.file.name,
              mimeType: part.file.mediaType,
              bytes: part.file.bytes,
            }
          : undefined;
      if (!file) {
        throw new Error("A chat file part requires a URL or base64 bytes.");
      }
      return { kind: "file", file, metadata: part.metadata };
    }
  }
}

function assertSingleTarget(target: ApolloAionChatTarget): void {
  const selectors = Object.values(target).filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (selectors.length !== 1) {
    throw new Error("An Apollo Aion chat target requires exactly one selector.");
  }
}

/** Builds the current Aion GraphQL A2A variables for one chat request. */
export function buildApolloAionChatVariables(
  request: AionChatRequest,
  method: "SendStreamingMessage" | "SendMessage",
  target: ApolloAionChatTarget,
  serviceParameters: ApolloAionChatServiceParameters = { version: "0.3" },
): ApolloAionChatVariables {
  assertSingleTarget(target);
  return {
    request: {
      jsonrpc: "2.0",
      id: request.requestId,
      method,
      params: {
        message: {
          kind: "message",
          messageId: request.message.id,
          role: "user",
          parts: request.message.parts.map(outboundPart),
          contextId: request.contextId,
          taskId: request.taskId,
          metadata: request.message.metadata,
        },
        metadata: request.metadata,
      },
    },
    target,
    serviceParameters,
  };
}

async function* observeApollo(
  client: ApolloClient<unknown>,
  operation: DocumentNode,
  variables: ApolloAionChatVariables,
  signal: AbortSignal,
): AsyncIterable<FetchResult<ApolloAionChatSubscriptionData>> {
  if (signal.aborted) {
    return;
  }
  const queue: ApolloNotification[] = [];
  let wake: ((notification: ApolloNotification) => void) | undefined;
  let closed = false;

  const push = (notification: ApolloNotification) => {
    if (closed) {
      return;
    }
    if (wake) {
      const resolve = wake;
      wake = undefined;
      resolve(notification);
    } else {
      queue.push(notification);
    }
  };
  const nextNotification = (): Promise<ApolloNotification> => {
    const queued = queue.shift();
    return queued
      ? Promise.resolve(queued)
      : new Promise((resolve) => {
          wake = resolve;
        });
  };
  const observable = client.subscribe<
    ApolloAionChatSubscriptionData,
    ApolloAionChatVariables
  >({ query: operation, variables });
  const subscription = observable.subscribe({
    next: (value) => push({ type: "next", value }),
    error: (error) => push({ type: "error", error }),
    complete: () => push({ type: "complete" }),
  });
  const onAbort = () => push({ type: "complete" });
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal.aborted) {
      return;
    }
    while (true) {
      const notification = await nextNotification();
      if (notification.type === "complete") {
        return;
      }
      if (notification.type === "error") {
        throw notification.error;
      }
      yield notification.value;
    }
  } finally {
    closed = true;
    wake = undefined;
    signal.removeEventListener("abort", onAbort);
    subscription.unsubscribe();
  }
}

function collectMessages(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value instanceof Error) {
    return [value.message, ...collectMessages(value.cause)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectMessages);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const candidate = value as Record<string, unknown>;
  return [
    ...collectMessages(candidate.message),
    ...collectMessages(candidate.cause),
    ...collectMessages(candidate.error),
    ...(Array.isArray(candidate.graphQLErrors)
      ? candidate.graphQLErrors.flatMap(collectMessages)
      : []),
    ...(Array.isArray(candidate.errors)
      ? candidate.errors.flatMap(collectMessages)
      : []),
  ];
}

function unsupportedStream(value: unknown): boolean {
  return collectMessages(value).some((message) =>
    UNSUPPORTED_STREAM_PATTERN.test(message),
  );
}

function graphqlError(value: unknown): ChatError {
  const messages = collectMessages(value).map((message) => message.toLowerCase());
  if (messages.some((message) => /unauthenticated|unauthorized|\b401\b|jwt/.test(message))) {
    return {
      code: "authentication_required",
      message: "Authentication is required to use this agent.",
      retryable: false,
    };
  }
  if (messages.some((message) => /forbidden|access denied|\b403\b/.test(message))) {
    return {
      code: "access_denied",
      message: "You do not have access to this agent.",
      retryable: false,
    };
  }
  return {
    code: "graphql_transport_error",
    message: "The Aion GraphQL chat stream failed.",
    retryable: true,
  };
}

function failedEvent(
  request: AionChatRequest,
  error: ChatError,
  eventId: () => string,
  timestamp: () => string,
): ChatTransportEvent {
  return {
    type: "run.failed",
    eventId: eventId(),
    requestId: request.requestId,
    occurredAt: timestamp(),
    error,
  };
}

async function* streamApolloAionChat(
  options: ApolloAionChatTransportOptions,
  request: AionChatRequest,
  signal: AbortSignal,
): AsyncIterable<ChatTransportEvent> {
  const operation = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION;
  const eventId = options.createEventId ?? createEventId;
  const timestamp = options.now ?? now;
  const target = options.targetForAgent?.(request.agent) ?? {
    distributionId: request.agent.id,
  };
  const allowUnaryFallback = options.unaryFallback !== false;
  const methods: readonly ("SendStreamingMessage" | "SendMessage")[] =
    allowUnaryFallback
      ? ["SendStreamingMessage", "SendMessage"]
      : ["SendStreamingMessage"];

  for (const method of methods) {
    let receivedPayload = false;
    let retryUnary = false;
    try {
      const variables = buildApolloAionChatVariables(
        request,
        method,
        target,
        options.serviceParameters,
      );
      for await (const payload of observeApollo(
        options.client,
        operation,
        variables,
        signal,
      )) {
        if (signal.aborted) {
          return;
        }
        receivedPayload = true;
        if (
          allowUnaryFallback &&
          method === "SendStreamingMessage" &&
          (unsupportedStream(payload.errors) ||
            unsupportedStream(payload.data?.a2aRpc))
        ) {
          retryUnary = true;
          break;
        }
        if (payload.errors?.length) {
          yield failedEvent(request, graphqlError(payload.errors), eventId, timestamp);
          return;
        }
        if (!payload.data) {
          continue;
        }
        const events = normalizeApolloAionChatResponse(payload.data, {
          requestId: request.requestId,
          turnId: request.turnId,
          occurredAt: timestamp(),
          createEventId: eventId,
        });
        for (const event of events) {
          yield event;
        }
      }
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      if (
        allowUnaryFallback &&
        method === "SendStreamingMessage" &&
        !receivedPayload &&
        unsupportedStream(error)
      ) {
        retryUnary = true;
      } else {
        yield failedEvent(request, graphqlError(error), eventId, timestamp);
        return;
      }
    }

    if (!retryUnary) {
      return;
    }
  }
}

/** Creates an Aion chat transport around one caller-owned Apollo client. */
export function createApolloAionChatTransport(
  options: ApolloAionChatTransportOptions,
): AionChatTransport {
  return {
    stream(request: AionChatRequest, streamOptions: AionChatStreamOptions) {
      return streamApolloAionChat(options, request, streamOptions.signal);
    },
  };
}
