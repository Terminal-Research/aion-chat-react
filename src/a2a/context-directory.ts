import type { ChatAgent } from "../model";
import {
  type AionConversationDirectory,
  aionConversationDirectoryResult,
  normalizeAionContextIds,
  normalizeAionConversationDirectoryPageRequest,
  normalizeAionRemoteConversation,
  toAionConversationDirectoryError,
} from "../conversations/directory";
import {
  callDirectAionJsonRpc,
  type DirectAionA2AConnectionOptions,
} from "./direct-transport";

/** Options for context extensions called directly through Agent Cards. */
export interface DirectAionConversationDirectoryOptions {
  readonly connectionForAgent: (
    agent: ChatAgent,
  ) => DirectAionA2AConnectionOptions;
  readonly createRequestId?: () => string;
  readonly createModelId?: () => string;
  readonly now?: () => string;
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function operationSignal(signal?: AbortSignal): AbortSignal {
  return signal ?? new AbortController().signal;
}

/** Creates a caller-scoped directory over direct A2A JSON-RPC. */
export function createDirectAionConversationDirectory(
  options: DirectAionConversationDirectoryOptions,
): AionConversationDirectory {
  const createRequestId = options.createRequestId ?? defaultId;
  const createModelId = options.createModelId ?? defaultId;
  const now = options.now ?? defaultNow;

  return {
    async list(agent, listOptions = {}) {
      const page = normalizeAionConversationDirectoryPageRequest(
        listOptions,
      );
      const requestId = createRequestId();
      try {
        const response = await callDirectAionJsonRpc(
          options.connectionForAgent(agent),
          {
            id: requestId,
            method: "GetContexts",
            params: {
              historyLength: page.limit,
              historyOffset: page.offset,
            },
          },
          operationSignal(listOptions.signal),
        );
        return normalizeAionContextIds(
          aionConversationDirectoryResult(response, requestId),
          page,
        );
      } catch (error) {
        throw toAionConversationDirectoryError(error);
      }
    },

    async load(agent, contextId, loadOptions = {}) {
      const requestId = createRequestId();
      try {
        const response = await callDirectAionJsonRpc(
          options.connectionForAgent(agent),
          {
            id: requestId,
            method: "GetContext",
            params: { contextId },
          },
          operationSignal(loadOptions.signal),
        );
        return normalizeAionRemoteConversation(
          aionConversationDirectoryResult(response, requestId),
          agent,
          contextId,
          now(),
          createModelId,
        );
      } catch (error) {
        throw toAionConversationDirectoryError(error);
      }
    },
  };
}
