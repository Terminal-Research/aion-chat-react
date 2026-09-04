import type { ChatTransportEvent } from "../events";
import type { ChatAgent, ChatError, ChatPart } from "../model";
import type {
  AionChatRequest,
  AionChatStreamOptions,
  AionChatTransport,
} from "../transport";
import { collectGraphQLErrorMessages } from "./error-messages";
import { normalizeAionChatGraphQLResponse } from "./normalize";
import { assertAionChatGraphQLTarget } from "./target";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
  AionChatGraphQLVariables,
  AionGraphQLResult,
} from "./types";

const UNSUPPORTED_STREAM_PATTERN =
  /Unsupported method:\s*SendStreamingMessage\b/i;

/** Shared configuration for GraphQL-backed Aion chat transports. */
export interface AionChatGraphQLTransportOptions {
  readonly observe: (
    variables: AionChatGraphQLVariables,
    signal: AbortSignal,
  ) => AsyncIterable<AionGraphQLResult<AionChatGraphQLSubscriptionData>>;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly createEventId?: () => string;
  readonly now?: () => string;
  readonly unaryFallback?: boolean;
}

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

/** Builds the current Aion GraphQL A2A variables for one chat request. */
export function buildAionChatGraphQLVariables(
  request: AionChatRequest,
  method: "SendStreamingMessage" | "SendMessage",
  target: AionChatGraphQLTarget,
  serviceParameters: AionChatGraphQLServiceParameters = { version: "0.3" },
): AionChatGraphQLVariables {
  assertAionChatGraphQLTarget(target);
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

function unsupportedStream(value: unknown): boolean {
  return collectGraphQLErrorMessages(value).some((message) =>
    UNSUPPORTED_STREAM_PATTERN.test(message),
  );
}

function graphqlError(value: unknown): ChatError {
  const messages = collectGraphQLErrorMessages(value).map((message) =>
    message.toLowerCase(),
  );
  if (
    messages.some((message) =>
      /authentication_required|unauthenticated|unauthorized|\b401\b|jwt/.test(
        message,
      ),
    )
  ) {
    return {
      code: "authentication_required",
      message: "Authentication is required to use this agent.",
      retryable: false,
    };
  }
  if (
    messages.some((message) =>
      /access_denied|forbidden|access denied|\b403\b/.test(message),
    )
  ) {
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

async function* streamAionChatGraphQL(
  options: AionChatGraphQLTransportOptions,
  request: AionChatRequest,
  signal: AbortSignal,
): AsyncIterable<ChatTransportEvent> {
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
      const variables = buildAionChatGraphQLVariables(
        request,
        method,
        target,
        options.serviceParameters,
      );
      for await (const payload of options.observe(variables, signal)) {
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
          yield failedEvent(
            request,
            graphqlError(payload.errors),
            eventId,
            timestamp,
          );
          return;
        }
        if (!payload.data) {
          continue;
        }
        const events = normalizeAionChatGraphQLResponse(payload.data, {
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

/** Creates a transport from a GraphQL result stream adapter. */
export function createAionChatGraphQLTransport(
  options: AionChatGraphQLTransportOptions,
): AionChatTransport {
  return {
    stream(request: AionChatRequest, streamOptions: AionChatStreamOptions) {
      return streamAionChatGraphQL(options, request, streamOptions.signal);
    },
  };
}
