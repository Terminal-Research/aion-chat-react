import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  AionChatTheme,
  AionChatWorkspace,
  type AionAgentCatalog,
  type AionAgentProfileSource,
  type AionConversationDirectory,
  type ChatAgent,
  type ChatConversationState,
  type ChatMessage,
} from "../../../src/index";
import { createBrowserAionConversationStore } from "../../../src/storage/browser";
import { FakeAionChatTransport } from "../../../src/testing";
import "../../../src/styles/aion-chat.css";
import "./fixture.css";

const AVAILABLE_AGENT: ChatAgent = {
  id: "available-agent",
  title: "Available agent",
  availability: "available",
};
const UNAVAILABLE_AGENT: ChatAgent = {
  id: "unavailable-agent",
  title: "Unavailable agent",
  availability: "unavailable",
  unavailableReason: "This fixture agent is paused.",
};
const AVAILABLE_CONTEXT_IDS = Array.from(
  { length: 40 },
  (_, index) => `available-context-${String(index + 1).padStart(2, "0")}`,
);
const UNAVAILABLE_CONTEXT_IDS = ["unavailable-context"];

const catalog: AionAgentCatalog = {
  list: () =>
    Promise.resolve(
      [AVAILABLE_AGENT, UNAVAILABLE_AGENT].map((agent) => ({
        agent,
        identityId: `${agent.id}-identity`,
        distributionId: `${agent.id}-distribution`,
        organizationId: "browser-fixture",
        identityType: "Principal" as const,
      })),
    ),
};

function contextIdsFor(agent: ChatAgent): readonly string[] {
  return agent.id === AVAILABLE_AGENT.id
    ? AVAILABLE_CONTEXT_IDS
    : UNAVAILABLE_CONTEXT_IDS;
}

function conversation(
  agent: ChatAgent,
  contextId: string,
): ChatConversationState {
  const messageCount = contextId === AVAILABLE_CONTEXT_IDS[0] ? 64 : 2;
  const messages: ChatMessage[] = Array.from(
    { length: messageCount },
    (_, index) => ({
      id: `${contextId}-message-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [
        {
          type: "text",
          text:
            index === 0
              ? `${contextId} prompt`
              : `Historical response ${index} for ${contextId}.`,
        },
      ],
      contextId,
      createdAt: new Date(Date.UTC(2026, 8, 1, 12, index)).toISOString(),
    }),
  );
  return {
    id: contextId,
    agent,
    contextId,
    turns: [],
    messages,
    transcript: messages.map((message) => ({
      type: "message" as const,
      id: message.id,
    })),
    tasks: {},
    artifacts: {},
    seenEventIds: {},
  };
}

const directory: AionConversationDirectory = {
  list: (agent, options = {}) => {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    const contextIds = contextIdsFor(agent);
    const page = contextIds.slice(offset, offset + limit);
    return Promise.resolve({
      contextIds: page,
      nextOffset: offset + page.length < contextIds.length
        ? offset + page.length
        : undefined,
    });
  },
  load: (agent, contextId) => Promise.resolve(conversation(agent, contextId)),
};

const profileSource: AionAgentProfileSource = {
  load: (identityId) =>
    Promise.resolve({
      identity: {
        id: identityId,
        agentType: "Principal",
        organizationId: "browser-fixture",
        name: "Available agent",
        atName: "available-agent",
        biography: "A browser fixture agent.",
        email: "available@example.test",
        website: "https://example.test/available-agent",
      },
      channels: [
        {
          distributionId: "available-agent-distribution",
          networkType: "Playground",
          projectId: "browser-fixture-project",
          projectName: "Browser fixture",
          agentEnvironmentName: "Production",
        },
      ],
    }),
};

const transport = new FakeAionChatTransport(() => []);
const store = createBrowserAionConversationStore({
  scopeKey: "browser-fixture",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="browser-fixture">
      <AionChatTheme className="browser-fixture__theme">
        <AionChatWorkspace
          catalog={catalog}
          agentProfileSource={profileSource}
          conversationDirectory={directory}
          conversationStore={store}
          transport={transport}
          attachmentUploader={{
            upload: (file) =>
              Promise.resolve({
                url: `https://example.test/${encodeURIComponent(file.name)}`,
              }),
          }}
        />
      </AionChatTheme>
    </main>
  </StrictMode>,
);
