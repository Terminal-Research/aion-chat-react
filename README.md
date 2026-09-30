# Aion Chat React

An Aion-owned React component library for transport-neutral agent chat.

Version 0.1 is an ESM-only, pre-1.0 release. It provides an inline chat surface
and a contained agent/conversation workspace with fake, direct A2A,
caller-owned Apollo, and standalone GraphQL transports. React and React DOM
19.2 are the supported peer versions for this initial release.

See the living
[feature specification](./specs/aion-chat-react-library-spec.md) for scope,
design decisions, and implementation status.

## Installation

The source repository is public, but the package is not yet published to the
npm registry. Aion-owned consumers should pin a reviewed commit or release tag
in `package.json`:

```json
{
  "dependencies": {
    "@terminal-research/aion-chat-react":
      "github:Terminal-Research/aion-chat-react#<commit-or-tag>"
  }
}
```

Running `npm install` builds the package from that Git reference through its
`prepare` lifecycle. Commit the resulting lockfile so staging and production
builds resolve the same source revision. Avoid depending on the moving `main`
branch.

The public repository does not make the React package a supported third-party
embed surface. Future customer-page distributions will receive a small Aion
loader script that mounts an Aion-hosted, cross-origin iframe. The iframe
application will consume this library internally; customer sites will not need
React, GraphQL, or Aion package dependencies.

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

