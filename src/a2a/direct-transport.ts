import type { ChatTransportEvent } from "../events";
import type { ChatError, ChatPart } from "../model";
import type {
  AionChatRequest,
  AionChatTransport,
} from "../transport";
import {
  normalizeAionJsonRpcError,
  normalizeAionResponse,
  type AionResponseNormalizationContext,
} from "./normalize";
import { readJsonSse } from "./sse";
import type {
  AionCredentialProvider,
  DirectAionAgentCard,
  DirectAionAgentInterface,
  DirectAionSecurityRequirement,
} from "./types";

const SUPPORTED_PROTOCOL_VERSION = "1.0";

/** Options for a browser-owned direct A2A transport. */
export interface DirectAionA2ATransportOptions {
  readonly agentCardUrl?: string;
  readonly agentCard?: DirectAionAgentCard;
  readonly credentials?: AionCredentialProvider;
  readonly fetch?: typeof globalThis.fetch;
  readonly createEventId?: () => string;
  readonly now?: () => string;
}

/** Agent Card and browser request options shared by direct A2A adapters. */
export type DirectAionA2AConnectionOptions = Pick<
  DirectAionA2ATransportOptions,
  "agentCard" | "agentCardUrl" | "credentials" | "fetch"
>;

/** One unary JSON-RPC request sent through a resolved Agent Card. */
export interface DirectAionJsonRpcRequest {
  readonly id: string;
  readonly method: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

class DirectAionTransportError extends Error {
  constructor(readonly chatError: ChatError) {
    super(chatError.message);
  }
}

function transportError(
  code: string,
  message: string,
  retryable: boolean,
  details?: Readonly<Record<string, unknown>>,
): DirectAionTransportError {
  return new DirectAionTransportError({ code, message, retryable, details });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function validateHttpUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw transportError(
      "invalid_agent_card",
      `${label} must be an absolute HTTP URL.`,
      false,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw transportError(
      "invalid_agent_card",
      `${label} must be an absolute HTTP URL.`,
      false,
    );
  }
}

function parseInterface(value: unknown): DirectAionAgentInterface {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.url !== "string" ||
    typeof candidate.protocolBinding !== "string" ||
    typeof candidate.protocolVersion !== "string"
  ) {
    throw transportError(
      "invalid_agent_card",
      "The Agent Card contains an invalid supported interface.",
      false,
    );
  }
  validateHttpUrl(candidate.url, "An Agent Card interface URL");
  return {
    url: candidate.url,
    protocolBinding: candidate.protocolBinding,
    protocolVersion: candidate.protocolVersion,
    tenant:
      typeof candidate.tenant === "string" ? candidate.tenant : undefined,
  };
}

function parseSecurityRequirements(
  value: unknown,
): readonly DirectAionSecurityRequirement[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw transportError(
      "invalid_agent_card",
      "The Agent Card security requirements are invalid.",
      false,
    );
  }
  return value.map((item) => {
    const requirement = record(item);
    const schemes = record(requirement?.schemes);
    if (!schemes) {
      throw transportError(
        "invalid_agent_card",
        "The Agent Card security requirements are invalid.",
        false,
      );
    }
    for (const scopes of Object.values(schemes)) {
      const scopeRecord = record(scopes);
      if (
        !scopeRecord ||
        !Array.isArray(scopeRecord.list) ||
        !scopeRecord.list.every((scope) => typeof scope === "string")
      ) {
        throw transportError(
          "invalid_agent_card",
          "The Agent Card security requirements are invalid.",
          false,
        );
      }
    }
    return {
      schemes: schemes as DirectAionSecurityRequirement["schemes"],
    };
  });
}

function parseSecuritySchemes(
  value: unknown,
): DirectAionAgentCard["securitySchemes"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  const candidate = record(value);
  if (!candidate) {
    throw transportError(
      "invalid_agent_card",
      "The Agent Card security schemes are invalid.",
      false,
    );
  }
  return Object.fromEntries(
    Object.entries(candidate).map(([name, rawScheme]) => {
      const scheme = record(rawScheme);
      if (
        !scheme ||
        typeof scheme.type !== "string" ||
        (scheme.scheme !== undefined && typeof scheme.scheme !== "string")
      ) {
        throw transportError(
          "invalid_agent_card",
          "The Agent Card security schemes are invalid.",
          false,
        );
      }
      return [
        name,
        {
          type: scheme.type,
          scheme: scheme.scheme,
          bearerFormat:
            typeof scheme.bearerFormat === "string"
              ? scheme.bearerFormat
              : undefined,
        },
      ];
    }),
  );
}

