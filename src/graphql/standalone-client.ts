import {
  createClient,
  type Client,
  type ClientOptions,
  type FormattedExecutionResult,
} from "graphql-ws";

import { collectGraphQLErrorMessages } from "./error-messages";
import type { AionGraphQLError, AionGraphQLResult } from "./types";

/** One text GraphQL operation submitted by the standalone client. */
export interface AionGraphQLOperation<TVariables extends object = object> {
  readonly query: string;
  readonly variables?: TVariables;
  readonly operationName?: string;
}

/** Cancellation for one standalone GraphQL operation. */
export interface AionGraphQLOperationOptions {
  readonly signal?: AbortSignal;
}

/** Browser WebSocket lifecycle controls forwarded to `graphql-ws`. */
export interface AionStandaloneGraphQLWebSocketOptions {
  readonly keepAlive?: number;
  readonly lazyCloseTimeout?: number;
  readonly retryAttempts?: number;
  readonly retryWait?: ClientOptions["retryWait"];
  readonly shouldRetry?: ClientOptions["shouldRetry"];
  readonly webSocketImpl?: unknown;
}

/** Configuration for one standalone Aion GraphQL client. */
export interface AionStandaloneGraphQLClientOptions {
  readonly organizationId: string;
  readonly httpUrl: string;
  readonly webSocketUrl: string;
  readonly getBearerToken: () => Promise<string | null | undefined>;
  readonly fetch?: typeof globalThis.fetch;
  readonly webSocket?: AionStandaloneGraphQLWebSocketOptions;
}

/** Stable error codes emitted by the standalone GraphQL client. */
export type AionStandaloneGraphQLClientErrorCode =
  | "access_denied"
  | "authentication_required"
  | "credential_error"
  | "disposed"
  | "graphql_http_error"
  | "graphql_ws_error"
  | "invalid_graphql_response";

/** Redaction-safe standalone GraphQL failure. */
export class AionStandaloneGraphQLClientError extends Error {
  readonly name = "AionStandaloneGraphQLClientError";

