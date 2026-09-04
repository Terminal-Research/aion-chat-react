/*
 * Scroll composition adapted from CopilotKit's controlled chat view:
 * packages/react-core/src/v2/components/chat/CopilotChatView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import {
  type HTMLAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AionChatMessage,
  type AionChatDataPartRenderers,
  type AionChatMessageProps,
} from "./AionChatMessage";
import {
  AionChatArtifact,
  type AionChatArtifactProps,
} from "./AionChatArtifact";
import {
  AionChatTaskActivity,
  type AionChatTaskActivityProps,
} from "./AionChatActivity";
import type { AionChatMarkdownComponent } from "./AionChatMarkdown";
import type { ChatArtifact, ChatMessage, ChatTask } from "./model";
import type { AionSlotValue } from "./slots";

/** One fully resolved item rendered by the transcript. */
export type AionChatTranscriptEntry =
  | {
      readonly type: "message";
      readonly message: ChatMessage;
      readonly streaming?: boolean;
    }
  | { readonly type: "artifact"; readonly artifact: ChatArtifact }
  | { readonly type: "task"; readonly task: ChatTask };

/** Props supplied to the transcript empty-state slot. */
export interface AionChatEmptyStateProps
  extends HTMLAttributes<HTMLDivElement> {
  readonly agentTitle?: string;
}

/** Typed replacement components accepted by the transcript. */
export interface AionChatTranscriptSlots {
  readonly message?: AionSlotValue<
    AionChatMessageProps,
    "message" | "streaming" | "markdownComponent" | "dataRenderers"
  >;
  readonly artifact?: AionSlotValue<
    AionChatArtifactProps,
    "artifact" | "markdownComponent" | "dataRenderers"
  >;
  readonly taskActivity?: AionSlotValue<AionChatTaskActivityProps, "task">;
  readonly emptyState?: AionSlotValue<AionChatEmptyStateProps, "agentTitle">;
  readonly markdown?: AionChatMarkdownComponent;
  readonly dataRenderers?: AionChatDataPartRenderers;
}

/** Props for the scrollable transcript component. */
export interface AionChatTranscriptProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly entries: readonly AionChatTranscriptEntry[];
  readonly agentTitle?: string;
  readonly slots?: AionChatTranscriptSlots;
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
      <p>
        {agentTitle
          ? `Start a conversation with ${agentTitle}.`
          : "Select an agent to begin."}
      </p>
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
  slots = {},
  className,
  ...props
}: AionChatTranscriptProps) {
  const MessageComponent = slots.message?.component ?? AionChatMessage;
  const ArtifactComponent = slots.artifact?.component ?? AionChatArtifact;
  const TaskActivityComponent =
    slots.taskActivity?.component ?? AionChatTaskActivity;
  const EmptyStateComponent =
    slots.emptyState?.component ?? AionChatEmptyState;
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
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
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
          <EmptyStateComponent
            {...slots.emptyState?.props}
            agentTitle={agentTitle}
          />
        ) : (
          entries.map((entry) => {
            if (entry.type === "message") {
              return (
                <MessageComponent
                  {...slots.message?.props}
                  key={`message:${entry.message.id}`}
                  message={entry.message}
                  streaming={entry.streaming}
                  markdownComponent={slots.markdown}
                  dataRenderers={slots.dataRenderers}
                />
              );
            }
            if (entry.type === "artifact") {
              return (
                <ArtifactComponent
                  {...slots.artifact?.props}
                  key={`artifact:${entry.artifact.id}`}
                  artifact={entry.artifact}
                  markdownComponent={slots.markdown}
                  dataRenderers={slots.dataRenderers}
                />
              );
            }
            return (
              <TaskActivityComponent
                {...slots.taskActivity?.props}
                key={`task:${entry.task.id}`}
                task={entry.task}
              />
            );
          })
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
