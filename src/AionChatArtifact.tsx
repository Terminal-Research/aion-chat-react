import type { HTMLAttributes } from "react";

import { AionChatParts } from "./AionChatMessage";
import type { ChatArtifact } from "./model";

/** Props supplied to a transcript artifact slot. */
export interface AionChatArtifactProps extends HTMLAttributes<HTMLElement> {
  readonly artifact: ChatArtifact;
}

/** Default transcript presentation for one streamed or completed artifact. */
export function AionChatArtifact({
  artifact,
  className,
  ...props
}: AionChatArtifactProps) {
  return (
    <article
      className={["aion-chat__artifact", className].filter(Boolean).join(" ")}
      data-artifact-id={artifact.id}
      {...props}
    >
      {artifact.name && artifact.name !== artifact.artifactId && (
        <div className="aion-chat__artifact-name">{artifact.name}</div>
      )}
      <div className="aion-chat__artifact-content">
        <AionChatParts parts={artifact.parts} />
      </div>
    </article>
  );
}
