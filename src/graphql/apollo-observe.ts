import type { ApolloClient, FetchResult } from "@apollo/client/core";
import type { DocumentNode } from "graphql";

import type { AionGraphQLResult } from "./types";

type ApolloNotification<TData> =
  | { readonly type: "next"; readonly value: FetchResult<TData> }
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "complete" };

/** @internal Adapts one Apollo observable into a cancelable async iterable. */
export async function* observeApolloAionGraphQL<
  TData,
  TVariables extends object,
>(
  client: ApolloClient<unknown>,
  operation: DocumentNode,
  variables: TVariables,
  signal: AbortSignal,
): AsyncIterable<AionGraphQLResult<TData>> {
  if (signal.aborted) {
    return;
  }
  const queue: ApolloNotification<TData>[] = [];
  let wake:
    | ((notification: ApolloNotification<TData>) => void)
    | undefined;
  let closed = false;

  const push = (notification: ApolloNotification<TData>) => {
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
  const nextNotification = (): Promise<ApolloNotification<TData>> => {
    const queued = queue.shift();
    return queued
      ? Promise.resolve(queued)
      : new Promise((resolve) => {
          wake = resolve;
        });
  };
  const observable = client.subscribe<TData, TVariables>({
    query: operation,
    variables,
  });
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
