import { parse, visit } from "graphql";
import { describe, expect, it } from "vitest";

import { AionAgentProfileError } from "../profile";
import {
  normalizeAionAgentProfile,
  toAionAgentProfileError,
} from "./profile";
import { AION_AGENT_PROFILE_QUERY_SOURCE } from "./profile-source";

const VALID_RESULT = {
  data: {
    agentIdentityDetail: {
      identity: {
        id: "identity-1",
        agentType: "Principal",
        identityNetwork: "Aion",
        organizationId: "organization-1",
        name: "Status agent",
        atName: "status-agent",
        biography: "Summarizes project status.",
        avatarImageUrl: "https://images.example/status.png",
        backgroundImageUrl: "https://images.example/status-background.png",
        email: "status@example.com",
        website: "https://example.com/status",
      },
      distributionUsages: [
        {
          projectId: "project-1",
          projectName: "Status",
          distributionId: "distribution-1",
          networkType: "Slack",
          agentEnvironmentId: "environment-1",
          agentEnvironmentName: "Production",
          serviceIdentity: {
            id: "service-identity-1",
            identityNetwork: "Slack",
            networkUserId: "U123",
            userName: "status-agent",
            name: "Status agent",
            website: "https://example.com/status",
            systemIdentity: true,
          },
        },
      ],
    },
  },
};

describe("Aion agent profile", () => {
  it("requests identity presentation and active distribution usages", () => {
    const fields = new Set<string>();
    visit(parse(AION_AGENT_PROFILE_QUERY_SOURCE), {
      Field(node) {
        fields.add(node.name.value);
      },
    });

    expect(fields).toContain("agentIdentityDetail");
    expect(fields).toContain("distributionUsages");
    expect(fields).toContain("serviceIdentity");
    expect(fields).toContain("biography");
    expect(fields).toContain("backgroundImageUrl");
  });

  it("normalizes identity details and their active channels", () => {
    expect(normalizeAionAgentProfile(VALID_RESULT)).toEqual({
      identity: {
        id: "identity-1",
        agentType: "Principal",
        identityNetwork: "Aion",
        organizationId: "organization-1",
        name: "Status agent",
        atName: "status-agent",
        biography: "Summarizes project status.",
        avatarImageUrl: "https://images.example/status.png",
        backgroundImageUrl: "https://images.example/status-background.png",
        email: "status@example.com",
        website: "https://example.com/status",
      },
      channels: [
        {
          projectId: "project-1",
          projectName: "Status",
          distributionId: "distribution-1",
          networkType: "Slack",
          agentEnvironmentId: "environment-1",
          agentEnvironmentName: "Production",
          serviceIdentity: {
            id: "service-identity-1",
            identityNetwork: "Slack",
            networkUserId: "U123",
            userName: "status-agent",
            name: "Status agent",
            website: "https://example.com/status",
            systemIdentity: true,
          },
        },
      ],
    });
  });

  it("distinguishes missing and malformed profiles", () => {
    expect(() =>
      normalizeAionAgentProfile({ data: { agentIdentityDetail: null } }),
    ).toThrowError(
      expect.objectContaining({ code: "not_found", retryable: false }),
    );
    expect(() =>
      normalizeAionAgentProfile({
        data: { agentIdentityDetail: { identity: {}, distributionUsages: [] } },
      }),
    ).toThrowError(AionAgentProfileError);
    expect(() =>
      normalizeAionAgentProfile(VALID_RESULT, "identity-other"),
    ).toThrowError(
      expect.objectContaining({ code: "invalid_response", retryable: false }),
    );
  });

  it("redacts authentication failures", () => {
    const error = toAionAgentProfileError({
      graphQLErrors: [
        { message: "JWT abc.def.ghi is unauthorized for secret tenant" },
      ],
    });

    expect(error).toMatchObject({
      code: "authentication_required",
      retryable: false,
    });
    expect(error.message).not.toContain("abc.def.ghi");
  });
});
