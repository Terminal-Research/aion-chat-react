import {
  AionChatProvider,
  AionChatTheme,
  AionChatView,
  type ChatTransportEvent,
} from "@terminal-research/aion-chat-react";
import {
  FakeAionChatTransport,
} from "@terminal-research/aion-chat-react/testing";

const agent = {
  id: "framework-neutral-agent",
  title: "Framework-neutral agent",
  availability: "available" as const,
};

const transport = new FakeAionChatTransport((request) => {
  const events: readonly ChatTransportEvent[] = [
    {
      type: "artifact.updated",
      eventId: `${request.requestId}-thinking`,
      requestId: request.requestId,
      occurredAt: new Date().toISOString(),
      turnId: request.turnId,
      append: false,
      artifact: {
        id: `${request.requestId}:aion:thinking-delta`,
        artifactId: "aion:thinking-delta",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        parts: [{ type: "text", text: "Reviewing the request." }],
        lastChunk: true,
      },
    },
    {
      type: "artifact.updated",
      eventId: `${request.requestId}-answer`,
      requestId: request.requestId,
      occurredAt: new Date().toISOString(),
      turnId: request.turnId,
      append: false,
      artifact: {
        id: `${request.requestId}:aion:stream-delta`,
        artifactId: "aion:stream-delta",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        parts: [
          {
            type: "text",
            text:
              "## Framework-neutral response\n\n" +
              "No host CSS framework is required.",
          },
        ],
        lastChunk: true,
      },
    },
  ];
  return events.map((event) => ({ event, delayMs: 300 }));
});

const uploader = {
  upload(file: File) {
    return Promise.resolve({
      url: `https://files.example/${encodeURIComponent(file.name)}`,
      name: file.name,
      mediaType: file.type,
    });
  },
};

export function App() {
  return (
    <main className="fixture-page">
      <header>
        <h1>Aion chat without a CSS framework</h1>
        <p>This fixture exercises the package defaults at a narrow width.</p>
      </header>
      <AionChatTheme className="fixture-chat">
        <AionChatProvider
          transport={transport}
          attachmentUploader={uploader}
          defaultAgent={agent}
        >
          <AionChatView />
        </AionChatProvider>
      </AionChatTheme>
    </main>
  );
}
