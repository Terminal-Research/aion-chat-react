import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { linkPreviewUrl } from "./link-preview";
import type { ChatPart } from "./model";

const parser = unified().use(remarkParse).use(remarkGfm);

function walk(node: Root | RootContent, visit: (node: RootContent) => void) {
  if (node.type !== "root") visit(node);
  if ("children" in node) {
    for (const child of node.children) walk(child, visit);
  }
}

/** @internal Discover actual Markdown links, excluding code and inline images. */
export function responseLinkUrls(parts: readonly ChatPart[]): readonly string[] {
  const explicitFiles = new Set(parts.flatMap((part) =>
    part.type === "file" ? [linkPreviewUrl(part.file.url)] : []));
  const urls = new Set<string>();
  for (const part of parts) {
    if (part.type !== "text") continue;
    const tree = parser.parse(part.text);
    const definitions = new Map<string, string>();
    walk(tree, (node) => {
      if (node.type === "definition" && !definitions.has(node.identifier)) {
        definitions.set(node.identifier, node.url);
      }
    });
    walk(tree, (node) => {
      const candidate = node.type === "link" ? node.url
        : node.type === "linkReference" ? definitions.get(node.identifier) : undefined;
      const url = linkPreviewUrl(candidate);
      if (url && !explicitFiles.has(url)) urls.add(url);
    });
  }
  return [...urls];
}