function parseAgentCard(value: unknown): DirectAionAgentCard {
  const candidate = record(value);
  const capabilities = record(candidate?.capabilities);
  if (
    !candidate ||
    typeof candidate.name !== "string" ||
    !Array.isArray(candidate.supportedInterfaces) ||
    candidate.supportedInterfaces.length === 0 ||
    !capabilities
  ) {
    throw transportError(
      "invalid_agent_card",
      "The response is not a valid A2A Agent Card.",
      false,
    );
  }
  if (
    capabilities.streaming !== undefined &&
    capabilities.streaming !== null &&
    typeof capabilities.streaming !== "boolean"
  ) {
    throw transportError(
      "invalid_agent_card",
      "The Agent Card streaming capability is invalid.",
      false,
    );
  }
  return {
    name: candidate.name,
    supportedInterfaces: candidate.supportedInterfaces.map(parseInterface),
    capabilities: {
      streaming:
        typeof capabilities.streaming === "boolean"
          ? capabilities.streaming
          : undefined,
    },
    securitySchemes: parseSecuritySchemes(candidate.securitySchemes),
    securityRequirements: parseSecurityRequirements(
      candidate.securityRequirements,
    ),
  };
}

function selectInterface(
  card: DirectAionAgentCard,
): DirectAionAgentInterface {
  if (card.capabilities.streaming !== true) {
    throw transportError(
      "streaming_not_supported",
      "The selected agent does not advertise streaming support.",
      false,
    );
  }
  const agentInterface = card.supportedInterfaces.find(
    (candidate) =>
      candidate.protocolVersion === SUPPORTED_PROTOCOL_VERSION &&
      (candidate.protocolBinding === "HTTP+JSON" ||
        candidate.protocolBinding === "JSONRPC"),
  );
  if (!agentInterface) {
    throw transportError(
      "unsupported_agent_interface",
      "The Agent Card has no browser-supported A2A 1.0 interface.",
      false,
    );
  }
  return agentInterface;
}

function selectJsonRpcInterface(
  card: DirectAionAgentCard,
): DirectAionAgentInterface {
  const agentInterface = card.supportedInterfaces.find(
    (candidate) =>
      candidate.protocolVersion === SUPPORTED_PROTOCOL_VERSION &&
      candidate.protocolBinding === "JSONRPC",
  );
  if (!agentInterface) {
    throw transportError(
      "unsupported_operation",
      "The Agent Card has no JSON-RPC interface for Aion extensions.",
      false,
    );
  }
  return agentInterface;
}

function bearerSchemeName(
  card: DirectAionAgentCard,
): string | undefined {
  const requirements = card.securityRequirements;
  if (!requirements || requirements.length === 0) {
    return undefined;
  }
  if (requirements.some((item) => Object.keys(item.schemes).length === 0)) {
    return undefined;
  }
  for (const requirement of requirements) {
    const names = Object.keys(requirement.schemes);
    if (names.length !== 1) {
      continue;
    }
    const name = names[0];
    const scheme = name ? card.securitySchemes?.[name] : undefined;
    if (
      scheme?.type.toLowerCase() === "http" &&
      scheme.scheme?.toLowerCase() === "bearer"
    ) {
      return name;
    }
  }
  throw transportError(
    "unsupported_authentication_scheme",
    "The Agent Card requires an unsupported authentication scheme.",
    false,
  );
}

async function authorizationHeader(
  card: DirectAionAgentCard,
  agentInterface: DirectAionAgentInterface,
  provider: AionCredentialProvider | undefined,
  signal: AbortSignal,
): Promise<string | undefined> {
  const schemeName = bearerSchemeName(card);
  if (!schemeName) {
    return undefined;
  }
  if (!provider) {
    throw transportError(
      "authentication_required",
      "The selected agent requires authentication.",
      false,
    );
  }
  let token: string | null;
  try {
    token = await provider.getBearerToken({
      agentCard: card,
      agentInterface,
      schemeName,
      signal,
    });
  } catch {
    throw transportError(
      "credential_provider_failed",
      "A bearer credential could not be obtained.",
      true,
    );
  }
  if (!token || token.trim().length === 0) {
    throw transportError(
      "authentication_required",
      "The selected agent requires authentication.",
      false,
    );
  }
  return `Bearer ${token}`;
}

