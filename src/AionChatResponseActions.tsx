import { InfoIcon } from "@phosphor-icons/react/Info";
import { type HTMLAttributes, useState } from "react";

import { AionChatDialog } from "./AionChatDialog";
import { AionCopyButton } from "./AionCopyButton";
import type { ContextId, TaskId } from "./model";

/** Identifiers associated with one rendered agent response. */
export interface AionChatResponseMetadata {
  readonly contextId?: ContextId;
  readonly taskId?: TaskId;
}

/** Props for the default agent-response action row. */
export interface AionChatResponseActionsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly text: string;
  readonly metadata: AionChatResponseMetadata;
}

/** Renders copy feedback and protocol identifiers for one agent response. */
export function AionChatResponseActions({
  text,
  metadata,
  className,
  ...props
}: AionChatResponseActionsProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasText = text.length > 0;
  return (
    <div
      className={["aion-chat__response-actions", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <AionCopyButton
        className="aion-chat__response-action"
        label="response"
        text={text}
        disabled={!hasText}
      />
      <button
        className="aion-chat__response-action"
        type="button"
        aria-label="View response details"
        onClick={() => setDetailsOpen(true)}
      >
        <InfoIcon aria-hidden="true" />
      </button>
      {detailsOpen ? (
        <AionChatDialog
          className="aion-chat__response-dialog"
          title="Response Details"
          closeLabel="Close response details"
          onRequestClose={() => setDetailsOpen(false)}
        >
          <dl className="aion-chat__response-details">
            <div>
              <dt>Task ID</dt>
              <dd>
                <code>{metadata.taskId ?? "Not available"}</code>
              </dd>
            </div>
            <div>
              <dt>Context ID</dt>
              <dd>
                <code>{metadata.contextId ?? "Not available"}</code>
              </dd>
            </div>
          </dl>
        </AionChatDialog>
      ) : null}
    </div>
  );
}
