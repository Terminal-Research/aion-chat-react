import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionChatTheme } from "./AionChatTheme";
import { useAionChatPortalContainer } from "./useAionChatTheme";

afterEach(cleanup);

function PortalProbe() {
  const portal = useAionChatPortalContainer();
  return <span>{portal ? "portal ready" : "portal pending"}</span>;
}

describe("AionChatTheme", () => {
  it("accepts CSS-variable overrides and owns a themed portal target", async () => {
    const { container } = render(
      <AionChatTheme
        className="host-theme"
        style={{ "--aion-chat-radius": "1rem" }}
      >
        <PortalProbe />
      </AionChatTheme>,
    );

    const root = container.querySelector(".aion-chat-theme");
    expect(root?.classList.contains("host-theme")).toBe(true);
    expect(root?.getAttribute("style")).toContain("--aion-chat-radius: 1rem");
    await waitFor(() => expect(screen.getByText("portal ready")).toBeTruthy());
    expect(root?.querySelector("[data-aion-chat-portal]")).toBeTruthy();
  });
});
