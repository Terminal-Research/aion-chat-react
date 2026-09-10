import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import { InfoIcon } from "@phosphor-icons/react/Info";
import {
  type HTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

import { AionChatDialog } from "./AionChatDialog";
import type { ContextId, TaskId } from "./model";

const COPY_FEEDBACK_DURATION_MS = 2_000;

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

type CopyStatus = "idle" | "copied" | "failed";

interface CopyFeedback {
  readonly status: CopyStatus;
  readonly text: string;
}

/** Renders copy feedback and protocol identifiers for one agent response. */
export function AionChatResponseActions({
  text,
  metadata,
  className,
  ...props
}: AionChatResponseActionsProps) {
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>({
    status: "idle",
    text,
  });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const copyAttempt = useRef(0);
  const copyResetTimeout = useRef<number | undefined>(undefined);
  const hasText = text.length > 0;
  const copyStatus =
    copyFeedback.text === text ? copyFeedback.status : "idle";

  useEffect(() => {
    return () => {
      copyAttempt.current += 1;
      window.clearTimeout(copyResetTimeout.current);
    };
  }, []);

  const copyResponse = async () => {
    const attempt = ++copyAttempt.current;
    window.clearTimeout(copyResetTimeout.current);
    setCopyFeedback({ status: "idle", text });

    try {
      await navigator.clipboard.writeText(text);
      if (attempt !== copyAttempt.current) {
        return;
      }
      setCopyFeedback({ status: "copied", text });
    } catch {
      if (attempt !== copyAttempt.current) {
        return;
      }
      setCopyFeedback({ status: "failed", text });
    }

    copyResetTimeout.current = window.setTimeout(() => {
      if (attempt === copyAttempt.current) {
        setCopyFeedback({ status: "idle", text });
      }
      copyResetTimeout.current = undefined;
    }, COPY_FEEDBACK_DURATION_MS);
  };

  const copyLabel =
    copyStatus === "copied"
      ? "Copied response"
      : copyStatus === "failed"
        ? "Copy response failed. Try again"
        : "Copy response";
  const CopyStatusIcon = copyStatus === "copied" ? CheckIcon : CopyIcon;
  return (
    <div
      className={["aion-chat__response-actions", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <button
        className="aion-chat__response-action"
        type="button"
        aria-label={copyLabel}
        title={copyLabel}
        data-copy-status={copyStatus}
        disabled={!hasText}
        onClick={() => void copyResponse()}
      >
        <CopyStatusIcon aria-hidden="true" />
      </button>
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
