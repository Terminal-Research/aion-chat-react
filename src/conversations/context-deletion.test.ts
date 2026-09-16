import { describe, expect, it, vi } from "vitest";

import { createDirectAionConversationDirectory } from "../a2a/context-directory";
import { createAionChatGraphQLConversationDirectory } from "../graphql/context-directory";
import type { AionChatGraphQLVariables } from "../graphql/types";
import type { ChatAgent } from "../model";

const AGENT: ChatAgent = {
  id: "distribution-1",
  title: "Agent",
  availability: "available",
};

function adapter(kind: "direct" | "graphql", result: unknown, code?: number) {
  const requests: unknown[] = [];
  const controller = new AbortController();
  const response =
    code === undefined
      ? { jsonrpc: "2.0", id: "request-1", result }
      : {
          jsonrpc: "2.0",
          id: "request-1",
          error: {
            code,
            message: "private provider detail",
            data: { retryable: code === 1001 },
          },
        };
  const fetcher = vi.fn<typeof fetch>((_url, options) => {
    requests.push(JSON.parse(options?.body as string));
    expect(options?.signal).toBe(controller.signal);
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer token",
    );
    return Promise.resolve(Response.json(response));
  });
  const directory =
    kind === "direct"
      ? createDirectAionConversationDirectory({
          createRequestId: () => "request-1",
          connectionForAgent: () => ({
            agentCard: {
              name: "Agent",
              capabilities: {},
              supportedInterfaces: [
                {
                  url: "https://agent.example/rpc",
                  protocolBinding: "JSONRPC",
                  protocolVersion: "1.0",
                },
              ],
              securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
              securityRequirements: [{ schemes: { bearer: { list: [] } } }],
            },
            credentials: { getBearerToken: () => Promise.resolve("token") },
            fetch: fetcher,
          }),
        })
      : createAionChatGraphQLConversationDirectory({
          createRequestId: () => "request-1",
          targetForAgent: () => ({ distributionId: "distribution-1" }),
          observe: async function* (
            variables: AionChatGraphQLVariables,
            signal,
          ) {
            requests.push(variables.request);
            expect(variables.target).toEqual({
              distributionId: "distribution-1",
            });
            expect(signal).toBe(controller.signal);
            yield await Promise.resolve({
              data: {
                a2aRpc:
                  code === undefined
                    ? {
                        __typename: "A2AJsonRpcSuccessResponseGQL",
                        jsonrpc: "2.0",
                        id: "request-1",
                        result,
                      }
                    : {
                        __typename: "A2AJsonRpcErrorResponseGQL",
                        jsonrpc: "2.0",
                        id: "request-1",
                        error: { code, message: "private provider detail" },
                      },
              },
            });
          },
        });
  return {
    requests,
    remove: () =>
      directory.delete!(AGENT, "context-1", {
        signal: controller.signal,
      }),
  };
}

describe.each(["direct", "graphql"] as const)("%s context deletion", (kind) => {
  it("uses the existing authenticated connection and validates confirmation", async () => {
    const { remove, requests } = adapter(kind, { contextId: "context-1" });
    await expect(remove()).resolves.toBeUndefined();
    expect(requests).toEqual([
      expect.objectContaining({
        id: "request-1",
        method: "DeleteContext",
        params: { contextId: "context-1" },
      }),
    ]);
  });

  it.each([
    null,
    {},
    { contextId: "another-context" },
    { contextId: "context-1", history: [] },
  ])("rejects an invalid confirmation: %j", async (result) => {
    await expect(adapter(kind, result).remove()).rejects.toMatchObject({
      code: "invalid_response",
      retryable: false,
    });
  });

  it.each([
    [1000, "context_not_found", false],
    [1001, "deletion_in_progress", true],
    [1002, "context_not_deletable", false],
    [-32601, "unsupported", false],
    [-32010, "authentication_required", false],
    [-32011, "access_denied", false],
  ] as const)(
    "preserves error %s without leaking provider details",
    async (code, category, retryable) => {
      const error = await adapter(kind, undefined, code)
        .remove()
        .catch((value: unknown) => value);
      expect(error).toMatchObject({ code: category, retryable });
      expect((error as Error).message).not.toContain("private provider detail");
    },
  );
});
