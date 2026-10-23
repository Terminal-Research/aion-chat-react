import { isWelcomeRequest } from "./welcome";
import { type HTMLAttributes, useMemo } from "react";

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
  type ChatArtifact,
  type ChatMessage,
  type ChatTask,
  type ChatTurn,
} from "./model";
import type { AionSlotValue } from "./slots";
import type { AionChatResponseMetadata } from "./AionChatResponseActions";
import { useTranscriptScroll } from "./useTranscriptScroll";

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
  /** New turns reserve response space; remount when changing conversations. */
  readonly activeTurn?: ChatTurn;
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

type MessageEntry = Extract<AionChatTranscriptEntry, { type: "message" }>;
type ArtifactEntry = Extract<AionChatTranscriptEntry, { type: "artifact" }>;
type VisibleTranscriptEntry = AionChatTranscriptEntry & { readonly key: string };

function isResponseStream(entry: AionChatTranscriptEntry): entry is ArtifactEntry {
  return entry.type === "artifact" && (
    entry.artifact.artifactId === "aion:stream-delta" ||
    entry.artifact.artifactId === "stream_delta"
  );
}

function entryKey(entry: AionChatTranscriptEntry): string {
  switch (entry.type) {
    case "message": return `message:${entry.message.id}`;
    case "artifact": return `artifact:${entry.artifact.id}`;
    case "task": return `task:${entry.task.id}`;
  }
}

/**
 * Presents streamed response text as an assistant message and reconciles its
 * durable copy, even when the SDK ends the stream with a message rather than
 * lastChunk. Keep the first transcript position and a stable rendering key.
 * Structured output and unrelated messages remain separate entries.
 */
function visibleTranscriptEntries(
  entries: readonly AionChatTranscriptEntry[],
): readonly VisibleTranscriptEntry[] {
  const streamsByTask = new Map<string, ArtifactEntry>();
  for (const entry of entries) {
    if (!isResponseStream(entry)) continue;
    const { artifact } = entry;
    if (artifact.parts.every((part) => part.type === "text")) {
      streamsByTask.set(JSON.stringify([artifact.contextId, artifact.taskId]), entry);
    }
  }

  const durableResponses = new Map<
    string, { readonly stream: ArtifactEntry; readonly entry: MessageEntry }
  >();
  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "assistant" ||
        entry.streaming || entry.message.parts.some((part) => part.type !== "text")) continue;
    const taskId = entry.message.taskId ?? entry.responseMetadata?.taskId;
    const contextId = entry.message.contextId ?? entry.responseMetadata?.contextId;
    const stream = taskId && contextId
      ? streamsByTask.get(JSON.stringify([contextId, taskId])) : undefined;
    if (stream) {
      durableResponses.set(stream.artifact.id, { stream, entry });
    }
  }
  const streamByMessageId = new Map(
    [...durableResponses.values()].map(({ stream, entry }) => [entry.message.id, stream]),
  );

  const renderedStreams = new Set<string>();
  return entries.flatMap<VisibleTranscriptEntry>((entry) => {
    if (entry.type === "message" && isWelcomeRequest(entry.message)) return [];
    const replacement = entry.type === "message"
      ? streamByMessageId.get(entry.message.id) : undefined;
    const stream = isResponseStream(entry) ? entry : replacement;
    if (!stream) return [{ ...entry, key: entryKey(entry) }];

    const { artifact } = stream;
    if (renderedStreams.has(artifact.id)) return [];
    renderedStreams.add(artifact.id);
    const durable = durableResponses.get(artifact.id)?.entry;
    return [{
      type: "message",
      key: `response:${artifact.id}`,
      message: durable?.message ?? {
        id: artifact.id,
        role: "assistant",
        parts: artifact.parts,
        contextId: artifact.contextId,
        taskId: artifact.taskId,
        createdAt: "",
        metadata: artifact.metadata,
      },
      streaming: !durable && !artifact.lastChunk,
      responseMetadata: durable?.responseMetadata ?? {
        contextId: artifact.contextId,
        taskId: artifact.taskId,
      },
    }];
  });
}

/**
 * Renders streamed and completed replies through the message slot, once per
 * logical response. Follows new output only while the reader is already pinned
 * near the bottom, including delayed layout changes.
 * Native scroll anchoring is reserved for reading older output.
 */
export function AionChatTranscript({
  entries: allEntries,
  activeTurn,
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
  const { scrollRef, contentRef, spacerRef, isPinned, onScroll, scrollToBottom } =
    useTranscriptScroll(activeTurn);

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
                    key={entry.key}
                    className="aion-chat__transcript-entry"
                    data-entry-type="message"
                    data-entry-id={entry.message.id}
                    data-scroll-anchor={entry.message.id === activeTurn?.userMessageId || undefined}
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
                    key={entry.key}
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
                  key={entry.key}
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
        <div ref={spacerRef} className="aion-chat__reply-space" aria-hidden="true" />
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
