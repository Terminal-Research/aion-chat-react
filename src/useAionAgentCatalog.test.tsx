import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  AionAgentCatalog,
  AionAgentCatalogEntry,
} from "./catalog";
import { useAionAgentCatalog } from "./useAionAgentCatalog";

const ENTRY: AionAgentCatalogEntry = {
  agent: {
    id: "distribution-1",
    title: "Status agent",
    availability: "available",
  },
  identityId: "identity-1",
  distributionId: "distribution-1",
  organizationId: "organization-1",
  identityType: "Principal",
};

describe("useAionAgentCatalog", () => {
  it("loads and explicitly reloads the injected catalog", async () => {
    const list = vi.fn().mockResolvedValue([ENTRY]);
    const catalog: AionAgentCatalog = { list };
    const { result } = renderHook(() => useAionAgentCatalog(catalog));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.entries).toEqual([ENTRY]);

    act(() => result.current.reload());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("cancels a stale catalog read on unmount", () => {
    let signal: AbortSignal | undefined;
    const catalog: AionAgentCatalog = {
      list(options) {
        signal = options?.signal;
        return new Promise(() => undefined);
      },
    };
    const { unmount } = renderHook(() => useAionAgentCatalog(catalog));

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
