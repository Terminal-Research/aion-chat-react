import type { Client, FormattedExecutionResult } from "graphql-ws";

async function closeIterator(
  iterator: AsyncIterableIterator<unknown>,
): Promise<void> {
  await iterator.return?.();
}

/** @internal Observes a socket operation with cancellation and optional no-replay. */
export async function* observeGraphQLWebSocket<TData>(
  iterator: AsyncIterableIterator<FormattedExecutionResult<TData, unknown>>,
  signal?: AbortSignal,
  stopOnClose?: Client,
): AsyncIterable<FormattedExecutionResult<TData, unknown>> {
  if (signal?.aborted) {
    await closeIterator(iterator);
    return;
  }
  let complete = false;
  let closePromise: Promise<void> | undefined;
  const close = () => {
    closePromise ??= closeIterator(iterator);
    return closePromise;
  };
  const onAbort = () => {
    void close().catch(() => undefined);
  };
  // Dispose synchronously during the close event, before graphql-ws can
  // resubscribe. Other operations may keep using the shared reconnect loop.
  const unlisten = stopOnClose?.on("closed", (error) => {
    void close().catch(() => undefined);
    void iterator.throw?.(error).catch(() => undefined);
  });
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (!signal?.aborted) {
      const result = await iterator.next();
      if (result.done) {
        complete = true;
        return;
      }
      yield result.value;
    }
  } catch (error) {
    if (!signal?.aborted) {
      throw error;
    }
  } finally {
    unlisten?.();
    signal?.removeEventListener("abort", onAbort);
    if (!complete) {
      await close();
    }
  }
}
