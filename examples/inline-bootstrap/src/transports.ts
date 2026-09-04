import type {
  AionAttachmentUploader,
  ChatTransportEvent,
} from "@terminal-research/aion-chat-react";
import {
  FakeAionChatTransport,
} from "@terminal-research/aion-chat-react/testing";

export const fakeTransport = new FakeAionChatTransport((request) => {
  const base = {
    requestId: request.requestId,
    turnId: request.turnId,
  };
  const events: readonly ChatTransportEvent[] = [
    {
      ...base,
      type: "task.status-changed",
      eventId: `${request.requestId}-working`,
      occurredAt: new Date().toISOString(),
      taskId: `task-${request.requestId}`,
      contextId: `context-${request.requestId}`,
      state: "working",
      final: false,
    },
    {
      ...base,
      type: "artifact.updated",
      eventId: `${request.requestId}-thinking`,
      occurredAt: new Date().toISOString(),
      append: false,
      artifact: {
        id: `task-${request.requestId}:aion:thinking-delta`,
        artifactId: "aion:thinking-delta",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        parts: [{ type: "text", text: "Checking the fixture state." }],
        lastChunk: true,
      },
    },
    {
      ...base,
      type: "artifact.updated",
      eventId: `${request.requestId}-first`,
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
      eventId: `${request.requestId}-final`,
      occurredAt: new Date().toISOString(),
      append: true,
      artifact: {
        id: `task-${request.requestId}:aion:stream-delta`,
        artifactId: "aion:stream-delta",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        parts: [
          {
            type: "text",
            text:
              "through the fake transport contract.\n\n" +
              "```ts\nconst streamed = true;\n```",
          },
        ],
        lastChunk: true,
      },
    },
    {
      ...base,
      type: "artifact.updated",
      eventId: `${request.requestId}-file`,
      occurredAt: new Date().toISOString(),
      append: false,
      artifact: {
        id: `task-${request.requestId}:fixture-file`,
        artifactId: "fixture-file",
        taskId: `task-${request.requestId}`,
        contextId: `context-${request.requestId}`,
        name: "Fixture output",
        parts: [
          {
            type: "file",
            file: {
              name: "fixture.txt",
              mediaType: "text/plain",
              url: "https://files.example/fixture.txt",
            },
          },
        ],
        lastChunk: true,
      },
    },
    {
      ...base,
      type: "task.status-changed",
      eventId: `${request.requestId}-completed`,
      occurredAt: new Date().toISOString(),
      taskId: `task-${request.requestId}`,
      contextId: `context-${request.requestId}`,
      state: "completed",
      final: true,
    },
  ];
  return events.map((event) => ({ event, delayMs: 300 }));
});

export const fixtureUploader: AionAttachmentUploader = {
  upload(file) {
    return Promise.resolve({
      url: `https://files.example/${encodeURIComponent(file.name)}`,
      name: file.name,
      mediaType: file.type,
    });
  },
};