Use `AionChatTheme` to customize the shared semantic CSS variables. See the
[styling guide](#styling-guide) for theme, layout, profile, and Bootstrap
integration examples.

Assistant text and streamed text artifacts use the safe default Markdown
renderer. Raw HTML and remote Markdown images are not rendered, unsafe URL
protocols are removed, and external links use opener isolation. A host can
replace the Markdown slot when it intentionally needs a different policy.

URL-backed file parts with an `image/*` media type render inline in their
original part order, so text, an image, and more text remain separate sections.
Previews preserve aspect ratio and stay within 20% of the viewport height.
Click or keyboard-activate an image to open a larger, screen-fitting view in the
themed modal; close it with the X button, Escape, or the backdrop. Failed image
loads fall back to the file link. Other file parts keep their attachment
presentation, and byte-only images do not create a preview.

Pass a stable `linkPreviewSource` to `AionChatWorkspace`, `AionChatView`, or
`AionChatTranscript` to enable cards below completed assistant responses. Links
are discovered using Markdown semantics, deduplicated in first-appearance order,
and excluded when the same URL is already an explicit file part. Code examples,
Markdown images, and thinking artifacts do not create cards. Cards stay in one
horizontally scrollable strip with a hidden scrollbar. Compact 13rem cards use
thumbnails capped at the smaller of `12vh` or `6rem`; touch, trackpad, and
keyboard focus can move through the strip.

```tsx
import { useMemo } from "react";
import { createApolloAionLinkPreviewSource } from
  "@terminal-research/aion-chat-react/graphql";

const linkPreviewSource = useMemo(
  () => createApolloAionLinkPreviewSource({ client }),
  [client],
);
<AionChatWorkspace transport={transport} linkPreviewSource={linkPreviewSource} />;
```

The adapters use the authenticated backend `linkPreviews(urls: [String!]!)`
query to resolve every distinct link in a completed response in one request.
There is no link-count limit. The standalone GraphQL entry also exports
`createStandaloneAionLinkPreviewSource`. Custom sources can implement
`AionLinkPreviewSource.loadMany(urls, { signal })` to return available previews
in input order. Sources that only implement `load(url, { signal })` resolve all
links concurrently. Unmounting or changing the response cancels the request;
late results are ignored and no automatic retries occur. Missing metadata or
an older backend without the batch query leaves the original links usable.

Every preview card opens its original URL in a new browser tab or window,
including image, YouTube, Vimeo, and X links. Preview cards do not create dialogs
or provider frames. Explicit image file parts retain their separate image viewer.
The client accepts validated metadata and public image URLs, never provider HTML.

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

## Styling guide

The library owns component structure and default styles; the host owns page
layout and theme values. Bootstrap, Tailwind, and CopilotKit styles are not
required. Import `@terminal-research/aion-chat-react/styles.css` once in your
application entry, then keep host customizations in one small stylesheet.

### Theme boundary and overrides

Put your theme class on `AionChatTheme`, not only on the workspace or a parent
page. Defaults are declared directly on `:where(.aion-chat-theme)`, so a class
on that same element overrides them without `!important`. Variables set only
on an ancestor (including `:root`) are superseded by those local defaults.
Independent theme boundaries can coexist on one page.

```tsx
import {
  AionChatTheme,
  AionChatWorkspace,
} from "@terminal-research/aion-chat-react";
import "@terminal-research/aion-chat-react/styles.css";
import "./chat-theme.css";

<AionChatTheme className="product-chat">
  <AionChatWorkspace catalog={catalog} transport={transport} />
</AionChatTheme>;
```

```css
/* chat-theme.css */
.product-chat {
  --aion-chat-font-family: system-ui, sans-serif;
  --aion-chat-font-size: 1rem;
  --aion-chat-content-font-size: 16px;
  --aion-chat-color-accent: #315efb;
  --aion-chat-color-accent-contrast: #ffffff;
  --aion-chat-radius: 0.5rem;
  --aion-chat-radius-small: 0.25rem;
  --aion-chat-navigation-width: 19rem;
  --aion-chat-shadow: none;

  width: 100%;
  min-width: 0;
  height: 40rem;
}
```

For runtime values, the `style` prop also accepts `--aion-chat-*` properties.
Extracted style objects can use the exported `AionChatThemeStyle` type:

```tsx
import type { AionChatThemeStyle } from "@terminal-research/aion-chat-react";

const theme = {
  "--aion-chat-color-accent": "#315efb",
  "--aion-chat-radius-small": "0.25rem",
} satisfies AionChatThemeStyle;

<AionChatTheme style={theme}>{children}</AionChatTheme>;
```

Inline values take precedence over stylesheet declarations. Theme variables
follow normal CSS inheritance inside the boundary, including the built-in
profile, image, and response-detail dialogs: their portal target is inside the
theme element. Place standalone `AionAgentProfile` components inside a theme too.
Custom portaled components can use `useAionChatPortalContainer()` to retain
that scope instead of rendering into `document.body`.

### Common tokens

These are the main customization points; the complete defaults and selectors
live in [aion-chat.css](./src/styles/aion-chat.css).

| Purpose | CSS properties |
| --- | --- |
| Typography | `--aion-chat-font-family`, `--aion-chat-font-heading`, `--aion-chat-font-mono`, `--aion-chat-font-size`, `--aion-chat-line-height` |
| Transcript, composer, and thread titles | `--aion-chat-content-font-size` (default `16px`) |
| Surfaces | `--aion-chat-color-background`, `--aion-chat-color-surface`, `--aion-chat-color-surface-emphasis` |
| Text, subtle actions, and borders | `--aion-chat-color-text`, `--aion-chat-color-muted`, `--aion-chat-color-action-muted`, `--aion-chat-color-border` |
| Primary and status colors | `--aion-chat-color-accent`, `--aion-chat-color-accent-contrast`, `--aion-chat-color-danger`, `--aion-chat-color-success`, `--aion-chat-color-info` |
| Message backgrounds and code | `--aion-chat-color-user-message`, `--aion-chat-color-assistant-message`, `--aion-chat-color-code` |
| Shape and focus | `--aion-chat-radius`, `--aion-chat-radius-small`, `--aion-chat-shadow`, `--aion-chat-focus-ring` |
| Spacing | `--aion-chat-space-1` through `--aion-chat-space-5` (defaults: `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`) |
| Widths | `--aion-chat-navigation-width` (default `18rem`), `--aion-chat-max-message-width` (default `80%`) |
| Avatars | `--aion-chat-avatar-background`, `--aion-chat-avatar-color`, `--aion-chat-avatar-border-color`, `--aion-chat-avatar-border-width` |

`--aion-chat-font-size` is the base size, not a universal font-size override.
Content uses its separate token; thread dates remain smaller and some headings
use explicit `rem` sizes. The composer starts at one line and grows to five
before scrolling, using its computed line height, padding, and borders. Avoid
forcing a fixed textarea height that conflicts with that behavior.

### Host layout and targeted overrides

Give the theme a definite height (as above), or put it in a constrained
flex/grid layout. The workspace and chat view fill their containing height;
the workspace has a default minimum height of `28rem`. Use `min-height: 0`
and `min-width: 0` on shrinking host flex/grid children as needed so the
transcript scrolls inside the panel rather than expanding the page.

Selecting a thread opens it at the latest message and keeps the bottom in view
as restored content finishes laying out. Scrolling up pauses this following
until the reader returns to the bottom. The composer receives focus on devices
with a fine pointer and hover support; touch-first devices keep focus in the
navigator. Hosts can override the composer’s existing `autoFocus` prop.

The default workspace stacks navigation above chat at viewport widths of
`40rem` or less. This is a viewport media query, not a container query; a
narrow panel on a wide page may need a host-specific layout override.

Prefer tokens for colors, typography, spacing, and radii. For a structural
adjustment without a token, scope the library's named classes to your theme:

```css
/* Remove the shared frame when the host already supplies a card. */
.product-chat .aion-chat__workspace {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
```

Keep selector overrides after the library stylesheet when specificity is
equal. Avoid broad rules such as `button`, `textarea`, or `svg` that affect
unrelated controls. For markup or behavior changes, use typed component slots
instead of CSS tied to child positions. Workspace view slots are passed through
`chatViewProps.slots`; inline views accept `slots` directly.

### Bootstrap and dark mode

There is no built-in dark-mode prop or automatic palette switch. Map the
tokens to the host's theme variables, or override them on a theme class/data
attribute. Include message backgrounds, muted text, borders, code, and focus
colors when defining a dark palette—not just the panel background.

For Bootstrap 5.3, load Bootstrap in the host and use a mapping such as:

```css
.product-chat {
  --aion-chat-font-family: var(--bs-body-font-family);
  --aion-chat-font-size: var(--bs-body-font-size);
  --aion-chat-line-height: var(--bs-body-line-height);
  --aion-chat-color-background: var(--bs-body-bg);
  --aion-chat-color-surface: var(--bs-tertiary-bg);
  --aion-chat-color-surface-emphasis: var(--bs-secondary-bg);
  --aion-chat-color-text: var(--bs-body-color);
  --aion-chat-color-muted: var(--bs-secondary-color);
  --aion-chat-color-action-muted: var(--bs-secondary-color);
  --aion-chat-color-border: var(--bs-border-color);
  --aion-chat-color-accent: var(--bs-primary);
  --aion-chat-color-accent-contrast: var(--bs-white);
  --aion-chat-color-danger: var(--bs-danger-text-emphasis);
  --aion-chat-color-info: var(--bs-info-text-emphasis);
  --aion-chat-color-success: var(--bs-success-text-emphasis);
  --aion-chat-color-user-message: var(--bs-primary-bg-subtle);
  --aion-chat-color-assistant-message: var(--bs-tertiary-bg);
  --aion-chat-color-code: var(--bs-code-color);
  --aion-chat-radius: var(--bs-border-radius-lg);
  --aion-chat-radius-small: var(--bs-border-radius);
  --aion-chat-shadow: var(--bs-box-shadow);
  --aion-chat-focus-ring:
    0 0 0 var(--bs-focus-ring-width) var(--bs-focus-ring-color);
}
```

With Bootstrap loaded, `data-bs-theme="dark"` on the theme element or an
ancestor changes the mapped mode-aware values. See Bootstrap's
[color-mode documentation](https://getbootstrap.com/docs/5.3/customize/color-modes/).
Check contrast for your actual brand palette, especially accent text, buttons,
subtle actions, and focus rings in both modes. The library does not load fonts
or infer your application's palette.

The checked-in [Bootstrap adapter](./examples/inline-bootstrap/src/bootstrap-aion-chat.css)
also demonstrates `--ins-*` mappings with `--bs-*` fallbacks for Aion Cloud.
It is an example stylesheet, not a package export; copy or adapt the mappings
you need into the host. The [plain CSS example](./examples/inline-css/src/fixture.css)
demonstrates a framework-independent theme.

### Profiles and channel colors

Profiles share the same font, surface, border, spacing, avatar, and radius
tokens as chat. Response and profile copy buttons share the subtle action
color and small-radius styling. Channel icon backgrounds and hover states
derive from these semantic colors:

| Channel (`data-network`) | Theme color |
| --- | --- |
| `A2A`, `Aion` | `--aion-chat-color-accent` |
| `AgentMail`, `Telegram`, `TelegramBot` | `--aion-chat-color-info` |
| `Meet`, `AionChat`, `Voice` | `--aion-chat-color-success` |
| `Slack` | `--aion-chat-color-danger` |
| `Twitter`, `GitHub` | `--aion-chat-color-text` |

To customize one channel without changing other uses of its semantic color,
override its local token on the channel element, not on the theme root:

```css
.product-chat .aion-chat__profile-channel[data-network="AgentMail"] {
  --aion-chat-profile-channel-color: #7c3aed;
}
```

Icons use Phosphor and inherit their component colors. Avatar shape is
class-based: navigation/header avatars are circular; the profile avatar is a
larger rounded square. Use a scoped `.aion-chat__profile-avatar` override if
your host needs a different shape.

### Motion and accessibility

Tune `--aion-chat-motion-shimmer-duration`,
`--aion-chat-motion-stream-duration`, `--aion-chat-motion-stream-blur`,
`--aion-chat-motion-spinner-duration`, and
`--aion-chat-navigation-duration` on the same theme boundary. Shimmer colors
use `--aion-chat-motion-shimmer-color` and
`--aion-chat-motion-shimmer-highlight`.

The default animations respect `prefers-reduced-motion: reduce`. Preserve
those rules and visible keyboard focus when adding overrides. Validate the
theme with long messages, narrow layouts, read-only/disabled controls,
profile and response-detail dialogs, and both light and dark palettes.

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
    agentProfileSource={agentProfileSource}
    conversationDirectory={conversationDirectory}
    conversationStore={createInMemoryAionConversationStore()}
    timeZone={user.timezone ?? organization.timezone}
  />
</AionChatTheme>;
```

The catalog lists caller-visible distributions for its configured chat
network. The optional conversation directory remotely pages A2A context
summaries and their latest activity with `GetContexts`, then hydrates only a
selected context with `GetContext`. The separate store is a safe local cache;
use the in-memory implementation by default or import the browser store from
`@terminal-research/aion-chat-react/storage/browser` with an opaque,
user-scoped key. Never use a bearer token as that key.

Context activity timestamps remain UTC instants on the wire. Supply an IANA
`timeZone`, such as `America/Los_Angeles`, to format them for the current user.
When the host omits the display zone, the workspace uses the timezone resolved
by the browser or runtime and falls back to UTC when it cannot resolve one.
Hosts should pass an explicit zone when applying a user or organization
preference, or when server-rendered output must be deterministic.

The workspace also supports `fixedAgent`, `fixedContextId`, and
`startNewConversation`. A remote directory is intentionally optional so known
public agents can chat without exposing anonymous conversation history.
Supplying `agentProfileSource` enables the workspace's profile action. The
selected identity detail and active distribution usages are then loaded only
when that action opens. Hosts that already hold a detail record can render
`AionAgentProfile` from `@terminal-research/aion-chat-react/profile` directly
with `detail` instead of an identity ID and source; `additionalDetails` appends
host-specific rows without changing the shared profile model. Aion-owned
channel links default to `https://app.aion.to`; set `appBaseUrl` on the profile
or `agentProfileAppBaseUrl` on the workspace so local and staging hosts link to
their own Aion Chat and rendered Agent Card pages.

To enable the default attachment picker, inject an `AionAttachmentUploader`
into `AionChatProvider`. The controller uploads selected files through that
transport-independent boundary, blocks submission while a draft is uploading
or failed, and converts completed uploads into URL-backed message parts. The
provider never creates a GraphQL or HTTP upload client itself.

## Live conversation metadata

The workspace shows the thread-row spinner as soon as a local request starts,
including while the composer says “Waiting for the agent.” It remains until the
request settles. Live task updates continue to show background activity and the
brief completion checkmark in the same position. Both sit at the right of the
thread row, vertically centered; long titles truncate to keep them visible.
Standalone navigators and conversation lists can supply `pendingContextId` for
the same immediate feedback.

Pass an optional principal-wide source to the workspace to update background
thread activity and generated titles without changing the selected conversation:

```tsx
import { createApolloAionConversationUpdatesSource } from
  "@terminal-research/aion-chat-react/graphql";

const conversationUpdatesSource = createApolloAionConversationUpdatesSource({
  client, // the application's existing authenticated Apollo client
  organizationId,
  scopeKey: `${userId}:${organizationId}`,
});

<AionChatWorkspace
  transport={transport}
  conversationDirectory={conversationDirectory}
  conversationUpdatesSource={conversationUpdatesSource}
/>
```

Memoize the source by client, principal, and organization, not by selected agent
or thread. The standalone entry exports
`createStandaloneAionConversationUpdatesSource` with the same scope options.
Custom sources implement `AionConversationUpdatesSource`; custom catalogs can
provide `agentIdForUpdate`. By default, events map by their distribution ID,
falling back to the edge environment ID only when no distribution is provided.

The optional `conversationUpdates` GraphQL subscription requires an authenticated
principal and supports only `TaskStatusUpdated` and
`ConversationSummaryUpdated`. An initial/reconnect `reset` replaces current task
activity and refreshes loaded directory metadata. There is no replay, read
receipt, or transcript stream. Focus and reconnect recover current state;
individual updates can be missed. Summary reads expose `summaryUpdatedAt` and
summary events expose that same persisted version as `updatedAt`. Older/equal
events cannot overwrite a newer read or restart its title animation. A newer
persisted read wins over an older event even if the event arrived during the
read. Unversioned reads retain request-order guards. These versions/checkpoints
are not a global transactional cursor.

Events also expose `createdAt` for notification construction time. Neither that
timestamp, local arrival time, nor task `lastActivityAt` determines summary
freshness. Deploy the backend timestamp contract before adopting this adapter
revision; custom sources may omit `createdAt`.

Each workspace owns a non-persisted Zustand 5 store, one subscription, and its
transient animation timers. Change `scopeKey` when authentication or organization
changes; old callbacks are ignored and prior reactive state is discarded.
Local conversation snapshots retain their fallback title, not generated text.
Authorized reads that omit/null generated fields clear overrides. Summarization
policy does not disable task progress. Pending tasks are tracked individually;
successful completion briefly shows the composer's check-circle styling.
Replacement titles reveal left to right, with reduced-motion and forced-colors
support. Existing direct-A2A and local-only usage needs no updates source.

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

## Deleting conversations

The workspace's **Delete chat** action calls `DeleteContext` through the
configured conversation directory. Direct A2A, Apollo, and standalone GraphQL
directories support deletion using the same credentials and target as history
requests; no separate authentication or GraphQL endpoint is needed.

The built-in confirmation is a centered, themeable modal, not a browser
prompt. It uses a title and close button, a warning naming the thread, and
Cancel/Delete footer actions. Cancel receives initial keyboard focus; Escape
and backdrop clicks also dismiss without deleting. The dialog inherits the
active `AionChatTheme`, including typography, spacing, borders, and the
`--aion-chat-color-danger` / `--aion-chat-color-danger-contrast` colors for
Delete and `--aion-chat-color-secondary-control` /
`--aion-chat-color-secondary-control-contrast` for Cancel. It does not require
Bootstrap or a host-owned modal component.

The warning describes server deletion and cancellation of active tasks.
After the user confirms, while awaiting the server, the workspace stops its
local chat stream and uploads and prevents new messages. History is retained
on failure. An in-progress response keeps the conversation blocked with a
**Retry deletion**
action to check completion; there is no automatic retry loop. Successful
deletion (or an already-absent context) clears local history and selection.
Deletion is logical, not immediate physical erasure; backend retention controls
physical cleanup and File deletion.

Custom directories may implement `delete(agent, contextId, options)` returning
`Promise<void>` after server confirmation. Omit it for read-only directories:
the workspace disables deletion rather than silently deleting only its cache.
Workspaces without a remote directory retain explicit local-history removal.
The optional `confirmRemoveConversation` callback replaces the built-in
confirmation modal; it does not replace the server deletion call.

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
const transport = createApolloAionChatTransport({
  client,
  // Return the same authenticated graphql-ws client used by the host's link.
  getWebSocketClient: () => wsClient,
});
```

The same host client can create an authenticated agent catalog and remote
conversation directory without opening another HTTP or WebSocket connection:

```tsx
import {
  createApolloAionAgentCatalog,
  createApolloAionAgentProfileSource,
  createApolloAionConversationDirectory,
} from "@terminal-research/aion-chat-react/graphql";

const catalog = createApolloAionAgentCatalog({
  client,
  organizationId,
  networkType: "A2A",
});
const conversationDirectory = createApolloAionConversationDirectory({
  client,
});
const agentProfileSource = createApolloAionAgentProfileSource({ client });
```

## Standalone GraphQL integration

Use the standalone client when a host does not already own an Apollo client.
It uses native `fetch` for HTTP operations and opens a lazy `graphql-ws`
connection only when a subscription starts. The same client can back chat and
other checked-in GraphQL operations without creating duplicate sockets.

```tsx
import {
  createStandaloneAionAgentCatalog,
  createStandaloneAionAgentProfileSource,
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
const catalog = createStandaloneAionAgentCatalog({
  client,
  networkType: "A2A",
});
const conversationDirectory = createStandaloneAionConversationDirectory({
  client,
});
const agentProfileSource = createStandaloneAionAgentProfileSource({ client });
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

Install Chromium once with `npm exec playwright install chromium`, then run
`npm run check` to validate the library, its browser behavior, the packed
artifact, and both example fixtures. The fixtures can also be run
independently:

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

Transports expose optional `getAgentCapabilities(agent, { signal })` discovery.
Direct A2A reads its configured card. GraphQL adapters resolve the selected
message target with `a2aAgentCardUrl`, then fetch that route's card, so an
identity's preferred distribution does not override the selected chat route.
Apollo hosts must provide a client with both `query` and `subscribe` for
capability discovery. Subscription-only clients remain usable for ordinary chat.
For welcomes, also provide `getWebSocketClient`, returning the host's existing
authenticated `graphql-ws` client. The adapter cancels only that operation on
socket closure, preventing reconnect from replaying a welcome while leaving
ordinary subscriptions and connection ownership with the host. If the getter
is absent, a welcome fails before dispatch instead of using a retrying Apollo
link. Direct A2A and standalone GraphQL need no additional configuration.

Creating a thread in `AionChatWorkspace` sends one unary welcome request when
the selected route advertises the Welcome Message Extension. Headless
`useAionConversations` callers pass their `transport` to enable the same
creation action. Restoration and reconnection do not send welcomes, and failed
welcomes are not retried. Ordinary chat stays available while a welcome is
pending. If user text arrives before capability discovery finishes, the
unsent welcome is skipped; already-dispatched welcomes may finish later.
Completed stream artifacts and matching assistant messages are displayed once,
in conversation order. Welcome responses retain their plain assistant layout
when restored from history, even when the server omits transient artifacts.
The extension-owned trigger remains in protocol history but is hidden
in the transcript; actual user text is always shown.