  constructor(
    readonly code: AionStandaloneGraphQLClientErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Minimal GraphQL client owned by a standalone browser integration. */
export interface AionStandaloneGraphQLClient {
  readonly organizationId: string;

  /** Executes one authenticated GraphQL HTTP operation. */
  execute<TData, TVariables extends object = object>(
    operation: AionGraphQLOperation<TVariables>,
    options?: AionGraphQLOperationOptions,
  ): Promise<AionGraphQLResult<TData>>;

  /** Opens one lazy authenticated GraphQL WebSocket operation. */
  subscribe<TData, TVariables extends object = object>(
    operation: AionGraphQLOperation<TVariables>,
    options?: AionGraphQLOperationOptions,
  ): AsyncIterable<AionGraphQLResult<TData>>;

  /** Closes the current socket so the next operation re-reads credentials. */
  reconnect(): Promise<void>;

  /** Permanently closes resources owned by this client. */
  dispose(): Promise<void>;
}

function clientError(
  code: AionStandaloneGraphQLClientErrorCode,
  message: string,
  retryable: boolean,
  status?: number,
): AionStandaloneGraphQLClientError {
  return new AionStandaloneGraphQLClientError(
    code,
    message,
    retryable,
    status,
  );
}

function assertConfigured(value: string, name: string): void {
  if (!value.trim()) {
    throw new Error(`${name} must not be empty.`);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function graphQLError(value: unknown): value is AionGraphQLError {
  return typeof record(value)?.message === "string";
}

function parseErrors(value: unknown): readonly AionGraphQLError[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  if (!value.every(graphQLError)) {
    return undefined;
  }
  return value;
}

function parseResult<TData>(value: unknown): AionGraphQLResult<TData> {
  const result = record(value);
  const errors = parseErrors(result?.errors);
  if (
    !result ||
    (!("data" in result) && !Array.isArray(result.errors)) ||
    (result.errors !== undefined && !errors)
  ) {
    throw clientError(
      "invalid_graphql_response",
      "The Aion GraphQL endpoint returned an invalid response.",
      false,
    );
  }
  return {
    data: result.data as TData | null | undefined,
    errors,
  };
}

function statusError(status: number): AionStandaloneGraphQLClientError {
  if (status === 401) {
    return clientError(
      "authentication_required",
      "Authentication is required to access Aion GraphQL.",
      false,
      status,
    );
  }
  if (status === 403) {
    return clientError(
      "access_denied",
      "Access to the Aion GraphQL operation was denied.",
      false,
      status,
    );
  }
  return clientError(
    "graphql_http_error",
    "The Aion GraphQL HTTP request failed.",
    status >= 500 || status === 429,
    status,
  );
}

function webSocketError(value: unknown): AionStandaloneGraphQLClientError {
  if (value instanceof AionStandaloneGraphQLClientError) {
    return value;
  }
  const code = record(value)?.code;
  if (code === 4401) {
    return statusError(401);
  }
  if (code === 4403) {
    return statusError(403);
  }
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
    return statusError(401);
  }
  if (
    messages.some((message) =>
      /access_denied|forbidden|access denied|\b403\b/.test(message),
    )
  ) {
    return statusError(403);
  }
  return clientError(
    "graphql_ws_error",
    "The Aion GraphQL subscription failed.",
    true,
  );
}

function authenticatedWebSocketUrl(value: string, token: string): string {
  let url: URL;
  try {
    url = globalThis.location
      ? new URL(value, globalThis.location.href)
      : new URL(value);
  } catch {
    throw clientError(
      "graphql_ws_error",
      "The Aion GraphQL WebSocket URL is invalid.",
      false,
    );
  }
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw clientError(
      "graphql_ws_error",
      "The Aion GraphQL WebSocket URL is invalid.",
      false,
    );
  }
  url.searchParams.set("token", token);
  return url.toString();
}

async function closeIterator(
  iterator: AsyncIterableIterator<unknown>,
): Promise<void> {
  await iterator.return?.();
}

async function* observeWebSocket<TData>(
  iterator: AsyncIterableIterator<FormattedExecutionResult<TData, unknown>>,
  signal?: AbortSignal,
): AsyncIterable<AionGraphQLResult<TData>> {
  if (signal?.aborted) {
    await closeIterator(iterator);
    return;
  }
  let complete = false;
  let closePromise: Promise<void> | undefined;
  const close = () => {
    closePromise ??= closeIterator(iterator);
    return closePromise;
  };
  const onAbort = () => {
    void close().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (!signal?.aborted) {
      const result = await iterator.next();
      if (result.done) {
        complete = true;
        return;
      }
      yield parseResult<TData>(result.value);
    }
  } catch (error) {
    if (!signal?.aborted) {
      throw webSocketError(error);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!complete) {
      await close();
    }
  }
}

/** Creates a lazy, explicitly disposable Aion GraphQL browser client. */
export function createStandaloneAionGraphQLClient(
  options: AionStandaloneGraphQLClientOptions,
): AionStandaloneGraphQLClient {
  assertConfigured(options.organizationId, "organizationId");
  assertConfigured(options.httpUrl, "httpUrl");
  assertConfigured(options.webSocketUrl, "webSocketUrl");

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  let webSocketClient: Client | undefined;
  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const assertActive = () => {
    if (disposed) {
      throw clientError(
        "disposed",
        "The standalone Aion GraphQL client has been disposed.",
        false,
      );
    }
  };
  const bearerToken = async () => {
    let token: string | null | undefined;
    try {
      token = await options.getBearerToken();
    } catch {
      throw clientError(
        "credential_error",
        "The Aion bearer credential could not be resolved.",
        true,
      );
    }
    if (!token?.trim()) {
      throw clientError(
        "authentication_required",
        "Authentication is required to access Aion GraphQL.",
        false,
      );
    }
    return token;
  };
  const currentWebSocketClient = () => {
    if (webSocketClient) {
      return webSocketClient;
    }
    let connectionToken: string | undefined;
    webSocketClient = createClient({
      url: async () => {
        connectionToken = await bearerToken();
        return authenticatedWebSocketUrl(
          options.webSocketUrl,
          connectionToken,
        );
      },
      connectionParams: async () => {
        const token = connectionToken ?? (await bearerToken());
        connectionToken = undefined;
        return { authorization: `Bearer ${token}` };
      },
      lazy: true,
      keepAlive: options.webSocket?.keepAlive,
      lazyCloseTimeout: options.webSocket?.lazyCloseTimeout,
      retryAttempts: options.webSocket?.retryAttempts,
      retryWait: options.webSocket?.retryWait,
      shouldRetry: options.webSocket?.shouldRetry,
      webSocketImpl: options.webSocket?.webSocketImpl,
    });
    return webSocketClient;
  };

  return {
    organizationId: options.organizationId,

    async execute<TData, TVariables extends object = object>(
      operation: AionGraphQLOperation<TVariables>,
      operationOptions?: AionGraphQLOperationOptions,
    ): Promise<AionGraphQLResult<TData>> {
      assertActive();
      operationOptions?.signal?.throwIfAborted();
      const token = await bearerToken();
      let response: Response;
      try {
        response = await fetchImplementation(options.httpUrl, {
          method: "POST",
          credentials: "omit",
          redirect: "error",
          signal: operationOptions?.signal,
          headers: {
            accept: "application/graphql-response+json, application/json",
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(operation),
        });
      } catch (error) {
        if (operationOptions?.signal?.aborted) {
          throw error;
        }
        throw clientError(
          "graphql_http_error",
          "The Aion GraphQL HTTP request failed.",
          true,
        );
      }
      if (!response.ok) {
        throw statusError(response.status);
      }
      try {
        return parseResult<TData>(await response.json());
      } catch (error) {
        if (error instanceof AionStandaloneGraphQLClientError) {
          throw error;
        }
        throw clientError(
          "invalid_graphql_response",
          "The Aion GraphQL endpoint returned an invalid response.",
          false,
        );
      }
    },

    subscribe<TData, TVariables extends object = object>(
      operation: AionGraphQLOperation<TVariables>,
      operationOptions?: AionGraphQLOperationOptions,
    ): AsyncIterable<AionGraphQLResult<TData>> {
      assertActive();
      if (operationOptions?.signal?.aborted) {
        return observeWebSocket(emptyIterator(), operationOptions.signal);
      }
      try {
        const iterator = currentWebSocketClient().iterate<TData>({
          query: operation.query,
          variables: operation.variables as
            | Record<string, unknown>
            | undefined,
          operationName: operation.operationName,
        });
        return observeWebSocket(iterator, operationOptions?.signal);
      } catch (error) {
        throw webSocketError(error);
      }
    },

    async reconnect(): Promise<void> {
      assertActive();
      const previousClient = webSocketClient;
      webSocketClient = undefined;
      await previousClient?.dispose();
    },

    dispose(): Promise<void> {
      if (disposePromise) {
        return disposePromise;
      }
      disposed = true;
      const previousClient = webSocketClient;
      webSocketClient = undefined;
      disposePromise = (async () => {
        await previousClient?.dispose();
      })();
      return disposePromise;
    },
  };
}

function emptyIterator(): AsyncIterableIterator<never> {
  return {
    next: () =>
      Promise.resolve({ done: true as const, value: undefined }),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
