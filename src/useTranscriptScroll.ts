/*
 * Scroll composition adapted from CopilotKit's controlled chat view:
 * packages/react-core/src/v2/components/chat/CopilotChatView.tsx
 * pinned at 65bd05e3682ced8f424023f75627f8f833e52745 (MIT).
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { ChatTurn } from "./model";

type ScrollTurn = Pick<ChatTurn, "id" | "userMessageId" | "status">;

interface ReplySpace {
  readonly turnId: string;
  /** Keeps the reading position stable as the reply consumes trailing space. */
  minimumBottom: number;
  settled: boolean;
}

/**
 * Reserves room below a newly sent message without animating layout or storing
 * scroll pixels in React state. A completed reply keeps its remaining space
 * until the reader scrolls far enough upward to remove it without clamping the
 * viewport. Restored turns never create a reservation.
 */
export function useTranscriptScroll(activeTurn?: ChatTurn) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const { id: turnId, userMessageId, status } = activeTurn ?? {};
  const seenTurnRef = useRef(turnId);
  const spaceRef = useRef<ReplySpace | undefined>(undefined);
  const layoutRef = useRef({ realBottom: 0, height: 0, spacer: 0 });
  const lastTopRef = useRef(0);
  const autoTopRef = useRef<number | undefined>(undefined);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const setPinned = useCallback((pinned: boolean) => {
    if (pinnedRef.current !== pinned) {
      pinnedRef.current = pinned;
      setIsPinned(pinned);
    }
  }, []);

  const setSpacer = useCallback((height: number) => {
    const next = Math.max(0, Math.ceil(height));
    if (spacerRef.current && layoutRef.current.spacer !== next) {
      spacerRef.current.style.height = `${next}px`;
      layoutRef.current.spacer = next;
    }
  }, []);

  const moveTo = useCallback((top: number) => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    if (viewport.scrollTop !== top) viewport.scrollTop = top;
    autoTopRef.current = viewport.scrollTop;
    lastTopRef.current = viewport.scrollTop;
  }, []);

  /** Measures only on content/viewport changes, never on ordinary scrolling. */
  const updateLayout = useCallback((newTurn?: ScrollTurn) => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const viewportTop =
      viewport.getBoundingClientRect().top + viewport.clientTop;
    const height = viewport.clientHeight;
    const paddingBottom =
      Number.parseFloat(getComputedStyle(viewport).paddingBottom) || 0;
    const realBottom = Math.max(height, Math.ceil(
      content.getBoundingClientRect().bottom - viewportTop +
        viewport.scrollTop + paddingBottom,
    ));
    layoutRef.current.realBottom = realBottom;
    layoutRef.current.height = height;

    if (newTurn) {
      const anchor = Array.from(content.children).find((element) =>
        element instanceof HTMLElement &&
        element.dataset.entryType === "message" &&
        element.dataset.entryId === newTurn.userMessageId,
      );
      // Welcome control messages have no visible user entry to reposition.
      if (anchor) {
        const top = Math.max(0,
          anchor.getBoundingClientRect().bottom - viewportTop +
            viewport.scrollTop - height / 2,
        );
        spaceRef.current = {
          turnId: newTurn.id,
          minimumBottom: top + height,
          settled: newTurn.status !== "running",
        };
        setSpacer(top + height - realBottom);
        setPinned(true);
        moveTo(Math.max(top, realBottom - height));
        return;
      }
    }

    const space = spaceRef.current;
    if (space) {
      // Removing the waiting indicator or resizing the composer can enlarge the
      // viewport. Keep enough room to preserve its previous reading position.
      space.minimumBottom = Math.max(
        space.minimumBottom, lastTopRef.current + height,
      );
      setSpacer(space.minimumBottom - realBottom);
      if (layoutRef.current.spacer === 0) spaceRef.current = undefined;
    }
    if (pinnedRef.current) {
      moveTo(spaceRef.current ? lastTopRef.current : viewport.scrollHeight);
    }
  }, [moveTo, setPinned, setSpacer]);

  useLayoutEffect(() => {
    const isNewTurn = turnId && turnId !== seenTurnRef.current;
    seenTurnRef.current = turnId;
    const space = spaceRef.current;
    if (space && space.turnId === turnId) space.settled = status !== "running";
    updateLayout(isNewTurn && userMessageId && status
      ? { id: turnId, userMessageId, status } : undefined);
  }, [turnId, status, userMessageId, updateLayout]);

  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;
    // The spacer is outside content, so changing its height cannot create an
    // observer feedback loop. Images, fonts, and streamed text all resize content.
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [updateLayout]);

  const onScroll = useCallback(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const top = viewport.scrollTop;
    const layout = layoutRef.current;
    // Composer/status layout can clamp scrollTop before ResizeObserver runs.
    // Preserve the reading position instead of mistaking that clamp for input.
    if (pinnedRef.current && viewport.clientHeight !== layout.height) {
      updateLayout();
      return;
    }
    // Ignore delayed scroll events from our own positioning.
    if (top === autoTopRef.current) return;
    const upward = top < lastTopRef.current;
    lastTopRef.current = top;
    autoTopRef.current = undefined;
    const hadSpace = Boolean(spaceRef.current);
    if (upward && spaceRef.current?.settled &&
        top <= Math.max(0, layout.realBottom - layout.height)) {
      // Check the current extent once before removal in case native anchoring
      // or content-visibility changed layout before ResizeObserver delivered it.
      const realMaximum = Math.max(0,
        viewport.scrollHeight - layout.spacer - viewport.clientHeight,
      );
      if (top <= realMaximum) {
        spaceRef.current = undefined;
        setSpacer(0);
      }
    }
    // Upward movement within reserved space releases follow mode immediately.
    // Cleanup must not immediately pull the reader back down. Ordinary history
    // retains the existing bottom tolerance for native layout adjustments.
    setPinned((!upward || !hadSpace) &&
      viewport.scrollHeight - top - viewport.clientHeight <= 24);
  }, [setPinned, setSpacer, updateLayout]);

  const scrollToBottom = useCallback(() => {
    spaceRef.current = undefined;
    setSpacer(0);
    setPinned(true);
    updateLayout();
  }, [setPinned, setSpacer, updateLayout]);

  return { scrollRef, contentRef, spacerRef, isPinned, onScroll, scrollToBottom };
}