function outboundPart(part: ChatPart): Readonly<Record<string, unknown>> {
  switch (part.type) {
    case "text":
      return { text: part.text, metadata: part.metadata };
    case "data":
      return { data: part.data, metadata: part.metadata };
    case "file": {
      const content = part.file.url
        ? { fileWithUri: part.file.url }
        : part.file.bytes
          ? { fileWithBytes: part.file.bytes }
          : undefined;
      if (!content) {
        throw transportError(
          "invalid_chat_request",
          "A chat file part requires a URL or base64 bytes.",
          false,
        );
      }
      return {
        file: {
          ...content,
          name: part.file.name,
          mediaType: part.file.mediaType,
        },
        metadata: part.metadata,
      };
    }
  }
}

function sendMessageRequest(
  request: AionChatRequest,
  agentInterface: DirectAionAgentInterface,
): Readonly<Record<string, unknown>> {
  return {
    tenant: agentInterface.tenant,
    message: {
      messageId: request.message.id,
      contextId: request.contextId ?? request.message.contextId,
      taskId: request.taskId ?? request.message.taskId,
      role: "ROLE_USER",
      parts: request.message.parts.map(outboundPart),
      metadata: request.message.metadata,
    },
    metadata: request.metadata,
  };
}

function endpointFor(
  agentInterface: DirectAionAgentInterface,
): string {
  if (agentInterface.protocolBinding === "JSONRPC") {
    return agentInterface.url;
  }
  return `${agentInterface.url.replace(/\/$/u, "")}/message:stream`;
}

function requestBody(
  request: AionChatRequest,
  agentInterface: DirectAionAgentInterface,
): Readonly<Record<string, unknown>> {
  const message = sendMessageRequest(request, agentInterface);
  return agentInterface.protocolBinding === "JSONRPC"
    ? {
        jsonrpc: "2.0",
        id: request.requestId,
        method: "SendStreamingMessage",
        params: message,
      }
    : message;
}

function failedEvent(
  request: AionChatRequest,
  error: ChatError,
  createEventId: () => string,
  now: () => string,
): ChatTransportEvent {
  return {
    type: "run.failed",
    eventId: createEventId(),
    requestId: request.requestId,
    occurredAt: now(),
    error,
  };
}

function httpError(response: Response): DirectAionTransportError {
  if (response.status === 401) {
    return transportError(
      "authentication_required",
      "The A2A request requires authentication.",
      false,
      { httpStatus: response.status },
    );
  }
  if (response.status === 403) {
    return transportError(
      "access_denied",
      "The caller is not authorized to access this agent.",
      false,
      { httpStatus: response.status },
    );
  }
  return transportError(
    "a2a_request_failed",
    "The A2A server rejected the request.",
    response.status === 429 || response.status >= 500,
    { httpStatus: response.status },
  );
}

function normalizationContext(
  request: AionChatRequest,
  createEventId: () => string,
  now: () => string,
): AionResponseNormalizationContext {
  return {
    requestId: request.requestId,
    turnId: request.turnId,
    occurredAt: now(),
    createEventId,
  };
}

function normalizeJsonRpc(
  value: unknown,
  context: AionResponseNormalizationContext,
): readonly ChatTransportEvent[] {
  const response = record(value);
  if (response?.id !== context.requestId) {
    return [];
  }
  const error = record(response?.error);
  if (
    error &&
    typeof error.code === "number" &&
    typeof error.message === "string"
  ) {
    return normalizeAionJsonRpcError(
      { code: error.code, message: error.message },
      context,
    );
  }
  return response && "result" in response
    ? normalizeAionResponse(response.result, context)
    : [];
}

function normalizePayload(
  value: unknown,
  binding: string,
  context: AionResponseNormalizationContext,
): readonly ChatTransportEvent[] {
  const events =
    binding === "JSONRPC"
      ? normalizeJsonRpc(value, context)
      : normalizeAionResponse(value, context);
  if (events.length === 0) {
    throw transportError(
      "invalid_a2a_response",
      "The A2A server returned an unrecognized response.",
      false,
    );
  }
  return events;
}

function isTerminal(event: ChatTransportEvent): boolean {
  if (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.canceled"
  ) {
    return true;
  }
  if (
    event.type !== "task.status-changed" &&
    event.type !== "task.received"
  ) {
    return false;
  }
  const state =
    event.type === "task.received" ? event.task.status.state : event.state;
  return [
    "input-required",
    "auth-required",
    "completed",
    "failed",
    "canceled",
    "rejected",
  ].includes(state);
}

