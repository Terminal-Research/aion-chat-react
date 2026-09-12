import { Observable } from "@apollo/client/core";
import { describe, expect, it, vi } from "vitest";
import { createApolloAionConversationUpdatesSource } from "./apollo-conversation-updates";
import { createStandaloneAionConversationUpdatesSource } from "./standalone-conversation-updates";
import {
  createConversationUpdatesSource,
  normalizeConversationUpdates,
} from "./conversation-updates";
import type { AionStandaloneGraphQLClient } from "./standalone-client";

const frame = { reset: true, updates: [] };
const result = { data: { conversationUpdates: frame } };

describe("conversation update adapters", () => {
  it("uses the existing Apollo subscription and disposes it on abort", async () => {
    const dispose = vi.fn();
    const subscribe = vi.fn(
      () =>
        new Observable((observer) => {
          observer.next(result);
          return dispose;
        }),
    );
    const source = createApolloAionConversationUpdatesSource({
      client: { subscribe },
      scopeKey: "user:org",
      organizationId: "org",
      principal: "aion:user:user",
    });
    const controller = new AbortController();
    const stream = source.subscribe({ signal: controller.signal });
    const iterator = stream[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual(frame);
    const pending = iterator.next();
    controller.abort();
    expect((await pending).done).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { organizationId: "org", principal: "aion:user:user" },
      }),
    );
  });

  it("uses the standalone client's same cancellable operation", async () => {
    const subscribe = vi.fn(() =>
      (async function* () {
        yield await Promise.resolve(result);
      })(),
    );
    const client = { subscribe } as unknown as AionStandaloneGraphQLClient;
    const source = createStandaloneAionConversationUpdatesSource({
      client,
      scopeKey: "user:org",
      organizationId: "org",
    });
    const controller = new AbortController();
    for await (const value of source.subscribe({ signal: controller.signal }))
      expect(value).toEqual(frame);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: "AionConversationUpdates",
        variables: { organizationId: "org" },
      }),
      { signal: controller.signal },
    );
  });

  it("rejects malformed resets, provider errors, and mismatched organization scope", async () => {
    expect(() =>
      normalizeConversationUpdates({
        data: { conversationUpdates: { reset: true, updates: [{}] } },
      }),
    ).toThrow();
    expect(() =>
      normalizeConversationUpdates({
        ...result,
        errors: [{ message: "private details" }],
      }),
    ).toThrow("Conversation updates are unavailable");
    const update = {
      kind: "TaskStatusUpdated",
      organizationId: "wrong",
      agentEnvironmentId: "env",
      contextId: "context",
      updatedAt: "2026-09-12T12:00:00Z",
      taskId: "task",
      taskState: "TASK_STATE_WORKING",
    };
    const source = createConversationUpdatesSource(
      { scopeKey: "user:org", organizationId: "org" },
      () =>
        (async function* () {
          yield await Promise.resolve({
            data: { conversationUpdates: { reset: true, updates: [update] } },
          });
        })(),
    );
    const stream = source.subscribe({ signal: new AbortController().signal });
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow();
  });
});
