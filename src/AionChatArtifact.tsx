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
import { AionShimmerText } from "./motion/AionShimmerText";
import { AionStreamingText } from "./motion/AionStreamingText";

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
  const isThinking = artifact.artifactId === "aion:thinking-delta";
  const streamPart =
    artifact.artifactId === "aion:stream-delta" &&
    artifact.parts.length === 1 &&
    artifact.parts[0]?.type === "text"
      ? artifact.parts[0]
      : undefined;
  const content = streamPart ? (
    <AionStreamingText
      text={streamPart.text}
      markdownComponent={markdownComponent}
    />
  ) : (
    <AionChatParts
      parts={artifact.parts}
      textComponent={markdownComponent}
      dataRenderers={dataRenderers}
    />
  );

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
          <summary>
            <AionShimmerText
              text={artifact.name ?? "Thinking"}
              active={!artifact.lastChunk}
            />
          </summary>
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
