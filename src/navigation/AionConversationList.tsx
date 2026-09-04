import { TrashIcon } from "@phosphor-icons/react/Trash";
import type { HTMLAttributes } from "react";

import type { AionConversationSummary } from "../conversations/types";

/** Controlled conversation-list presentation. */
export interface AionConversationListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly summaries: readonly AionConversationSummary[];
  readonly selectedContextId?: string;
  readonly loading?: boolean;
  readonly error?: Error;
  readonly onSelectConversation: (contextId: string) => void;
  readonly onRemoveConversation?: (contextId: string) => void;
  readonly onRetry?: () => void;
  readonly formatTimestamp?: (timestamp: string) => string;
}

const DEFAULT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

function defaultFormatTimestamp(value: string): string {
  return DEFAULT_TIMESTAMP_FORMATTER.format(new Date(value));
}

/** Renders locally known A2A contexts without owning selection or storage. */
export function AionConversationList({
  summaries,
  selectedContextId,
  loading = false,
  error,
  onSelectConversation,
  onRemoveConversation,
  onRetry,
  formatTimestamp = defaultFormatTimestamp,
  className,
  ...props
}: AionConversationListProps) {
  return (
    <div
      className={["aion-chat__conversation-list", className]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loading}
      {...props}
    >
      {loading && summaries.length === 0 ? (
        <p className="aion-chat__navigation-status" role="status">
          Loading conversations…
        </p>
      ) : null}
      {error ? (
        <div className="aion-chat__navigation-status" role="alert">
          <p>Local conversation history could not be loaded.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && summaries.length === 0 ? (
        <p className="aion-chat__navigation-status">
          No conversations yet.
        </p>
      ) : null}
      <div className="aion-chat__navigation-list" role="list">
        {summaries.map((summary) => {
          const selected = summary.contextId === selectedContextId;
          return (
            <div
              className="aion-chat__conversation-item"
              role="listitem"
              key={summary.contextId}
              data-selected={selected || undefined}
            >
              <button
                className="aion-chat__conversation-select"
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelectConversation(summary.contextId)}
              >
                <span className="aion-chat__navigation-title">
                  {summary.title}
                </span>
                {summary.preview ? (
                  <span className="aion-chat__navigation-caption">
                    {summary.preview}
                  </span>
                ) : null}
                <time
                  className="aion-chat__navigation-time"
                  dateTime={summary.updatedAt}
                >
                  {formatTimestamp(summary.updatedAt)}
                </time>
              </button>
              {onRemoveConversation ? (
                <button
                  className="aion-chat__conversation-remove"
                  type="button"
                  aria-label={`Remove ${summary.title}`}
                  onClick={() => onRemoveConversation(summary.contextId)}
                >
                  <TrashIcon aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
