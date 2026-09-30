import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AionChatSessionBoundary } from "./AionChatSessionBoundary";
import { createAionSessionCredentials } from "./a2a/anonymous-session";

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-09-30T12:00:00Z");
const scope = {
  controlPlaneUrl: "https://api.example", environmentId: "test",
  sourceId: "registry", destinationOrigin: "https://agent.example",
};
afterEach(cleanup);

function Workspace() {
  const [draft, setDraft] = useState("");
  return <input aria-label="Draft" value={draft}
    onChange={(event) => setDraft(event.target.value)} />;
}

describe("AionChatSessionBoundary", () => {
  it("requires explicit replacement of expired identity before showing history", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      sessionId: ID, token: "new-guest", expiresAt: "2026-10-30T12:00:00Z",
    }));
    const credentials = createAionSessionCredentials({ ...scope, now: () => NOW,
      storage: { read: () => JSON.stringify({ version: 1, sessionId: ID,
        token: "expired", expiresAt: "2026-09-01T00:00:00Z" }), write: vi.fn() },
      fetch: fetcher,
    });
    render(<AionChatSessionBoundary credentials={credentials}><Workspace /></AionChatSessionBoundary>);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Your guest session has expired.")).toBeTruthy();
    expect(screen.getByText(/loses access to previous/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start new session" }));
    await screen.findByRole("textbox");
    expect(fetcher).toHaveBeenCalledTimes(1);
    credentials.dispose();
  });

  it("clears workspace state on login/logout without creating another guest", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      sessionId: ID, token: "guest", expiresAt: "2026-10-30T12:00:00Z",
    }));
    const credentials = createAionSessionCredentials({ ...scope, now: () => NOW,
      storage: { read: () => null, write: vi.fn() }, fetch: fetcher,
    });
    render(<AionChatSessionBoundary credentials={credentials}><Workspace /></AionChatSessionBoundary>);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "guest draft" } });
    act(() => credentials.setAccount({ scopeKey: "user-a", credentials: {
      getBearerToken: () => Promise.resolve("account"),
    } }));
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "account draft" } });
    act(() => credentials.setAccount(null));
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe(""));
    expect(fetcher).toHaveBeenCalledTimes(1);
    credentials.dispose();
  });
});
