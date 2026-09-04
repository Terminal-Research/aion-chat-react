import { describe, expect, it, vi } from "vitest";

import type { ChatAgent } from "../model";
import { AionConversationDirectoryError } from "../conversations/directory";
import { createDirectAionConversationDirectory } from "./context-directory";
import type { DirectAionAgentCard } from "./types";

const AGENT: ChatAgent = {
  id: "distribution-1",
  title: "Status agent",
  availability: "available",
};

const CARD: DirectAionAgentCard = {
  name: "Status agent",
  supportedInterfaces: [
    {
      url: "https://agent.example/a2a/rpc",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  capabilities: {},
};

describe("createDirectAionConversationDirectory", () => {
  it("lists context IDs through one authenticated extension call", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: "request-1",
        result: ["context-2", "context-1"],
      }),
    );
    const directory = createDirectAionConversationDirectory({
      connectionForAgent: () => ({ agentCard: CARD, fetch: fetcher }),
      createRequestId: () => "request-1",
    });

    const page = await directory.list(AGENT, { offset: 10, limit: 2 });

    expect(page).toEqual({
      contextIds: ["context-2", "context-1"],
      nextOffset: 12,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string))
      .toMatchObject({
        id: "request-1",
        method: "GetContexts",
        params: { historyLength: 2, historyOffset: 10 },
      });
  });

  it("uses existing credentials when loading one context", async () => {
    const securedCard: DirectAionAgentCard = {
      ...CARD,
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer" },
      },
      securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: "request-1",
        result: {
          contextId: "context-1",
          history: [],
          artifacts: [],
          status: { state: "TASK_STATE_WORKING" },
        },
      }),
    );
    const directory = createDirectAionConversationDirectory({
      connectionForAgent: () => ({
        agentCard: securedCard,
        credentials: {
          getBearerToken: () => Promise.resolve("current-token"),
        },
        fetch: fetcher,
      }),
      createRequestId: () => "request-1",
      createModelId: () => "model-1",
      now: () => "2026-09-03T12:00:00.000Z",
    });

    const conversation = await directory.load(AGENT, "context-1");

    expect(conversation.contextId).toBe("context-1");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
      "Authorization",
    )).toBe("Bearer current-token");
  });

  it("reports unsupported cards before sending an extension call", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const directory = createDirectAionConversationDirectory({
      connectionForAgent: () => ({
        agentCard: {
          ...CARD,
          supportedInterfaces: [
            {
              url: "https://agent.example/a2a/rest",
              protocolBinding: "HTTP+JSON",
              protocolVersion: "1.0",
            },
          ],
        },
        fetch: fetcher,
      }),
    });

    await expect(directory.list(AGENT)).rejects.toMatchObject({
      code: "unsupported",
    } satisfies Partial<AionConversationDirectoryError>);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
