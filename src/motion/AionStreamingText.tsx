import { memo, useLayoutEffect, useRef } from "react";

import {
  AionChatMarkdown,
  type AionChatMarkdownComponent,
} from "../AionChatMarkdown";

/** Props for streamed text that retains one canonical content value. */
export interface AionStreamingTextProps {
  readonly text: string;
  readonly markdownComponent?: AionChatMarkdownComponent;
}

function canIsolatePlainText(text: string): boolean {
  return !/[\\`*_#[\]<>|\n\r]/u.test(text);
}

/**
 * Softens a safely isolated appended plain-text range without delaying it.
 * Markdown-shaped updates fall back to the canonical safe renderer.
 */
export const AionStreamingText = memo(function AionStreamingText({
  text,
  markdownComponent: MarkdownComponent = AionChatMarkdown,
}: AionStreamingTextProps) {
  const previousTextRef = useRef(text);
  const previousText = previousTextRef.current;
  const appendedText = text.startsWith(previousText)
    ? text.slice(previousText.length)
    : "";
  const isPlainText = canIsolatePlainText(text);
  const canAnimate =
    previousText.length > 0 &&
    appendedText.length > 0 &&
    isPlainText;

  useLayoutEffect(() => {
    previousTextRef.current = text;
  }, [text]);

  return isPlainText ? (
    <span className="aion-chat__streaming-text">
      {canAnimate ? (
        <>
          <span>{previousText}</span>
          <span className="aion-chat__streaming-text-new" key={text}>
            {appendedText}
          </span>
        </>
      ) : (
        text
      )}
    </span>
  ) : (
    <MarkdownComponent text={text} />
  );
});
