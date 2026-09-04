import { ChatCircleDotsIcon } from "@phosphor-icons/react/ChatCircleDots";
import type { HTMLAttributes } from "react";

import type { AionAgentCatalogEntry } from "../catalog";

/** Controlled agent-list presentation. */
export interface AionAgentListProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly entries: readonly AionAgentCatalogEntry[];
  readonly selectedAgentId?: string;
  readonly loading?: boolean;
  readonly error?: Error;
  readonly onSelectAgent: (entry: AionAgentCatalogEntry) => void;
  readonly onRetry?: () => void;
}

function initials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Renders the authenticated agent catalog without owning selection. */
export function AionAgentList({
  entries,
  selectedAgentId,
  loading = false,
  error,
  onSelectAgent,
  onRetry,
  className,
  ...props
}: AionAgentListProps) {
  return (
    <div
      className={["aion-chat__agent-list", className]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loading}
      {...props}
    >
      {loading && entries.length === 0 ? (
        <p className="aion-chat__navigation-status" role="status">
          Loading agents…
        </p>
      ) : null}
      {error ? (
        <div className="aion-chat__navigation-status" role="alert">
          <p>Agents could not be loaded.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && entries.length === 0 ? (
        <p className="aion-chat__navigation-status">
          No chat agents are available.
        </p>
      ) : null}
      <div className="aion-chat__navigation-list" role="list">
        {entries.map((entry) => {
          const selected = entry.agent.id === selectedAgentId;
          return (
            <div
              role="listitem"
              key={entry.distributionId}
            >
              <button
                className="aion-chat__navigation-item"
                type="button"
                data-aion-agent-id={entry.agent.id}
                data-selected={selected || undefined}
                aria-current={selected ? "true" : undefined}
                disabled={entry.agent.availability === "unavailable"}
                onClick={() => onSelectAgent(entry)}
              >
                <span
                  className="aion-chat__navigation-avatar"
                  aria-hidden="true"
                >
                  {initials(entry.agent.title) || <ChatCircleDotsIcon />}
                </span>
                <span className="aion-chat__navigation-copy">
                  <span className="aion-chat__navigation-title">
                    {entry.agent.title}
                  </span>
                  <span className="aion-chat__navigation-caption">
                    {entry.atName
                      ? `@${entry.atName.replace(/^@/u, "")}`
                      : entry.agent.description ?? "Aion agent"}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
