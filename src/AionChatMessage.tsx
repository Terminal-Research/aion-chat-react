/*
 * Presentation structure adapted from CopilotKit's controlled message view:
 * packages/react-core/src/v2/components/chat/CopilotChatMessageView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import {
  type ComponentType,
  type HTMLAttributes,
  memo,
} from "react";

import {
  AionChatMarkdown,
  type AionChatMarkdownComponent,
} from "./AionChatMarkdown";
import type {
  ChatDataPart,
  ChatFilePart,
  ChatMessage,
  ChatPart,
} from "./model";
import { AionStreamingText } from "./motion/AionStreamingText";

/** Props supplied to a structured-data part renderer. */
export interface AionChatDataPartProps {
  readonly part: ChatDataPart;
}

/** Renderer selected for one structured-data kind. */
export type AionChatDataPartRenderer = ComponentType<AionChatDataPartProps>;

/** Specialized structured-data renderers keyed by `part.data.kind`. */
export type AionChatDataPartRenderers = Readonly<
  Record<string, AionChatDataPartRenderer>
>;

/** Props supplied to the default file-part renderer. */
export interface AionChatFilePartProps {
  readonly part: ChatFilePart;
}

/** Props for the default typed-part renderer. */
export interface AionChatPartsProps {
  readonly parts: readonly ChatPart[];
  readonly textComponent?: AionChatMarkdownComponent;
  readonly dataRenderers?: AionChatDataPartRenderers;
}

/** Props supplied to a transcript message slot. */
export interface AionChatMessageProps extends HTMLAttributes<HTMLDivElement> {
  readonly message: ChatMessage;
  readonly streaming?: boolean;
  readonly markdownComponent?: AionChatMarkdownComponent;
  readonly dataRenderers?: AionChatDataPartRenderers;
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

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === "object"
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function stringField(
  value: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function dataKind(part: ChatDataPart): string | undefined {
  return stringField(record(part.data), "kind");
}

function renderData(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2) ?? String(data);
  } catch {
    return "[Unsupported structured data]";
  }
}

function dataTitle(part: ChatDataPart): string | undefined {
  const data = record(part.data);
  return (
    stringField(data, "title") ??
    stringField(data, "name") ??
    dataKind(part)
  );
}

/** Renders a URL- or byte-backed A2A file without creating unsafe links. */
export const AionChatFilePart = memo(function AionChatFilePart({
  part,
}: AionChatFilePartProps) {
  const url = safeFileUrl(part.file.url);
  const name = part.file.name ?? "File attachment";
  const detail =
    part.file.mediaType ?? (part.file.bytes ? "Embedded file" : "File");

  return (
    <span className="aion-chat__file">
      {url ? <a href={url}>{name}</a> : <span>{name}</span>}
      <span className="aion-chat__file-detail">{detail}</span>
    </span>
  );
});

/**
 * Renders unclaimed structured content as a disclosure so unknown activity
 * remains visible and diagnosable without assuming its schema.
 */
export const AionChatDataPart = memo(function AionChatDataPart({
  part,
}: AionChatDataPartProps) {
  const data = record(part.data);
  const status = stringField(data, "status");
  const title = dataTitle(part);

  return title ? (
    <details className="aion-chat__data">
      <summary>
        <span>{title}</span>
        {status && <span className="aion-chat__data-status">{status}</span>}
      </summary>
      <pre>{renderData(part.data)}</pre>
    </details>
  ) : (
    <pre className="aion-chat__data-unknown">{renderData(part.data)}</pre>
  );
});

function renderPart(
  part: ChatPart,
  index: number,
  TextComponent?: AionChatMarkdownComponent,
  dataRenderers?: AionChatDataPartRenderers,
) {
  switch (part.type) {
    case "text":
      return TextComponent ? (
        <TextComponent key={index} text={part.text} />
      ) : (
        <span key={index}>{part.text}</span>
      );
    case "file":
      return <AionChatFilePart key={index} part={part} />;
    case "data": {
      const kind = dataKind(part);
      const DataComponent =
        (kind ? dataRenderers?.[kind] : undefined) ?? AionChatDataPart;
      return <DataComponent key={index} part={part} />;
    }
  }
}

/** Renders normalized text, file, and structured-data parts safely. */
export const AionChatParts = memo(function AionChatParts({
  parts,
  textComponent,
  dataRenderers,
}: AionChatPartsProps) {
  return (
    <>
      {parts.map((part, index) =>
        renderPart(part, index, textComponent, dataRenderers),
      )}
    </>
  );
});

/** Default safe, non-Markdown presentation for one normalized message. */
export const AionChatMessage = memo(function AionChatMessage({
  message,
  streaming = false,
  markdownComponent = AionChatMarkdown,
  dataRenderers,
  className,
  ...props
}: AionChatMessageProps) {
  const classes = ["aion-chat__message", `aion-chat__message--${message.role}`];
  if (className) {
    classes.push(className);
  }
  const streamPart =
    streaming &&
    message.role === "assistant" &&
    message.parts.length === 1 &&
    message.parts[0]?.type === "text"
      ? message.parts[0]
      : undefined;

  return (
    <div
      className={classes.join(" ")}
      data-message-role={message.role}
      {...props}
    >
      <div className="aion-chat__message-content">
        {streamPart ? (
          <AionStreamingText
            text={streamPart.text}
            markdownComponent={markdownComponent}
          />
        ) : (
          <AionChatParts
            parts={message.parts}
            textComponent={
              message.role === "assistant" ? markdownComponent : undefined
            }
            dataRenderers={dataRenderers}
          />
        )}
      </div>
    </div>
  );
});
