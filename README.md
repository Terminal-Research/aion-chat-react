# Aion Chat React

An Aion-owned React component library for transport-neutral agent chat.

Version 0.1 is an ESM-only, pre-1.0 release. It provides an inline chat surface
and a contained agent/conversation workspace with fake, direct A2A,
caller-owned Apollo, and standalone GraphQL transports. React and React DOM
19.2 are the supported peer versions for this initial release.

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

## Workspace, catalog, and conversations

`AionChatWorkspace` composes the default agent picker, the selected agent's
conversation list, and the active chat view. A host may instead compose the
exported headless hooks and controlled lists, or omit navigation by supplying a
fixed agent and optional fixed context.

```tsx
import {
  AionChatTheme,
  AionChatWorkspace,
  createInMemoryAionConversationStore,
} from "@terminal-research/aion-chat-react";

<AionChatTheme>
  <AionChatWorkspace
    catalog={catalog}
    transport={transport}
    conversationDirectory={conversationDirectory}
    conversationStore={createInMemoryAionConversationStore()}
  />
</AionChatTheme>;
```

The catalog lists caller-visible A2A distributions. The optional conversation
directory remotely pages A2A context IDs with `GetContexts` and hydrates only a
selected context with `GetContext`. The separate store is a safe local cache;
use the in-memory implementation by default or import the browser store from
`@terminal-research/aion-chat-react/storage/browser` with an opaque,
user-scoped key. Never use a bearer token as that key.

The workspace also supports `fixedAgent`, `fixedContextId`, and
`startNewConversation`. A remote directory is intentionally optional so known
public agents can chat without exposing anonymous conversation history.

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

The same host client can create an authenticated agent catalog and remote
conversation directory without opening another HTTP or WebSocket connection:

```tsx
import {
  createApolloAionAgentCatalog,
  createApolloAionConversationDirectory,
} from "@terminal-research/aion-chat-react/graphql";

const catalog = createApolloAionAgentCatalog({ client, organizationId });
const conversationDirectory = createApolloAionConversationDirectory({
  client,
});
```

## Standalone GraphQL integration

Use the standalone client when a host does not already own an Apollo client.
It uses native `fetch` for HTTP operations and opens a lazy `graphql-ws`
connection only when a subscription starts. The same client can back chat and
other checked-in GraphQL operations without creating duplicate sockets.

```tsx
import {
  createStandaloneAionAgentCatalog,
  createStandaloneAionChatTransport,
  createStandaloneAionConversationDirectory,
  createStandaloneAionGraphQLClient,
} from "@terminal-research/aion-chat-react/graphql/standalone";

const client = createStandaloneAionGraphQLClient({
  organizationId,
  httpUrl: "https://api.example/api/graphql",
  webSocketUrl: "wss://api.example/ws/graphql",
  getBearerToken: async () => getCurrentUserJwt(),
});
const transport = createStandaloneAionChatTransport({ client });
const catalog = createStandaloneAionAgentCatalog({ client });
const conversationDirectory = createStandaloneAionConversationDirectory({
  client,
});
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

Authentication is owned at the adapter boundary. Core components and stores
never receive credentials. Direct A2A requests call a credential provider only
when the Agent Card requires bearer authentication. The Apollo adapter inherits
the host client's authenticated links. The standalone GraphQL client requires
an organization ID and asynchronous user-JWT callback for the current Aion
GraphQL catalog and RPC operations. A supplied credential failure is never
downgraded to anonymous access.

## Aion Files uploads

The optional Files adapter implements the existing attachment-uploader
boundary with authenticated `POST /files` and an exact-version read grant. It
requires a user JWT, organization ID, and association to the selected Aion
agent identity or distribution. The returned chat attachment contains the
temporary grant URL; the protected File create URL is never returned.

```tsx
import {
  createAionFilesAttachmentUploader,
} from "@terminal-research/aion-chat-react/uploads";

const attachmentUploader = createAionFilesAttachmentUploader({
  organizationId,
  association: { kind: "Distribution", id: distributionId },
  getBearerToken: async () => getCurrentUserJwt(),
  filesUrl: "https://api.example/files",
});

<AionChatProvider
  transport={transport}
  attachmentUploader={attachmentUploader}
  defaultAgent={agent}
>
  <AionChatView />
</AionChatProvider>;
```

Uploads are rejected before network access above 20 MiB. Grant lifetimes
default to one hour and cannot be configured above the server maximum. One
uploader preserves an operation ID for repeated attempts with the same browser
`File`, allowing a lost-response retry to replay safely. Grant URLs are
temporary credentials: do not log or persist them beyond the active message
lifecycle. File selection, screenshot capture, previews, confirmation, and
narrower accepted media types remain host concerns.

## Migrating an existing chat surface

Keep authentication, organization/project selection, and GraphQL lifecycle in
the host. Replace the existing view/controller with `AionChatWorkspace`, then
adapt the host's existing client to one of the transport exports. Map the
existing agent selector to `AionAgentCatalog`; inject an explicitly scoped
conversation store only when browser persistence is required.

Migrate event behavior before deleting the old implementation: streamed text,
unary fallback, task and status updates, artifacts, cancellation, typed errors,
and reconnect behavior should all pass through the shared transport event
model. There are no legacy-state compatibility shims in version 0.1; staging
consumers should start with a clean conversation cache when adopting it.

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
