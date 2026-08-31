import type {
  AionChatRequest,
  AionChatStreamOptions,
  AionChatTransport,
} from "../transport";
import type { ChatTransportEvent } from "../events";

/** One scripted fake-transport event with an optional delivery delay. */
export interface FakeAionChatStep {
  readonly event: ChatTransportEvent;
  readonly delayMs?: number;
}

/** A scripted response selected for one fake transport request. */
export type FakeAionChatScenario = (
  request: AionChatRequest,
) => readonly FakeAionChatStep[] | Promise<readonly FakeAionChatStep[]>;

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("The fake Aion chat stream was aborted.");
}

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }

    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError(signal));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Deterministic transport for examples and consumer behavior tests. */
export class FakeAionChatTransport implements AionChatTransport {
  readonly requests: AionChatRequest[] = [];
  disposed = false;

  constructor(private readonly scenario: FakeAionChatScenario) {}

  async *stream(
    request: AionChatRequest,
    { signal }: AionChatStreamOptions,
  ): AsyncIterable<ChatTransportEvent> {
    if (this.disposed) {
      throw new Error("The fake Aion chat transport is disposed.");
    }

    this.requests.push(request);
    const steps = await this.scenario(request);
    for (const step of steps) {
      if (signal.aborted) {
        return;
      }
      if (step.delayMs) {
        await waitForDelay(step.delayMs, signal);
      }
      if (!signal.aborted) {
        yield step.event;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
