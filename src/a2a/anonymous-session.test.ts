import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aionSessionStorageKey, createAionSessionCredentials,
  type AionSessionStorage,
} from "./anonymous-session";
import type { AionCredentialRequest } from "./types";

const DAY = 86400_000;
const INITIAL = Date.parse("2026-09-30T12:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SCOPE = {
  controlPlaneUrl: "https://api.example", environmentId: "staging",
  sourceId: "registry", destinationOrigin: "https://agent.example",
};
const REQUEST: AionCredentialRequest = {
  agentCard: { name: "Agent", supportedInterfaces: [], capabilities: {} },
  agentInterface: {
    url: "https://agent.example/a2a", protocolBinding: "JSONRPC",
    protocolVersion: "1.0",
  },
  schemeName: "bearer", signal: new AbortController().signal,
};
function payload(now = INITIAL, id = ID) {
  return { sessionId: id, token: `token-${id}-${now}`,
    expiresAt: new Date(now + 30 * DAY).toISOString() };
}
function fixture(initial?: string) {
  let time = INITIAL;
  let saved = initial ?? null;
  const storage: AionSessionStorage = {
    read: vi.fn(() => saved), write: vi.fn((_: string, value: string) => { saved = value; }),
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(Response.json(payload(time))));
  const client = createAionSessionCredentials({ ...SCOPE, storage,
    fetch: fetcher, now: () => time });
  return { client, storage, fetcher, advance: (ms: number) => { time += ms; } };
}
afterEach(() => vi.useRealTimers());

