import { useId, useRef } from "react";

import { AionChatDialog } from "./AionChatDialog";
import type { AionConversationSummary } from "./conversations/types";

interface AionChatDeleteConversationDialogProps {
  readonly summary: AionConversationSummary;
  readonly remote: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Confirms thread removal without coupling the dialog to a transport or host. */
export function AionChatDeleteConversationDialog({
  summary,
  remote,
  onCancel,
  onConfirm,
}: AionChatDeleteConversationDialogProps) {
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AionChatDialog
      className="aion-chat__delete-dialog"
      title={remote ? "Delete Thread" : "Remove Thread"}
      closeLabel="Cancel thread deletion"
      aria-describedby={descriptionId}
      onRequestClose={onCancel}
      initialFocusRef={cancelRef}
    >
      <p id={descriptionId} className="aion-chat__delete-dialog-body">
        {remote ? "Delete " : "Remove "}
        <strong>{summary.title}</strong>
        {remote
          ? " and its conversation history? Active tasks will be canceled. " +
            "This action cannot be undone."
          : " from local history? This does not delete history on the server."}
      </p>
      <footer className="aion-chat__delete-dialog-footer">
        <button
          ref={cancelRef}
          className="aion-chat__delete-dialog-cancel"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="aion-chat__delete-dialog-confirm"
          type="button"
          onClick={onConfirm}
        >
          {remote ? "Delete" : "Remove"}
        </button>
      </footer>
    </AionChatDialog>
  );
}
