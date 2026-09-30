import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionChatArtifact } from "./AionChatArtifact";
import { AionChatFilePart, AionChatMessage } from "./AionChatMessage";
import { AionChatTheme } from "./AionChatTheme";
import type { ChatFilePart, ChatPart } from "./model";

afterEach(cleanup);

const IMAGE: ChatFilePart = {
  type: "file",
  file: {
    name: "Chart.png",
    mediaType: "image/png",
    url: "https://files.example.test/chart?signature=first",
  },
};

describe("image file parts", () => {
  it.each(["message", "artifact"])(
    "preserves text, image, text sections in a %s",
    (kind) => {
      const parts: readonly ChatPart[] = [
        { type: "text", text: "Before **the image**." },
        IMAGE,
        { type: "text", text: "After the image." },
      ];
      const { container } = render(kind === "message" ? (
        <AionChatMessage message={{
          id: "message-1", role: "assistant", parts,
          createdAt: "2026-09-29T12:00:00Z",
        }} />
      ) : (
        <AionChatArtifact artifact={{
          id: "artifact-1", artifactId: "aion:stream-delta", parts,
          taskId: "task-1", contextId: "context-1", lastChunk: true,
        }} />
      ));
      const content = container.querySelector(`.aion-chat__${kind}-content`)!;
      expect(content.children).toHaveLength(3);
      expect(content.children[0]?.textContent).toBe("Before the image.");
      expect(content.children[0]?.querySelector("strong")?.textContent)
        .toBe("the image");
      expect(within(content.children[1] as HTMLElement)
        .getByRole("img", { name: "Chart.png" }).getAttribute("src"))
        .toBe(IMAGE.file.url);
      expect(content.children[2]?.textContent).toBe("After the image.");
    },
  );

  it.each([
    { name: "uppercase image MIME type", file: { url: "/chart", mediaType: "IMAGE/PNG" }, preview: true },
    { name: "non-image file", file: { url: "/chart.pdf", mediaType: "application/pdf" }, preview: false },
    { name: "missing MIME type", file: { url: "/chart.png" }, preview: false },
    { name: "byte-only image", file: { bytes: "aW1hZ2U=", mediaType: "image/png" }, preview: false },
    { name: "executable URL", file: { url: "javascript:alert(1)", mediaType: "image/png" }, preview: false },
    { name: "data URL", file: { url: "data:image/png;base64,aW1hZ2U=", mediaType: "image/png" }, preview: false },
  ])("handles $name without guessing from the filename", ({ file, preview }) => {
    render(<AionChatFilePart part={{ type: "file", file }} />);
    expect(Boolean(screen.queryByRole("img"))).toBe(preview);
    if (!preview && file.url?.startsWith("/")) {
      expect(screen.getByRole("link").getAttribute("href")).toBe(file.url);
    } else if (!preview) {
      expect(screen.queryByRole("link")).toBeNull();
    }
  });

  it("falls back to the file link and resets the preview for a replacement URL", () => {
    const view = render(<AionChatFilePart part={IMAGE} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Chart.png" }).getAttribute("href"))
      .toBe(IMAGE.file.url);
    view.rerender(<AionChatFilePart part={{ ...IMAGE }} />);
    expect(screen.queryByRole("img")).toBeNull();

    view.rerender(<AionChatFilePart part={{
      ...IMAGE, file: { ...IMAGE.file, url: "/replacement.png" },
    }} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/replacement.png");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("uses the theme portal and closes a preview when its URL changes", () => {
    const renderImage = (part: ChatFilePart) => (
      <AionChatTheme><AionChatFilePart part={part} /></AionChatTheme>
    );
    const view = render(renderImage(IMAGE));
    fireEvent.click(screen.getByRole("button", { name: "Expand Chart.png" }));
    const dialog = screen.getByRole("dialog", { name: "Chart.png" });
    expect(dialog.closest("[data-aion-chat-portal]")).toBeTruthy();
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe(IMAGE.file.url);

    view.rerender(renderImage({
      ...IMAGE, file: { ...IMAGE.file, url: "/updated.png" },
    }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe("/updated.png");
  });

  it("falls back to the file link if the expanded image fails to load", () => {
    render(<AionChatFilePart part={IMAGE} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Chart.png" }));
    fireEvent.error(within(screen.getByRole("dialog")).getByRole("img"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Chart.png" })).toBeTruthy();
  });
});
