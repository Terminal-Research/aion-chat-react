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
  it.each(["2026-09-12T11:59:00Z", "2026-09-12T12:00:00Z"])(
    "does not replace a read with an older or equal summary event (%s)",
    (updatedAt) => {
      const store = createConversationUpdatesStore();
      const read = store.getState().beginRead();
      store.getState().hydrate("catalog-agent", [{ contextId: "context",
        lastActivityAt: scope.updatedAt, title: "Current",
        summaryUpdatedAt: scope.updatedAt }], read);
      store.getState().apply({ reset: false, updates: [{
        ...summary("Outdated", 20), updatedAt,
        createdAt: "2026-09-12T13:00:00Z",
      }] }, agentId);
      expect(selectConversationMetadata(store.getState(), "catalog-agent", "context"))
        .toMatchObject({ title: "Current", revealUntil: 0 });
    },
  );

  it("orders summaries by their own version, not later task activity", () => {
    const store = createConversationUpdatesStore();
    const read = store.getState().beginRead();
    store.getState().hydrate("catalog-agent", [{ contextId: "context",
      lastActivityAt: "2026-09-12T15:00:00Z", title: "Old",
      summaryUpdatedAt: "2026-09-12T11:00:00Z" }], read);
    store.getState().apply({ reset: false, updates: [summary("Current")] }, agentId, 0);
    expect(selectConversationMetadata(store.getState(), "catalog-agent", "context"))
      .toMatchObject({ title: "Current", summaryUpdatedAt: scope.updatedAt,
        revealUntil: 600 });
  });

  it("accepts a newer persisted read even when an older event arrived during it", () => {
    const store = createConversationUpdatesStore();
    const read = store.getState().beginRead();
    store.getState().apply({ reset: false, updates: [summary("Old")] }, agentId);
    store.getState().hydrate("catalog-agent", [{ contextId: "context",
      lastActivityAt: scope.updatedAt, title: "Current",
      summaryUpdatedAt: "2026-09-12T12:01:00Z" }], read);
    expect(selectConversationMetadata(store.getState(), "catalog-agent", "context"))
      .toMatchObject({ title: "Current", revealUntil: 0 });
  });

  it("rejects a stale read even when requested after a newer live event", () => {
    const store = createConversationUpdatesStore();
    store.getState().apply({ reset: false, updates: [summary("Current")] }, agentId);
    const read = store.getState().beginRead();
    store.getState().hydrate("catalog-agent", [{ contextId: "context",
      lastActivityAt: scope.updatedAt, title: "Old",
      summaryUpdatedAt: "2026-09-12T11:59:00Z" }], read);
    expect(selectConversationMetadata(store.getState(), "catalog-agent", "context")?.title)
      .toBe("Current");
  });

  it("retains the version while policy hides text and restores it on a later read", () => {
    const store = createConversationUpdatesStore();
    store.getState().apply({ reset: false, updates: [summary("Current")] }, agentId);
    const row = { contextId: "context", lastActivityAt: scope.updatedAt };
    store.getState().hydrate("catalog-agent", [{ ...row, title: null,
      summary: null, summaryUpdatedAt: null }], store.getState().beginRead());
    store.getState().apply({ reset: false, updates: [summary("Delayed", 20)] }, agentId);
    expect(selectConversationMetadata(store.getState(), "catalog-agent", "context")?.title)
      .toBeNull();
    store.getState().hydrate("catalog-agent", [{ ...row, title: "Current",
      summaryUpdatedAt: scope.updatedAt }], store.getState().beginRead());
    expect(selectConversationMetadata(store.getState(), "catalog-agent", "context")?.title)
      .toBe("Current");
  });

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
  it("clears stale working activity when the latest task completes", () => {
    const store = createConversationUpdatesStore();
    const activity = () => conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ));
    store.getState().apply({ reset: false, updates: [
      task("stuck", working),
      task("latest", working, "2026-09-12T12:01:00Z"),
    ] }, agentId, 0);
    expect(activity()).toBe("pending");
    const finished = task("latest", completed, "2026-09-12T12:02:00Z");
    store.getState().apply({ reset: false, updates: [finished] }, agentId, 10);
    expect(activity()).toBe("succeeded");
    expect(selectConversationThread(store.getState(), "catalog-agent", "context")
      ?.tasks.stuck?.state).toBe(working);
    store.getState().expire(1_211);
    expect(activity()).toBeUndefined();
    store.getState().apply({ reset: false, updates: [finished] }, agentId, 1_212);
    expect(activity()).toBeUndefined();
    store.getState().apply({ reset: true, updates: [task("stuck", working)] }, agentId, 1_213);
    expect(activity()).toBeUndefined();
  });

  it.each([
    ["INPUT_REQUIRED", "requires-action"],
    ["AUTH_REQUIRED", "requires-action"],
    ["FAILED", undefined],
    ["REJECTED", undefined],
    ["CANCELLED", undefined],
    ["CANCELED", undefined],
  ] as const)("uses the latest task's %s state despite older working tasks", (state, expected) => {
    const store = createConversationUpdatesStore();
    store.getState().apply({ reset: false, updates: [
      task("stuck", working),
      task("latest", `TASK_STATE_${state}`, "2026-09-12T12:01:00Z"),
    ] }, agentId, 0);
    expect(conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ))).toBe(expected);
  });

  it("keeps the latest task working when an older completion arrives late", () => {
    const store = createConversationUpdatesStore();
    store.getState().apply({ reset: false, updates: [
      task("latest", working, "2026-09-12T12:02:00Z"),
      task("older", completed),
    ] }, agentId, 0);
    expect(conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ))).toBe("pending");
    expect(selectConversationThread(store.getState(), "catalog-agent", "context")
      ?.completedUntil).toBe(0);
  });

  it("does not let delayed older tasks change activity or replay completion", () => {
    const store = createConversationUpdatesStore();
    const activity = () => conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ));
    store.getState().apply({ reset: false, updates: [
      task("latest", completed, "2026-09-12T12:02:00Z"),
    ] }, agentId, 0);
    store.getState().expire(1_201);
    store.getState().apply({ reset: false, updates: [
      task("older", working),
      task("older", completed, "2026-09-12T12:01:00Z"),
      task("stuck", working),
    ] }, agentId, 1_202);
    expect(activity()).toBeUndefined();
  });

  it("uses persisted timestamps when a reset delivers tasks out of order", () => {
    const store = createConversationUpdatesStore();
    store.getState().apply({ reset: true, updates: [
      task("latest", "TASK_STATE_INPUT_REQUIRED", "2026-09-12T12:01:00Z"),
      task("older", working),
    ] }, agentId, 0);
    expect(conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ))).toBe("requires-action");
  });

  it("uses the last accepted update for equal timestamps, including numeric task IDs", () => {
    const store = createConversationUpdatesStore();
    const activity = () => conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ));
    store.getState().apply({ reset: false, updates: [
      task("20", working), task("1", completed),
    ] }, agentId, 0);
    expect(activity()).toBe("succeeded");
    store.getState().apply({ reset: false, updates: [
      task("20", "TASK_STATE_AUTH_REQUIRED"),
    ] }, agentId, 10);
    expect(activity()).toBe("requires-action");
  });

  it("clears an earlier completion flash when a newer task fails", () => {
    const store = createConversationUpdatesStore();
    store.getState().apply({ reset: false, updates: [
      task("older", completed),
      task("latest", "TASK_STATE_FAILED", "2026-09-12T12:01:00Z"),
    ] }, agentId, 0);
    expect(conversationActivity(selectConversationThread(
      store.getState(), "catalog-agent", "context",
    ))).toBeUndefined();
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

  it.each(["COMPLETED", "FAILED", "REJECTED", "CANCELLED", "CANCELED"])(
    "retains %s guards across reconnect without replaying completion",
    (state) => {
      const store = createConversationUpdatesStore();
      const terminal = task("one", `TASK_STATE_${state}`);
      const activity = () => conversationActivity(selectConversationThread(
        store.getState(), "catalog-agent", "context",
      ));
      store.getState().apply({ reset: false, updates: [terminal] }, agentId, 0);
      store.getState().expire(1_201);
      store.getState().apply({ reset: true, updates: [] }, agentId, 1_202);
      store.getState().apply({ reset: false, updates: [
        task("one", working, "2026-09-12T11:59:00Z"),
      ] }, agentId, 1_203);
      expect(activity()).toBeUndefined();
      store.getState().apply({ reset: false, updates: [terminal] }, agentId, 1_204);
      expect(activity()).toBeUndefined();
    },
  );

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
