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

  it("preserves loaded entries while a replacement catalog loads", async () => {
    let resolveReplacement: (
      entries: readonly AionAgentCatalogEntry[],
    ) => void = () => undefined;
    const initialCatalog: AionAgentCatalog = {
      list: vi.fn().mockResolvedValue([ENTRY]),
    };
    const replacementEntry: AionAgentCatalogEntry = {
      ...ENTRY,
      agent: { ...ENTRY.agent, title: "Updated status agent" },
    };
    const replacementCatalog: AionAgentCatalog = {
      list: vi.fn(
        () =>
          new Promise<readonly AionAgentCatalogEntry[]>((resolve) => {
            resolveReplacement = resolve;
          }),
      ),
    };
    const { result, rerender } = renderHook(
      ({ catalog }) => useAionAgentCatalog(catalog),
      { initialProps: { catalog: initialCatalog } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ catalog: replacementCatalog });

    expect(result.current.status).toBe("loading");
    expect(result.current.entries).toEqual([ENTRY]);

    act(() => resolveReplacement([replacementEntry]));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.entries).toEqual([replacementEntry]);
  });

  it("clears loaded entries when the catalog is removed", async () => {
    const catalog: AionAgentCatalog = {
      list: vi.fn().mockResolvedValue([ENTRY]),
    };
    const initialProps: { currentCatalog?: AionAgentCatalog } = {
      currentCatalog: catalog,
    };
    const { result, rerender } = renderHook(
      ({ currentCatalog }: { currentCatalog?: AionAgentCatalog }) =>
        useAionAgentCatalog(currentCatalog),
      { initialProps },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ currentCatalog: undefined });

    expect(result.current.status).toBe("idle");
    expect(result.current.entries).toEqual([]);
  });
});
