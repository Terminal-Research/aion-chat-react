import { describe, expect, it, vi } from "vitest";

import type { AionStandaloneGraphQLClient } from "./standalone-client";
import { createStandaloneAionAgentCatalog } from "./standalone-catalog";

describe("createStandaloneAionAgentCatalog", () => {
  it("uses the standalone client's organization scope", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { agentIdentityDetails: [] },
    });
    const client = {
      organizationId: "organization-1",
      execute,
    } as unknown as AionStandaloneGraphQLClient;
    const controller = new AbortController();
    const catalog = createStandaloneAionAgentCatalog({ client });

    await expect(
      catalog.list({ signal: controller.signal }),
    ).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { organizationId: "organization-1" },
        operationName: "AionChatAgentCatalog",
      }),
      { signal: controller.signal },
    );
  });

  it("preserves cancellation errors from the standalone client", async () => {
    const aborted = new DOMException("cancelled", "AbortError");
    const execute = vi.fn().mockRejectedValue(aborted);
    const client = {
      organizationId: "organization-1",
      execute,
    } as unknown as AionStandaloneGraphQLClient;
    const catalog = createStandaloneAionAgentCatalog({ client });

    await expect(catalog.list()).rejects.toBe(aborted);
  });
});
