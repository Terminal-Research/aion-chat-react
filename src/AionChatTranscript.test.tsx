import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionChatTranscript } from "./AionChatTranscript";
import type { ChatMessage } from "./model";

afterEach(cleanup);

describe("AionChatTranscript", () => {
  it("retains every long-history entry in the DOM", () => {
    const entries = Array.from({ length: 300 }, (_, index) => {
      const message: ChatMessage = {
        id: `message-${index}`,
        role: "assistant",
        parts: [{ type: "text", text: `Message ${index}` }],
        createdAt: "2026-09-03T12:00:00.000Z",
      };
      return { type: "message" as const, message };
    });

    const view = render(<AionChatTranscript entries={entries} />);

    expect(
      view.container.querySelectorAll(".aion-chat__transcript-entry"),
    ).toHaveLength(300);
    expect(screen.getByText("Message 0")).toBeTruthy();
    expect(screen.getByText("Message 299")).toBeTruthy();
    expect(view.container.querySelector('[data-entry-id="message-150"]'))
      .toBeTruthy();
  });

  it("keeps interactive content keyboard reachable inside wrappers", () => {
    const message: ChatMessage = {
      id: "message-file",
      role: "assistant",
      parts: [
        {
          type: "file",
          file: {
            name: "Report",
            url: "https://files.example/report.pdf",
          },
        },
      ],
      createdAt: "2026-09-03T12:00:00.000Z",
    };
    render(
      <AionChatTranscript entries={[{ type: "message", message }]} />,
    );
    const link = screen.getByRole("link", { name: "Report" });

    link.focus();

    expect(document.activeElement).toBe(link);
  });

  it("uses browser containment without windowing styles", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/aion-chat.css"),
      "utf8",
    );

    expect(css).toContain("content-visibility: auto");
    expect(css).toContain("contain-intrinsic-size: auto 6rem");
  });
});
