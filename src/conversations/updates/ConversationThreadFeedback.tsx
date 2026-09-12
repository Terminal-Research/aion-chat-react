import { useStore } from "zustand";
import { useState } from "react";
import type { AionConversationSummary } from "../types";
import { AionActivityIndicator } from "../../motion/AionActivityIndicator";
import { useConversationUpdatesContext } from "./context";
import {
  conversationActivity,
  selectConversationMetadata,
  selectConversationThread,
} from "./selectors";
import type { ConversationMetadata, ConversationUpdatesStore } from "./store";

function Title({
  summary,
  metadata,
}: {
  readonly summary: AionConversationSummary;
  readonly metadata?: ConversationMetadata;
}) {
  const title =
    (metadata ? metadata.title : summary.generatedTitle) ?? summary.title;
  return (
    <span className="aion-chat__navigation-title" title={title}>
      <RevealedTitle
        key={metadata?.revision ?? title}
        title={title}
        until={metadata?.revealUntil ?? 0}
      />
    </span>
  );
}

function RevealedTitle({
  title,
  until,
}: {
  readonly title: string;
  readonly until: number;
}) {
  const [mountedAt] = useState(Date.now);
  const remaining = Math.max(0, until - mountedAt);
  return (
    <span
      className={remaining ? "aion-chat__thread-title-reveal" : undefined}
      style={remaining ? { animationDelay: `${remaining - 600}ms` } : undefined}
    >
      {title}
    </span>
  );
}

function ScopedTitle({
  store,
  summary,
}: {
  readonly store: ConversationUpdatesStore;
  readonly summary: AionConversationSummary;
}) {
  const metadata = useStore(store, (state) =>
    selectConversationMetadata(state, summary.agentId, summary.contextId),
  );
  return <Title summary={summary} metadata={metadata} />;
}

/** Reveal replacement generated text while keeping the full accessible text immediate. */
export function ConversationThreadTitle({
  summary,
}: {
  readonly summary: AionConversationSummary;
}) {
  const context = useConversationUpdatesContext();
  return context ? (
    <ScopedTitle store={context.store} summary={summary} />
  ) : (
    <Title summary={summary} />
  );
}

function ScopedActivity({
  store,
  summary,
}: {
  readonly store: ConversationUpdatesStore;
  readonly summary: AionConversationSummary;
}) {
  const phase = useStore(store, (state) =>
    conversationActivity(
      selectConversationThread(state, summary.agentId, summary.contextId),
    ),
  );
  const until = useStore(
    store,
    (state) =>
      selectConversationThread(state, summary.agentId, summary.contextId)
        ?.completedUntil ?? 0,
  );
  if (!phase) return null;
  return (
    <Activity
      key={phase === "succeeded" ? `${phase}:${until}` : phase}
      phase={phase}
      until={until}
    />
  );
}

function Activity({
  phase,
  until,
}: {
  readonly phase: "pending" | "requires-action" | "succeeded" | "failed";
  readonly until: number;
}) {
  const [mountedAt] = useState(Date.now);
  const label =
    phase === "pending"
      ? "Task in progress"
      : phase === "requires-action"
        ? "Task needs input or authentication"
        : "Task completed";
  return (
    <AionActivityIndicator
      phase={phase}
      label={label}
      title={label}
      className="aion-chat__thread-activity"
      style={
        phase === "succeeded"
          ? { animationDelay: `${Math.min(0, until - mountedAt - 1_200)}ms` }
          : undefined
      }
    />
  );
}

/** Reuse composer lifecycle styling, with task completion as the success trigger. */
export function ConversationThreadActivity({
  summary,
}: {
  readonly summary: AionConversationSummary;
}) {
  const context = useConversationUpdatesContext();
  return context ? (
    <ScopedActivity store={context.store} summary={summary} />
  ) : null;
}
