import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AionChatWorkspace } from "./AionChatWorkspace";
import { createInMemoryAionConversationStore } from "./conversations/memory-store";
import { normalizeAionRemoteConversation } from "./conversations/directory";
import type { AionConversationDirectory } from "./conversations/directory";
import { createAionChatGraphQLTransport } from "./graphql/chat-transport";
import type { AionChatGraphQLVariables } from "./graphql/types";
import { WELCOME_MESSAGE_EXTENSION_URI } from "./welcome";

afterEach(cleanup);

it.each([false, true])(
  "shows one welcome immediately and retains ordered replies after reopening (artifacts=%s)",
  async (restoreArtifacts) => {
  const agent = { id: "agent", title: "Welcome agent", availability: "available" as const };
  const now = () => "2026-09-29T13:00:00Z";
  let nextId = 0;
  const createId = () => `id-${++nextId}`;
  const sent: AionChatGraphQLVariables[] = [];
  const history: Record<string, unknown>[] = [];
  const artifacts: Record<string, unknown>[] = [];
  let contextId = "";
  const transport = createAionChatGraphQLTransport({
    getAgentCapabilities: () => Promise.resolve({
      extensions: [{ uri: WELCOME_MESSAGE_EXTENSION_URI }],
    }),
    async *observe(variables) {
      sent.push(variables);
      const request = variables.request.params.message as Record<string, unknown>;
      contextId = request.contextId as string;
      const welcome = variables.request.method === "SendMessage";
      const taskId = welcome ? "welcome-task" : `reply-task-${sent.length}`;
      const message = {
        kind: "message", messageId: `${taskId}-message`, role: "agent",
        taskId, contextId,
        parts: [{ kind: "text", text: welcome ? "Hello from the agent" : `Answer ${sent.length - 1}` }],
        extensions: welcome ? [WELCOME_MESSAGE_EXTENSION_URI] : [],
      };
      const artifact = { artifactId: "aion:stream-delta", taskId, parts: message.parts };
      history.push(request, message);
      artifacts.unshift(artifact);
      yield await Promise.resolve({ data: { a2aRpc: {
        __typename: "A2AJsonRpcSuccessResponseGQL" as const,
        jsonrpc: "2.0", id: variables.request.id,
        result: { kind: "task", id: taskId, contextId,
          history: [request, message], artifacts: [artifact],
          status: { state: "completed", message },
        },
      } } });
    },
    createEventId: createId, now,
  });
  const directory: AionConversationDirectory = {
    list: () => Promise.resolve({ contexts: contextId ? [{
      contextId, lastActivityAt: now(), title: "Welcome test",
    }] : [] }),
    load: () => Promise.resolve(normalizeAionRemoteConversation({
      contextId, history, artifacts: restoreArtifacts ? artifacts : [],
      status: { state: "completed", message: history.at(-1) },
      lastActivityAt: now(), title: "Welcome test",
    }, agent, contextId, createId)),
  };
  const props = {
    fixedAgent: agent, transport, conversationDirectory: directory,
    conversationStore: createInMemoryAionConversationStore(), createId, now,
  };
  const view = render(<AionChatWorkspace {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "New thread" }));
  const log = await screen.findByRole("log");
  await within(log).findByText("Hello from the agent");
  expect(within(log).getAllByText("Hello from the agent")).toHaveLength(1);
  expect(log.querySelector('[data-message-role="user"]')).toBeNull();
  expect(log.querySelector('[data-message-role="assistant"]')).toBeNull();
  expect(sent).toHaveLength(1);

  fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
    target: { value: "First question" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await within(log).findByText("Answer 1");
  view.unmount();

  render(<AionChatWorkspace {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: /Welcome test/u }));
  const restored = await screen.findByRole("log");
  await within(restored).findByText("Answer 1");
  const texts = () => [...restored.querySelectorAll("[data-entry-type]")]
    .map((entry) => entry.querySelector(".aion-chat__message-content, .aion-chat__artifact-content")?.textContent);
  expect(texts()).toEqual(["Hello from the agent", "First question", "Answer 1"]);
  if (!restoreArtifacts) {
    expect(restored.querySelector(".aion-chat__message--welcome")?.textContent)
      .toContain("Hello from the agent");
  }
  expect(sent).toHaveLength(2);

  fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
    target: { value: "Second question" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await within(restored).findByText("Answer 2");
  expect(texts()).toEqual([
    "Hello from the agent", "First question", "Answer 1", "Second question", "Answer 2",
  ]);
  expect(sent.filter((request) => request.request.method === "SendMessage")).toHaveLength(1);
});
