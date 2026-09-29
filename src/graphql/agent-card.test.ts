import { describe, expect, it, vi } from "vitest";
import { createStandaloneAionChatTransport } from "./standalone-chat-transport";
import { createApolloAionChatTransport } from "./apollo-transport";
import { loadAgentCardCapabilities } from "./agent-card";
import { createDirectAionA2ATransport } from "../a2a/direct-transport";

const uri = "https://docs.aion.to/a2a/extensions/aion/welcome-message/1.0.0";
const card = {
  name: "Selected agent",
  supportedInterfaces: [{ url: "https://example.com/a2a", protocolBinding: "HTTP+JSON", protocolVersion: "1.0" }],
  capabilities: { streaming: false, extensions: [{ uri, required: false, params: { custom: true } }] },
};
const agent = { id: "selected-distribution", title: "Agent", availability: "available" as const };
const signal = new AbortController().signal;

function cardFetch() {
  return vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(card), { headers: { "Content-Type": "application/json" } })),
  );
}

describe("route-specific capability discovery", () => {
  it("preserves direct-card extensions even without streaming support", async () => {
    const transport = createDirectAionA2ATransport({ agentCard: card });
    expect(await transport.getAgentCapabilities!(agent, { signal }))
      .toEqual(card.capabilities);
  });

  it("resolves standalone custom targets rather than an identity preference", async () => {
    const execute = vi.fn().mockResolvedValue({ data: { a2aAgentCardUrl: "https://example.com/selected-card" } });
    const fetcher = cardFetch();
    const transport = createStandaloneAionChatTransport({
      client: { execute, subscribe: vi.fn(), organizationId: "org", reconnect: vi.fn(), dispose: vi.fn() }, fetch: fetcher,
      targetForAgent: () => ({ agentAtName: "selected-name" }),
    });
    expect((await transport.getAgentCapabilities!(agent, { signal })).extensions)
      .toEqual(card.capabilities.extensions);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      variables: { target: { agentAtName: "selected-name" } },
    }), { signal });
    expect(fetcher).toHaveBeenCalledWith("https://example.com/selected-card", expect.objectContaining({ signal }));
  });

  it("resolves Apollo distribution targets afresh without caching capability flags", async () => {
    const query = vi.fn().mockResolvedValue({ data: { a2aAgentCardUrl: "https://example.com/selected-card" } });
    const fetcher = cardFetch();
    const transport = createApolloAionChatTransport({ client: { query, subscribe: vi.fn() }, fetch: fetcher });
    await transport.getAgentCapabilities!(agent, { signal });
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ capabilities: {} })));
    expect(await transport.getAgentCapabilities!(agent, { signal })).toEqual({});
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      variables: { target: { distributionId: agent.id } }, fetchPolicy: "no-cache",
    }));
  });

  it("does not fetch when authorization fails or the target has no distribution card", async () => {
    const fetcher = cardFetch();
    await expect(loadAgentCardCapabilities({ errors: [{ message: "denied" }] }, signal, fetcher)).rejects.toThrow();
    expect(await loadAgentCardCapabilities({ data: { a2aAgentCardUrl: null } }, signal, fetcher)).toEqual({});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
