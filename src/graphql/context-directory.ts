import type { ChatAgent, ContextId } from "../model";
import {
  type AionConversationDirectory,
  aionConversationDirectoryResult,
  normalizeAionContextIds,
  normalizeAionConversationDirectoryPageRequest,
  normalizeAionRemoteConversation,
  toAionConversationDirectoryError,
} from "../conversations/directory";
import { assertAionChatGraphQLTarget } from "./target";
import type {
  AionChatGraphQLServiceParameters,
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLTarget,
  AionChatGraphQLVariables,
  AionGraphQLResult,
} from "./types";

/** Shared configuration for GraphQL-backed conversation directories. */
export interface AionChatGraphQLConversationDirectoryOptions {
  readonly observe: (
    variables: AionChatGraphQLVariables,
    signal: AbortSignal,
  ) => AsyncIterable<AionGraphQLResult<AionChatGraphQLSubscriptionData>>;
  readonly targetForAgent?: (agent: ChatAgent) => AionChatGraphQLTarget;
  readonly serviceParameters?: AionChatGraphQLServiceParameters;
  readonly createRequestId?: () => string;
  readonly createModelId?: () => string;
  readonly now?: () => string;
}

type DirectoryMethod = "GetContext" | "GetContexts";

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function operationSignal(signal?: AbortSignal): AbortSignal {
  return signal ?? new AbortController().signal;
}

function variablesFor(
  agent: ChatAgent,
  method: DirectoryMethod,
  params: Readonly<Record<string, unknown>>,
  requestId: string,
  options: AionChatGraphQLConversationDirectoryOptions,
): AionChatGraphQLVariables {
  const target = options.targetForAgent?.(agent) ?? {
    distributionId: agent.id,
  };
  assertAionChatGraphQLTarget(target);
  return {
    request: {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    },
    target,
    serviceParameters: options.serviceParameters ?? { version: "0.3" },
  };
}

async function executeDirectoryCall(
  options: AionChatGraphQLConversationDirectoryOptions,
  variables: AionChatGraphQLVariables,
  signal: AbortSignal,
): Promise<unknown> {
  for await (const result of options.observe(variables, signal)) {
    if (result.errors?.length) {
      throw toAionConversationDirectoryError({
        message: result.errors.map((error) => error.message).join(" "),
      });
    }
    const response = result.data?.a2aRpc;
    if (!response) {
      continue;
    }
    return aionConversationDirectoryResult(
      response.__typename === "A2AJsonRpcErrorResponseGQL"
        ? { id: response.id, error: response.error }
        : { id: response.id, result: response.result },
      variables.request.id,
    );
  }
  return aionConversationDirectoryResult(undefined, variables.request.id);
}

async function contextIds(
  options: AionChatGraphQLConversationDirectoryOptions,
  agent: ChatAgent,
  listOptions: Parameters<AionConversationDirectory["list"]>[1] = {},
) {
  const page = normalizeAionConversationDirectoryPageRequest(listOptions);
  const requestId = (options.createRequestId ?? defaultId)();
  const signal = operationSignal(listOptions.signal);
  const variables = variablesFor(
    agent,
    "GetContexts",
    { historyLength: page.limit, historyOffset: page.offset },
    requestId,
    options,
  );
  const result = await executeDirectoryCall(options, variables, signal);
  return normalizeAionContextIds(result, page);
}

async function conversation(
  options: AionChatGraphQLConversationDirectoryOptions,
  agent: ChatAgent,
  contextId: ContextId,
  loadOptions: Parameters<AionConversationDirectory["load"]>[2] = {},
) {
  const requestId = (options.createRequestId ?? defaultId)();
  const signal = operationSignal(loadOptions.signal);
  const variables = variablesFor(
    agent,
    "GetContext",
    { contextId },
    requestId,
    options,
  );
  const result = await executeDirectoryCall(options, variables, signal);
  return normalizeAionRemoteConversation(
    result,
    agent,
    contextId,
    (options.now ?? defaultNow)(),
    options.createModelId ?? defaultId,
  );
}

/** Creates a directory from an Aion GraphQL `a2aRpc` result stream. */
export function createAionChatGraphQLConversationDirectory(
  options: AionChatGraphQLConversationDirectoryOptions,
): AionConversationDirectory {
  return {
    async list(agent, listOptions) {
      try {
        return await contextIds(options, agent, listOptions);
      } catch (error) {
        throw toAionConversationDirectoryError(error);
      }
    },
    async load(agent, contextId, loadOptions) {
      try {
        return await conversation(
          options,
          agent,
          contextId,
          loadOptions,
        );
      } catch (error) {
        throw toAionConversationDirectoryError(error);
      }
    },
  };
}
