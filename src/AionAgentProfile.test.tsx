import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionAgentProfile } from "./AionAgentProfile";
import { AionAgentProfileError } from "./profile";

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
        "https://staging.app.aion.to/aions/playground",
      );
    expect(playground).toHaveProperty(
      "title",
      "Open Playground · Status · Production",
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
