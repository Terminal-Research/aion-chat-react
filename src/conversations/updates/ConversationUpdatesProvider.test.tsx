import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AionConversationList } from "../../navigation/AionConversationList";
import { ConversationUpdatesProvider } from "./ConversationUpdatesProvider";
import type {
  AionConversationUpdates,
  AionConversationUpdatesSource,
} from "./types";

const summaries = [
  { agentId: "agent", contextId: "context", title: "Fallback" },
];
const update = {
  organizationId: "org",
  agentEnvironmentId: "environment",
  distributionId: "agent",
  contextId: "context",
  updatedAt: "2026-09-12T12:00:00Z",
};

function feed(scopeKey: string) {
  const calls: {
    signal: AbortSignal;
    resolve: (frame: IteratorResult<AionConversationUpdates>) => void;
  }[] = [];
  const source: AionConversationUpdatesSource = {
    scopeKey,
    subscribe({ signal }) {
      return {
        [Symbol.asyncIterator]() {
          return {
            next: () =>
              new Promise<IteratorResult<AionConversationUpdates>>((resolve) =>
                calls.push({ signal, resolve }),
              ),
          };
        },
      };
    },
  };
  return {
    source,
    calls,
    send(frame: AionConversationUpdates, index = calls.length - 1) {
      calls[index]!.resolve({ done: false, value: frame });
      return Promise.resolve();
    },
  };
}

function View({
  source,
  selected,
}: {
  source: AionConversationUpdatesSource;
  selected?: string;
}) {
  return (
    <ConversationUpdatesProvider source={source}>
      <AionConversationList
        summaries={summaries}
        selectedContextId={selected}
        onSelectConversation={() => {}}
      />
    </ConversationUpdatesProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("conversation subscription lifecycle", () => {
  it("keeps the feed across selection and ignores late callbacks from a replaced scope", async () => {
    const old = feed("user:old");
    const next = feed("user:new");
    const view = render(<View source={old.source} />);
    await waitFor(() => expect(old.calls).toHaveLength(1));
    view.rerender(<View source={old.source} selected="context" />);
    expect(old.calls).toHaveLength(1);
    view.rerender(<View source={next.source} selected="context" />);
    expect(old.calls[0]!.signal.aborted).toBe(true);
    await waitFor(() => expect(next.calls).toHaveLength(1));
    await act(() =>
      old.send({
        reset: false,
        updates: [
          {
            ...update,
            kind: "ConversationSummaryUpdated",
            title: "Wrong principal",
            summary: null,
            summarizedThroughTurn: 1,
          },
        ],
      }),
    );
    expect(screen.queryByText("Wrong principal")).toBeNull();
    await act(() =>
      next.send({
        reset: false,
        updates: [
          {
            ...update,
            kind: "ConversationSummaryUpdated",
            title: "Current principal",
            summary: null,
            summarizedThroughTurn: 1,
          },
        ],
      }),
    );
    expect(screen.getByText("Current principal")).toBeTruthy();
    view.unmount();
    expect(next.calls[0]!.signal.aborted).toBe(true);
  });

  it("expires completion and replacement motion without duplicate flashes", async () => {
    vi.useFakeTimers();
    const channel = feed("user");
    render(<View source={channel.source} />);
    const completed: AionConversationUpdates = {
      reset: false,
      updates: [
        {
          ...update,
          kind: "TaskStatusUpdated",
          taskId: "one",
          taskState: "TASK_STATE_COMPLETED",
        },
      ],
    };
    await act(() => channel.send(completed));
    expect(screen.getByText("Task completed")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(1_201));
    expect(screen.queryByText("Task completed")).toBeNull();
    await act(() => channel.send(completed));
    expect(screen.queryByText("Task completed")).toBeNull();
    const summary: AionConversationUpdates = {
      reset: false,
      updates: [
        {
          ...update,
          kind: "ConversationSummaryUpdated",
          title: "Replacement",
          summary: null,
          summarizedThroughTurn: 1,
        },
      ],
    };
    await act(() => channel.send(summary));
    expect(screen.getByText("Replacement").className).toBe(
      "aion-chat__thread-title-reveal",
    );
    await act(async () => vi.advanceTimersByTimeAsync(601));
    expect(screen.getByText("Replacement").className).toBe("");
    await act(() => channel.send(summary));
    expect(screen.getByText("Replacement").className).toBe("");
  });
});
