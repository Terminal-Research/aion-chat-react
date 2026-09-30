import type { AionCredentialProvider, AionCredentialRequest } from "./types";

/** Host-owned credential persistence, separate from transcript/account storage. */
export interface AionSessionStorage {
  readonly read: (key: string) => string | null;
  readonly write: (key: string, value: string) => void;
}

/** Trusted configuration, never derived from a bearer or Agent Card. */
export interface AionSessionScope {
  readonly controlPlaneUrl: string;
  readonly environmentId: string;
  readonly sourceId: string;
  readonly destinationOrigin: string;
}

/** Existing account credentials remain owned by the host's auth implementation. */
export interface AionSessionAccount {
  readonly scopeKey: string;
  readonly credentials: AionCredentialProvider;
}

/** Public lifecycle state; never includes a bearer. */
export interface AionSessionState {
  readonly scopeKey: string;
  readonly mode: "guest" | "account";
  readonly ready: boolean;
  readonly notice?: "expired" | "rejected" | "temporary";
}

/** Options for explicit guest opt-in on a trusted destination. */
export interface AionSessionCredentialsOptions extends AionSessionScope {
  readonly storage: AionSessionStorage;
  readonly account?: AionSessionAccount;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
}

/** Identity changes cancel direct requests; UI should key state by scopeKey. */
export interface AionSessionCredentials extends AionCredentialProvider {
  readonly getSnapshot: () => AionSessionState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly prepare: () => Promise<void>;
  readonly setAccount: (account: AionSessionAccount | null) => void;
  readonly startNewSession: () => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly dispose: () => void;
}

interface StoredSession {
  readonly version: 1;
  readonly sessionId: string;
  readonly token: string;
  readonly expiresAt: string;
}

const DAY = 24 * 60 * 60 * 1000;
const RETRIES = [1_000, 5_000, 30_000];

function trustedUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
      !["https:", "http:"].includes(url.protocol)) {
    throw new Error("Session scope requires an absolute HTTP(S) URL.");
  }
  return url;
}

/** Collision-free v1 scope; the configured API URL is not the JWT issuer label. */
export function aionSessionStorageKey(scope: AionSessionScope): string {
  if (!scope.environmentId || !scope.sourceId) {
    throw new Error("Session environment and source IDs are required.");
  }
  return "aion-chat:anonymous-session:v1:" + [
    trustedUrl(scope.controlPlaneUrl).href.replace(/\/$/, ""),
    scope.environmentId,
    scope.sourceId,
    trustedUrl(scope.destinationOrigin).origin,
  ].map(encodeURIComponent).join(":");
}

function storedSession(value: unknown): StoredSession | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Partial<StoredSession>;
  if (data.version !== 1 || typeof data.sessionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.sessionId) ||
      typeof data.token !== "string" || !data.token || data.token.length > 8192 ||
      typeof data.expiresAt !== "string" || !data.expiresAt.endsWith("Z") ||
      !Number.isFinite(Date.parse(data.expiresAt))) return undefined;
  return data as StoredSession;
}

/**
 * Create a headless account/guest credential lifecycle for one trusted source.
 * Only active calls renew; cache failures lose persistence without recovery.
 * A rejected account bearer never switches to guest mode. Explicit logout calls
 * setAccount(null), restoring the separately retained guest when still valid.
 */
