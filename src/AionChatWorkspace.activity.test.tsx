import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AionChatWorkspace } from "./AionChatWorkspace";
import type { ChatAgent } from "./model";
import { FakeAionChatTransport } from "./testing/fake-transport";

const agent: ChatAgent = {
  id: "agent",
  title: "Agent",
  availability: "available",
};

afterEach(cleanup);

async function startRequest(transport: FakeAionChatTransport) {
  render(<AionChatWorkspace fixedAgent={agent} transport={transport} />);
  await waitFor(() => expect(
    screen.getByRole("button", { name: "New thread" }).hasAttribute("disabled"),
  ).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "New thread" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
    target: { value: "Waiting request" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  const threads = within(screen.getByRole("region", { name: "Threads" }));
  const indicator = threads.getByRole("status");
  expect(indicator.textContent).toBe("Task in progress");
  expect(indicator.getAttribute("data-activity-phase")).toBe("pending");
  expect(screen.getByText("Waiting for the agent")).toBeTruthy();
  return threads;
}

describe("workspace thread request activity", () => {
  it.each(["completed", "failed", "canceled"] as const)(
    "shows waiting before any feed update and clears when the request is %s",
    async (outcome) => {
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => { finish = resolve; });
      const transport = new FakeAionChatTransport(async (request) => {
        await pending;
        const base = {
          eventId: "finished",
          requestId: request.requestId,
          occurredAt: "2026-09-29T12:00:00Z",
        };
        return [{ event: outcome === "failed" ? {
          ...base,
          type: "run.failed" as const,
          error: { code: "test", message: "Request failed", retryable: false },
        } : { ...base, type: "run.completed" as const } }];
      });
      const threads = await startRequest(transport);
      if (outcome === "canceled") {
        fireEvent.click(screen.getByRole("button", { name: "Stop" }));
      }
      await act(() => { finish(); return pending; });
      await waitFor(() => expect(threads.queryByRole("status")).toBeNull());
      expect(threads.queryByText("Task completed")).toBeNull();
    },
  );

  it("does not leave local waiting on the previous thread after selection changes", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const transport = new FakeAionChatTransport(async () => {
      await pending;
      return [];
    });
    const threads = await startRequest(transport);
    fireEvent.click(screen.getByRole("button", { name: "New thread" }));
    await waitFor(() => expect(threads.queryByRole("status")).toBeNull());
    await act(() => { finish(); return pending; });
    expect(threads.queryByRole("status")).toBeNull();
  });
});
