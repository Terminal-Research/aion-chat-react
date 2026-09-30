import { AionChatLinkPreviews } from "./AionChatLinkPreviews";
import { type HTMLAttributes, memo } from "react";

import type { AionLinkPreviewSource } from "./link-preview";

import {
  AionChatMarkdown,
  type AionChatMarkdownComponent,
} from "./AionChatMarkdown";
import {
  AionChatParts,
  type AionChatDataPartRenderers,
} from "./AionChatMessage";
import { getChatText, type ChatArtifact } from "./model";
import { AionChatResponseActions } from "./AionChatResponseActions";
import { AionShimmerText } from "./motion/AionShimmerText";
import { AionStreamingText } from "./motion/AionStreamingText";

/** Props supplied to a transcript artifact slot. */
export interface AionChatArtifactProps extends HTMLAttributes<HTMLElement> {
  readonly artifact: ChatArtifact;
  readonly markdownComponent?: AionChatMarkdownComponent;
  readonly dataRenderers?: AionChatDataPartRenderers;
  /** Optional public metadata source for completed-response previews. */
  readonly linkPreviewSource?: AionLinkPreviewSource;
}

/** Default transcript presentation for one streamed or completed artifact. */
export const AionChatArtifact = memo(function AionChatArtifact({
  artifact,
  markdownComponent = AionChatMarkdown,
  dataRenderers,
  linkPreviewSource,
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
          {artifact.lastChunk && linkPreviewSource && (
            <AionChatLinkPreviews parts={artifact.parts} source={linkPreviewSource} />
          )}
          {artifact.lastChunk ? (
            <AionChatResponseActions
              text={getChatText(artifact.parts)}
              metadata={{
                contextId: artifact.contextId,
                taskId: artifact.taskId,
              }}
            />
          ) : null}
        </>
      )}
    </article>
  );
});
