import type { ApolloClient, FetchResult } from "@apollo/client/core";
import type { DocumentNode } from "graphql";

import type { ChatAgent } from "../model";
import type { AionChatTransport } from "../transport";
import { createAionChatGraphQLTransport } from "./chat-transport";
import { AION_CHAT_A2A_RPC_SUBSCRIPTION } from "./operation";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
  AionChatGraphQLVariables,
  AionGraphQLResult,
} from "./types";

/** Options for the caller-owned Apollo Aion chat transport. */
export interface ApolloAionChatTransportOptions {
  readonly client: ApolloClient<unknown>;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly operation?: DocumentNode;
  readonly createEventId?: () => string;
  readonly now?: () => string;
  readonly unaryFallback?: boolean;
}

type ApolloNotification =
  | {
      readonly type: "next";
      readonly value: FetchResult<AionChatGraphQLSubscriptionData>;
    }
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "complete" };

async function* observeApollo(
  client: ApolloClient<unknown>,
  operation: DocumentNode,
  variables: AionChatGraphQLVariables,
  signal: AbortSignal,
): AsyncIterable<AionGraphQLResult<AionChatGraphQLSubscriptionData>> {
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
    AionChatGraphQLSubscriptionData,
    AionChatGraphQLVariables
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
      yield {
        data: notification.value.data,
        errors: notification.value.errors?.map((error) => ({
          ...error,
          message: error.message,
        })),
      };
    }
  } finally {
    closed = true;
    wake = undefined;
    signal.removeEventListener("abort", onAbort);
    subscription.unsubscribe();
  }
}

/** Creates an Aion chat transport around one caller-owned Apollo client. */
export function createApolloAionChatTransport(
  options: ApolloAionChatTransportOptions,
): AionChatTransport {
  const operation = options.operation ?? AION_CHAT_A2A_RPC_SUBSCRIPTION;
  return createAionChatGraphQLTransport({
    observe: (variables, signal) =>
      observeApollo(options.client, operation, variables, signal),
    targetForAgent: options.targetForAgent,
    serviceParameters: options.serviceParameters,
    createEventId: options.createEventId,
    now: options.now,
    unaryFallback: options.unaryFallback,
  });
}
