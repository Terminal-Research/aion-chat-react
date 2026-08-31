import {
  AionChatProvider,
  AionChatView,
  type ChatTransportEvent,
} from "@terminal-research/aion-chat-react";
import { FakeAionChatTransport } from "@terminal-research/aion-chat-react/testing";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./fixture.css";

const agent = {
  id: "example-agent",
  title: "Example agent",
  availability: "available" as const,
};

const transport = new FakeAionChatTransport((request) => {
  const base = {
    requestId: request.requestId,
    turnId: request.turnId,
  };
  const events: readonly ChatTransportEvent[] = [
    {
      ...base,
      type: "artifact.updated",
      eventId: `${request.requestId}-1`,
      occurredAt: new Date().toISOString(),
      append: false,
      artifact: {
        id: `task-${request.requestId}:aion:stream-delta`,
        artifactId: "aion:stream-delta",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        parts: [{ type: "text", text: "This response is streaming " }],
        lastChunk: false,
      },
    },
    {
      ...base,
      type: "artifact.updated",
      eventId: `${request.requestId}-2`,
      occurredAt: new Date().toISOString(),
      append: true,
      artifact: {
        id: `task-${request.requestId}:aion:stream-delta`,
        artifactId: "aion:stream-delta",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        parts: [
          { type: "text", text: "through the public transport contract." },
        ],
        lastChunk: true,
      },
    },
    {
      type: "run.completed",
      eventId: `${request.requestId}-3`,
      requestId: request.requestId,
      occurredAt: new Date().toISOString(),
    },
  ];
  return events.map((event) => ({ event, delayMs: 250 }));
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="fixture">
      <AionChatProvider transport={transport} defaultAgent={agent}>
        <AionChatView />
      </AionChatProvider>
    </main>
  </StrictMode>,
);
