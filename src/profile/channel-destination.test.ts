import { describe, expect, it } from "vitest";

import type { AionAgentProfileChannel } from "../profile";
import {
  DEFAULT_AION_APP_BASE_URL,
  getAionAgentProfileChannelDestination,
} from "./channel-destination";

const CHANNEL: AionAgentProfileChannel = {
  distributionId: "distribution/one",
  networkType: "Playground",
  projectId: "project-1",
  projectName: "Support",
};
const OPTIONS = { agentIdentityId: "identity/one" } as const;

describe("getAionAgentProfileChannelDestination", () => {
  it("deep-links the identity from the production application root", () => {
    expect(getAionAgentProfileChannelDestination(CHANNEL, OPTIONS)).toEqual({
      href:
        `${DEFAULT_AION_APP_BASE_URL}/aions/playground/` +
        "identity%2Fone",
      label: "Open Playground",
      target: "external",
    });
  });

  it("uses an overridden application root for rendered Agent Cards", () => {
    expect(
      getAionAgentProfileChannelDestination(
        { ...CHANNEL, networkType: "A2A" },
        {
          agentIdentityId: "identity-1",
          appBaseUrl: "https://staging.app.aion.to/nested",
        },
      ),
    ).toEqual({
      href:
        "https://staging.app.aion.to/aions/agent-cards/" +
        "distribution%2Fone",
      label: "View Agent Card",
      target: "external",
    });
  });

  it("derives native links from matching service identities", () => {
    expect(
      getAionAgentProfileChannelDestination(
        {
          ...CHANNEL,
          networkType: "Twitter",
          serviceIdentity: {
            id: "identity-1",
            identityNetwork: "Twitter",
            networkUserId: "123",
            userName: "@aion",
            systemIdentity: false,
          },
        },
        OPTIONS,
      ),
    ).toEqual({
      href: "https://x.com/aion",
      label: "Open X profile",
      target: "external",
    });
  });

  it("rejects invalid application roots and mismatched native identities", () => {
    expect(() =>
      getAionAgentProfileChannelDestination(CHANNEL, {
        ...OPTIONS,
        appBaseUrl: "javascript:alert(1)",
      }),
    ).toThrow("appBaseUrl must be an absolute HTTP or HTTPS URL.");
    expect(
      getAionAgentProfileChannelDestination(
        {
          ...CHANNEL,
          networkType: "GitHub",
          serviceIdentity: {
            id: "identity-1",
            identityNetwork: "Twitter",
            networkUserId: "123",
            userName: "octocat",
            systemIdentity: false,
          },
        },
        OPTIONS,
      ),
    ).toBeUndefined();
  });
});
