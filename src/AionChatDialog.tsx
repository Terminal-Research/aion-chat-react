import { XIcon } from "@phosphor-icons/react/X";
import {
  type DialogHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";

import { useAionChatPortalContainer } from "./useAionChatTheme";

interface AionChatDialogProps
  extends Omit<
    DialogHTMLAttributes<HTMLDialogElement>,
    "children" | "onClose" | "open" | "title"
  > {
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
  readonly onRequestClose: () => void;
}

/** Shared modal shell for content rendered within the active chat theme. */
export function AionChatDialog({
  title,
  closeLabel,
  children,
  onRequestClose,
  className,
  ...props
}: AionChatDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const portalContainer = useAionChatPortalContainer();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }, []);

  if (!portalContainer && typeof document === "undefined") {
    return null;
  }

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (typeof dialog?.close === "function" && dialog.open) {
      dialog.close();
    } else {
      onRequestClose();
    }
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className={["aion-chat__dialog", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={onRequestClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          closeDialog();
        }
      }}
      {...props}
    >
      <header className="aion-chat__dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button
          className="aion-chat__dialog-close"
          type="button"
          aria-label={closeLabel}
          onClick={closeDialog}
        >
          <XIcon aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>,
    portalContainer ?? document.body,
  );
}
