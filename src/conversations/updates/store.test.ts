import { describe, expect, it } from "vitest";
import {
  conversationActivity,
  selectConversationMetadata,
  selectConversationThread,
} from "./selectors";
import { createConversationUpdatesStore } from "./store";
import type {
  AionConversationUpdate,
  AionConversationUpdateScope,
} from "./types";

const scope = {
  organizationId: "org",
  agentEnvironmentId: "environment",
  distributionId: "catalog-agent",
  contextId: "context",
  updatedAt: "2026-09-12T12:00:00Z",
};
const agentId = (update: AionConversationUpdateScope) => update.distributionId;
const task = (
  taskId: string,
  taskState: string,
  updatedAt = scope.updatedAt,
): AionConversationUpdate => ({
  ...scope,
  kind: "TaskStatusUpdated",
  taskId,
  taskState,
  updatedAt,
});
const summary = (title: string, through = 1): AionConversationUpdate => ({
  ...scope,
  kind: "ConversationSummaryUpdated",
  title,
  summary: "Summary",
  summarizedThroughTurn: through,
});
const working = "TASK_STATE_WORKING";
const completed = "TASK_STATE_COMPLETED";

describe("workspace conversation updates", () => {
  it("does not reveal an unchanged title at a newer summary checkpoint", () => {
    const store = createConversationUpdatesStore();
    const read = store.getState().beginRead();
    store.getState().hydrate("catalog-agent", [{ contextId: "context",
      lastActivityAt: scope.updatedAt, title: "Old" }], read);
    store.getState().apply({ reset: false, updates: [summary("New", 10)] }, agentId, 0);
    store.getState().expire(601);
    store.getState().apply({ reset: false, updates: [summary("New", 20)] }, agentId, 700);
    expect(selectConversationMetadata(store.getState(), "catalog-agent", "context")?.revealUntil).toBe(0);
  });
  it("does not let an older directory response undo a newer authoritative read", () => {
    const store = createConversationUpdatesStore();
    const first = store.getState().beginRead();
    const second = store.getState().beginRead();
    const row = { contextId: "context", lastActivityAt: scope.updatedAt };
    store
      .getState()
      .hydrate("catalog-agent", [{ ...row, title: "Current" }], second);
    store
      .getState()
      .hydrate("catalog-agent", [{ ...row, title: "Old" }], first);
    expect(
      selectConversationMetadata(store.getState(), "catalog-agent", "context")
        ?.title,
    ).toBe("Current");
  });
  it("tracks multiple tasks and expires success without hiding pending work", () => {
    const store = createConversationUpdatesStore();
    const activity = () =>
      conversationActivity(
        selectConversationThread(store.getState(), "catalog-agent", "context"),
      );
    store
      .getState()
      .apply(
        { reset: true, updates: [task("one", working), task("two", working)] },
        agentId,
        0,
      );
    store
      .getState()
      .apply({ reset: false, updates: [task("one", completed)] }, agentId, 10);
    expect(activity()).toBe("pending");
    store
      .getState()
      .apply({ reset: false, updates: [task("two", completed)] }, agentId, 20);
    expect(activity()).toBe("succeeded");
    store.getState().expire(1_221);
    expect(activity()).toBeUndefined();
    store
      .getState()
      .apply(
        { reset: false, updates: [task("two", completed)] },
        agentId,
        1_222,
      );
    expect(activity()).toBeUndefined();
  });

  it.each(["FAILED", "REJECTED", "CANCELLED"])(
    "never flashes success for %s",
    (state) => {
      const store = createConversationUpdatesStore();
      store
        .getState()
        .apply({ reset: false, updates: [task("one", working)] }, agentId);
      store
        .getState()
        .apply(
          { reset: false, updates: [task("one", `TASK_STATE_${state}`)] },
          agentId,
        );
      expect(
        conversationActivity(
          selectConversationThread(
            store.getState(),
            "catalog-agent",
            "context",
          ),
        ),
      ).toBeUndefined();
    },
  );

  it("resets missed task state and does not replay historical success", () => {
    const store = createConversationUpdatesStore();
    store
      .getState()
      .apply({ reset: false, updates: [task("one", working)] }, agentId);
    store.getState().apply({ reset: true, updates: [] }, agentId);
    expect(
      conversationActivity(
        selectConversationThread(store.getState(), "catalog-agent", "context"),
      ),
    ).toBeUndefined();
    store
      .getState()
      .apply({ reset: true, updates: [task("old", completed)] }, agentId);
    expect(
      conversationActivity(
        selectConversationThread(store.getState(), "catalog-agent", "context"),
      ),
    ).toBeUndefined();
  });

  it("ignores stale states and preserves requires-action as nonterminal", () => {
    const store = createConversationUpdatesStore();
    store
      .getState()
      .apply(
        { reset: false, updates: [task("one", "TASK_STATE_AUTH_REQUIRED")] },
        agentId,
      );
    store.getState().apply(
      {
        reset: false,
        updates: [task("one", working, "2026-09-11T00:00:00Z")],
      },
      agentId,
    );
    expect(
      conversationActivity(
        selectConversationThread(store.getState(), "catalog-agent", "context"),
      ),
    ).toBe("requires-action");
  });

  it("keeps newer live text across late reads; a later policy-off read clears it", () => {
    const store = createConversationUpdatesStore();
    const metadata = () =>
      selectConversationMetadata(store.getState(), "catalog-agent", "context");
    const oldRead = store.getState().revision;
    store
      .getState()
      .apply(
        { reset: false, updates: [summary("New title", 10)] },
        agentId,
        100,
      );
    store
      .getState()
      .hydrate(
        "catalog-agent",
        [{ contextId: "context", lastActivityAt: scope.updatedAt }],
        oldRead,
      );
    expect(metadata()?.title).toBe("New title");
    expect(metadata()?.revealUntil).toBe(700);
    store
      .getState()
      .apply({ reset: false, updates: [summary("Stale title")] }, agentId, 200);
    expect(metadata()?.title).toBe("New title");
    expect(metadata()?.revealUntil).toBe(700);
    store.getState().hydrate(
      "catalog-agent",
      [
        {
          contextId: "context",
          lastActivityAt: scope.updatedAt,
          title: null,
          summary: null,
        },
      ],
      store.getState().revision,
    );
    expect(metadata()?.title).toBeNull();
    expect(metadata()?.revealUntil).toBe(0);
    store
      .getState()
      .apply(
        { reset: false, updates: [summary("Duplicate title", 10)] },
        agentId,
      );
    expect(metadata()?.title).toBeNull();
  });

  it("isolates stores and colliding context IDs across environments", () => {
    const first = createConversationUpdatesStore();
    const second = createConversationUpdatesStore();
    first.getState().apply(
      {
        reset: false,
        updates: [
          summary("First"),
          {
            ...summary("Second"),
            agentEnvironmentId: "other-env",
            distributionId: "other-agent",
          },
        ],
      },
      agentId,
    );
    expect(
      selectConversationMetadata(first.getState(), "catalog-agent", "context")
        ?.title,
    ).toBe("First");
    expect(
      selectConversationMetadata(first.getState(), "other-agent", "context")
        ?.title,
    ).toBe("Second");
    expect(
      selectConversationMetadata(second.getState(), "catalog-agent", "context"),
    ).toBeUndefined();
  });
});
