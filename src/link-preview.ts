/** Validated provider-owned content identifier returned with preview metadata. */
export type AionLinkPreviewEmbed =
  | { readonly kind: "Image"; readonly value: string }
  | { readonly kind: "YouTube" | "Vimeo" | "X"; readonly value: string };

/** Public page metadata displayed below a completed assistant response. */
export interface AionLinkPreview {
  readonly url: string;
  readonly title: string;
  readonly description?: string;
  readonly siteName?: string;
  readonly imageUrl?: string;
  readonly embed?: AionLinkPreviewEmbed;
}

/** Host-owned metadata boundary; returning undefined leaves the original link. */
export interface AionLinkPreviewSource {
  /** Resolve one public URL. Implementations should honor cancellation. */
  load(
    url: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AionLinkPreview | undefined>;
  /**
   * Resolve all URLs in one batch, in input order, omitting unavailable previews.
   * No link-count limit is imposed. Sources without this method use parallel load calls.
   */
  loadMany?(
    urls: readonly string[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<readonly AionLinkPreview[]>;
}

/** @internal Canonical web URL, excluding credentials and document fragments. */
export function linkPreviewUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) {
      return undefined;
    }
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

/** @internal Validate both GraphQL metadata and custom-source rendering input. */
export function normalizeLinkPreview(value: unknown): AionLinkPreview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const url = linkPreviewUrl(data.url);
  if (!url || typeof data.title !== "string" || !data.title.trim()) return undefined;
  const rawEmbed = data.embed && typeof data.embed === "object"
    ? data.embed as Record<string, unknown> : undefined;
  let embed: AionLinkPreviewEmbed | undefined;
  if (rawEmbed?.kind === "Image") {
    const imageUrl = linkPreviewUrl(rawEmbed.value);
    if (imageUrl) embed = { kind: "Image", value: imageUrl };
  } else if (typeof rawEmbed?.value === "string") {
    const { kind, value: id } = rawEmbed;
    if ((kind === "YouTube" && /^[\w-]{11}$/u.test(id)) ||
      ((kind === "Vimeo" || kind === "X") && /^\d{1,25}$/u.test(id))) {
      embed = { kind, value: id };
    }
  }
  return {
    url,
    title: data.title.trim().slice(0, 300),
    description: typeof data.description === "string"
      ? data.description.slice(0, 2000) : undefined,
    siteName: typeof data.siteName === "string" ? data.siteName.slice(0, 100) : undefined,
    imageUrl: linkPreviewUrl(data.imageUrl),
    embed,
  };
}

/** @internal Canonicalize and deduplicate a URL batch without truncating it. */
export function linkPreviewUrls(values: readonly string[]): string[] {
  return [...new Set(values.flatMap((value) => {
    const url = linkPreviewUrl(value);
    return url ? [url] : [];
  }))];
}

/** @internal Validate batch results and omit individual unavailable previews. */
export function normalizeLinkPreviews(value: unknown): AionLinkPreview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const preview = normalizeLinkPreview(item);
    return preview ? [preview] : [];
  });
}
