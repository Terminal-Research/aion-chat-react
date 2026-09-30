import { describe, expect, it } from "vitest";

import { responseLinkUrls } from "./markdown-links";

describe("responseLinkUrls", () => {
  it("uses Markdown semantics, keeps first appearance, and excludes explicit files", () => {
    const text = [
      "[First][guide] and https://example.com/plain.",
      "<https://example.com/auto> then [same](https://example.com/plain#section)",
      "[guide]: https://example.com/guide",
      "`https://example.com/code`",
      "```\nhttps://example.com/fence\n```",
      "![inline](https://example.com/inline.png)",
      "[File](https://example.com/file.png)",
      "[Bad](javascript:alert) [Private](https://user:pass@example.com/secret)",
    ].join("\n\n");
    expect(responseLinkUrls([
      { type: "text", text },
      { type: "file", file: { url: "https://example.com/file.png" } },
      { type: "text", text: "[Second](https://example.com/second)" },
    ])).toEqual([
      "https://example.com/guide", "https://example.com/plain",
      "https://example.com/auto", "https://example.com/second",
    ]);
  });
});
