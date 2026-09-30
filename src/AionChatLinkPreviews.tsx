import { useEffect, useMemo, useState } from "react";

import {
  type AionLinkPreview,
  type AionLinkPreviewSource,
  normalizeLinkPreviews,
} from "./link-preview";
import { responseLinkUrls } from "./markdown-links";
import type { ChatPart } from "./model";

/** Props for the optional completed-response preview footer. */
export interface AionChatLinkPreviewsProps {
  readonly parts: readonly ChatPart[];
  readonly source: AionLinkPreviewSource;
}

/** Loads all discovered URLs together, preserving Markdown order. */
export function AionChatLinkPreviews({ parts, source }: AionChatLinkPreviewsProps) {
  const urls = useMemo(() => responseLinkUrls(parts), [parts]);
  const [result, setResult] = useState<{
    urls: readonly string[];
    source: AionLinkPreviewSource;
    previews: readonly AionLinkPreview[];
  }>();

  useEffect(() => {
    if (!urls.length) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function loadPreviews() {
      try {
        const previews = source.loadMany
          ? await source.loadMany(urls, options)
          : await Promise.all(urls.map(async (url) => {
            try {
              return await source.load(url, options);
            } catch {
              return undefined;
            }
          }));
        if (!controller.signal.aborted) {
          setResult({ urls, source, previews: normalizeLinkPreviews(previews) });
        }
      } catch {
        // Unavailable metadata leaves the original message and links usable.
      }
    }
    void loadPreviews();
    return () => controller.abort();
  }, [urls, source]);

  if (result?.urls !== urls || result.source !== source || !result.previews.length) {
    return null;
  }
  return (
    <section className="aion-chat__link-previews" aria-label="Link previews">
      {result.previews.map((preview) => (
        <LinkPreviewCard key={preview.url} preview={preview} />
      ))}
    </section>
  );
}

function LinkPreviewCard({ preview }: { readonly preview: AionLinkPreview }) {
  const [failedImage, setFailedImage] = useState<string>();
  return (
    <div className="aion-chat__link-preview">
      <a className="aion-chat__link-preview-card" href={preview.url}
        target="_blank" rel="noopener noreferrer">
        {preview.imageUrl && failedImage !== preview.imageUrl && (
          <img
            className="aion-chat__link-preview-image"
            src={preview.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(preview.imageUrl)}
          />
        )}
        <span className="aion-chat__link-preview-details">
          <span className="aion-chat__link-preview-site">
            {preview.siteName || new URL(preview.url).hostname}
          </span>
          <span className="aion-chat__link-preview-title">{preview.title}</span>
          {preview.description && (
            <span className="aion-chat__link-preview-description">{preview.description}</span>
          )}
        </span>
      </a>
    </div>
  );
}
