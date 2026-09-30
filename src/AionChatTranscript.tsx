import { isWelcomeRequest } from "./welcome";
/*
 * Scroll composition adapted from CopilotKit's controlled chat view:
 * packages/react-core/src/v2/components/chat/CopilotChatView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import {
  type HTMLAttributes,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AionLinkPreviewSource } from "./link-preview";

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
import {
  getChatText,
  type ChatArtifact,
  type ChatMessage,
  type ChatPart,
  type ChatTask,
} from "./model";
import type { AionSlotValue } from "./slots";
import type { AionChatResponseMetadata } from "./AionChatResponseActions";

/** One fully resolved item rendered by the transcript. */
export type AionChatTranscriptEntry =
  | {
      readonly type: "message";
      readonly message: ChatMessage;
      readonly streaming?: boolean;
      readonly responseMetadata?: AionChatResponseMetadata;
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
    | "message"
    | "streaming"
    | "responseMetadata"
    | "markdownComponent"
    | "dataRenderers"
    | "linkPreviewSource"
  >;
  readonly artifact?: AionSlotValue<
    AionChatArtifactProps,
    "artifact" | "markdownComponent" | "dataRenderers" | "linkPreviewSource"
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
  readonly linkPreviewSource?: AionLinkPreviewSource;
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

/** Matches only complete text with the same task and context identity. */
function textResponseKey(
  taskId: string | undefined,
  contextId: string | undefined,
  parts: readonly ChatPart[],
): string | undefined {
  if (!taskId || !contextId || parts.some((part) => part.type !== "text")) {
    return undefined;
  }
  const text = getChatText(parts);
  return text ? JSON.stringify([contextId, taskId, text]) : undefined;
}

/**
 * Shows one copy of an assistant reply represented by both a message and its
 * completed stream artifact. Use the first transcript position, so restored
 * history stays chronological even when artifacts arrive newest first.
 * Structured output and unrelated messages remain separate entries.
 */
function visibleTranscriptEntries(
  entries: readonly AionChatTranscriptEntry[],
): readonly AionChatTranscriptEntry[] {
  const responses = new Map<
    string,
    Extract<AionChatTranscriptEntry, { type: "artifact" }>
  >();
  for (const entry of entries) {
    if (entry.type !== "artifact" || !entry.artifact.lastChunk) continue;
    const { artifact } = entry;
    if (artifact.artifactId !== "aion:stream-delta" &&
        artifact.artifactId !== "stream_delta") continue;
    const key = textResponseKey(
      artifact.taskId, artifact.contextId, artifact.parts,
    );
    if (key) responses.set(key, entry);
  }
  const renderedArtifacts = new Set<string>();
  return entries.flatMap((entry) => {
    if (entry.type === "message" && isWelcomeRequest(entry.message)) return [];
    const key = entry.type === "message" && entry.message.role === "assistant"
      ? textResponseKey(
          entry.message.taskId ?? entry.responseMetadata?.taskId,
          entry.message.contextId ?? entry.responseMetadata?.contextId,
          entry.message.parts,
        )
      : undefined;
    const artifact = entry.type === "artifact"
      ? entry : key ? responses.get(key) : undefined;
    if (!artifact) return [entry];
    if (renderedArtifacts.has(artifact.artifact.id)) return [];
    renderedArtifacts.add(artifact.artifact.id);
    return [artifact];
  });
}

/**
 * Renders each logical response once and follows new output only while the
 * reader is already pinned near the bottom, including delayed layout changes.
 * Native scroll anchoring is reserved for reading older output.
 */
export function AionChatTranscript({
  entries: allEntries,
  linkPreviewSource,
  agentTitle,
  slots = {},
  className,
  ...props
}: AionChatTranscriptProps) {
  const entries = useMemo(
    () => visibleTranscriptEntries(allEntries),
    [allEntries],
  );
  const MessageComponent = slots.message?.component ?? AionChatMessage;
  const ArtifactComponent = slots.artifact?.component ?? AionChatArtifact;
  const TaskActivityComponent =
    slots.taskActivity?.component ?? AionChatTaskActivity;
  const EmptyStateComponent =
    slots.emptyState?.component ?? AionChatEmptyState;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const autoScrollTopRef = useRef(0);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
    autoScrollTopRef.current = element.scrollTop;
    pinnedRef.current = true;
    setIsPinned(true);
  }, []);

  useLayoutEffect(() => {
    if (pinnedRef.current) {
      scrollToBottom();
    }
  }, [entries, scrollToBottom]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;
    // Restored entries, images, fonts, and composer resizing can change the
    // bottom position after React has committed the message list.
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom();
    });
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    // A delayed event from our own scroll must not unpin a changing layout.
    if (pinnedRef.current && element.scrollTop === autoScrollTopRef.current) {
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
        data-scroll-pinned={isPinned}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        {...props}
      >
        <div ref={contentRef} className="aion-chat__transcript-content">
          {entries.length === 0 ? (
            <EmptyStateComponent
              {...slots.emptyState?.props}
              agentTitle={agentTitle}
            />
          ) : (
            entries.map((entry) => {
              if (entry.type === "message") {
                return (
                  <div
                    key={`message:${entry.message.id}`}
                    className="aion-chat__transcript-entry"
                    data-entry-type="message"
                    data-entry-id={entry.message.id}
                  >
                    <MessageComponent
                      {...slots.message?.props}
                      message={entry.message}
                      streaming={entry.streaming}
                      responseMetadata={entry.responseMetadata}
                      markdownComponent={slots.markdown}
                      dataRenderers={slots.dataRenderers}
                      linkPreviewSource={linkPreviewSource}
                    />
                  </div>
                );
              }
              if (entry.type === "artifact") {
                return (
                  <div
                    key={`artifact:${entry.artifact.id}`}
                    className="aion-chat__transcript-entry"
                    data-entry-type="artifact"
                    data-entry-id={entry.artifact.id}
                  >
                    <ArtifactComponent
                      {...slots.artifact?.props}
                      artifact={entry.artifact}
                      markdownComponent={slots.markdown}
                      dataRenderers={slots.dataRenderers}
                      linkPreviewSource={linkPreviewSource}
                    />
                  </div>
                );
              }
              return (
                <div
                  key={`task:${entry.task.id}`}
                  className="aion-chat__transcript-entry"
                  data-entry-type="task"
                  data-entry-id={entry.task.id}
                >
                  <TaskActivityComponent
                    {...slots.taskActivity?.props}
                    task={entry.task}
                  />
                </div>
              );
            })
          )}
        </div>
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