describe("guest credential lifecycle", () => {
  it("deduplicates creation, omits browser credentials and persists a scoped v1 entry", async () => {
    const { client, fetcher, storage } = fixture();
    const values = await Promise.all([1, 2, 3].map(() => client.getBearerToken(REQUEST)));
    expect(new Set(values).size).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("https://api.example/auth/anonymous-sessions",
      expect.objectContaining({ credentials: "omit", redirect: "error", headers: {} }));
    expect(storage.write).toHaveBeenCalledWith(aionSessionStorageKey(SCOPE),
      JSON.stringify({ ...payload(), version: 1 }));
    expect(JSON.stringify(client.getSnapshot())).not.toContain("token-");
  });

  it("scopes keys by API URL, environment, source and destination", () => {
    const base = aionSessionStorageKey(SCOPE);
    expect(aionSessionStorageKey({ ...SCOPE, controlPlaneUrl: "https://API.example:443/" })).toBe(base);
    for (const field of ["environmentId", "sourceId"] as const) {
      expect(aionSessionStorageKey({ ...SCOPE, [field]: "different" })).not.toBe(base);
    }
    expect(aionSessionStorageKey({ ...SCOPE, destinationOrigin: "https://other.example" })).not.toBe(base);
    expect(aionSessionStorageKey({ ...SCOPE, controlPlaneUrl: "https://api.example/prefix" })).not.toBe(base);
    expect(() => aionSessionStorageKey({ ...SCOPE, controlPlaneUrl: "https://user:secret@api.example" })).toThrow();
  });

  it("restores and renews within seven days while retaining identity", async () => {
    const { client, fetcher, advance } = fixture(JSON.stringify({ ...payload(), version: 1 }));
    const initialScope = client.getSnapshot().scopeKey;
    const signal = client.lifecycleSignal;
    await client.prepare();
    expect(fetcher).not.toHaveBeenCalled();
    advance(24 * DAY);
    await Promise.all([client.prepare(), client.prepare()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      headers: { Authorization: `Bearer ${payload().token}` },
    }));
    expect(client.getSnapshot().scopeKey).toBe(initialScope);
    expect(client.lifecycleSignal).toBe(signal);
  });

  it("retains valid credentials across bounded active-use retries and cooldown", async () => {
    const { client, fetcher, advance } = fixture(JSON.stringify({ ...payload(), version: 1 }));
    advance(24 * DAY);
    fetcher.mockRejectedValue(new Error("offline"));
    for (const delay of [0, 1000, 5000, 30_000]) {
      advance(delay);
      expect(await client.getBearerToken(REQUEST)).toBe(payload().token);
    }
    await client.prepare();
    expect(fetcher).toHaveBeenCalledTimes(4);
    advance(5 * 60_000);
    await client.prepare();
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(client.getSnapshot().notice).toBe("temporary");
    expect(client.getSnapshot().ready).toBe(true);
  });

  it("honors Retry-After even on explicit Retry and accepts HTTP dates", async () => {
    for (const retryAfter of ["120", new Date(INITIAL + 120_000).toUTCString(), "invalid"]) {
      const { client, fetcher, advance } = fixture();
      fetcher.mockResolvedValueOnce(new Response(null, { status: 429,
        headers: { "Retry-After": retryAfter } }));
      await expect(client.prepare()).rejects.toThrow();
      await expect(client.retry()).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
      advance(retryAfter === "invalid" ? 60_000 : 120_000);
      await client.prepare();
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it("requires explicit replacement for expiry or server rejection", async () => {
    for (const expired of [true, false]) {
      const { client, fetcher, advance } = fixture(JSON.stringify({ ...payload(), version: 1 }));
      advance((expired ? 31 : 24) * DAY);
      fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
      await expect(client.prepare()).rejects.toThrow();
      expect(client.getSnapshot().notice).toBe(expired ? "expired" : "rejected");
      await expect(client.retry()).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(expired ? 0 : 1);
      fetcher.mockReset().mockResolvedValue(Response.json(payload(INITIAL + 31 * DAY, OTHER_ID)));
      await client.startNewSession();
      expect(client.getSnapshot().scopeKey).toContain(OTHER_ID);
      expect(fetcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headers: {} }));
    }
  });

  it("aborts old identity work on login, ignores late renewal and restores on logout", async () => {
    const { client, fetcher, advance, storage } = fixture(JSON.stringify({ ...payload(), version: 1 }));
    advance(24 * DAY);
    let resolve: (response: Response) => void = () => undefined;
    fetcher.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = client.prepare();
    const oldSignal = client.lifecycleSignal;
    const getBearerToken = vi.fn().mockResolvedValue("account-token");
    client.setAccount({ scopeKey: "user-a", credentials: { getBearerToken } });
    expect(oldSignal?.aborted).toBe(true);
    resolve(Response.json(payload(INITIAL + 24 * DAY)));
    await expect(pending).rejects.toThrow();
    expect(storage.write).not.toHaveBeenCalled();
    expect(await client.getBearerToken(REQUEST)).toBe("account-token");
    const loggedInSignal = client.lifecycleSignal;
    client.setAccount(null);
    expect(loggedInSignal?.aborted).toBe(true);
    expect(client.getSnapshot().scopeKey).toContain(ID);
  });

  it("does not replace account failures or leak bearers to another destination", async () => {
    const { client, fetcher } = fixture();
    const getBearerToken = vi.fn().mockRejectedValue(new Error("account expired"));
    client.setAccount({ scopeKey: "user-a", credentials: { getBearerToken } });
    await expect(client.getBearerToken(REQUEST)).rejects.toThrow("account expired");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.getBearerToken({ ...REQUEST, agentInterface: {
      ...REQUEST.agentInterface, url: "https://evil.example/a2a",
    } })).rejects.toThrow("Untrusted");
    expect(getBearerToken).toHaveBeenCalledTimes(1);
  });

  it("treats unavailable or malformed storage as loss, not expiry", async () => {
    const { client } = fixture("not JSON");
    await client.prepare();
    expect(client.getSnapshot().ready).toBe(true);
    const unavailable = createAionSessionCredentials({ ...SCOPE,
      now: () => INITIAL,
      storage: { read: () => { throw new Error("blocked"); },
        write: () => { throw new Error("full"); } },
      fetch: vi.fn().mockResolvedValue(Response.json(payload())),
    });
    await unavailable.prepare();
    expect(await unavailable.getBearerToken(REQUEST)).toBe(payload().token);
  });

  it("times out issuance after ten seconds without silently starting again", async () => {
    vi.useFakeTimers();
    const { client, fetcher } = fixture();
    fetcher.mockImplementation((_, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
    }));
    const failed = expect(client.prepare()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await failed;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot().notice).toBe("temporary");
  });
});
