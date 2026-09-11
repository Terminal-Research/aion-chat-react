import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionAgentProfile } from "./AionAgentProfile";
import {
  AionAgentProfileError,
  type AionAgentProfileNetworkType,
} from "./profile";

function profileChannelColor(
  css: string,
  networkType: AionAgentProfileNetworkType,
): string | undefined {
  const selector = `[data-network="${networkType}"]`;
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex < 0) {
    return undefined;
  }
  const ruleEnd = css.indexOf("}", selectorIndex);
  if (ruleEnd < 0) {
    return undefined;
  }
  const rule = css.slice(selectorIndex, ruleEnd);
  return /--aion-chat-profile-channel-color:\s*([^;]+);/u.exec(rule)?.[1];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AionAgentProfile", () => {
  it("preserves the established profile hierarchy and controls", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(
      <AionAgentProfile
        detail={{
          identity: {
            id: "identity-1",
            agentType: "Principal",
            identityNetwork: "Aion",
            organizationId: "organization-1",
            name: "Status agent",
            atName: "status-agent",
            biography: "Summarizes project status.",
            email: "status@example.com",
            website: "https://example.com/status",
          },
          channels: [
            {
              distributionId: "distribution-1",
              networkType: "Playground",
              projectId: "project-1",
              projectName: "Status",
              agentEnvironmentName: "Production",
            },
            {
              distributionId: "distribution-voice",
              networkType: "Voice",
              projectId: "project-1",
              projectName: "Status",
              serviceIdentity: {
                id: "service-voice",
                identityNetwork: "Twilio",
                networkUserId: "+14155550123",
                systemIdentity: true,
              },
            },
          ],
        }}
        additionalDetails={[
          { id: "responses", label: "Responses", value: "42" },
        ]}
        appBaseUrl="https://staging.app.aion.to"
      />,
    );

    expect(screen.getByRole("article", { name: "Status agent profile" }))
      .toBeTruthy();
    expect(screen.getByRole("heading", { name: "status-agent" })).toBeTruthy();
    expect(screen.getByText("Status agent")).toBeTruthy();
    expect(screen.getByText("Principal")).toBeTruthy();
    expect(screen.getByText("Summarizes project status.")).toBeTruthy();
    expect(screen.getAllByRole("term").map((term) => term.textContent))
      .toEqual(["Email", "Website", "Responses"]);
    expect(screen.getByRole("link", { name: /example.com\/status/u }))
      .toHaveProperty("href", "https://example.com/status");
    const emailCopy = screen.getByRole("button", { name: "Copy email" });
    fireEvent.click(emailCopy);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied email" }))
        .toBeTruthy();
    });
    expect(writeText).toHaveBeenCalledWith("status@example.com");
    expect(screen.getByText("Playground")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    const playground = screen.getByRole("link", {
      name: "Open Playground: Status",
    });
    expect(playground)
      .toHaveProperty(
        "href",
        "https://staging.app.aion.to/aions/playground/identity-1",
      );
    expect(playground).toHaveProperty(
      "title",
      "Open Playground · Status · Production",
    );
    const voice = screen.getByRole("link", {
      name: "Call number: +14155550123",
    });
    const actionSelector = ".aion-chat__profile-channel-action svg";
    expect(voice.querySelector(actionSelector)?.innerHTML)
      .toBe(playground.querySelector(actionSelector)?.innerHTML);
    expect(screen.getByText("Responses")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("does not offer retries for terminal profile failures", async () => {
    render(
      <AionAgentProfile
        identityId="identity-missing"
        source={{
          load: () =>
            Promise.reject(
              new AionAgentProfileError(
                "not_found",
                "The requested Aion profile was not found.",
                false,
              ),
            ),
        }}
      />,
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The requested Aion profile was not found.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("reserves accent for Aion channels and distinguishes email and Meet", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/aion-chat.css"),
      "utf8",
    );
    const channelCss = css.slice(css.indexOf(".aion-chat__profile-channel {"));

    expect(profileChannelColor(channelCss, "A2A"))
      .toBe("var(--aion-chat-color-accent)");
    expect(profileChannelColor(channelCss, "Aion"))
      .toBe("var(--aion-chat-color-accent)");
    expect(profileChannelColor(channelCss, "AgentMail"))
      .toBe("var(--aion-chat-color-info)");
    expect(profileChannelColor(channelCss, "Meet"))
      .toBe("var(--aion-chat-color-success)");
    expect(
      channelCss.match(
        /--aion-chat-profile-channel-color: var\(--aion-chat-color-accent\);/gu,
      ),
    ).toHaveLength(1);
  });

});
