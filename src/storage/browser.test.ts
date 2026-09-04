import { describe, expect, it } from "vitest";

import type { ChatConversationState } from "../model";
import { createAionConversationSnapshot } from "../conversations/snapshot";
import { createBrowserAionConversationStore } from "./browser";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  getCalls = 0;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    this.getCalls += 1;
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function snapshot(contextId: string) {
  const conversation: ChatConversationState = {
    id: contextId,
    agent: {
      id: "distribution-1",
      title: "Status agent",
      availability: "available",
    },
    contextId,
    turns: [],
    messages: [],
    transcript: [],
    tasks: {},
    artifacts: {},
    seenEventIds: {},
  };
  return createAionConversationSnapshot(conversation, {
    updatedAt: "2026-09-03T12:00:00.000Z",
  });
}

describe("createBrowserAionConversationStore", () => {
  it("does not read storage until an operation uses it", async () => {
    const storage = new MemoryStorage();
    const store = createBrowserAionConversationStore({
      scopeKey: "user-1:organization-1:playground",
      storage,
    });

    expect(storage.getCalls).toBe(0);
    await store.list("distribution-1");
    expect(storage.getCalls).toBe(1);
  });

  it("isolates the same agent and context across host scopes", async () => {
    const storage = new MemoryStorage();
    const first = createBrowserAionConversationStore({
      scopeKey: "user-1:organization-1:playground",
      storage,
    });
    const second = createBrowserAionConversationStore({
      scopeKey: "user-2:organization-1:playground",
      storage,
    });

    await first.save("distribution-1", snapshot("context-1"));

    expect(await first.list("distribution-1")).toHaveLength(1);
    expect(await second.list("distribution-1")).toEqual([]);
    expect(storage.values.size).toBe(1);
  });

  it("isolates recovery from an invalid scoped envelope", async () => {
    const storage = new MemoryStorage();
    const first = createBrowserAionConversationStore({
      scopeKey: "scope-1",
      storage,
    });
    const second = createBrowserAionConversationStore({
      scopeKey: "scope-2",
      storage,
    });
    await first.save("distribution-1", snapshot("context-1"));
    await second.save("distribution-1", snapshot("context-2"));
    const firstKey = Array.from(storage.values.keys()).find((key) =>
      key.endsWith("scope-1"),
    );
    if (!firstKey) {
      throw new Error("Expected the first scoped storage key.");
    }
    storage.values.set(firstKey, "{not-json");

    expect(await first.list("distribution-1")).toEqual([]);
    expect(await second.list("distribution-1")).toHaveLength(1);
    expect(storage.values.has(firstKey)).toBe(false);
  });
});
