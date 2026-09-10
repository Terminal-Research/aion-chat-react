import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionAgentProfile } from "./AionAgentProfile";
import { AionAgentProfileError } from "./profile";

afterEach(cleanup);

describe("AionAgentProfile", () => {
  it("renders preloaded details, channels, and host-defined rows", () => {
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
    expect(screen.getByText("@status-agent")).toBeTruthy();
    expect(screen.getByText("Summarizes project status.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /example.com\/status/u }))
      .toHaveProperty("href", "https://example.com/status");
    expect(screen.getByText("Status · Production")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Playground: Playground" }))
      .toHaveProperty(
        "href",
        "https://staging.app.aion.to/aions/playground",
      );
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
});
