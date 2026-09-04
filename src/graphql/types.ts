/** Exactly one selector must be populated for an Aion capability target. */
export interface AionChatGraphQLTarget {
  readonly agentAtName?: string;
  readonly agentEnvironmentId?: string;
  readonly agentIdentityId?: string;
  readonly deploymentId?: string;
  readonly distributionId?: string;
}

/** Service parameters forwarded with an Aion GraphQL A2A request. */
export interface AionChatGraphQLServiceParameters {
  readonly version?: string;
  readonly extensions?: readonly string[];
  readonly additional?: readonly {
    readonly key: string;
    readonly value: string;
  }[];
}

/** Variables for the scoped Aion A2A GraphQL subscription. */
export interface AionChatGraphQLVariables {
  readonly request: {
    readonly jsonrpc: "2.0";
    readonly id: string;
    readonly method:
      | "GetContext"
      | "GetContexts"
      | "SendMessage"
      | "SendStreamingMessage";
    readonly params: Readonly<Record<string, unknown>>;
  };
  readonly target: AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
}

/** Minimal result shape selected by the Aion A2A GraphQL subscription. */
export interface AionChatGraphQLSubscriptionData {
  readonly a2aRpc?:
    | {
        readonly __typename: "A2AJsonRpcSuccessResponseGQL";
        readonly id?: unknown;
        readonly jsonrpc: string;
        readonly result: unknown;
      }
    | {
        readonly __typename: "A2AJsonRpcErrorResponseGQL";
        readonly id?: unknown;
        readonly jsonrpc: string;
        readonly error: {
          readonly code: number;
          readonly message: string;
          readonly data?: unknown;
        };
      }
    | null;
}

/** Portable GraphQL error fields used by both client adapters. */
export interface AionGraphQLError {
  readonly message: string;
  readonly [field: string]: unknown;
}

/** One GraphQL execution result from either supported client adapter. */
export interface AionGraphQLResult<TData> {
  readonly data?: TData | null;
  readonly errors?: readonly AionGraphQLError[];
}
