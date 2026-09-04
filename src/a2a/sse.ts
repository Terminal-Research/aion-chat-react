function emitEvent(data: readonly string[]): readonly [] | readonly [unknown] {
  if (data.length === 0) {
    return [];
  }
  return [JSON.parse(data.join("\n"))];
}

/** Parses JSON data fields from an SSE response body. */
export async function* readJsonSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  let complete = false;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) {
    abort();
  }

  const processLine = (
    line: string,
  ): readonly [] | readonly [unknown] => {
    if (line.length === 0) {
      const events = emitEvent(data);
      data = [];
      return events;
    }
    if (line.startsWith(":")) {
      return [];
    }
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "data") {
      data.push(value);
    }
    return [];
  };

  try {
    while (!complete) {
      const chunk = await reader.read();
      complete = chunk.done;
      buffer += chunk.done
        ? decoder.decode()
        : decoder.decode(chunk.value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        for (const event of processLine(line)) {
          yield event;
        }
        newline = buffer.indexOf("\n");
      }
    }

    if (buffer.length > 0) {
      for (const event of processLine(buffer.replace(/\r$/u, ""))) {
        yield event;
      }
    }
    for (const finalEvent of emitEvent(data)) {
      yield finalEvent;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    if (!complete) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
