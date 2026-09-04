# Aion Chat React

An Aion-owned React component library for transport-neutral agent chat.

The package is under active development and is not yet published. It provides
an inline chat surface with fake, direct A2A, caller-owned Apollo, and
standalone GraphQL transports.

See the living
[feature specification](./specs/aion-chat-react-library-spec.md) for scope,
design decisions, and implementation status.

## Local usage

The root entry exports the transport-neutral model, provider, headless hooks,
theme boundary, and inline view. Styles are an explicit package export so a
host controls when they enter its CSS cascade.

```tsx
import {
  AionChatProvider,
  AionChatTheme,
  AionChatView,
} from "@terminal-research/aion-chat-react";
import "@terminal-research/aion-chat-react/styles.css";

<AionChatTheme>
  <AionChatProvider transport={transport} defaultAgent={agent}>
    <AionChatView />
  </AionChatProvider>
</AionChatTheme>;
```

Customize the view through semantic CSS properties on `AionChatTheme`, a host
class, or a stylesheet. The main groups are `--aion-chat-color-*`,
`--aion-chat-font-*`, `--aion-chat-space-*`, `--aion-chat-radius*`,
`--aion-chat-shadow`, and `--aion-chat-focus-ring`. The example workspace maps
these properties to both standard Bootstrap 5.3 variables and Aion Cloud's
`--ins-*` equivalents.

Interaction motion uses the same CSS-variable boundary. Hosts can tune
`--aion-chat-motion-shimmer-duration`,
`--aion-chat-motion-stream-duration`,
`--aion-chat-motion-stream-blur`, and
`--aion-chat-motion-spinner-duration`. The defaults stop automatically for
`prefers-reduced-motion: reduce`.

Assistant text and streamed text artifacts use the safe default Markdown
renderer. Raw HTML and remote Markdown images are not rendered, unsafe URL
protocols are removed, and external links use opener isolation. A host can
replace the Markdown slot when it intentionally needs a different policy.

Task states and Aion `aion:thinking-delta` artifacts have default activity and
reasoning presentations. Structured data remains visible as JSON unless a host
registers a typed component by `part.data.kind` through
`slots.dataRenderers`. Message, artifact, task-activity, and error components
also remain replaceable through their typed slots.

The response indicator stays pending until normalized agent output begins,
uses Phosphor icons by default, and never treats request admission as success.
Its icon set and the complete response-activity component are replaceable
without coupling transport state to Phosphor types.

Transcript entries stay in React state and in the DOM. The default stylesheet
uses browser-native `content-visibility` containment for off-screen work; it
does not window or truncate long conversations.

Component slots accept an optional replacement component and default props.
Controller-owned values such as the current draft and send handlers remain
owned by the chat view.

```tsx
<AionChatView
  slots={{
    composer: { props: { placeholder: "Ask the agent" } },
    message: { component: CustomMessage },
  }}
/>;
```

To enable the default attachment picker, inject an `AionAttachmentUploader`
into `AionChatProvider`. The controller uploads selected files through that
transport-independent boundary, blocks submission while a draft is uploading
or failed, and converts completed uploads into URL-backed message parts. The
provider never creates a GraphQL or HTTP upload client itself.

## Direct A2A integration

The optional direct adapter discovers an A2A 1.0 Agent Card, chooses the first
declared `HTTP+JSON` or `JSONRPC` interface, and requires advertised streaming
support. It sends no cookies or bearer header for a public card. When the card
requires HTTP bearer authentication, the callback is invoked for the current
request and may return a refreshed token.

```tsx
import {
  createDirectAionA2ATransport,
} from "@terminal-research/aion-chat-react/a2a";

const transport = createDirectAionA2ATransport({
  agentCardUrl: "https://agent.example/.well-known/agent-card.json",
  credentials: {
    getBearerToken: async ({ signal }) => getCurrentToken({ signal }),
  },
});
```

Pass `agentCard` instead of `agentCardUrl` when the host already resolved the
card. The transport validates the same current card shape before every call,
sends `A2A-Version: 1.0`, maps responses into the shared chat event model, and
closes the SSE reader on completion or browser cancellation.

## Host Apollo integration

The optional Apollo adapter wraps a client that the host already configured
for authentication and subscriptions. It does not create, reconnect, reset, or
dispose that client. By default, the selected agent ID is sent as the Aion
distribution ID; use `targetForAgent` when the host uses another target
selector.

```tsx
import { useApolloClient } from "@apollo/client";
import {
  createApolloAionChatTransport,
} from "@terminal-research/aion-chat-react/graphql";

const client = useApolloClient();
const transport = createApolloAionChatTransport({ client });
```

## Standalone GraphQL integration

Use the standalone client when a host does not already own an Apollo client.
It uses native `fetch` for HTTP operations and opens a lazy `graphql-ws`
connection only when a subscription starts. The same client can back chat and
other checked-in GraphQL operations without creating duplicate sockets.

```tsx
import {
  createStandaloneAionChatTransport,
  createStandaloneAionGraphQLClient,
} from "@terminal-research/aion-chat-react/graphql/standalone";

const client = createStandaloneAionGraphQLClient({
  organizationId,
  httpUrl: "https://api.example/api/graphql",
  webSocketUrl: "wss://api.example/ws/graphql",
  getBearerToken: async () => getCurrentUserJwt(),
});
const transport = createStandaloneAionChatTransport({ client });
```

The client sends no cookies. Aion's current WebSocket authentication requires
the bearer token on the upgrade URL; the client also sends the same value in
GraphQL connection parameters. Server request logging must continue to omit
query strings, and hosts must not log constructed socket URLs or tokens.

Changing the value returned by `getBearerToken` does not reauthenticate an
already-open socket. Call `await client.reconnect()` after a login or explicit
credential transition, then let the next subscription open the new socket.
Call `await client.dispose()` when the owning integration unmounts; repeated
disposal is safe. Automatic reconnect attempts also re-read the token. Browser
extension CSP, permissions, and content-script mounting remain deferred until
there is a concrete extension host.

Run `npm run check` to validate the library, packed artifact, and both example
fixtures. The fixtures can also be run independently:

```sh
npm run dev --workspace \
  @terminal-research/aion-chat-react-example-inline-bootstrap
npm run dev --workspace \
  @terminal-research/aion-chat-react-example-inline-css
```

The Bootstrap fixture switches between fake and injected Apollo transports and
can constrain itself to a narrow layout. The framework-neutral fixture proves
that the default theme does not require host CSS. Bundle baselines and enforced
limits are documented in [BUNDLE_BUDGETS.md](./BUNDLE_BUDGETS.md).
