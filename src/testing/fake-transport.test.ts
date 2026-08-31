import { describe, expect, it } from "vitest";

import type { AionChatRequest } from "../transport";
import { FakeAionChatTransport } from "./fake-transport";
import { collectAionChatTransportTrace } from "./transport-contract";

const REQUEST: AionChatRequest = {
  requestId: "request-1",
  turnId: "turn-1",
  attempt: 1,
  agent: {
    id: "distribution-1",
    title: "Status agent",
    availability: "available",
  },
  message: {
    id: "message-1",
    role: "user",
    parts: [{ type: "text", text: "Hello" }],
    createdAt: "2026-08-31T12:00:00.000Z",
  },
};

describe("FakeAionChatTransport", () => {
  it("supports the shared trace collector and disposal contract", async () => {
    const transport = new FakeAionChatTransport((request) => [
      {
        event: {
          type: "run.completed",
          eventId: "event-1",
          requestId: request.requestId,
          occurredAt: "2026-08-31T12:00:01.000Z",
        },
      },
    ]);

    await expect(collectAionChatTransportTrace(transport, REQUEST)).resolves.toEqual({
      events: [
        {
          type: "run.completed",
          eventId: "event-1",
          requestId: "request-1",
          occurredAt: "2026-08-31T12:00:01.000Z",
        },
      ],
      requestIdsMatch: true,
    });

    transport.dispose();
    await expect(
      collectAionChatTransportTrace(transport, REQUEST),
    ).rejects.toThrow("disposed");
  });
});
