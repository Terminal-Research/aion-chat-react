import { describe, expect, it, vi } from "vitest";

import type { AionStandaloneGraphQLClient } from "./standalone-client";
import { createStandaloneAionAgentProfileSource } from "./standalone-profile";

describe("createStandaloneAionAgentProfileSource", () => {
  it("executes one cancellable profile operation", async () => {
    const execute = vi.fn().mockResolvedValue({
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
    const client = { execute } as unknown as AionStandaloneGraphQLClient;
    const source = createStandaloneAionAgentProfileSource({ client });
    const controller = new AbortController();

    await expect(
      source.load("identity-1", { signal: controller.signal }),
    ).resolves.toMatchObject({ identity: { id: "identity-1" } });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: "AionChatAgentProfile",
        variables: { agentIdentityId: "identity-1" },
      }),
      { signal: controller.signal },
    );
  });
});
