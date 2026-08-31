import {
  AionChatProvider,
  AionChatTheme,
  AionChatView,
  type ChatTransportEvent,
} from "@terminal-research/aion-chat-react";
import { FakeAionChatTransport } from "@terminal-research/aion-chat-react/testing";
import { useState } from "react";
import { Button, Container, Stack } from "react-bootstrap";

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

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  return (
    <main className="fixture-shell bg-body-tertiary" data-bs-theme={theme}>
      <Container className="fixture-container py-4">
        <Stack className="mb-3" direction="horizontal" gap={3}>
          <div>
            <h1 className="h4 mb-1">Aion chat React</h1>
            <p className="text-body-secondary mb-0">
              Inline public-export fixture
            </p>
          </div>
          <Button
            className="ms-auto"
            variant="outline-primary"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            Use {theme === "light" ? "dark" : "light"} theme
          </Button>
        </Stack>
        <AionChatTheme className="aion-chat-bootstrap-theme fixture-chat">
          <AionChatProvider transport={transport} defaultAgent={agent}>
            <AionChatView />
          </AionChatProvider>
        </AionChatTheme>
      </Container>
    </main>
  );
}
