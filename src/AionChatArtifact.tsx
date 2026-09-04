import { type HTMLAttributes, memo } from "react";

import {
  AionChatMarkdown,
  type AionChatMarkdownComponent,
} from "./AionChatMarkdown";
import {
  AionChatParts,
  type AionChatDataPartRenderers,
} from "./AionChatMessage";
import type { ChatArtifact } from "./model";

/** Props supplied to a transcript artifact slot. */
export interface AionChatArtifactProps extends HTMLAttributes<HTMLElement> {
  readonly artifact: ChatArtifact;
  readonly markdownComponent?: AionChatMarkdownComponent;
  readonly dataRenderers?: AionChatDataPartRenderers;
}

/** Default transcript presentation for one streamed or completed artifact. */
export const AionChatArtifact = memo(function AionChatArtifact({
  artifact,
  markdownComponent = AionChatMarkdown,
  dataRenderers,
  className,
  ...props
}: AionChatArtifactProps) {
  const content = (
    <AionChatParts
      parts={artifact.parts}
      textComponent={markdownComponent}
      dataRenderers={dataRenderers}
    />
  );
  const isThinking = artifact.artifactId === "aion:thinking-delta";

  return (
    <article
      className={[
        "aion-chat__artifact",
        isThinking && "aion-chat__artifact--thinking",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-artifact-id={artifact.id}
      {...props}
    >
      {isThinking ? (
        <details open={!artifact.lastChunk}>
          <summary>{artifact.name ?? "Thinking"}</summary>
          <div className="aion-chat__artifact-content">{content}</div>
        </details>
      ) : (
        <>
          {artifact.name && artifact.name !== artifact.artifactId && (
            <div className="aion-chat__artifact-name">{artifact.name}</div>
          )}
          {artifact.description && (
            <div className="aion-chat__artifact-description">
              {artifact.description}
            </div>
          )}
          <div className="aion-chat__artifact-content">
            {artifact.parts.length > 0
              ? content
              : "This artifact has no previewable content."}
          </div>
        </>
      )}
    </article>
  );
});
