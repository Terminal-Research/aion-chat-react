import type { ApolloClient } from "@apollo/client/core";

/** Minimal host-client capability required by subscription adapters. */
export interface ApolloAionSubscriptionClient {
  readonly subscribe: unknown;
}

/** Minimal host-client capability required by query adapters. */
export interface ApolloAionQueryClient {
  readonly query: unknown;
}

/** @internal Validates and narrows a caller-owned subscription client. */
export function asApolloSubscriptionClient(
  client: ApolloAionSubscriptionClient,
): ApolloClient<unknown> {
  if (typeof client.subscribe !== "function") {
    throw new Error("The supplied Apollo client must support subscriptions.");
  }
  return client as ApolloClient<unknown>;
}

/** @internal Validates and narrows a caller-owned query client. */
export function asApolloQueryClient(
  client: ApolloAionQueryClient,
): ApolloClient<unknown> {
  if (typeof client.query !== "function") {
    throw new Error("The supplied Apollo client must support queries.");
  }
  return client as ApolloClient<unknown>;
}
