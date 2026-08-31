import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionChatMarkdown } from "./AionChatMarkdown";
import { AionChatMessage } from "./AionChatMessage";
import type { ChatMessage } from "./model";

afterEach(cleanup);

describe("AionChatMarkdown", () => {
  it("renders GFM content through typed React elements", () => {
    const { container } = render(
      <AionChatMarkdown
        text={"# Status\n\n- Ready\n\n| Agent | State |\n| --- | --- |\n| One | **working** |\n\n`code`"}
      />,
    );

    expect(screen.getByRole("heading", { name: "Status" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("working");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("drops raw HTML, remote images, and executable link protocols", () => {
    const { container } = render(
      <AionChatMarkdown
        text={'<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n<svg onload="alert(1)"></svg>\n\n![tracker](https://example.com/pixel.png)\n\n[unsafe](javascript:alert(1))'}
      />,
    );

    expect(container.querySelector("script, iframe, svg, img")).toBeNull();
    expect(screen.getByText("[Image: tracker]")).toBeTruthy();
    expect(screen.getByText("unsafe").closest("a")).toBeNull();
  });

  it("isolates external links from the opener", () => {
    render(<AionChatMarkdown text="[Reference](https://example.com/docs)" />);

    expect(screen.getByRole("link", { name: "Reference" })).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("keeps user-authored Markdown syntax as plain text", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "**literal**" }],
      createdAt: "2026-08-31T12:00:00.000Z",
    };
    const { container } = render(<AionChatMessage message={message} />);

    expect(container.querySelector("strong")).toBeNull();
    expect(screen.getByText("**literal**")).toBeTruthy();
  });

  it("allows a host to replace the assistant Markdown renderer", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "assistant",
      parts: [{ type: "text", text: "**custom**" }],
      createdAt: "2026-08-31T12:00:00.000Z",
    };
    render(
      <AionChatMessage
        message={message}
        markdownComponent={({ text }) => (
          <span data-testid="custom-markdown">{text}</span>
        )}
      />,
    );

    expect(screen.getByTestId("custom-markdown").textContent).toBe(
      "**custom**",
    );
  });
});
