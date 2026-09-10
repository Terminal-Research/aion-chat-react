import type { ApolloClient } from "@apollo/client/core";
import { describe, expect, it, vi } from "vitest";

import { createApolloAionAgentProfileSource } from "./apollo-profile";

describe("createApolloAionAgentProfileSource", () => {
  it("uses the caller-owned Apollo cache for one lazy identity read", async () => {
    const query = vi.fn().mockResolvedValue({
      data: {
        agentIdentityDetail: {
          identity: {
            id: "identity-1",
            agentType: "Principal",
            organizationId: "organization-1",
            name: "Status agent",
          },
          distributionUsages: [],
        },
      },
    });
    const client = { query } as unknown as ApolloClient<unknown>;
    const source = createApolloAionAgentProfileSource({ client });
    const controller = new AbortController();

    await expect(
      source.load(" identity-1 ", { signal: controller.signal }),
    ).resolves.toMatchObject({ identity: { id: "identity-1" } });
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { agentIdentityId: "identity-1" },
        fetchPolicy: "cache-first",
        errorPolicy: "all",
        context: { fetchOptions: { signal: controller.signal } },
      }),
    );
  });
});
