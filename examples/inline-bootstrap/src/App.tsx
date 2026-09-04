import {
  AionChatProvider,
  AionChatTheme,
  AionChatView,
  type AionChatTransport,
} from "@terminal-research/aion-chat-react";
import { useState } from "react";
import { Button, Container, Stack } from "react-bootstrap";

import { fakeTransport, fixtureUploader } from "./transports";

const agent = {
  id: "example-agent",
  title: "Example agent",
  availability: "available" as const,
};

export function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [transportMode, setTransportMode] = useState<"fake" | "apollo">(
    "fake",
  );
  const [transport, setTransport] =
    useState<AionChatTransport>(fakeTransport);
  const [transportLoading, setTransportLoading] = useState(false);
  const [transportError, setTransportError] = useState<string>();
  const [narrow, setNarrow] = useState(false);

  const toggleTransport = async () => {
    if (transportMode === "apollo") {
      setTransport(fakeTransport);
      setTransportMode("fake");
      return;
    }

    setTransportLoading(true);
    setTransportError(undefined);
    try {
      const { apolloTransport } = await import("./apollo-transport");
      setTransport(apolloTransport);
      setTransportMode("apollo");
    } catch {
      setTransportError("The Apollo transport fixture could not be loaded.");
    } finally {
      setTransportLoading(false);
    }
  };

  return (
    <main className="fixture-shell bg-body-tertiary" data-bs-theme={theme}>
      <Container className="fixture-container py-4">
        <Stack className="mb-3 flex-wrap" direction="horizontal" gap={3}>
          <div>
            <h1 className="h4 mb-1">Aion chat React</h1>
            <p className="text-body-secondary mb-0">
              Inline Bootstrap and injected-transport fixture
            </p>
          </div>
          <Stack className="ms-auto" direction="horizontal" gap={2}>
            <Button
              variant="outline-primary"
              aria-pressed={transportMode === "apollo"}
              disabled={transportLoading}
              onClick={() => void toggleTransport()}
            >
              {transportLoading
                ? "Loading Apollo…"
                : `Use ${
                    transportMode === "fake" ? "injected Apollo" : "fake"
                  }`}
            </Button>
            <Button
              variant="outline-primary"
              aria-pressed={narrow}
              onClick={() => setNarrow(!narrow)}
            >
              {narrow ? "Desktop width" : "Narrow width"}
            </Button>
            <Button
              variant="outline-primary"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              Use {theme === "light" ? "dark" : "light"} theme
            </Button>
          </Stack>
        </Stack>
        {transportError ? (
          <p className="alert alert-danger" role="alert">
            {transportError}
          </p>
        ) : null}
        <AionChatTheme
          className={[
            "aion-chat-bootstrap-theme",
            "fixture-chat",
            narrow && "fixture-chat--narrow",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <AionChatProvider
            key={transportMode}
            transport={transport}
            attachmentUploader={fixtureUploader}
            defaultAgent={agent}
          >
            <AionChatView />
          </AionChatProvider>
        </AionChatTheme>
      </Container>
    </main>
  );
}
