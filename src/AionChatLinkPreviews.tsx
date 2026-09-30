import { useEffect, useMemo, useState } from "react";

import { AionChatDialog } from "./AionChatDialog";
import {
  type AionLinkPreview,
  type AionLinkPreviewSource,
  normalizeLinkPreview,
} from "./link-preview";
import { responseLinkUrls } from "./markdown-links";
import type { ChatPart } from "./model";

/** Props for the optional completed-response preview footer. */
export interface AionChatLinkPreviewsProps {
  readonly parts: readonly ChatPart[];
  readonly source: AionLinkPreviewSource;
}

/** Loads each URL once per mounted response, preserving Markdown order. */
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
    const previews: (AionLinkPreview | undefined)[] = Array.from({ length: urls.length }, () => undefined);
    let next = 0;
    async function worker() {
      while (!controller.signal.aborted && next < urls.length) {
        const index = next++;
        try {
          previews[index] = normalizeLinkPreview(await source.load(urls[index]!, {
            signal: controller.signal,
          }));
        } catch {
          // An unavailable preview never changes the original message or link.
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker))
      .then(() => {
        if (!controller.signal.aborted) {
          setResult({ urls, source, previews: previews.filter(
            (preview): preview is AionLinkPreview => Boolean(preview),
          ) });
        }
      });
    return () => controller.abort();
  }, [urls, source]);

  if (result?.urls !== urls || result.source !== source || !result.previews.length) {
    return null;
  }
  return (
    <section className="aion-chat__link-previews" aria-label="Link previews">
      {result.previews.map((preview, index) => (
        <LinkPreviewCard key={`${urls[index]}:${preview.url}`} preview={preview} />
      ))}
    </section>
  );
}

function LinkPreviewCard({ preview }: { readonly preview: AionLinkPreview }) {
  const [expanded, setExpanded] = useState(false);
  const [failedImage, setFailedImage] = useState<string>();
  const content = (
    <>
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
    </>
  );
  return (
    <div className="aion-chat__link-preview">
      {preview.embed ? (
        <button
          className="aion-chat__link-preview-card"
          type="button"
          aria-label={`Expand ${preview.title}`}
          aria-haspopup="dialog"
          onClick={() => setExpanded(true)}
        >{content}</button>
      ) : (
        <a className="aion-chat__link-preview-card" href={preview.url}
          target="_blank" rel="noopener noreferrer">{content}</a>
      )}
      {expanded && preview.embed && (
        <AionChatDialog title={preview.title} closeLabel="Close preview"
          className="aion-chat__embed-dialog" onRequestClose={() => setExpanded(false)}>
          <ExpandedPreview preview={preview} />
          <a className="aion-chat__embed-original" href={preview.url}
            target="_blank" rel="noopener noreferrer">Open original</a>
        </AionChatDialog>
      )}
    </div>
  );
}

/** Only fixed provider templates receive the already-validated content ID. */
function ExpandedPreview({ preview }: { readonly preview: AionLinkPreview }) {
  const embed = preview.embed!;
  if (embed.kind === "Image") {
    return <img className="aion-chat__embed-image" src={embed.value}
      alt={preview.title} referrerPolicy="no-referrer" />;
  }
  if (embed.kind === "X") {
    // Match the current widgets.js session capability. Without this hint, X's
    // standalone frame requests fail credentialed CORS. Keep provider details
    // here; opaque srcDoc wrappers also break the nested frame's origin.
    const query = new URLSearchParams({
      id: embed.value,
      dnt: "true",
      features: btoa(JSON.stringify({
        tfw_refsrc_session: { bucket: "on", version: null },
      })),
    });
    return <iframe className="aion-chat__embed-frame aion-chat__embed-frame--post"
      title={preview.title}
      src={`https://platform.twitter.com/embed/Tweet.html?${query.toString()}`}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" />;
  }
  const src = embed.kind === "YouTube"
    ? `https://www.youtube-nocookie.com/embed/${embed.value}`
    : `https://player.vimeo.com/video/${embed.value}`;
  return <iframe className="aion-chat__embed-frame" title={preview.title} src={src}
    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin" />;
}
