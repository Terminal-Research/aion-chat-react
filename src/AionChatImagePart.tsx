import { type ReactNode, useState } from "react";

import { AionChatDialog } from "./AionChatDialog";

interface AionChatImagePartProps {
  readonly url: string;
  readonly name: string;
  readonly fallback: ReactNode;
}

/** Previews a validated image URL and expands it in the shared themed dialog. */
export function AionChatImagePart({
  url,
  name,
  fallback,
}: AionChatImagePartProps) {
  const [view, setView] = useState<"preview" | "expanded" | "failed">("preview");

  return (
    <div className="aion-chat__image-part">
      {view === "failed" ? fallback : (
        <>
          <button
            className="aion-chat__image-preview"
            type="button"
            aria-label={`Expand ${name}`}
            aria-haspopup="dialog"
            onClick={() => setView("expanded")}
          >
            <img
              src={url}
              alt={name}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setView("failed")}
            />
          </button>
          {view === "expanded" && (
            <AionChatDialog
              className="aion-chat__image-dialog"
              title={name}
              closeLabel="Close image"
              onRequestClose={() => setView("preview")}
            >
              <div className="aion-chat__image-dialog-body">
                <img
                  src={url}
                  alt={name}
                  referrerPolicy="no-referrer"
                  onError={() => setView("failed")}
                />
              </div>
            </AionChatDialog>
          )}
        </>
      )}
    </div>
  );
}
