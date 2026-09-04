import { parse, visit } from "graphql";
import { describe, expect, it } from "vitest";

import { AionAgentCatalogError } from "../catalog";
import {
  normalizeAionAgentCatalog,
  toAionAgentCatalogError,
} from "./catalog";
import { AION_AGENT_CATALOG_QUERY_SOURCE } from "./catalog-source";

const VALID_RESULT = {
  data: {
    agentIdentityDetails: [
      {
        identity: {
          id: "identity-2",
          agentType: "Principal",
          organizationId: "organization-1",
          name: "Writer",
          atName: "writer",
          biography: "Drafts concise prose.",
          avatarImageUrl: "https://images.example/writer.png",
          a2aUrl: "https://agents.example/writer",
        },
        distributionUsages: [
          { distributionId: "distribution-2", networkType: "A2A" },
          { distributionId: "distribution-slack", networkType: "Slack" },
        ],
      },
      {
        identity: {
          id: "identity-1",
          agentType: "Personal",
          organizationId: "organization-1",
          name: "Analyst",
        },
        distributionUsages: [
          { distributionId: "distribution-1b", networkType: "A2A" },
          { distributionId: "distribution-1a", networkType: "A2A" },
        ],
      },
    ],
  },
};

describe("Aion agent catalog", () => {
  it("requests only identity, presentation, and A2A addressing fields", () => {
    const fields = new Set<string>();
    visit(parse(AION_AGENT_CATALOG_QUERY_SOURCE), {
      Field(node) {
        fields.add(node.name.value);
      },
    });

    expect(fields).toEqual(
      new Set([
        "a2aUrl",
        "agentIdentityDetails",
        "agentType",
        "atName",
        "avatarImageUrl",
        "biography",
        "distributionId",
        "distributionUsages",
        "id",
        "identity",
        "name",
        "networkType",
        "organizationId",
      ]),
    );
    expect(AION_AGENT_CATALOG_QUERY_SOURCE).toContain(
      "types: [Principal, Personal]",
    );
    expect(AION_AGENT_CATALOG_QUERY_SOURCE).toContain("networkTypes: [A2A]");
    expect(AION_AGENT_CATALOG_QUERY_SOURCE).toContain(
      "includePersonalSelf: false",
    );
  });

  it("normalizes one deterministic entry per active A2A distribution", () => {
    expect(normalizeAionAgentCatalog(VALID_RESULT, "organization-1")).toEqual([
      {
        agent: {
          id: "distribution-1a",
          title: "Analyst",
          availability: "available",
        },
        identityId: "identity-1",
        distributionId: "distribution-1a",
        organizationId: "organization-1",
        identityType: "Personal",
      },
      {
        agent: {
          id: "distribution-1b",
          title: "Analyst",
          availability: "available",
        },
        identityId: "identity-1",
        distributionId: "distribution-1b",
        organizationId: "organization-1",
        identityType: "Personal",
      },
      {
        agent: {
          id: "distribution-2",
          title: "Writer",
          description: "Drafts concise prose.",
          availability: "available",
        },
        identityId: "identity-2",
        distributionId: "distribution-2",
        organizationId: "organization-1",
        identityType: "Principal",
        atName: "writer",
        a2aUrl: "https://agents.example/writer",
        avatarImageUrl: "https://images.example/writer.png",
      },
    ]);
  });

  it("rejects cross-organization and malformed catalog data", () => {
    const crossOrganization = {
      data: {
        agentIdentityDetails: [
          {
            identity: {
              id: "identity-1",
              agentType: "Principal",
              organizationId: "organization-2",
              name: "Unexpected",
            },
            distributionUsages: [
              { distributionId: "distribution-1", networkType: "A2A" },
            ],
          },
        ],
      },
    };

    expect(() =>
      normalizeAionAgentCatalog(crossOrganization, "organization-1"),
    ).toThrowError(
      expect.objectContaining({
        code: "invalid_response",
        message: "The Aion agent catalog returned an invalid response.",
      }),
    );
    expect(() =>
      normalizeAionAgentCatalog({ data: {} }, "organization-1"),
    ).toThrowError(AionAgentCatalogError);
  });

  it("classifies authentication errors without exposing server details", () => {
    const error = toAionAgentCatalogError({
      graphQLErrors: [
        {
          message: "JWT token abc.def.ghi is unauthorized for secret tenant",
        },
      ],
    });

    expect(error).toMatchObject({
      code: "authentication_required",
      message: "Authentication is required to load the Aion agent catalog.",
      retryable: false,
    });
    expect(error.message).not.toContain("abc.def.ghi");
  });
});
