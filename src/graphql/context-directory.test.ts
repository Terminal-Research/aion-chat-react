import { describe, expect, it, vi } from "vitest";

import type { ChatAgent } from "../model";
import {
  createAionChatGraphQLConversationDirectory,
} from "./context-directory";
import type {
  AionChatGraphQLSubscriptionData,
  AionChatGraphQLVariables,
  AionGraphQLResult,
} from "./types";

const AGENT: ChatAgent = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available",
};

function results(
  result: AionGraphQLResult<AionChatGraphQLSubscriptionData>,
) {
  return async function* observe() {
    yield await Promise.resolve(result);
  };
}

describe("createAionChatGraphQLConversationDirectory", () => {
  it("lists one context page without hydrating its entries", async () => {
    const observed: AionChatGraphQLVariables[] = [];
    const observe = vi.fn((variables: AionChatGraphQLVariables) => {
      observed.push(variables);
      return results({
        data: {
          a2aRpc: {
            __typename: "A2AJsonRpcSuccessResponseGQL",
            jsonrpc: "2.0",
            id: "request-1",
            result: ["context-3", "context-2"],
          },
        },
      })();
    });
    const directory = createAionChatGraphQLConversationDirectory({
      observe,
      createRequestId: () => "request-1",
    });

    await expect(directory.list(AGENT, { offset: 4, limit: 2 }))
      .resolves.toEqual({
        contextIds: ["context-3", "context-2"],
        nextOffset: 6,
      });
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observed[0]).toMatchObject({
      request: {
        method: "GetContexts",
        params: { historyLength: 2, historyOffset: 4 },
      },
      target: { distributionId: "distribution-1" },
    });
  });

  it("hydrates only the selected context", async () => {
    let observed: AionChatGraphQLVariables | undefined;
    const observe = vi.fn((variables: AionChatGraphQLVariables) => {
      observed = variables;
      return results({
        data: {
          a2aRpc: {
            __typename: "A2AJsonRpcSuccessResponseGQL",
            jsonrpc: "2.0",
            id: "request-1",
            result: {
              contextId: "context-1",
              history: [
                {
                  messageId: "message-1",
                  role: "ROLE_AGENT",
                  parts: [{ text: "Ready" }],
                },
              ],
              artifacts: [],
              status: { state: "TASK_STATE_COMPLETED" },
            },
          },
        },
      })();
    });
    const directory = createAionChatGraphQLConversationDirectory({
      observe,
      createRequestId: () => "request-1",
      createModelId: () => "model-1",
      now: () => "2026-09-03T12:00:00.000Z",
    });

    const conversation = await directory.load(AGENT, "context-1");

    expect(conversation.messages[0]).toMatchObject({
      id: "message-1",
      role: "assistant",
    });
    expect(observed).toMatchObject({
      request: {
        method: "GetContext",
        params: { contextId: "context-1" },
      },
    });
  });

  it("preserves typed authorization failures", async () => {
    const directory = createAionChatGraphQLConversationDirectory({
      observe: results({
        data: {
          a2aRpc: {
            __typename: "A2AJsonRpcErrorResponseGQL",
            jsonrpc: "2.0",
            id: "request-1",
            error: { code: -32010, message: "Do not expose this" },
          },
        },
      }),
      createRequestId: () => "request-1",
    });

    await expect(directory.list(AGENT)).rejects.toMatchObject({
      code: "authentication_required",
      message: "Authentication is required to load remote conversations.",
      retryable: false,
    });
  });
});