export function createAionSessionCredentials(
  options: AionSessionCredentialsOptions,
): AionSessionCredentials {
  const key = aionSessionStorageKey(options);
  const destination = trustedUrl(options.destinationOrigin).origin;
  const endpoint = trustedUrl(options.controlPlaneUrl);
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + "/auth/anonymous-sessions";
  const now = options.now ?? Date.now;
  const fetcher = options.fetch ?? globalThis.fetch;
  let session: StoredSession | undefined;
  try {
    const serialized = options.storage.read(key);
    session = serialized ? storedSession(JSON.parse(serialized)) : undefined;
  } catch { /* Unavailable/malformed storage is ordinary credential loss. */ }
  let account = options.account ?? null;
  let lifetime = new AbortController();
  let inFlight: Promise<void> | undefined;
  let failures = 0;
  let nextAttemptAt = 0;
  let retryAfterAt = 0;
  let rejected = false;
  let notice: AionSessionState["notice"];
  const listeners = new Set<() => void>();

  function state(): AionSessionState {
    const expired = session && Date.parse(session.expiresAt) <= now();
    return {
      mode: account ? "account" : "guest",
      scopeKey: account ? `${key}:account:${account.scopeKey}` : `${key}:${session?.sessionId ?? "new"}`,
      ready: !!account || (!!session && !expired && !rejected),
      notice: account ? undefined : expired ? "expired" : rejected ? "rejected" : notice,
    };
  }
  let snapshot = state();
  function publish(): void {
    const next = state();
    if (next.scopeKey === snapshot.scopeKey && next.mode === snapshot.mode &&
        next.ready === snapshot.ready && next.notice === snapshot.notice) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function changeIdentity(): void {
    lifetime.abort();
    lifetime = new AbortController();
    inFlight = undefined;
    failures = 0;
    nextAttemptAt = 0;
    notice = undefined;
  }

  async function exchange(): Promise<void> {
    const signal = lifetime.signal;
    const previous = session;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 10_000);
    try {
      const response = await fetcher(endpoint.href, {
        method: "POST",
        headers: previous ? { Authorization: `Bearer ${previous.token}` } : {},
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.any([signal, timeout.signal]),
      });
      signal.throwIfAborted();
      if (response.status === 429) {
        const value = response.headers.get("Retry-After") ?? "";
        const deadline = /^\d+$/.test(value)
          ? now() + Number(value) * 1000 : Date.parse(value);
        retryAfterAt = Number.isFinite(deadline)
          ? Math.max(now(), deadline) : now() + 60_000;
      }
      if (!response.ok) {
        await response.body?.cancel();
        signal.throwIfAborted();
        if (response.status === 401 && previous) rejected = true;
        if (response.status >= 400 && response.status < 500 &&
            response.status !== 429 && response.status !== 401) {
          nextAttemptAt = Infinity;
        }
        throw new Error("Guest session request was not accepted.");
      }
      const payload: unknown = await response.json();
      signal.throwIfAborted();
      const next = storedSession({ ...(payload as object), version: 1 });
      if (!next || Date.parse(next.expiresAt) <= now() ||
          (previous && previous.sessionId !== next.sessionId)) {
        throw new Error("Invalid guest session response.");
      }
      session = next;
      rejected = false;
      failures = 0;
      nextAttemptAt = 0;
      retryAfterAt = 0;
      notice = undefined;
      try { options.storage.write(key, JSON.stringify(next)); }
      catch { /* The currently held bearer remains usable until expiry. */ }
    } catch {
      signal.throwIfAborted();
      notice = "temporary";
      if (nextAttemptAt !== Infinity) {
        nextAttemptAt = now() + (RETRIES[failures] ?? 5 * 60_000);
        failures = failures >= RETRIES.length ? 0 : failures + 1;
      }
      // A still-valid credential survives transient renewal failure.
      if (!session || rejected || Date.parse(session.expiresAt) <= now()) {
        throw new Error("Guest session unavailable.");
      }
    } finally {
      clearTimeout(timer);
      if (!signal.aborted) publish();
    }
  }

  async function prepare(): Promise<void> {
    lifetime.signal.throwIfAborted();
    if (account) return;
    publish();
    if (rejected || (session && Date.parse(session.expiresAt) <= now())) {
      throw new Error("Start a new guest session to continue.");
    }
    if (session && Date.parse(session.expiresAt) - now() >= 7 * DAY) return;
    if (now() < Math.max(nextAttemptAt, retryAfterAt)) {
      if (session) return;
      throw new Error("Guest session retry is deferred.");
    }
    if (!inFlight) {
      const pending = exchange();
      inFlight = pending;
      void pending.finally(() => {
        if (inFlight === pending) inFlight = undefined;
      }).catch(() => undefined);
    }
    await inFlight;
  }

  return {
    sendOnPublicEndpoints: true,
    get lifecycleSignal() { return lifetime.signal; },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    prepare,
    async getBearerToken(request: AionCredentialRequest) {
      request.signal.throwIfAborted();
      const url = trustedUrl(request.agentInterface.url);
      if (url.origin !== destination) throw new Error("Untrusted credential destination.");
      const signal = lifetime.signal;
      if (account) {
        const token = await account.credentials.getBearerToken(request);
        signal.throwIfAborted();
        request.signal.throwIfAborted();
        return token;
      }
      await prepare();
      signal.throwIfAborted();
      request.signal.throwIfAborted();
      return session?.token ?? null;
    },
    setAccount(next) {
      if (account?.scopeKey !== next?.scopeKey) {
        changeIdentity();
        account = next;
        publish();
      } else account = next;
    },
    async startNewSession() {
      if (account) throw new Error("Account mode does not replace guest sessions.");
      changeIdentity();
      session = undefined;
      rejected = false;
      publish();
      await prepare();
    },
    async retry() {
      failures = 0;
      nextAttemptAt = 0;
      await prepare(); // Never bypass a server-provided Retry-After.
    },
    dispose() { lifetime.abort(); listeners.clear(); },
  };
}
