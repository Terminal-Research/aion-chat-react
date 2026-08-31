/*
 * Presentation structure adapted from CopilotKit's controlled message view:
 * packages/react-core/src/v2/components/chat/CopilotChatMessageView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import type { HTMLAttributes } from "react";

import type { ChatMessage, ChatPart } from "./model";

/** Props for the default typed-part renderer. */
export interface AionChatPartsProps {
  readonly parts: readonly ChatPart[];
}

/** Props supplied to a transcript message slot. */
export interface AionChatMessageProps extends HTMLAttributes<HTMLDivElement> {
  readonly message: ChatMessage;
}

function safeFileUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  if (url.startsWith("/")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

function renderData(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2) ?? String(data);
  } catch {
    return "[Unsupported structured data]";
  }
}

function renderPart(part: ChatPart, index: number) {
  switch (part.type) {
    case "text":
      return <span key={index}>{part.text}</span>;
    case "file": {
      const url = safeFileUrl(part.file.url);
      return url ? (
        <a key={index} href={url}>
          {part.file.name ?? "File"}
        </a>
      ) : (
        <span key={index}>{part.file.name ?? "File attachment"}</span>
      );
    }
    case "data":
      return <pre key={index}>{renderData(part.data)}</pre>;
  }
}

/** Renders normalized text, file, and structured-data parts safely. */
export function AionChatParts({ parts }: AionChatPartsProps) {
  return <>{parts.map(renderPart)}</>;
}

/** Default safe, non-Markdown presentation for one normalized message. */
export function AionChatMessage({
  message,
  className,
  ...props
}: AionChatMessageProps) {
  const classes = ["aion-chat__message", `aion-chat__message--${message.role}`];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(" ")} data-message-role={message.role} {...props}>
      <div className="aion-chat__message-content">
        <AionChatParts parts={message.parts} />
      </div>
    </div>
  );
}
