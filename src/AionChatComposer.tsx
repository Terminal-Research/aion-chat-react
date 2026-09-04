/*
 * Controlled composer structure adapted from CopilotKit's chat input:
 * packages/react-core/src/v2/components/chat/CopilotChatInput.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import {
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useLayoutEffect,
  useRef,
} from "react";

import type { ChatAttachmentDraft } from "./model";

/** Visible processing state for the default composer. */
export type AionChatComposerStatus = "idle" | "uploading" | "running";

/** File-input options hosts may customize without owning upload behavior. */
export type AionChatAttachmentInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "onChange" | "type"
>;

/** Props supplied to the composer slot. */
export interface AionChatComposerProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "children" | "onChange" | "value"
  > {
  readonly value: string;
  readonly status: AionChatComposerStatus;
  readonly canSend: boolean;
  readonly attachments: readonly ChatAttachmentDraft[];
  readonly attachmentInputProps?: AionChatAttachmentInputProps;
  readonly onChange: (value: string) => void;
  readonly onSelectAttachments?: (files: readonly File[]) => void;
  readonly onRemoveAttachment: (attachmentId: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly children?: ReactNode;
}

function attachmentStatus(attachment: ChatAttachmentDraft): string {
  switch (attachment.status) {
    case "uploading":
      return "Uploading";
    case "uploaded":
      return "Ready";
    case "failed":
      return attachment.error.message;
  }
}

/** Controlled multiline composer with send and stop behavior. */
export function AionChatComposer({
  value,
  status,
  canSend,
  attachments,
  attachmentInputProps,
  onChange,
  onSelectAttachments,
  onRemoveAttachment,
  onSend,
  onStop,
  children,
  className,
  placeholder = "Message the agent",
  ...props
}: AionChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRunning = status === "running";
  const isUploading = status === "uploading";

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  const focusInput = () => textareaRef.current?.focus();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) {
      onSend();
      focusInput();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    props.onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    if (canSend) {
      onSend();
    }
  };

  const selectAttachments = () => fileInputRef.current?.click();

  const onAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) {
      onSelectAttachments?.(files);
      focusInput();
    }
  };

  return (
    <form
      className="aion-chat__composer"
      data-composer-status={status}
      aria-busy={status !== "idle"}
      onSubmit={submit}
    >
      {attachments.length > 0 && (
        <div
          className="aion-chat__composer-attachments"
          role="list"
          aria-label="Attachments"
          aria-live="polite"
        >
          {attachments.map((attachment) => (
            <div
              className="aion-chat__composer-attachment"
              key={attachment.id}
              role="listitem"
            >
              <span className="aion-chat__composer-attachment-name">
                {attachment.file.name}
              </span>
              <span className="aion-chat__composer-attachment-status">
                {attachmentStatus(attachment)}
              </span>
              <button
                className="aion-chat__composer-remove"
                type="button"
                aria-label={`Remove ${attachment.file.name}`}
                onClick={() => {
                  onRemoveAttachment(attachment.id);
                  focusInput();
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="aion-chat__composer-controls">
        {onSelectAttachments && (
          <>
            <input
              {...attachmentInputProps}
              ref={fileInputRef}
              className={[
                "aion-chat__composer-file-input",
                attachmentInputProps?.className,
              ]
                .filter(Boolean)
                .join(" ")}
              type="file"
              tabIndex={-1}
              multiple={attachmentInputProps?.multiple ?? true}
              disabled={
                attachmentInputProps?.disabled || status !== "idle"
              }
              aria-hidden="true"
              onChange={onAttachmentChange}
            />
            <button
              className="aion-chat__composer-secondary-action"
              type="button"
              disabled={
                attachmentInputProps?.disabled || status !== "idle"
              }
              aria-label="Attach files"
              onClick={selectAttachments}
            >
              Attach
            </button>
          </>
        )}
        <textarea
          {...props}
          ref={textareaRef}
          className={["aion-chat__composer-input", className]
            .filter(Boolean)
            .join(" ")}
          value={value}
          placeholder={placeholder}
          aria-label="Chat message"
          rows={2}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        {children && (
          <div className="aion-chat__composer-extra-actions">{children}</div>
        )}
        {isRunning ? (
          <button
            className="aion-chat__composer-action"
            type="button"
            onClick={() => {
              onStop();
              focusInput();
            }}
          >
            Stop
          </button>
        ) : (
          <button
            className="aion-chat__composer-action"
            type="submit"
            disabled={!canSend}
          >
            {isUploading ? "Uploading…" : "Send"}
          </button>
        )}
      </div>
    </form>
  );
}
