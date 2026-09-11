import { CheckIcon } from "@phosphor-icons/react/Check";
import { CopyIcon } from "@phosphor-icons/react/Copy";
import {
  type ButtonHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";

const COPY_FEEDBACK_DURATION_MS = 2_000;

type CopyStatus = "idle" | "copied" | "failed";

interface CopyFeedback {
  readonly status: CopyStatus;
  readonly text: string;
}

interface AionCopyButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick"> {
  readonly label: string;
  readonly text: string;
}

/** Copies one text value and exposes transient success or failure feedback. */
export function AionCopyButton({
  label,
  text,
  className,
  ...props
}: AionCopyButtonProps) {
  const [feedback, setFeedback] = useState<CopyFeedback>({
    status: "idle",
    text,
  });
  const copyAttempt = useRef(0);
  const resetTimeout = useRef<number | undefined>(undefined);
  const status = feedback.text === text ? feedback.status : "idle";

  useEffect(() => {
    return () => {
      copyAttempt.current += 1;
      window.clearTimeout(resetTimeout.current);
    };
  }, []);

  const copyText = async () => {
    const attempt = ++copyAttempt.current;
    window.clearTimeout(resetTimeout.current);
    setFeedback({ status: "idle", text });

    let nextStatus: CopyStatus;
    try {
      await navigator.clipboard.writeText(text);
      nextStatus = "copied";
    } catch {
      nextStatus = "failed";
    }
    if (attempt !== copyAttempt.current) {
      return;
    }

    setFeedback({ status: nextStatus, text });
    resetTimeout.current = window.setTimeout(() => {
      if (attempt === copyAttempt.current) {
        setFeedback({ status: "idle", text });
      }
      resetTimeout.current = undefined;
    }, COPY_FEEDBACK_DURATION_MS);
  };

  const accessibleLabel =
    status === "copied"
      ? `Copied ${label}`
      : status === "failed"
        ? `Copy ${label} failed. Try again`
        : `Copy ${label}`;
  const StatusIcon = status === "copied" ? CheckIcon : CopyIcon;

  return (
    <button
      {...props}
      className={className}
      type="button"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-copy-status={status}
      onClick={() => void copyText()}
    >
      <StatusIcon aria-hidden="true" />
    </button>
  );
}