async function resolveAgentCard(
  options: DirectAionA2AConnectionOptions,
  fetcher: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<DirectAionAgentCard> {
  if (options.agentCard !== undefined) {
    return parseAgentCard(options.agentCard);
  }
  const response = await fetcher(options.agentCardUrl!, {
    headers: { Accept: "application/json" },
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw transportError(
      "agent_card_unavailable",
      "The A2A Agent Card could not be loaded.",
      response.status === 429 || response.status >= 500,
      { httpStatus: response.status },
    );
  }
  return parseAgentCard(await response.json());
}

function validateConnectionOptions(
  options: DirectAionA2AConnectionOptions,
): void {
  const hasAgentCardUrl = options.agentCardUrl !== undefined;
  const hasAgentCard = options.agentCard !== undefined;
  if (hasAgentCardUrl === hasAgentCard) {
    throw new Error("Provide exactly one of agentCardUrl or agentCard.");
  }
  if (options.agentCardUrl !== undefined) {
    validateHttpUrl(options.agentCardUrl, "The Agent Card URL");
  }
}

/** @internal Sends one unary extension call through a direct Agent Card. */
export async function callDirectAionJsonRpc(
  options: DirectAionA2AConnectionOptions,
  request: DirectAionJsonRpcRequest,
  signal: AbortSignal,
): Promise<unknown> {
  validateConnectionOptions(options);
  const fetcher = options.fetch ?? globalThis.fetch;
  const card = await resolveAgentCard(options, fetcher, signal);
  const agentInterface = selectJsonRpcInterface(card);
  const authorization = await authorizationHeader(
    card,
    agentInterface,
    options.credentials,
    signal,
  );
  const headers: Record<string, string> = {
    Accept: "application/json",
    "A2A-Version": agentInterface.protocolVersion,
    "Content-Type": "application/json",
  };
  if (authorization) {
    headers.Authorization = authorization;
  }
  const response = await fetcher(agentInterface.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", ...request }),
    credentials: "omit",
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw httpError(response);
  }
  return response.json();
}

async function* responsePayloads(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<unknown> {
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    if (!response.body) {
      throw transportError(
        "invalid_a2a_response",
        "The A2A streaming response has no body.",
        true,
      );
    }
    yield* readJsonSse(response.body, signal);
    return;
  }
  yield await response.json();
}

async function* directStream(
  options: DirectAionA2ATransportOptions,
  request: AionChatRequest,
  signal: AbortSignal,
): AsyncIterable<ChatTransportEvent> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const createEventId =
    options.createEventId ?? (() => globalThis.crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  try {
    const card = await resolveAgentCard(options, fetcher, signal);
    const agentInterface = selectInterface(card);
    const authorization = await authorizationHeader(
      card,
      agentInterface,
      options.credentials,
      signal,
    );
    const headers: Record<string, string> = {
      Accept: "text/event-stream, application/json",
      "A2A-Version": agentInterface.protocolVersion,
      "Content-Type": "application/json",
    };
    if (authorization) {
      headers.Authorization = authorization;
    }
    const response = await fetcher(endpointFor(agentInterface), {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody(request, agentInterface)),
      credentials: "omit",
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw httpError(response);
    }

    let terminal = false;
    for await (const payload of responsePayloads(response, signal)) {
      const context = normalizationContext(request, createEventId, now);
      for (const event of normalizePayload(
        payload,
        agentInterface.protocolBinding,
        context,
      )) {
        terminal = isTerminal(event);
        yield event;
        if (terminal) {
          return;
        }
      }
    }
    if (!terminal) {
      throw transportError(
        "incomplete_a2a_stream",
        "The A2A stream closed before a terminal response.",
        true,
      );
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    const chatError =
      error instanceof DirectAionTransportError
        ? error.chatError
        : error instanceof SyntaxError
          ? {
              code: "invalid_a2a_response",
              message: "The A2A server returned invalid JSON.",
              retryable: false,
            }
        : {
            code: "a2a_transport_failed",
            message: "The A2A request could not be completed.",
            retryable: true,
          };
    yield failedEvent(request, chatError, createEventId, now);
  }
}

/** Creates a direct browser A2A transport from one card source. */
export function createDirectAionA2ATransport(
  options: DirectAionA2ATransportOptions,
): AionChatTransport {
  validateConnectionOptions(options);
  return {
    stream: (request, { signal }) => directStream(options, request, signal),
  };
}
