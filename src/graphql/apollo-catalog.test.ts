import type { ApolloClient } from "@apollo/client/core";
import { describe, expect, it, vi } from "vitest";

import { createApolloAionAgentCatalog } from "./apollo-catalog";

describe("createApolloAionAgentCatalog", () => {
  it("uses the caller-owned Apollo client and organization scope", async () => {
    const query = vi.fn().mockResolvedValue({
      data: {
        agentIdentityDetails: [
          {
            identity: {
              id: "identity-1",
              agentType: "Principal",
              organizationId: "organization-1",
              name: "Analyst",
            },
            distributionUsages: [
              { distributionId: "distribution-1", networkType: "A2A" },
            ],
          },
        ],
      },
    });
    const lifecycle = {
      clearStore: vi.fn(),
      resetStore: vi.fn(),
      stop: vi.fn(),
    };
    const client = { query, ...lifecycle } as unknown as ApolloClient<unknown>;
    const catalog = createApolloAionAgentCatalog({
      client,
      organizationId: " organization-1 ",
    });

    const entries = await catalog.list();

    expect(entries[0]?.agent.id).toBe("distribution-1");
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { organizationId: "organization-1" },
        fetchPolicy: "network-only",
        errorPolicy: "all",
      }),
    );
    expect(lifecycle.clearStore).not.toHaveBeenCalled();
    expect(lifecycle.resetStore).not.toHaveBeenCalled();
    expect(lifecycle.stop).not.toHaveBeenCalled();
  });

  it("forwards cancellation through Apollo fetch context", async () => {
    const query = vi.fn().mockResolvedValue({
      data: { agentIdentityDetails: [] },
    });
    const client = { query } as unknown as ApolloClient<unknown>;
    const controller = new AbortController();
    const catalog = createApolloAionAgentCatalog({
      client,
      organizationId: "organization-1",
    });

    await catalog.list({ signal: controller.signal });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { fetchOptions: { signal: controller.signal } },
      }),
    );
  });
});
