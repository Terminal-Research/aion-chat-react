import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AionAgentCatalog,
  AionAgentCatalogEntry,
} from "./catalog";

/** Async lifecycle used by catalog and conversation hooks. */
export type AionNavigationLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

/** Headless state returned by the authenticated agent-catalog hook. */
export interface UseAionAgentCatalogResult {
  readonly entries: readonly AionAgentCatalogEntry[];
  readonly status: AionNavigationLoadStatus;
  readonly error?: Error;
  readonly reload: () => void;
}

interface CatalogHookState {
  readonly catalog?: AionAgentCatalog;
  readonly entries: readonly AionAgentCatalogEntry[];
  readonly status: AionNavigationLoadStatus;
  readonly error?: Error;
}

function catalogError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error("The Aion agent catalog could not be loaded.");
}

/** Loads a caller-scoped catalog and cancels stale or unmounted reads. */
export function useAionAgentCatalog(
  catalog?: AionAgentCatalog,
): UseAionAgentCatalogResult {
  const [reloadToken, setReloadToken] = useState(0);
  const generationRef = useRef(0);
  const [state, setState] = useState<CatalogHookState>({
    catalog,
    entries: [],
    status: catalog ? "loading" : "idle",
  });
  const reload = useCallback(() => {
    setState((current) => ({
      catalog,
      entries: current.catalog === catalog ? current.entries : [],
      status: catalog ? "loading" : "idle",
    }));
    setReloadToken((value) => value + 1);
  }, [catalog]);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!catalog) {
      return;
    }
    const controller = new AbortController();
    void catalog
      .list({ signal: controller.signal })
      .then((entries) => {
        if (
          !controller.signal.aborted &&
          generationRef.current === generation
        ) {
          setState({ catalog, entries, status: "ready" });
        }
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          generationRef.current === generation
        ) {
          setState({
            catalog,
            entries: [],
            status: "error",
            error: catalogError(error),
          });
        }
      });
    return () => controller.abort();
  }, [catalog, reloadToken]);

  const result =
    state.catalog === catalog
      ? state
      : {
          entries: [],
          status: catalog ? "loading" as const : "idle" as const,
        };
  return {
    entries: result.entries,
    status: result.status,
    error: result.error,
    reload,
  };
}
