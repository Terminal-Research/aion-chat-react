/*
 * Scroll composition adapted from CopilotKit's controlled chat view:
 * packages/react-core/src/v2/components/chat/CopilotChatView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import {
  type ComponentType,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { AionChatMessage, type AionChatMessageProps } from "./AionChatMessage";
import { AionChatArtifact, type AionChatArtifactProps } from "./AionChatArtifact";
import type { AionChatMarkdownComponent } from "./AionChatMarkdown";
import type { ChatArtifact, ChatMessage } from "./model";

/** One fully resolved item rendered by the transcript. */
export type AionChatTranscriptEntry =
  | { readonly type: "message"; readonly message: ChatMessage }
  | { readonly type: "artifact"; readonly artifact: ChatArtifact };

/** Props supplied to the transcript empty-state slot. */
export interface AionChatEmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  readonly agentTitle?: string;
}

/** Props for the scrollable transcript component. */
export interface AionChatTranscriptProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly entries: readonly AionChatTranscriptEntry[];
  readonly agentTitle?: string;
  readonly messageComponent?: ComponentType<AionChatMessageProps>;
  readonly artifactComponent?: ComponentType<AionChatArtifactProps>;
  readonly emptyStateComponent?: ComponentType<AionChatEmptyStateProps>;
  readonly markdownComponent?: AionChatMarkdownComponent;
}

/** Default empty state shown before a conversation begins. */
export function AionChatEmptyState({
  agentTitle,
  className,
  ...props
}: AionChatEmptyStateProps) {
  return (
    <div
      className={["aion-chat__empty", className].filter(Boolean).join(" ")}
      {...props}
    >
      <p>{agentTitle ? `Start a conversation with ${agentTitle}.` : "Select an agent to begin."}</p>
    </div>
  );
}

/**
 * Renders normalized messages and follows new output only while the reader is
 * already pinned near the bottom.
 */
export function AionChatTranscript({
  entries,
  agentTitle,
  messageComponent: MessageComponent = AionChatMessage,
  artifactComponent: ArtifactComponent = AionChatArtifact,
  emptyStateComponent: EmptyStateComponent = AionChatEmptyState,
  markdownComponent,
  className,
  ...props
}: AionChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
    pinnedRef.current = true;
    setIsPinned(true);
  }, []);

  useEffect(() => {
    if (pinnedRef.current) {
      scrollToBottom();
    }
  }, [entries, scrollToBottom]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nextPinned = distance <= 24;
    pinnedRef.current = nextPinned;
    setIsPinned(nextPinned);
  }, []);

  return (
    <div className="aion-chat__transcript-frame">
      <div
        ref={scrollRef}
        className={["aion-chat__transcript", className]
          .filter(Boolean)
          .join(" ")}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        {...props}
      >
        {entries.length === 0 ? (
          <EmptyStateComponent agentTitle={agentTitle} />
        ) : (
          entries.map((entry) =>
            entry.type === "message" ? (
              <MessageComponent
                key={`message:${entry.message.id}`}
                message={entry.message}
                markdownComponent={markdownComponent}
              />
            ) : (
              <ArtifactComponent
                key={`artifact:${entry.artifact.id}`}
                artifact={entry.artifact}
                markdownComponent={markdownComponent}
              />
            ),
          )
        )}
      </div>
      {!isPinned && (
        <button
          className="aion-chat__scroll-button"
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
        >
          ↓
        </button>
      )}
    </div>
  );
}
