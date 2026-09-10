import type { HTMLAttributes } from "react";

import { AionAgentAvatar } from "../AionAgentAvatar";
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
          const unavailable = entry.agent.availability === "unavailable";
          const unavailableReason = unavailable
            ? entry.agent.unavailableReason?.trim() ||
              "This agent is currently unavailable."
            : undefined;
          return (
            <div
              role="listitem"
              key={entry.agent.id}
            >
              <button
                className="aion-chat__navigation-item"
                type="button"
                data-aion-agent-id={entry.agent.id}
                data-selected={selected || undefined}
                data-availability={entry.agent.availability}
                aria-current={selected ? "true" : undefined}
                title={unavailableReason}
                onClick={() => onSelectAgent(entry)}
              >
                <AionAgentAvatar
                  className="aion-chat__navigation-avatar"
                  title={entry.agent.title}
                  imageUrl={entry.agent.avatarImageUrl}
                />
                <span className="aion-chat__navigation-copy">
                  <span className="aion-chat__navigation-title">
                    {entry.agent.title}
                    {unavailable ? (
                      <span className="aion-chat__navigation-availability">
                        Unavailable
                      </span>
                    ) : null}
                  </span>
                  <span className="aion-chat__navigation-caption">
                    {unavailableReason ??
                      (entry.atName
                        ? `@${entry.atName.replace(/^@/u, "")}`
                        : entry.agent.description ?? "Aion agent")}
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
