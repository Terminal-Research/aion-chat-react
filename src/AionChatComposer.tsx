/*
 * Controlled composer structure adapted from CopilotKit's chat input:
 * packages/react-core/src/v2/components/chat/CopilotChatInput.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import type { FormEvent, KeyboardEvent, TextareaHTMLAttributes } from "react";

/** Props supplied to the composer slot. */
export interface AionChatComposerProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  readonly value: string;
  readonly isRunning: boolean;
  readonly canSend: boolean;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
}

/** Controlled multiline composer with send and stop behavior. */
export function AionChatComposer({
  value,
  isRunning,
  canSend,
  onChange,
  onSend,
  onStop,
  className,
  placeholder = "Message the agent",
  ...props
}: AionChatComposerProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) {
      onSend();
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

  return (
    <form className="aion-chat__composer" onSubmit={submit}>
      <textarea
        {...props}
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
      {isRunning ? (
        <button
          className="aion-chat__composer-action"
          type="button"
          onClick={onStop}
        >
          Stop
        </button>
      ) : (
        <button
          className="aion-chat__composer-action"
          type="submit"
          disabled={!canSend}
        >
          Send
        </button>
      )}
    </form>
  );
}
