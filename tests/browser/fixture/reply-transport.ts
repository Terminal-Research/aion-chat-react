import type { AionChatTransport, ChatTransportEvent } from "../../../src/index";

/** Browser-controlled responses let tests inspect layout between real updates. */
export const replyTransport: AionChatTransport = {
  async *stream(request, { signal }) {
    const queue: ChatTransportEvent[] = [];
    let wake = () => {};
    let sequence = 0;
    const receive = (event: Event) => {
      const step = (event as CustomEvent<{ text?: string; finish?: "completed" | "failed" }>).detail;
      const base = {
        eventId: `${request.requestId}-${++sequence}`,
        requestId: request.requestId,
        occurredAt: new Date().toISOString(),
      };
      if (step.text !== undefined) queue.push({
        ...base, type: "message.delta", turnId: request.turnId,
        messageId: `${request.turnId}-reply`, text: step.text,
      });
      else if (step.finish === "failed") queue.push({
        ...base, type: "run.failed",
        error: { code: "fixture", message: "The fixture reply failed.", retryable: true },
      });
      else queue.push({ ...base, type: "run.completed" });
      wake();
    };
    const abort = () => wake();
    window.addEventListener("chat-reply", receive);
    signal.addEventListener("abort", abort);
    try {
      while (!signal.aborted) {
        const event = queue.shift();
        if (event) {
          yield event;
          if (event.type !== "message.delta") return;
        } else await new Promise<void>((resolve) => { wake = resolve; });
      }
    } finally {
      window.removeEventListener("chat-reply", receive);
      signal.removeEventListener("abort", abort);
    }
  },
};
