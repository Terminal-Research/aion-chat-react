import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AionChatArtifact } from "./AionChatArtifact";
import { AionChatMessage } from "./AionChatMessage";
import { AionChatLinkPreviews } from "./AionChatLinkPreviews";
import { type AionLinkPreview, type AionLinkPreviewSource, normalizeLinkPreview } from "./link-preview";
import type { ChatMessage, ChatPart } from "./model";

afterEach(cleanup);
const parts: readonly ChatPart[] = [{ type: "text", text: "See https://example.com/one" }];
const message: ChatMessage = {
  id: "reply", role: "assistant", parts, createdAt: "2026-09-29T12:00:00Z",
};
const preview: AionLinkPreview = { url: "https://example.com/one", title: "Example page" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("completed response previews", () => {
  it("waits until an assistant response finishes and leaves its content intact", async () => {
    const source = { load: vi.fn().mockResolvedValue(preview) };
    const view = render(<AionChatMessage message={message} streaming linkPreviewSource={source} />);
    expect(source.load).not.toHaveBeenCalled();
    view.rerender(<AionChatMessage message={message} linkPreviewSource={source} />);
    const footer = await screen.findByRole("region", { name: "Link previews" });
    expect(within(footer).getByRole("link").textContent).toContain("Example page");
    expect(screen.getByRole("link", { name: "https://example.com/one" })).toBeTruthy();
    expect(source.load).toHaveBeenCalledTimes(1);
  });

  it("does not resolve user, thinking, or unfinished artifact links", () => {
    const source = { load: vi.fn() };
    render(<AionChatMessage message={{ ...message, role: "user" }} linkPreviewSource={source} />);
    render(<AionChatArtifact artifact={{ id: "a", taskId: "task", contextId: "context", artifactId: "aion:thinking-delta", parts, lastChunk: true }} linkPreviewSource={source} />);
    render(<AionChatArtifact artifact={{ id: "b", taskId: "task", contextId: "context", artifactId: "result", parts, lastChunk: false }} linkPreviewSource={source} />);
    expect(source.load).not.toHaveBeenCalled();
  });

  it("renders completed artifact links", async () => {
    render(<AionChatArtifact artifact={{ id: "a", taskId: "task", contextId: "context", artifactId: "result", parts, lastChunk: true }}
      linkPreviewSource={{ load: () => Promise.resolve(preview) }} />);
    expect(await screen.findByRole("region", { name: "Link previews" })).toBeTruthy();
  });

  it("preserves discovery order despite out-of-order results and missing previews", async () => {
    const first = deferred<AionLinkPreview>();
    const source = { load: vi.fn((url: string) => url.endsWith("one")
      ? first.promise : url.endsWith("missing") ? Promise.reject(new Error("offline"))
        : Promise.resolve({ ...preview, url, title: "Second page" })) };
    render(<AionChatLinkPreviews parts={[{ type: "text", text:
      "https://example.com/one https://example.com/missing https://example.com/two" }]} source={source} />);
    await act(async () => { first.resolve(preview); await first.promise; });
    const links = within(await screen.findByRole("region")).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href")))
      .toEqual([preview.url, "https://example.com/two"]);
  });

  it("aborts departed responses and ignores late results", async () => {
    const pending = deferred<AionLinkPreview>();
    const source = { load: vi.fn<import("./link-preview").AionLinkPreviewSource["load"]>().mockReturnValue(pending.promise) };
    const view = render(<AionChatLinkPreviews parts={parts} source={source} />);
    const signal = source.load.mock.calls[0]![1]!.signal as AbortSignal;
    view.rerender(<AionChatLinkPreviews parts={[]} source={source} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(preview); await pending.promise; });
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("loads every discovered URL in one batch without a card-count limit", async () => {
    const urls = Array.from({ length: 25 }, (_, index) => `https://example.com/${index}`);
    const source = {
      load: vi.fn(),
      loadMany: vi.fn().mockResolvedValue(urls.map((url) => ({ ...preview, url }))),
    };
    render(<AionChatLinkPreviews parts={[{ type: "text", text: [...urls, urls[0]].join(" ") }]}
      source={source} />);
    const links = within(await screen.findByRole("region")).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(urls);
    expect(source.loadMany).toHaveBeenCalledTimes(1);
    expect(source.loadMany).toHaveBeenCalledWith(urls, expect.anything());
    expect(source.load).not.toHaveBeenCalled();
  });

  it("aborts a departed batch and ignores its late results", async () => {
    const pending = deferred<readonly AionLinkPreview[]>();
    const source = {
      load: vi.fn(),
      loadMany: vi.fn<NonNullable<AionLinkPreviewSource["loadMany"]>>().mockReturnValue(pending.promise),
    };
    const view = render(<AionChatLinkPreviews parts={parts} source={source} />);
    const signal = source.loadMany.mock.calls[0]![1]!.signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve([preview]); await pending.promise; });
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("leaves the original message usable when a batch fails", async () => {
    const source = { load: vi.fn(), loadMany: vi.fn().mockRejectedValue(new Error("offline")) };
    render(<AionChatMessage message={message} linkPreviewSource={source} />);
    expect(await screen.findByRole("link", { name: "https://example.com/one" })).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
    expect(source.loadMany).toHaveBeenCalledTimes(1);
    expect(source.load).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "Image" as const, value: "https://example.com/photo.jpg" },
    { kind: "YouTube" as const, value: "dQw4w9WgXcQ" },
    { kind: "Vimeo" as const, value: "12345" },
    { kind: "X" as const, value: "12345" },
  ])("opens $kind preview cards as ordinary links in a new window", async (embed) => {
    render(<AionChatLinkPreviews parts={parts}
      source={{ load: () => Promise.resolve({ ...preview, embed }) }} />);
    const footer = await screen.findByRole("region");
    const link = within(footer).getByRole("link", { name: /Example page/ });
    expect(link.getAttribute("href")).toBe(preview.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(footer).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("keeps the card when a thumbnail fails", async () => {
    render(<AionChatLinkPreviews parts={parts} source={{ load: () => Promise.resolve({
      ...preview, imageUrl: "https://example.com/broken.png",
    }) }} />);
    const footer = await screen.findByRole("region");
    fireEvent.error(footer.querySelector("img")!);
    expect(footer.querySelector("img")).toBeNull();
    expect(within(footer).getByRole("link").getAttribute("href")).toBe(preview.url);
  });

  it("rejects executable URLs and arbitrary iframe content from custom sources", () => {
    expect(normalizeLinkPreview({ ...preview, url: "javascript:alert(1)" })).toBeUndefined();
    for (const embed of [
      { kind: "X", value: '123" onload=alert(1)' },
      { kind: "YouTube", value: "https://evil.test" },
      { kind: "Image", value: "data:text/html,<script>alert(1)</script>" },
      { kind: "HTML", value: "<script>alert(1)</script>" },
    ]) {
      expect(normalizeLinkPreview({ ...preview, embed })?.embed).toBeUndefined();
    }
  });
});
