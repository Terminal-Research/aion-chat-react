---
name: Aion Chat React Library
date_created: 2026-08-31
date_started: 2026-08-31
date_completed: <incomplete>
date_updated: 2026-09-03
---

# Aion Chat React Library

## 1) Description

Build an importable React chat library in the `aion-chat-react` repository for
interactive conversations with Aion agents. The current library scope is a
contained chat workspace with:

- an agent catalog and agent-selection panel;
- the selected agent's conversation/context list; and
- the active conversation's chat panel.

The workspace will first be consumed by the Playground in `aion-agent-cloud`
and may be mounted inside other host-owned page layouts. A future integration
may ask a customer to include an Aion JavaScript entry that mounts the same
workspace inside a popover, overlay, or sidebar, but that bootstrap and shell
behavior is outside the current implementation scope.

The visual starting point will be selected MIT-licensed CopilotKit chat source,
pinned initially to CopilotKit commit
`65bd05e3682ced8f424023f75627f8f833e52745`. We will adapt the useful view,
composer, message, scrolling, and slot patterns into Aion-owned components. We
will not carry over CopilotKit runtime, AG-UI, hosted-service, license-gating,
or branding dependencies. CopilotKit's popup and sidebar sources remain future
interaction references rather than current implementation inputs.

The first working milestone is intentionally narrower than the complete
library: an inline chat interface with fake streaming, safe Markdown, one
CSS-variable theme boundary, a Bootstrap-based example, and the injected
Apollo transport used by `aion-agent-cloud`. The next UI milestone completes
the agent catalog, agent panel, conversation list, and chat panel as one
contained workspace. Popup, popover, sidebar, and script-loader shells are
deferred.

The runtime architecture will have three distinct layers:

1. A transport-neutral Aion chat model and controller.
2. Controlled React presentation components.
3. Optional backend adapters for direct A2A and Aion's GraphQL chat surface.

The core package will never create a GraphQL or Apollo client implicitly. In a
host such as `aion-agent-cloud`, the GraphQL adapter will receive the host's
existing authenticated `ApolloClient`. This shares the host's cache, HTTP and
WebSocket links, token lifecycle, reconnect policy, and connection.

For independent hosts, direct A2A will be the canonical chat transport when
the caller already has an Agent Card or A2A address. The adapter will discover
the target's advertised security requirements and request a bearer credential
only when required. An authenticated standalone GraphQL adapter may reuse the
existing identity catalog and A2A RPC operations through Aion's existing
GraphQL HTTP and subscription endpoints. Authenticated file and screenshot
uploads use Aion's existing Files HTTP API and return a bounded exact-version
grant URL for the outbound A2A file part.

Recent conversation discovery and history loading will use Aion's published
[`GetContexts`](https://docs.aion.to/a2a/extensions/aion/context/get-contexts/1.0.0)
and
[`GetContext`](https://docs.aion.to/a2a/extensions/aion/context/get-context/1.0.0)
extensions. `GetContexts` returns context IDs in most-recent-first order and
`GetContext` hydrates the selected context's messages, artifacts, and status.
These calls form a separate conversation-directory boundary rather than
expanding the send/stream transport. The browser conversation store remains a
safe cache and optimistic local state, not the authoritative remote directory.

Agent interactions will use a small Aion-owned motion vocabulary inspired by
Transitions.dev's shimmer text, streaming text, and spinner-to-check examples.
Shimmer communicates an explicit active thinking/reasoning title. A waiting
indicator occupies the agent-response position after send and resolves when
meaningful agent output begins. Newly appended streaming text receives a soft
entrance without replaying already visible content. These are presentation
effects driven by normalized Aion lifecycle state, not timers that invent
protocol progress.

The backend work is part of this feature across repositories. `aion-api2`
already generates `chat-client-schema.graphql` by filtering the full Caliban
schema to selected root fields for the terminal chat client in
`aion-python-sdk`. That existing schema will become the shared GraphQL contract
for both chat clients instead of introducing a second Aion chat schema. It is
an SDL/codegen projection whose current fields already include the authenticated
`agentIdentityDetails` and A2A RPC operations needed by the initial React
integration. A developer will copy the generated schema into this repository
when it changes. The initial catalog integration requires no new GraphQL field,
public catalog projection, or optional-authentication change in `aion-api2`.

### CopilotKit source baseline

The first implementation pass should evaluate and selectively adapt these
source areas rather than copying the complete `@copilotkit/react-core` package:

- `CopilotChatView` for the controlled chat surface and scroll behavior;
- `CopilotChatInput` for composer interactions and attachment affordances;
- `CopilotChatMessageView` and its default message renderers;
- the slot-based customization pattern and relevant scoped styles.

`CopilotPopupView` and `CopilotSidebarView` remain pinned future references,
but their shell behavior is not part of the current source-adoption pass.

The stateful `CopilotChat` component, CopilotKit providers, CopilotKit runtime,
AG-UI agents, license checks, and unrelated UI systems are outside the source
adoption boundary.

Reference baseline:

- [CopilotKit license](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/LICENSE)
- [CopilotChatView](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/components/chat/CopilotChatView.tsx)
- [CopilotChatInput](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/components/chat/CopilotChatInput.tsx)
- [CopilotChatMessageView](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/components/chat/CopilotChatMessageView.tsx)
- [CopilotChatAssistantMessage](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/components/chat/CopilotChatAssistantMessage.tsx)
- [CopilotKit Markdown renderer](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-ui/src/components/chat/Markdown.tsx)
- [react-markdown](https://github.com/remarkjs/react-markdown)
- [CopilotPopupView](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/components/chat/CopilotPopupView.tsx)
- [CopilotSidebarView](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/components/chat/CopilotSidebarView.tsx)
- [CopilotKit headless entry point](https://github.com/CopilotKit/CopilotKit/blob/65bd05e3682ced8f424023f75627f8f833e52745/packages/react-core/src/v2/headless.ts)

Interaction motion references:

- [Shimmer text](https://transitions.dev/detail.html?t=shimmer-text)
- [Streaming text](https://transitions.dev/detail.html?t=streaming-text)
- [Spinner to check morph](https://transitions.dev/detail.html?t=spinner-to-check-morph)

## 1a) Goals

- Publish an Aion-owned React library with a stable, documented public API.
- Provide a reusable contained workspace that composes the chat panel, agent
  catalog, agent-selection panel, and selected agent's conversation list.
- Preserve the strongest CopilotKit UI behavior where it provides material
  value, including accessibility, focus management, auto-scroll behavior,
  streaming-friendly rendering, composer states, attachment affordances, and
  replaceable render slots.
- Use one styling contract for every surface: scoped component CSS consuming
  documented semantic `--aion-chat-*` custom properties from a shared theme
  boundary.
- Render assistant Markdown conveniently and safely, including GitHub-flavored
  Markdown and replaceable element renderers, without parsing raw HTML or
  permitting executable URL schemes.
- Provide restrained, state-driven motion for waiting, thinking, first
  response, streamed deltas, and completed/failed agent activities without
  changing the underlying message or task semantics.
- Represent Aion/A2A concepts directly, including contexts, messages, message
  parts, tasks, task status, artifacts, streaming deltas, errors, and
  attachments.
- Keep the UI independent of Apollo, GraphQL, AG-UI, and any specific Aion
  deployment.
- Define a small transport contract that supports streamed responses,
  cancellation, retries initiated by the user, and cleanup on unmount.
- Provide an optional GraphQL adapter that translates between Aion's GraphQL
  `a2aRpc` operations and the library's transport events.
- Allow `aion-agent-cloud` to inject its existing Apollo client so the library
  does not create another authenticated GraphQL connection.
- Provide a direct A2A adapter that discovers interfaces, streaming support,
  and authentication requirements from an Agent Card.
- Provide an explicit standalone GraphQL factory for authenticated consumers
  that need Aion catalog or RPC operations.
- Reuse the existing `chat-client-schema.graphql` as one shared contract for
  the Python SDK chat client and this React library without creating a parallel
  schema.
- Reuse the existing authenticated `agentIdentityDetails` operation for initial
  agent selection, with the organization ID and user JWT supplied by the host
  application or standalone configuration.
- Provide both headless agent/conversation selection and an Aion-owned default
  workspace that navigates from the agent catalog to that agent's recent
  conversations. A conversation is canonically identified by its A2A
  `contextId`.
- Use Aion's `GetContexts` and `GetContext` extensions as the server-backed
  conversation-directory contract, with the same directory abstraction
  available through direct A2A and GraphQL `a2aRpc` adapters.
- Define an attachment upload boundary that can turn browser files or captured
  screenshots into URL-backed A2A file parts through the existing authenticated
  Aion Files API without coupling the core UI to that adapter.
- Migrate the existing `aion-agent-cloud` Playground chat without losing its
  current task, artifact, status, unary-fallback, or streaming behavior.
- Keep the root bundle tree-shakeable and free of optional GraphQL dependencies
  unless the corresponding adapter subpath is imported.
- Preserve source provenance and required MIT notices for adapted CopilotKit
  code.

## 1b) Non-Goals

- Adopting CopilotKit runtime, CopilotKit Cloud, AG-UI as the canonical model,
  or CopilotKit licensing/feature checks.
- Maintaining a general-purpose fork of the full CopilotKit repository.
- Replacing Aion's A2A protocol or backend GraphQL API.
- Replacing server-side agent orchestration, authorization, or storage systems.
  The initial catalog integration does not add a new public catalog or change
  GraphQL authentication, and the initial upload integration reuses the
  existing Files boundary.
- Replacing the terminal/Ink-based package currently named
  `@terminal-research/aion` in `aion-python-sdk`.
- Shipping a framework-independent Web Component, iframe, or script-tag embed
  in the initial release.
- Shipping a library-owned popup, popover, sidebar, page overlay, or JavaScript
  bootstrap loader in the current release. Hosts own placement of the contained
  workspace until one of those shells is designed as a later feature.
- Owning application routing, organization selection, agent authorization, or
  agent administration. The library may render its normalized chat catalog and
  conversation navigator without becoming the source of those records.
- Persisting credentials, refresh tokens, or access tokens in the library.
- Adding voice input, transcription, or real-time voice chat in the initial
  implementation unless it is explicitly added as a later subtask.
- Reproducing every CopilotKit renderer, action system, or generative-UI
  feature before a concrete Aion use case requires it.

## 1c) Assumptions and Dependencies

- The initial consumers use React and can install the library as a normal npm
  dependency or workspace package.
- The first published release targets the same React baseline as
  `aion-agent-cloud`: React and React DOM `^19.2.0`.
- Aion's current GraphQL API exposes the A2A request and streaming behavior
  required by the existing `aion-agent-cloud` Playground transport.
- `aion-agent-cloud` continues to own an authenticated Apollo client whose
  WebSocket lifecycle, retry policy, and access-token refresh behavior should
  remain authoritative inside that application.
- The host can supply its selected organization ID and authenticated user
  context to the library. Standalone GraphQL consumers can supply an
  organization ID, endpoint URLs, and an asynchronous bearer-token callback.
- The existing `POST /api/graphql` and `GET /ws/graphql` authentication behavior
  remains unchanged for the initial integration: GraphQL catalog and RPC use
  require a valid user JWT.
- `aion-api2` already contains a scoped-schema generator based on approved root
  fields and Caliban field exclusion. The existing chat-client projection is a
  code-generation contract for both consumers and neither creates nor restricts
  the runtime endpoint.
- The current terminal `chat-client-schema.graphql` includes authenticated
  `user`, `agentIdentityDetails`, `agentIdentityDetail`, `healthCheckAgent`, and
  `a2aRpc` fields. The React library can use the existing
  `agentIdentityDetails` contract without changing the backend schema.
- A2A distributions currently support three access modes:
  `Public`, `AionAnyMember`, and `AionSameOrgMember`.
- `Public` and `AionAnyMember` are globally catalog-visible under the current
  policy. Only `Public` allows anonymous RPC execution. `AionSameOrgMember` is
  visible and executable only for an authenticated member of the owning
  organization.
- Playground distributions always resolve to `AionAnyMember` and therefore
  require Aion authentication.
- URL-backed A2A file parts remain an acceptable way to deliver uploaded files
  and screenshots to an agent.
- The existing Files API accepts authenticated multipart uploads, returns
  stable file/version metadata, and can mint a bounded exact-version read-grant
  URL suitable for an A2A file part.
- CopilotKit's referenced source remains available under the MIT license. Any
  copied or materially adapted files will retain appropriate attribution.
- CopilotKit's pinned v2 assistant message uses a replaceable Markdown renderer,
  while its related renderer implementations demonstrate component overrides,
  GitHub-flavored Markdown, and code-block handling. Aion may reuse those
  patterns without inheriting CopilotKit's Markdown dependency or raw-HTML
  configuration.
- `aion-agent-cloud` currently compiles Bootstrap 5.3 and React-Bootstrap with
  an `ins-` CSS-variable prefix and switches light/dark mode with
  `data-bs-theme`. Its example integration can map Aion's semantic tokens to
  those host variables without making Bootstrap a library dependency.
- The current `aion-agent-cloud` Playground implementation is the behavioral
  compatibility baseline for A2A normalization, task status, artifact updates,
  streaming, cancellation, and unary fallback.
- The current Playground keeps its conversation list and transcripts in
  browser-local storage. The library preserves that behavior behind an
  injected conversation-store boundary while adding the published Aion
  context extensions as the authoritative server-backed directory.
- The published Aion context extensions use offset pagination:
  `GetContexts` accepts `historyLength` and `historyOffset`, and `GetContext`
  accepts a required `contextId` plus optional history pagination. The current
  backend implementations require caller-scoping and contract alignment before
  browser clients can safely rely on them.
- `aion-agent-cloud` currently uses `@phosphor-icons/react` `^2.1.10`. The chat
  library will align with that package for default status and activity icons.
- React, React DOM, and optional integration libraries such as Apollo Client
  can be declared as peer dependencies to prevent duplicate runtimes.

## 1d) Constraints

- The root UI entry point must not import Apollo Client, GraphQL WebSocket
  libraries, CopilotKit runtime packages, or AG-UI packages.
- Importing the GraphQL adapter must not create a client or open a connection.
  Network ownership begins only when the consumer calls an explicit factory or
  supplies an existing client to an adapter.
- Generated SDL is a client/codegen contract, not an authorization boundary.
  The existing GraphQL routes continue to mount the complete runtime schema.
- `chat-client-schema.graphql` is the single generated chat-client contract.
  Do not introduce a React-specific schema artifact; evolve the shared
  root-field allowlist compatibly for both the Python SDK and React clients.
- Inclusion in the shared schema does not imply anonymous access. Existing
  authenticated fields retain their existing field- and operation-level
  authorization.
- The catalog operation requires a valid user JWT and an explicit organization
  ID. The organization ID scopes the query but is not authorization evidence;
  the server must continue to authorize it against the authenticated caller.
- The checked-in catalog operation must select only fields the React client
  needs. It must not request internal notes, role keys, email, system keys,
  private usage records, or unrelated administrative identity fields.
- The default Aion uploader requires a valid user JWT and organization ID. It
  uploads with `purpose=MessagingMedia`, uses a caller-stable operation ID, and
  associates the file with the selected Aion agent identity or distribution.
- One uploaded file is limited by the existing 20 MiB Files ingest maximum.
  `MessagingMedia` retention is one hour, and the exact-version read grant sent
  to the agent must not exceed that one-hour lifetime.
- The ordinary File create URL remains protected and must not be placed in the
  A2A message. The uploader must mint and use the exact-version grant URL.
- Grant-bearing URLs are temporary credentials. They may appear only where
  required for the A2A file part and must not enter logs, analytics, or durable
  UI state beyond the associated message lifecycle.
- Conversation persistence must use a versioned, persistence-safe snapshot
  rather than raw `ChatConversationState`. It excludes browser `File` objects,
  active runs, queued uploads, credentials, and temporary grant-bearing URLs;
  retained attachment history is limited to non-secret display metadata.
- Attachment `accept` configuration is presentation and preflight behavior,
  not a server security boundary. The initial integration keeps the Files
  API's existing media-type validation rather than adding a chat-specific
  server allowlist.
- RPC authorization must be re-evaluated by the server at request time even
  when a cached catalog entry or Agent Card says the target is accessible.
- A provided credential must be acquired just in time through a callback. The
  browser library must not encourage embedding long-lived JWTs or personal API
  keys in application bundles.
- A `Public` distribution continues to execute as the anonymous public
  principal even when the caller has an Aion session. Authenticated
  personalization requires a future explicit access mode rather than an
  opportunistic client-side choice.
- Host-integrated mode must use a caller-provided Apollo client and must never
  silently fall back to a library-owned client.
- Standalone mode must own exactly one client/connection per configured
  transport instance and expose deterministic disposal.
- A chat provider instance must use exactly one transport configuration. Mixed
  host and standalone configuration must fail fast during development.
- Access tokens must be requested just in time through a caller callback and
  must not be stored in React state, browser storage, logs, or public models.
- React and React DOM must be peer dependencies at `^19.2.0`, matching the
  initial `aion-agent-cloud` consumer. Apollo Client and its GraphQL transport
  dependencies must remain optional and isolated to adapter exports.
- All default component styling must consume semantic `--aion-chat-*` CSS
  custom properties from one theme boundary. Do not add a parallel JavaScript
  theme object, per-component color props, or shell-specific theme system.
- Motion timing, blur, and shimmer colors must consume semantic
  `--aion-chat-motion-*` custom properties with usable defaults. Do not add a
  second JavaScript motion-theme object.
- Default icons must use named imports from `@phosphor-icons/react`, inherit
  `currentColor`, and remain replaceable through the applicable component slot.
  Do not copy custom icon SVG paths from animation references.
- The initial motion layer must use CSS transitions/keyframes plus small React
  state adapters. Do not add a general-purpose animation runtime until a
  concrete interaction requires capabilities CSS cannot provide.
- A shimmer may run only while its associated thinking/reasoning state is
  active. A spinner may resolve to a check only after meaningful agent output
  or an explicitly successful activity; request admission or transport
  acceptance alone is insufficient.
- The default response placeholder must not combine an indefinitely rotating
  spinner and indefinitely shimmering label. Use the spinner with plain text
  for generic waiting, and reserve shimmer for an explicit thinking/activity
  title.
- Streaming motion must apply only to newly appended assistant content. It
  must not replay the existing message, delay canonical content behind an
  animation queue, or animate contexts restored from history.
- Streaming animation must preserve safe Markdown parsing and text selection.
  If a newly appended Markdown range cannot be isolated without changing its
  syntax or semantics, render that range immediately without motion.
- `prefers-reduced-motion: reduce` must disable shimmer, rotation, blur, scale,
  and icon-transition effects. State changes and accessible status text remain
  immediate and complete without animation.
- Motion is never the only status signal. Decorative icons are hidden from the
  accessibility tree, while waiting, responding, completed, and failed states
  expose concise text without duplicate announcements for visual-only layers.
- Transitions.dev is a behavioral reference, not a source dependency. No
  repository license was declared when this decision was recorded, and the
  spinner/check recipe is a Pro example, so implement these effects
  independently and do not copy its Pro source or obfuscated preview code.
- The theme boundary must provide complete usable defaults and accept normal
  `className` and `style` overrides for its custom properties. Its existing
  portal container may remain as future-ready infrastructure, but the current
  workspace must not depend on a popup or sidebar shell.
- The package must not require a host-wide Tailwind, Bootstrap, React-Bootstrap,
  or CopilotKit CSS configuration and must not leak global resets. Bootstrap
  and React-Bootstrap are example-only development dependencies.
- The default Markdown renderer must not use `dangerouslySetInnerHTML`,
  `rehype-raw`, or another path that turns Markdown HTML nodes into live DOM.
  It must retain a safe URL transform, render external links with appropriate
  opener isolation, and keep custom element renderers inside the same safety
  boundary.
- Components must support controlled state where host applications need to own
  open/closed state, selected agent, draft, thread, and lifecycle callbacks.
- The canonical persisted conversation key is the selected agent plus A2A
  `contextId`. A new conversation receives a context ID before its first send;
  transport task IDs remain turn/execution identifiers and must not become
  thread identifiers.
- Catalog, conversation-list, and conversation-persistence operations must not
  be added to `AionChatTransport`. They belong to optional catalog and
  conversation-directory/store contracts so fixed-agent/fixed-context
  consumers can use chat without importing navigation or persistence.
- The library must not derive a user-visible conversation directory by calling
  an agent-wide `ListTasks` endpoint unless the server contract proves that the
  result is scoped to the current caller. Use the dedicated Aion context
  extensions instead.
- `GetContexts` and `GetContext` must scope reads to the selected agent or
  environment and the exact effective caller. A missing or unauthorized
  context must not disclose whether another caller owns it.
- Anonymous public execution must not expose a shared-principal conversation
  directory. Until Aion has a stable per-caller scope for anonymous clients,
  public anonymous chat may use fixed/new contexts but remote history listing
  remains unavailable.
- The conversation list must not call `GetContext` for every returned ID.
  Merge `GetContexts` IDs with safe cached summaries, show a non-sensitive
  fallback for uncached IDs, and hydrate one context only when it is selected.
- Browser persistence is a cache, not an authorization boundary. Loading or
  resuming a remote context must re-enter the server directory boundary and
  must not rely solely on a previously cached snapshot.
- The UI must be keyboard accessible, preserve focus correctly, expose
  meaningful accessible names, and honor reduced-motion preferences.
- The core model must not flatten task, artifact, or non-text message-part data
  into irreversible display strings.
- Stream cancellation and component disposal must stop downstream observation
  and must not update unmounted React state.
- Copied source must be traceable to its upstream file and pinned commit in a
  third-party notices or provenance document.
- Public exports must be intentional; source-internal modules are not part of
  the compatibility contract unless exported from a documented entry point.
- The initial transcript must use browser-native `content-visibility: auto`
  with `contain-intrinsic-size` on stable transcript-entry wrappers. Do not
  add JavaScript windowing, item measurement, or transcript-retention limits
  until measured consumer behavior demonstrates that browser containment is
  insufficient.
- Release readiness must include measured bundle output and an agreed budget;
  no arbitrary size threshold is assumed before the initial build exists.

## 1e) Risks and Mitigations

- **Risk: CopilotKit coupling survives the source adaptation.** AG-UI message
  types, provider hooks, action registries, licensing checks, or internal
  contexts could make the UI difficult to reuse. **Mitigation:** adapt from the
  controlled view layer inward, define Aion contracts first, prohibit
  CopilotKit runtime imports, and add an import-boundary test.
- **Risk: importing the library creates a second GraphQL connection in
  `aion-agent-cloud`.** This could duplicate authentication, subscriptions,
  retries, and cache state. **Mitigation:** require a caller-provided
  `ApolloClient` in host mode; keep standalone creation in a separate explicit
  export; test that the injected adapter never constructs or disposes the host
  client.
- **Risk: a standalone client duplicates the large, application-specific
  GraphQL implementation from `aion-agent-cloud`.** **Mitigation:** implement
  only the shared chat-client schema, accept endpoint and token callbacks, and
  keep app-wide reconnect coordinators and cache policies in their owning
  application. Prefer direct A2A when catalog/control-plane GraphQL is not
  needed.
- **Risk: a generated subset is mistaken for a server security boundary.** The
  generator only produces client SDL and does not restrict the full runtime
  interpreter. **Mitigation:** keep the complete runtime schema explicit and
  test that subject annotations and operation-level authorization reject
  anonymous use of representative protected operations.
- **Risk: the broad identity-detail type encourages clients to request
  administrative profile fields.** **Mitigation:** keep one checked-in catalog
  operation that selects only the identity and A2A addressing fields needed by
  the chat UI, and test the generated operation shape.
- **Risk: a configured organization ID is mistaken for authorization.**
  **Mitigation:** continue requiring a valid user JWT and rely on the existing
  resolver authorization to validate visibility within that organization.
- **Risk: an authenticated standalone WebSocket retains an expired token.**
  **Mitigation:** obtain tokens through a callback, reconnect deliberately when
  the credential changes, and make the resulting catalog/RPC streams resume or
  fail in a typed way without duplicating requests.
- **Risk: GraphQL schema drift breaks either independently published chat
  client.** **Mitigation:** generate one `chat-client-schema.graphql`, use
  checked-in operation documents and generated operation types against that
  contract in both repositories, run compatibility checks in CI, and version
  breaking changes explicitly.
- **Risk: a generic display model loses A2A lifecycle information.**
  **Mitigation:** normalize transport data into an A2A-aware event and state
  model before deriving presentation messages; retain raw identifiers and
  typed parts needed for follow-up actions.
- **Risk: token-by-token streaming causes expensive rerenders or broken scroll
  behavior.** **Mitigation:** preserve message memoization, browser-native
  off-screen rendering, batched event reduction, and explicit pinned/manual
  scroll modes; validate with long and rapidly streaming transcripts before
  introducing virtualization.
- **Risk: delta motion accumulates behind a fast stream.** A word-by-word demo
  can queue more visual delay than a real model stream can tolerate.
  **Mitigation:** animate actual appended batches from their current state,
  coalesce rapid updates, and drop presentation animation before delaying
  canonical text.
- **Risk: decorative progress implies a protocol state that has not occurred.**
  A success check after request admission could be mistaken for an agent
  response or completed task. **Mitigation:** derive indicator phases from the
  normalized turn/activity state, distinguish response-started from task
  completed, and map failure/input-required/auth-required explicitly.
- **Risk: streaming animation breaks Markdown or selection.** Splitting raw
  Markdown into independently rendered delta fragments can change parsing.
  **Mitigation:** retain one canonical source string, mark only safely isolated
  newly rendered text nodes, and fall back to immediate rendering otherwise.
- **Risk: continuous motion distracts or harms motion-sensitive users.**
  **Mitigation:** keep effects local and short, avoid simultaneous indefinite
  effects, stop them with their lifecycle state, and provide a complete
  reduced-motion path.
- **Risk: copied UI becomes an unmaintainable partial fork.** **Mitigation:**
  keep a small source inventory, rewrite runtime-facing seams to Aion APIs,
  document provenance, and only port upstream fixes deliberately.
- **Risk: CSS collides with a host application or portaled content loses its
  theme.** **Mitigation:** use a stable Aion class prefix, one semantic
  CSS-variable theme boundary, scoped styles, a portal target inside that
  boundary, and fixtures with both Bootstrap-heavy and otherwise styled hosts.
- **Risk: agent Markdown injects executable browser content.** **Mitigation:**
  build the default renderer on a safe Markdown-to-React pipeline, omit raw
  HTML parsing, retain safe URL transformation, isolate external links, and
  test representative script, event-handler, iframe, SVG, and unsafe-protocol
  payloads.
- **Risk: attachment uploads expose sensitive screenshots or stale URLs.**
  **Mitigation:** make capture and upload user-initiated, show an attachment
  preview before send, use protected `MessagingMedia` storage and a bounded
  exact-version grant, avoid logging the grant URL, and discard browser file
  contents after upload.
- **Risk: an uploaded File is cleaned up before the agent reads it.**
  **Mitigation:** associate initial uploads with the selected Aion identity or
  distribution, use the existing one-hour `MessagingMedia` retention, and mint
  a grant whose lifetime does not exceed that retention.
- **Risk: future script-loaded embeds need a different mounting and security
  boundary.** **Mitigation:** keep the current workspace importable and
  controlled, but defer loader, CSP, custom-element, positioning, and page
  isolation decisions until a concrete customer embed is selected.
- **Risk: the new component diverges from Playground behavior during
  migration.** **Mitigation:** build a transport conformance suite from current
  Playground cases, migrate behind a temporary application-level switch if
  useful, and remove the old implementation only after parity checks pass.
- **Risk: browser-local conversation history leaks across users or
  organizations on a shared browser.** **Mitigation:** require persistent store
  adapters to receive an opaque host-defined scope key, never derive that key
  from a JWT, clear cached state when the scope changes, and ship only an
  in-memory store as an implicit default.
- **Risk: task listing is mistaken for a safe conversation directory.** The
  current agent-environment task list is not a user-facing catalog contract.
  **Mitigation:** use the dedicated `GetContexts` and `GetContext` extensions,
  and make their storage queries caller- and agent-scoped before exposing them
  to browser clients.
- **Risk: context history leaks between callers.** Existing context storage may
  be agent-wide or collapse public users into one anonymous principal.
  **Mitigation:** require exact effective-caller scoping for authenticated
  history, make missing and unauthorized contexts indistinguishable, and keep
  anonymous remote history disabled until it has a stable caller boundary.
- **Risk: the conversation list causes one history request per row.** This
  would make initial navigation latency grow with the page size.
  **Mitigation:** list IDs once, enrich from safe local summaries, lazily load
  only the selected context, and consider a future summary extension only if
  measured UI needs justify it.

## 1f) Testing and Validation

- Verify the model reducer handles user messages, assistant text deltas,
  complete messages, task snapshots, task status changes, artifact updates,
  input-required states, failures, cancellation, duplicate events, and terminal
  completion without losing identifiers or producing duplicate content.
- Run a shared transport conformance suite against fake, direct-A2A,
  injected-Apollo, and standalone GraphQL transports.
- Verify stream cancellation, unmount, transport errors, retries, and late
  events do not leak observers or update disposed controllers.
- Verify the composer supports send, stop, multiline input, disabled and
  processing states, keyboard submission, attachment removal, and accessible
  file selection.
- Verify auto-scroll remains pinned during normal streaming, respects manual
  user scrolling, recovers predictably, and remains usable with large histories.
- Verify `content-visibility: auto` and `contain-intrinsic-size` reduce
  off-screen rendering work without removing transcript content from browser
  search, selection, keyboard navigation, or the accessibility tree. Exercise
  initial history restore, upward scrolling, variable-height messages, and
  streamed height changes for visible scroll jumps.
- Verify the contained workspace composes agent catalog, agent selection,
  conversation selection, and chat without requiring a popup/sidebar shell or
  taking ownership of host-page layout.
- Verify message rendering covers Markdown, plain text, reasoning/status
  presentation, A2A artifacts, non-text parts, tool/activity placeholders,
  errors, copy, and retry/regenerate hooks where supported.
- Verify the waiting indicator begins with an active request, does not resolve
  on transport acceptance alone, transitions to a check with the first
  meaningful assistant message, artifact output, or successful terminal state,
  and transitions to attention or failure without showing a success check for
  input-required, auth-required, failed, rejected, or cancelled states. An
  ordinary working status keeps the indicator pending.
- Verify thinking shimmer starts and stops with explicit activity state, uses
  actual visible text as the accessible label, and does not run beside the
  default waiting spinner.
- Verify streaming motion affects only newly appended assistant text, does not
  reanimate existing text or restored history, does not delay fast deltas, and
  preserves Markdown output, selection, copy, and scroll pinning.
- Verify reduced motion shows immediate static text and icon states with no
  shimmer, rotation, blur, scale, or icon-transition animation.
- Verify default status icons are Phosphor icons, inherit theme color and size,
  remain tree-shakeable named imports, and can be replaced through public
  component slots.
- Verify GitHub-flavored Markdown renders headings, lists, tables, links,
  blockquotes, inline code, and fenced code while raw HTML and executable URL
  payloads cannot create active DOM or navigation targets.
- Verify inline and, when implemented, portaled surfaces consume the same
  `--aion-chat-*` tokens. Test neutral defaults, direct token overrides, the
  Bootstrap `--ins-*` bridge, light/dark changes, and a host without Bootstrap.
- Verify every default surface can be customized through typed slots without
  importing internal modules.
- Verify root-package consumers do not bundle Apollo, GraphQL WebSocket,
  CopilotKit runtime, AG-UI, or optional rich renderers they did not import.
- Verify the injected Apollo adapter uses the exact client instance supplied by
  `aion-agent-cloud`, opens no client of its own, and never stops the supplied
  client.
- Verify the standalone adapter creates no connection before use, requests the
  latest token for connection/reconnection, owns no more than one connection,
  and closes it exactly once when disposed.
- Verify authentication failures are surfaced as typed transport failures and
  do not expose token values in messages, logs, or errors.
- Verify the shared chat-client GraphQL schema contains only fields approved for
  either chat client and that its generated operation types compile against the
  complete runtime schema.
- Verify both `aion-python-sdk` and `aion-chat-react` generate operations from
  the same shared schema artifact, and that adding the React client does not
  remove or change existing Python SDK chat operations unintentionally.
- Verify the authenticated catalog operation forwards the configured
  organization ID, filters to the required identity and A2A network types, and
  normalizes only identities with usable A2A addressing.
- Verify the default navigator moves from agent list to that agent's recent
  conversations, supports Back, New conversation, selection, deletion, empty
  and error states, keyboard navigation, focus restoration, and reduced motion.
- Verify conversations are partitioned by selected agent and host scope,
  sorted by latest activity, keyed by `contextId`, and cannot survive a scope
  change in the wrong user's view.
- Verify `GetContexts` offset pagination preserves most-recent-first ordering,
  merges cached summaries without changing server order, and does not issue a
  `GetContext` request for every list row.
- Verify selecting a remote context calls `GetContext`, normalizes its ordered
  messages, artifacts, and status, and safely refreshes the local cache.
- Verify two callers using the same agent cannot list or retrieve each other's
  contexts, and that missing and unauthorized context IDs have equivalent
  observable behavior.
- Verify unsupported context methods degrade to typed history-unavailable
  state without preventing fixed-context or new-context chat.
- Verify snapshot serialization and restore preserve transcript/task/artifact
  meaning while excluding active runs, queued browser files, tokens, uploaded
  bytes, and temporary grant-bearing URLs.
- Verify fixed-agent, fixed-context, and always-new configurations can omit the
  corresponding navigation levels without creating a second transport or
  persistence implementation.
- Verify missing or invalid JWTs fail instead of producing catalog results, and
  a user without visibility into the supplied organization is denied.
- Verify the catalog operation does not select notes, role keys, email, system
  keys, private usage records, or unrelated administrative fields.
- Verify public direct-A2A execution independently against the access modes
  supported by the selected Agent Card; it does not depend on the authenticated
  GraphQL catalog contract.
- Verify upload success produces a URL-backed A2A file part with correct media
  metadata, while rejected type, oversized content, cancellation, and failed
  upload leave the composer recoverable.
- Verify the Files adapter sends the configured JWT and organization ID,
  `purpose=MessagingMedia`, a stable operation ID, declared byte size, and the
  selected target association through `POST /files`.
- Verify the adapter mints an exact-version read grant after upload and sends
  only the grant URL in the A2A file part, never the protected create URL.
- Verify the 20 MiB preflight, one-hour maximum grant, upload cancellation,
  idempotent retry, expired grant, and grant-redaction behavior.
- Run accessibility checks plus keyboard-only interaction tests for the inline
  chat and contained workspace fixtures.
- Exercise visual fixtures at desktop and narrow/mobile workspace dimensions
  with long text, code, attachments, task states, and streaming.
- Integrate into `aion-agent-cloud` and rerun its existing Playground tests,
  adding parity coverage for streaming, unary fallback, status, artifacts,
  agent changes, thread changes, and authentication/reconnection behavior.
- Build the packed npm artifact, install it into an isolated fixture, validate
  ESM/types/style exports, check for duplicate React copies, and record bundle
  sizes before setting release budgets.
- Verify the packed artifact against React and React DOM 19.2, including the
  `aion-agent-cloud` host integration. Broader React-version compatibility is
  not part of the initial release contract.
- Confirm copied or adapted files and distributed artifacts carry the required
  third-party notices and do not contain CopilotKit license gating or branding.

## 1g) Implementation Notes

[[SPEC-INSTRUCTION]]
When the user asks for running implementation notes while implementing this
spec, create or update a sibling `implementation-notes.html` file in this spec
directory by default. Use Markdown only when the user requests it or the
repository convention requires it. Keep the notes browser-readable,
append-friendly, and focused on decisions not captured in this spec, deviations
from the plan, tradeoffs, validation blockers, follow-up risks, and anything
the user should know before review. Do not create or update this companion file
unless the user directs you to do so.
[[/SPEC-INSTRUCTION]]

- Companion notes file: `implementation-notes.html` (create only on request).

## 2) Subtasks (incremental)

[[SPEC-INSTRUCTION]]
Before implementation begins, freely add, remove, reorder, rename, reletter,
split, or combine subtasks so they express the best execution plan. Keep every
subtask `not started`.
When implementation work starts on the first subtask, mark it `in progress`.
From that point, subtasks are append-only: do not delete, reorder, or repurpose
existing tasks, and append newly discovered work under a new subtask letter.
Every implemented subtask must list all associated implementation and follow-up
commits. Commit-association lines may be added or corrected later as an explicit
exception to subtask immutability; do not otherwise rewrite the subtask.
Use only these statuses: `not started`, `in progress`, `done`, `deferred`.
Use header format:
`### Subtask <Letter> — <Title> (status: <value>)`
After a commit is made specifically for a subtask, append
`- Commit ID: <commit-id>` under that subtask. Repeat the line for every
qualifying commit instead of replacing an earlier ID. When this spec spans
multiple repositories, use
`- Commit ID (<repository>): <commit-id>`.
[[/SPEC-INSTRUCTION]]

### Phase 1 — Inline chat walking skeleton

### Subtask A — Establish the package and source provenance (status: done)

- Commit ID (aion-chat-react): `ed74476`

- Initialize the React/TypeScript library, build, test, lint, typecheck, and
  package-entry configuration.
- Declare React and React DOM as peer dependencies and keep backend adapters out
  of the root dependency graph.
- Record the pinned CopilotKit commit, selected source inventory, original file
  paths, MIT license, and attribution rules in `THIRD_PARTY_NOTICES` or an
  equivalent provenance document.
- Add an example/test workspace that consumes the packed library through public
  exports rather than source-relative imports.

### Subtask B — Define the Aion chat model (status: done)

- Commit ID (aion-chat-react): `b08e34d`

- Define stable identifiers and models for agent selection, conversation
  context, turns, messages, typed message parts, task lifecycle, artifacts,
  attachments, errors, and transport events.
- Keep transport events lossless enough to support A2A task/status/artifact
  behavior while deriving renderer-friendly state.
- Define reducer rules for streaming deltas, duplicate events, terminal states,
  input-required states, cancellation, and retries.
- Add behavior-focused tests based on current Playground event sequences.

### Subtask C — Define the transport and controller contracts (status: done)

- Commit ID (aion-chat-react): `4645ccd`

- Define a transport-neutral streaming interface with explicit request,
  cancellation, error, and disposal semantics.
- Implement the React controller/provider and headless hooks that coordinate
  draft state, the active run, normalized conversation state, and host
  callbacks.
- Keep agent selection and thread ownership controllable by the host while
  allowing ergonomic standalone defaults.
- Publish a fake transport and conformance harness through a testing-only
  export.

### Subtask D — Build the inline chat interface (status: done)

- Commit ID (aion-chat-react): `8126859`

- Selectively adapt CopilotKit's controlled chat-view structure to the Aion
  model and controller contracts.
- Implement the minimum transcript and composer behavior needed to send, stop,
  and observe a fake streamed response in an inline chat.
- Preserve useful scroll behavior and typed view slots without importing
  CopilotKit providers, AG-UI types, popup code, or sidebar code.
- Add a small Vite fixture that consumes the packed library through its public
  exports.

### Subtask E — Establish safe Markdown and the shared theme boundary (status: done)

- Commit ID (aion-chat-react): `79e27df`

- Add the single Aion chat theme boundary and make every inline component style
  consume documented semantic `--aion-chat-*` variables with usable defaults.
- Implement the default Markdown renderer with `react-markdown`,
  `remark-gfm`, safe URL transformation, and component overrides for links,
  headings, tables, lists, inline code, and fenced code.
- Do not enable raw HTML parsing. Preserve a replaceable renderer slot while
  keeping the default path safe for untrusted agent output.
- Style the Vite fixture with Bootstrap 5.3 and React-Bootstrap as example-only
  dependencies. Add a bridge stylesheet that maps Aion tokens to the
  Bootstrap variables used by `aion-agent-cloud`, including its `ins-` prefix
  and `data-bs-theme` color modes.

### Subtask F — Implement the injected Apollo transport (status: done)

- Commit ID (aion-chat-react): `e857c27`

- Add a GraphQL adapter subpath that accepts an already configured
  `ApolloClient` and translates the current authenticated Aion GraphQL A2A
  stream into core transport events.
- Port only the behavior required for the first inline slice: streaming text,
  completion, cancellation, and typed failure, while retaining extension
  points for task, status, and artifact events.
- Prove that the adapter does not construct, authenticate, reconnect, or
  dispose the injected client.
- Complete the phase with a working inline authenticated chat against a host
  Apollo client; popup, sidebar, catalog, direct A2A, and upload behavior remain
  deferred.

### Phase 2 — Complete and harden the inline chat

### Subtask G — Complete the composer and attachment UI (status: done)

- Commit ID (aion-chat-react): `3dcdeee`
- Expand the composer for processing state, multiline input, keyboard
  interaction, attachment drafts, removal, and host-supplied actions.
- Define an attachment draft model and uploader interface independent of
  GraphQL.
- Preserve the simple send/stop path established by the walking skeleton and
  avoid copying CopilotKit's full action/runtime system.

### Subtask H — Build Aion message and activity renderers (status: done)

- Commit ID (aion-chat-react): `84820bc`
- Implement default renderers for task status, reasoning/status disclosure,
  errors, typed parts, artifacts, file attachments, and extensible
  tool/activity content around the safe Markdown renderer from Subtask E.
- Preserve renderer customization through typed slots or registries while
  keeping unknown content visible and diagnosable.
- Add memoization and virtualization only where transcript behavior proves it
  useful.

### Subtask I — Validate inline behavior and packaging (status: done)

- Commit ID (aion-chat-react): `b91563c`
- Add interactive fixtures for inline desktop, narrow/mobile, fake-transport,
  injected-Apollo, Bootstrap-bridged, and framework-neutral layouts.
- Complete accessibility, keyboard, streaming, large-history, visual, and
  package-boundary validation for the core library.
- Measure the core and optional-renderer bundles and establish release budgets
  from the measured baseline.

### Phase 3 — Standalone and optional-auth integration

The initial catalog scope now remains authenticated and uses the existing
identity-detail operation. Public catalog and optional-authentication work in
the historical subtasks below is deferred until a concrete embed requires it.

### Subtask J — Define the public-safe chat catalog contract (status: deferred)

- In `aion-api2`, define a catalog read model specifically for chat clients
  rather than reusing authenticated `AgentIdentityDetail` payloads.
- Include stable agent identity/addressing data, public presentation metadata,
  Agent Card URL, supported chat interfaces, and explicit access metadata
  sufficient to distinguish discovery from current-caller invocation.
- Derive visibility and invocation decisions from live distribution ingress
  policy and verified optional caller context.
- Cover `Public`, `AionAnyMember`, and `AionSameOrgMember` behavior for
  anonymous, same-org, and other-org viewers.

### Subtask K — Evolve the shared chat-client GraphQL schema (status: deferred)

- In `aion-api2`, reuse the current `RootOperationFields` and Caliban
  `Transformer.ExcludeField` mechanism and retain
  `chat-client-schema.graphql` as the single generated contract for the Python
  SDK chat client and the React chat library.
- Preserve existing authenticated operations required by the Python SDK chat
  client, add the public-safe agent catalog, and add upload operations only
  after their contract is approved.
- Treat the root-field allowlist as the union of approved requirements for both
  clients. Sharing the schema must not weaken resolver-level authorization for
  existing `user`, identity-detail, health, login, or RPC behavior.
- Add generator tests that fail when an approved root field is missing, an
  unapproved root field leaks into the schema, or an empty operation root is
  rendered incorrectly.
- Define how the same generated artifact is synchronized or published to both
  `aion-python-sdk` and `aion-chat-react` for code generation and drift checks.

### Subtask L — Mount an optional-auth chat GraphQL runtime (status: deferred)

- In `aion-api2`, build a distinct runtime GraphQL API from the same approved
  shared chat-client root contract rather than serving the full `GraphQLApi`
  behind a filtered SDL file.
- Mount dedicated HTTP and subscription routes with narrowly scoped CORS and
  safe request logging.
- Add optional bearer authentication where absent credentials produce an
  anonymous caller, valid credentials produce an Aion authentication context,
  and invalid supplied credentials are rejected rather than downgraded.
- Limit anonymous RPC addressing to distribution-backed chat targets and apply
  the same live access policy as direct A2A JSON-RPC/REST ingress.
- Verify that the full GraphQL routes and their mandatory authentication remain
  unchanged.

### Subtask M — Implement the direct A2A transport (status: done)

- Commit ID (aion-chat-react): `3e7807b`
- In `aion-chat-react`, add a direct A2A adapter that accepts an Agent Card URL
  or resolved card, selects a supported interface, and validates streaming
  capability.
- Read the Agent Card security requirements before dispatch and request a
  bearer credential only when required.
- Use an optional asynchronous credential provider, omit authorization when no
  credential is required, and surface authentication-required separately from
  access-denied and transport failures.
- Support browser cancellation, SSE/stream cleanup, A2A version headers, and
  the same normalized event model as GraphQL transports.

### Subtask N — Implement the standalone GraphQL gateway adapter (status: done)

- Commit ID (aion-chat-react): `7e52357`
- In `aion-chat-react`, add a separate standalone export for Aion's existing
  GraphQL routes with explicit HTTP/subscription URLs, an optional
  asynchronous bearer-token getter, and transport lifecycle options.
- Reuse catalog/RPC operation documents and GraphQL-to-core normalization with
  the injected adapter while owning only the minimal standalone connection.
- Make connection creation lazy, credential changes explicit, and disposal
  idempotent.
- Document browser-extension CSP, origin, token-refresh, login transition, and
  permission requirements.
- Deferral: browser-extension-specific documentation is not part of the current
  workspace scope. Retain the general standalone-client lifecycle work for a
  later host that needs it.
- Implementation decision: the initial standalone client requires an
  organization ID and asynchronous user-JWT getter. Optional authentication
  remains deferred with the public embed work.

### Subtask O — Implement upload integration (status: done)

- Commit ID (aion-chat-react): `db9c087`
- Finalize the upload capability contract once the server endpoint,
  authorization behavior, retention policy, and anonymous-upload posture are
  selected.
- Implement the GraphQL or web upload adapter without coupling file selection,
  screenshot capture, or preview UI to that transport.
- Convert successful uploads into URL-backed A2A file parts and cover failure,
  cancellation, retry, validation, and sensitive-data handling.
- Do not expose a general anonymous file-upload surface merely because an agent
  accepts anonymous chat; use a bounded upload grant or require authentication
  if anonymous attachments are supported.

### Phase 4 — Consumer adoption

### Subtask P — Migrate the aion-agent-cloud Playground (status: not started)

- Wrap the existing application-owned Apollo client in the injected GraphQL
  adapter and replace the current Playground presentation/controller in
  incremental slices.
- Preserve host ownership of authentication, organization/agent selection,
  navigation, and GraphQL reconnect coordination.
- Prove parity for current message, streaming, task, status, artifact,
  cancellation, fallback, and error behavior before deleting replaced code.
- Record implementation commits separately for `aion-chat-react` and
  `aion-agent-cloud` under this subtask.

### Phase 5 — Popup/sidebar shells and release

Popup/sidebar shell work is deferred. The initial library may be released with
the contained workspace from Subtask AA and without completing Subtasks Q or R.

### Subtask Q — Adapt popup and sidebar shells (status: deferred)

- Adapt responsive popup and left/right sidebar shells around the established
  shared chat view.
- Support controlled/uncontrolled state, dimensions, safe areas, focus,
  Escape/outside interactions, body-layout effects where explicitly enabled,
  mobile behavior, and slot-based headers/toggles.
- Resolve portals through a container owned or supplied by the shared theme
  boundary so popup content inherits the same CSS variables without a second
  shell theme API.
- Ensure shell-specific code does not own transport or conversation state.
- Deferral: wait for a concrete host or customer embed to establish whether a
  popover, overlay, sidebar, or another mounting model is actually required.

### Subtask R — Add popup and sidebar integration examples (status: deferred)

- Provide examples for a host-owned Apollo connection and a standalone browser
  extension/embed connection.
- Demonstrate controlled agent selection, open state, theming, slots,
  screenshot/file attachment, cleanup, and auth-error handling.
- Validate that multiple visual instances can share one host transport without
  accidentally creating multiple backend clients.
- Deferral: add these examples only with the corresponding concrete shell
  requirement. They are not release blockers for the contained workspace.

### Subtask S — Publish the initial library release (status: not started)

- Finalize package name, semantic versioning, supported React versions, public
  exports, generated declarations, styles, license notices, and changelog.
- Document core, direct A2A, injected GraphQL, standalone GraphQL, optional
  credentials, catalog, upload, theming, and migration APIs.
- Pack and install the release candidate in isolated and
  `aion-agent-cloud` fixtures before publishing.

### Review follow-ups discovered after Phase 1

### Subtask T — Make composer submission IME-safe (status: done)

- Commit ID (aion-chat-react): `ed56711`

- Prevent Enter from submitting while an input method editor is composing,
  including the legacy browser key-code fallback.
- Prove that the same composer submits normally once composition is complete.

### Subtask U — Stabilize transcript derivation (status: done)

- Commit ID (aion-chat-react): `cca8683`

- Resolve transcript references in linear time with stable memoized output.
- Prevent unrelated provider updates such as draft changes from retriggering
  transcript scroll work.

### Subtask V — Extend the safe Markdown component map (status: done)

- Commit ID (aion-chat-react): `2a8e49c`

- Allow hosts to override individual Markdown elements without replacing the
  default safe parsing and URL-transformation pipeline.
- Preserve raw-HTML suppression and unsafe-link handling when ordinary
  element overrides are used.

### Subtask W — Correct CopilotKit source provenance (status: done)

- Commit ID (aion-chat-react): `34f3c6f`

- Separate sources actually adapted in Phase 1 from candidates reserved for
  later work.
- Correct source paths and distinguish code adaptation from conceptual pattern
  references.

### Subtask X — Define reusable typed slot values (status: done)

- Commit ID (aion-chat-react): `1e195ea`
- Introduce a small Aion-owned slot-value contract for recurring component
  replacement and partial default-prop customization across the composer,
  message/activity renderers, and popup/sidebar shells.
- Update the pre-release slot APIs directly without a compatibility layer.
- Do not copy CopilotKit's implicit string-to-class behavior, `any`-based
  rendering, Tailwind merging, or universal render-prop composition. Add only
  the behavior exercised by at least two Aion surfaces.

### Subtask Y — Make GraphQL authentication optional (status: deferred)

- In `aion-api2`, allow `POST /api/graphql` and `GET /ws/graphql` to establish
  an anonymous caller when credentials are absent, while preserving verified
  caller context for valid credentials and rejecting invalid supplied
  credentials.
- Keep the complete runtime schema on those routes. Continue enforcing schema
  subject annotations and operation-level authorization for protected fields;
  the generated chat-client schema remains a client code-generation subset.
- Verify representative authenticated operations remain inaccessible to an
  anonymous caller and public catalog/RPC operations can execute without a
  separate GraphQL controller or route pair.

### Subtask Z — Reuse the authenticated identity catalog (status: done)

- In `aion-chat-react`, add a checked-in `agentIdentityDetails` operation based
  on the existing Python chat-client catalog query.
- Require the caller to provide an organization ID and authenticated user JWT,
  either through the host-owned Apollo client or standalone GraphQL
  configuration.
- Filter to chat-selectable personal and principal identities with active A2A
  distributions, and normalize only the identity, presentation, and A2A
  addressing fields required by the React client.
- Keep organization authorization server-owned and prove the client query does
  not request administrative identity fields it does not use.
- Implementation decision: expose one catalog entry per active A2A
  distribution, using the distribution ID as `ChatAgent.id` while retaining
  the parent identity's presentation and addressing fields. This preserves the
  existing Playground invocation model without a target-remapping callback.

### Subtask AA — Add agent and conversation navigation (status: not started)

- Define an Aion-owned `AionConversationStore` separate from
  `AionChatTransport`. Its initial operations list, load, save, and remove
  versioned safe snapshots keyed by selected agent and A2A `contextId`.
- Ship an in-memory implementation and a browser-storage implementation that
  requires an opaque host-supplied scope key. Adapt the existing
  `aion-agent-cloud` Playground storage through this contract during migration.
- Add headless catalog/conversation hooks plus a controlled
  `AionChatNavigator` and a convenience `AionChatWorkspace` composition.
- In the default navigator, show the agent catalog first. Selecting an agent
  slides the same navigation panel to that agent's recent conversations; Back
  returns to the catalog, New conversation creates and selects a fresh context,
  and selecting a context restores its transcript.
- Keep the navigator responsive and composable. A host may show both lists in
  a wider custom layout, hide the catalog for a fixed agent, hide all
  navigation for a fixed context, or always begin with a new context.
- Defer remote history synchronization, thread rename, archive, cross-device
  updates, and server-side deletion until Aion exposes a reviewed caller-scoped
  conversation-directory contract.

### Subtask AB — Secure the Aion context directory (status: not started)

- In `aion-api2`, implement typed `GetContexts` handling and make the existing
  `GetContext` path operational through the A2A distribution boundary.
- Scope both operations to the selected agent environment and exact effective
  caller. Use persisted job/task ownership as the authority; do not substitute
  an agent-wide `ListTasks` query or trust a caller-provided organization ID.
- In `aion-python-sdk`, align the existing context extension handlers and store
  contracts with the same caller boundary. In-memory and durable stores must
  not iterate contexts belonging to a different resolved owner.
- Make missing and unauthorized context IDs indistinguishable. Do not expose
  remote history for anonymous public callers until they have a stable
  per-caller ownership scope.
- Add behavior tests with two callers using the same agent, plus pagination,
  ordering, history, artifacts, status, and unsupported-method coverage.

### Subtask AC — Add the remote conversation directory (status: not started)

- In `aion-chat-react`, define `AionConversationDirectory` separately from
  `AionChatTransport` and `AionConversationStore`. It lists remote context IDs
  and loads one selected context through Aion's context extensions.
- Implement direct-A2A and GraphQL `a2aRpc` directory adapters that share the
  same normalization and typed failure behavior.
- Use `GetContexts` with `historyLength` and `historyOffset` for ordered paging.
  Do not issue `GetContext` for every visible list row; merge safe cached
  summaries and hydrate a context only on selection.
- Treat the local store as a persistence-safe cache and optimistic state for a
  newly generated context ID. Revalidate remote contexts through the directory
  instead of treating cached history as authorization evidence.
- Keep fixed-context and always-new chat usable when the extension is
  unsupported or remote history is unavailable. Remote rename, archive, and
  deletion remain outside the version 1.0.0 extension contract.

### Subtask AD — Add agent interaction motion (status: done)

- Commit ID (aion-chat-react): `a717299`
- Add Aion-owned shimmer, streamed-content entrance, and lifecycle indicator
  components based on the referenced interaction behavior, without copying
  Transitions.dev Pro source or custom SVG paths.
- Add `@phosphor-icons/react` aligned with the frontend's `^2.1.10` range. Use
  named imports such as `SpinnerGapIcon`, `CheckCircleIcon`,
  `WarningCircleIcon` for attention, and `XCircleIcon` for failure; expose
  component slots instead of leaking Phosphor types into the core transport
  model.
- Drive the response placeholder from normalized turn state. Keep it pending
  through admission and ordinary working status, resolve it when meaningful
  agent output begins, and show failure/input-required/auth-required states
  without falsely presenting success.
- Display streamed output immediately and animate only safely isolated newly
  appended text. Coalesce rapid visual updates and fall back to unanimated
  rendering where Markdown structure prevents a safe delta boundary.
- Add semantic `--aion-chat-motion-*` tokens for the initial 2-second shimmer,
  350-millisecond streamed-text entrance with at most 1px blur, and roughly
  900-millisecond spinner cycle. Hosts may tune or disable them without a
  JavaScript theme API.
- Implement reduced-motion, hydration/history, cancellation, failure,
  unmount/timer cleanup, accessibility, and fast-stream performance coverage.

### Subtask AE — Add browser-native transcript containment (status: done)

- Commit ID (aion-chat-react): `81be03d`
- Add stable transcript-entry wrappers around messages and artifacts. Apply
  `content-visibility: auto` and pair it with an `auto`
  `contain-intrinsic-size` fallback suitable for ordinary chat entries.
- Keep every message in React state and the DOM. This optimization must not
  delete, truncate, paginate, or otherwise change transcript retention.
- Do not add virtual-list state, item measurement, spacer elements, or a
  windowing dependency in the initial implementation.
- Validate browser search, selection, keyboard and screen-reader access,
  pinned and manual scrolling, restored history, variable-height Markdown and
  attachments, and rapid streamed updates. Reconsider windowing only if these
  measured fixtures establish a material remaining problem.

## 3) Package Hierarchy + Responsibilities

The names below are provisional but establish dependency direction. Modules may
depend downward from React presentation to core contracts. Core modules must
not depend on backend adapters.

```text
aion-chat-react/
├── src/
│   ├── model/
│   │   ├── conversation.ts       # Aion/A2A-aware public state model
│   │   ├── events.ts             # normalized transport event model
│   │   ├── attachments.ts        # local, uploading, and URL-backed files
│   │   └── reducer.ts            # deterministic event-to-state behavior
│   ├── transport/
│   │   ├── transport.ts          # send/stream/cancel/dispose contract
│   │   └── errors.ts             # typed, credential-safe failures
│   ├── controller/
│   │   ├── AionChatProvider.tsx  # React lifecycle and shared controller
│   │   └── hooks.ts              # headless consumer hooks
│   ├── conversations/
│   │   ├── snapshot.ts           # versioned persistence-safe model
│   │   ├── directory.ts          # remote list/load contract
│   │   ├── store.ts              # list/load/save/remove contract
│   │   ├── memoryStore.ts        # implicit session-only default
│   │   └── browserStore.ts       # explicitly host-scoped persistence
│   ├── motion/
│   │   ├── AionShimmerText.tsx   # active thinking/activity title
│   │   ├── AionStreamingText.tsx # appended-content entrance
│   │   └── AionActivityIndicator.tsx # pending/success/failure motion
│   ├── components/
│   │   ├── AionChatTheme.tsx     # CSS-variable and portal boundary
│   │   ├── AionChatView.tsx      # controlled inline chat surface
│   │   ├── AionChatWorkspace.tsx # default navigator and chat
│   │   ├── AionChatNavigator.tsx # agent/context navigation panel
│   │   ├── AionAgentList.tsx     # controlled catalog presentation
│   │   ├── AionConversationList.tsx # controlled context presentation
│   │   ├── AionChatComposer.tsx  # draft, send, stop, attachment UI
│   │   ├── AionChatTranscript.tsx
│   │   ├── AionChatPopup.tsx     # deferred future shell
│   │   ├── AionChatSidebar.tsx   # deferred future shell
│   │   ├── renderers/
│   │   │   ├── MarkdownRenderer.tsx # safe Markdown-to-React rendering
│   │   │   └── ...               # message/part/activity renderers
│   │   └── slots.ts              # public customization contracts
│   ├── styles/
│   │   ├── variables.css         # semantic theme tokens
│   │   └── aion-chat.css         # scoped component styles
│   ├── a2a/
│   │   ├── agentCard.ts          # discovery and security requirements
│   │   ├── contextDirectory.ts   # direct A2A context extensions
│   │   └── directTransport.ts    # direct HTTP/SSE A2A adapter
│   ├── graphql/
│   │   ├── operations.ts         # Aion chat GraphQL documents
│   │   ├── normalize.ts          # GraphQL/A2A to core events
│   │   ├── contextDirectory.ts   # a2aRpc context extension adapter
│   │   ├── apolloTransport.ts    # caller-owned Apollo adapter
│   │   └── standalone.ts         # standalone GraphQL client factory
│   ├── uploads/
│   │   └── uploader.ts           # Aion Files and injected upload adapters
│   └── testing/
│       ├── fakeTransport.ts
│       └── transportContract.ts
├── examples/
│   ├── inline-bootstrap/
│   ├── host-apollo/
│   └── standalone-embed/         # future customer-embed fixture
├── specs/
│   └── aion-chat-react-library-spec.md
└── THIRD_PARTY_NOTICES
```

Planned entry points:

- Package root: models, controller/hooks, inline chat/workspace components,
  conversation-store contracts, and transport interfaces, including the shared
  theme boundary and safe Markdown renderer. Popup/sidebar exports are
  deferred.
- `./styles.css`: opt-in base styles and variables.
- `./a2a`: Agent Card discovery and direct A2A streaming transport.
- `./graphql`: GraphQL documents, normalization, and caller-owned Apollo
  adapter. Importing it performs no connection setup.
- `./graphql/standalone`: explicit standalone transport/client factory for
  Aion's existing GraphQL routes.
- `./uploads`: upload contracts plus the authenticated Aion Files adapter.
- `./storage/browser`: explicit host-scoped browser conversation store. Its
  import and construction perform no storage reads until the consumer uses it.
- `./testing`: fake transport and transport conformance helpers.

`aion-agent-cloud` remains responsible for application concerns around the
library: obtaining its Apollo client from the existing provider, selecting the
organization, authorizing access, routing, defining the browser-history scope,
and deciding when the Playground is visible. It may control agent/context
selection itself or use the library's default workspace navigator.

The related backend ownership is expected to remain in `aion-api2`:

```text
aion-api2/
├── graphql/.../GraphQLGenerator.scala    # scoped SDL allowlist/generation
├── src/main/.../controllers/FileController.scala # upload and grant HTTP API
└── src/main/resources/static/
    └── chat-client-schema.graphql        # shared generated client contract
```

The generated schema remains a manually synchronized client contract. It does
not select which fields the existing runtime endpoints mount or replace
resolver-level authorization. No initial backend catalog or authentication
change is required.

## 4) Configuration Model (key decisions)

The exact TypeScript names may change during planning, but the ownership model
is fixed unless recorded as a new design decision.

### Core transport

```ts
export interface AionChatTransport {
  stream(
    request: AionChatRequest,
    options: { signal: AbortSignal },
  ): AsyncIterable<AionChatEvent>;

  dispose?(): void | Promise<void>;
}
```

- `AionChatRequest` carries the selected agent, context/message identifiers,
  typed message parts, and request metadata needed by the A2A call.
- `AionChatEvent` is a normalized discriminated union for acceptance, message
  content/deltas, task snapshots/status, artifacts, input-required state,
  completion, and failure.
- Cancellation uses `AbortSignal`; transport-specific unsubscribe behavior is
  hidden behind the adapter.
- `dispose` applies only to resources owned by that transport. The injected
  Apollo adapter does not implement client disposal because it does not own the
  client.

### Optional credentials

```ts
export interface AionCredentialProvider {
  getBearerToken(
    request: AionCredentialRequest,
  ): Promise<string | null>;
}
```

- The provider is optional because public distributions accept anonymous
  requests.
- Direct A2A calls request a token only when the Agent Card requires one.
  GraphQL catalog and RPC calls always use an authenticated connection and
  therefore require a token provider or a host-owned authenticated client.
- `null` means no credential is currently available; it does not authorize a
  fallback after a supplied credential was rejected.
- A static token convenience may exist for tests, but application documentation
  must prefer a callback capable of returning a refreshed, short-lived token.
- Credential values never enter conversation state, error payloads, analytics,
  or logs.

### Authenticated catalog selection

- The initial agent picker queries `agentIdentityDetails` with a host-supplied
  organization ID, `types: [Principal, Personal]`, `networkTypes: [A2A]`, and
  `includePersonalSelf: true`, matching the existing Python chat client.
- The GraphQL connection carries a valid user JWT. The server remains
  authoritative for organization and identity visibility.
- The catalog model exposes the selected identity's display and A2A addressing
  information. It does not attempt to mirror distribution access policy or
  predict authorization for a later RPC request.
- A future anonymous or cross-organization directory will define its own safe
  projection only when an embed requires one. Known public targets should
  prefer direct A2A discovery through their configured Agent Card.

### Agent and conversation navigation

```ts
export interface AionConversationDirectory {
  list(
    agent: ChatAgent,
    options: {
      historyLength?: number;
      historyOffset?: number;
      signal: AbortSignal;
    },
  ): Promise<readonly string[]>;

  get(
    agent: ChatAgent,
    contextId: string,
    options: {
      historyLength?: number;
      historyOffset?: number;
      signal: AbortSignal;
    },
  ): Promise<AionConversationSnapshot>;
}

export interface AionConversationStore {
  list(agentId: string): Promise<readonly AionConversationSummary[]>;
  load(
    agentId: string,
    contextId: string,
  ): Promise<AionConversationSnapshot | null>;
  save(agentId: string, snapshot: AionConversationSnapshot): Promise<void>;
  remove(agentId: string, contextId: string): Promise<void>;
}
```

- `contextId` is the conversation/thread identifier used by A2A. A task ID
  identifies one execution within that context and is not a navigation key.
- The directory is the remote read boundary. Its direct-A2A and GraphQL
  adapters map `list` to `GetContexts` and `get` to `GetContext`; neither
  operation belongs on the send/stream transport.
- `GetContexts` defines the canonical recent order. Cached summaries may add a
  local title or preview but cannot add an inaccessible remote context to the
  server result. An uncached ID receives a neutral fallback label until it is
  selected and hydrated.
- Starting a new conversation generates a context ID client-side, selects an
  empty local conversation, and sends that same ID with the first message. An
  unsent empty conversation need not be written to a persistent store. After
  the first persisted turn, the server directory becomes authoritative for its
  remote presence.
- The initial store is intentionally small: list, load, save, and remove.
  Rename, archive, server-side delete, realtime synchronization, and
  cross-device mutation are not implied by this contract. `remove` only
  removes the local cached snapshot because version 1.0.0 defines no remote
  deletion operation.
- `AionConversationSnapshot` is versioned and serializable. Snapshot creation
  strips transient controller state, `File` objects, queued uploads, bearer
  credentials, and grant-bearing URLs before calling the store. File history
  may retain a safe name, media type, and size for display.
- The implicit default is in-memory and lasts for the provider lifetime. The
  optional browser store requires an opaque host-provided scope key such as a
  stable user/organization/application tuple; it never receives or persists a
  bearer token.
- `AionChatTransport` remains responsible only for sending, streaming,
  cancelling, and disposing. The controller saves normalized conversation
  state through the store after meaningful changes.
- A directory adapter is optional. When present, the workspace pages remote
  IDs and lazily refreshes a selected context before treating cached history as
  current. When unsupported, the workspace exposes a typed history-unavailable
  state and may continue with local, fixed, or newly created contexts.
- `AionChatNavigator` is controlled presentation over normalized agents,
  conversation summaries, selection, loading, and errors. Headless hooks join
  the catalog and store for consumers that render different navigation.
- `AionChatWorkspace` is the default composition. Its navigation panel begins
  on the agent list, slides to recent conversations after agent selection, and
  provides Back and New conversation actions. The transition honors reduced
  motion and preserves focus on the corresponding trigger.
- The same contracts support four initial host policies: catalog plus
  conversations (default), fixed agent plus conversations, fixed agent plus
  fixed context, and fixed agent with a fresh context per mounted workspace.
  Hiding a navigation level is composition, not a separate transport mode.
- A wider host may render `AionAgentList` and `AionConversationList`
  simultaneously instead of using the one-panel transition. A future shell
  must reuse the same controlled navigator rather than inventing another
  selection model.
- Neither GraphQL nor direct A2A uses agent-wide `ListTasks` to discover
  contexts. Both use the dedicated Aion context extensions after their server
  implementation enforces the caller boundary described above.

### Shared theme boundary

```tsx
const themeStyle = {
  "--aion-chat-radius": "0.5rem",
} satisfies AionChatThemeStyle;

<AionChatTheme
  className="aion-chat-bootstrap-theme"
  style={themeStyle}
>
  <AionChatProvider transport={transport} agentId={agentId}>
    <AionChatView />
  </AionChatProvider>
</AionChatTheme>
```

- Semantic `--aion-chat-*` custom properties are the sole styling parameter
  contract. Component props select behavior and structure, not colors,
  typography, spacing, radii, or shadows.
- Export `AionChatThemeStyle` so TypeScript consumers can set supported CSS
  custom properties without unsafe casts or an additional JavaScript theme
  model.
- The package stylesheet defines complete neutral defaults on the theme root.
  Hosts customize them through a class, stylesheet, or the root element's
  `style` prop; all three set the same CSS variables rather than invoking
  separate theme systems.
- The theme boundary's existing portal container remains future-ready
  infrastructure; no current workspace behavior depends on it. A future shell
  can define its portal behavior when that work is resumed.
- The Bootstrap example maps Aion tokens to the host's Bootstrap custom
  properties. It may use Bootstrap and React-Bootstrap for page chrome, but no
  library component emits Bootstrap class names or imports Bootstrap code.
- Light/dark changes are expressed by changing the variables available at the
  theme boundary. The core library does not inspect `data-bs-theme`; the
  Bootstrap bridge naturally follows the host variables selected by that
  attribute.

### Safe Markdown rendering

- The default assistant renderer uses `react-markdown` with `remark-gfm` and
  typed component overrides, following the useful replaceable-renderer pattern
  demonstrated by CopilotKit.
- Raw HTML is not parsed. The default path does not use `rehype-raw` or
  `dangerouslySetInnerHTML`, and keeps the renderer's safe URL transform so
  executable protocols are discarded.
- Links, headings, paragraphs, lists, tables, blockquotes, inline code, and
  fenced code receive Aion-owned components and scoped classes. External links
  open with `noopener` and `noreferrer` isolation.
- Consumers may replace the Markdown renderer through a slot, but the default
  component map should be extensible enough that ordinary customization does
  not require replacing the safety pipeline.
- Syntax highlighting, math, raw HTML allowlists, and executable embedded
  content are not required for the walking skeleton. They require separate
  dependency and security review before becoming defaults.

### Agent interaction motion

- `AionActivityIndicator` has explicit pending, succeeded, requires-action, and
  failed visual phases. It renders Phosphor icons and receives its label and
  phase from the normalized UI/controller state; it does not inspect transport
  payloads or decide when work is complete.
- The generic post-send placeholder uses a rotating `SpinnerGapIcon` and plain
  waiting label. First meaningful agent output may transition the icon to a
  `CheckCircleIcon` while the actual content appears immediately; the check is
  a brief acknowledgement that waiting ended, not a claim that the A2A task
  completed.
- Explicit thinking or reasoning titles may use `AionShimmerText`. The visible
  text remains the canonical accessible text and the masked highlight layer is
  decorative.
- `AionStreamingText` adapts the soft opacity/1px-blur entrance to actual
  appended model deltas. Arrival cadence supplies the stagger; the library does
  not replay the reference's synthetic per-word timer or hold later content to
  preserve a visual sequence.
- Initial defaults are a 2-second linear shimmer, a 350-millisecond smooth
  streamed-content entrance, and a roughly 900-millisecond linear spinner
  cycle. These values are CSS-variable defaults rather than protocol timing.
- A reduced-motion media query produces static, immediately resolved visual
  states. It does not require a React-side media-query listener for correctness.

### Transcript rendering performance

- Stable transcript-entry wrappers use `content-visibility: auto` so supporting
  browsers can skip off-screen layout and painting while preserving the full
  transcript in the DOM.
- Pair containment with `contain-intrinsic-size: auto <fallback>` so an
  unrendered wrapper reserves an estimated block size and remembers its actual
  size after rendering. Tune the initial fallback using the long-history
  fixture rather than adding per-message JavaScript measurement.
- Browsers that do not support the properties render the complete transcript
  normally. The library does not branch its React state model by browser
  support.
- Virtualization is not part of the initial implementation. It may be added as
  a later measured optimization if browser containment does not meet the
  transcript performance requirements of real consumers.

### React composition

```tsx
<AionChatTheme>
  <AionChatProvider transport={transport} agentId={agentId}>
    <AionChatView slots={slots} />
  </AionChatProvider>
</AionChatTheme>
```

- The provider owns normalized conversation/controller state, not global
  authentication or navigation.
- The inline chat and contained workspace consume the same provider and can
  also be driven through controlled headless hooks.
- A future popup, popover, sidebar, or script-loaded embed must compose this
  established view rather than defining another controller, transport, or
  styling contract.
- Hosts may control agent/context selection and inject their own conversation
  store. Consumers that do not need persistence receive an in-memory store and
  may omit the navigator entirely for a fixed context.

### Host-owned Apollo integration

```tsx
const client = useApolloClient();
const transport = useMemo(
  () => createApolloAionChatTransport({ client }),
  [client],
);

return (
  <AionChatProvider transport={transport} agentId={agentId}>
    <AionChatView />
  </AionChatProvider>
);
```

- This is the required integration mode for `aion-agent-cloud`.
- The adapter reuses the application's current client, including its WorkOS
  token callback, authenticated WebSocket, retry/reconnect coordination, and
  cache.
- The adapter subscribes and unsubscribes operations but does not create,
  reconnect, stop, reset, or clear the supplied client.
- There is one GraphQL authentication and connection owner: the host
  application.

### Direct A2A integration

```ts
const transport = createDirectAionA2ATransport({
  agentCardUrl,
  credentials,
});
```

- Agent Card discovery supplies the preferred A2A interface, streaming
  capability, protocol version, and security requirements.
- The adapter omits authorization for a card with no security requirement and
  requests a bearer token when the advertised scheme requires one.
- The server repeats live access checks on every operation; cached discovery
  data cannot grant access.
- This is the smallest standalone path when the host already knows the target
  and does not need Aion catalog or upload operations.

### Standalone GraphQL integration

```ts
const client = createStandaloneAionChatGraphQLClient({
  httpUrl,
  websocketUrl,
  organizationId,
  getBearerToken: async () => extensionAuth.getAccessToken(),
});

// Later, when the embed is permanently removed:
await client.dispose();
```

- Standalone creation is explicit and lives in an optional subpath.
- The factory sends only operations generated from the shared chat-client
  schema to Aion's existing complete-schema endpoints and owns the minimal
  query/subscription connection needed for catalog and chat. It does not
  reproduce the full
  `aion-agent-cloud` GraphQL provider, global cache policies, or application
  reconnect coordinator.
- The token getter is called when authorization is needed so refreshed tokens
  do not require rebuilding UI state.
- The initial standalone GraphQL client requires an organization ID and a
  bearer token. Changing credentials requires an explicit reconnect because
  GraphQL WebSocket authentication is established for the connection.
- The consumer owns the client instance and must dispose it when its
  long-lived embed or extension context is destroyed.

### Existing GraphQL backend behavior

- The existing GraphQL HTTP and subscription routes continue to require valid
  authentication.
- The `agentIdentityDetails` resolver requires a user and authorizes visibility
  for the supplied organization ID before returning identities.
- The complete runtime schema remains exposed. The generated
  `chat-client-schema.graphql` only constrains the operations shipped by chat
  clients and does not replace resolver-level authorization.

### Attachment upload integration

```ts
export interface AionAttachmentUploader {
  upload(
    file: File,
    options: { signal: AbortSignal },
  ): Promise<AionUploadedAttachment>;
}
```

- File selection, screenshot capture, preview, and user confirmation remain UI
  or host concerns.
- The uploader owns only the authorized transfer and returned metadata.
- The controller converts the uploaded result into a URL-backed A2A file part
  before calling the chat transport.
- Hosts may inject a custom uploader even when using the standard GraphQL chat
  adapter.
- The default Aion adapter sends an authenticated multipart `POST /files` with
  a stable `operationId`, the configured `organizationId`, the exact
  `byteSize`, `purpose=MessagingMedia`, and an `AgentIdentity` or
  `Distribution` association for the selected Aion target.
- The adapter uses the returned file and version IDs to call
  `POST /files/{fileId}/versions/{versionId}/grants` with a grant lifetime of at
  most one hour. `AionUploadedAttachment.url` is the returned exact-version
  grant URL, not the protected current-head URL from File creation.
- The adapter exposes the current 20 MiB server limit for client preflight and
  preserves the Files service's one-hour `MessagingMedia` retention. It does
  not introduce a new `ChatAttachment` purpose until chat needs materially
  different storage policy.
- Screenshot capture normally produces PNG. Hosts may narrow accepted file
  types through attachment configuration, while the server retains its current
  generic media-type validation.
- The uploader treats grant URLs as temporary credentials and redacts them
  from errors, logs, analytics, and diagnostic summaries.

## 5) Open Questions

[[SPEC-INSTRUCTION]]
Before implementation begins, freely revise, reorder, or remove Open Questions
so they reflect current decision needs. Once implementation begins, Open
Questions are append-only; do not delete resolved questions.
Track each question with status: `open`, `resolved`, `deferred`.
When resolving a question, keep the original text and add a short resolution
note.
[[/SPEC-INSTRUCTION]]

- [status: resolved] What npm scope and package name should distinguish this
  browser library from the existing terminal package: for example,
  `@terminal-research/aion-chat-react`, `@aion/chat-react`, or another name?
  Resolution: use `@terminal-research/aion-chat-react`, matching the repository
  and current package metadata while keeping the React binding explicit.
- [status: resolved] Which exact CopilotKit files and style fragments survive
  the first adaptation after Aion contracts are defined, and which should be
  reimplemented more simply? Resolution: Phase 1 adapted the controlled chat
  view, input, message-view, and Markdown component-map patterns listed in
  `THIRD_PARTY_NOTICES.md`. No CopilotKit styles, runtime, AG-UI model,
  configuration provider, branding, or license-gating code was adopted.
- [status: resolved] Should `aion-api2` publish the shared
  `chat-client-schema.graphql` as a versioned artifact/package, or should both
  `aion-python-sdk` and `aion-chat-react` synchronize pinned copies and verify
  them against the backend in CI? Resolution: do neither. Keep the generated
  `aion-api2` schema canonical and manually copy it into each client repository
  that needs it, currently `aion-chat-react`, when the contract changes.
- [status: resolved] Should the minimal standalone GraphQL transport use Apollo
  Client for maximum code reuse or use `graphql-ws` plus a smaller request
  client to reduce extension bundle size? Resolution: use native `fetch` for
  HTTP operations and `graphql-ws` for subscriptions. Keep Apollo limited to
  the caller-owned client adapter used by host applications.
- [status: resolved] What stable HTTP and subscription paths should host the
  dedicated optional-auth Aion chat GraphQL API? Resolution: do not add
  dedicated chat paths. Reuse `POST /api/graphql` and `GET /ws/graphql`, make
  missing credentials anonymous, and retain schema annotations plus
  operation-level authorization as the security boundary. Superseded for the
  initial release: the existing routes retain required authentication.
- [status: deferred] What exact public-safe fields, filters, pagination model,
  and access presentation should the new `agentCatalog` query expose?
  Deferral: reuse authenticated `agentIdentityDetails` for now and reconsider a
  public-safe catalog only when a concrete embed requires one.
- [status: deferred] Should a standalone private embed obtain an ordinary
  short-lived Aion JWT from the host, or should the backend issue a narrower
  audience- and agent-scoped embed token? Deferral: the initial GraphQL
  integration accepts a host-supplied user JWT; embed-specific credentials will
  be designed with the first concrete embed.
- [status: resolved] What server endpoint, authorization scope, retention
  policy, size limit, and media-type policy will back screenshot/file uploads?
  Resolution: reuse the authenticated Aion Files API with the caller's JWT and
  organization ID, `MessagingMedia`, a selected target association, the
  existing 20 MiB ingest limit and one-hour retention, and an exact-version
  read grant of at most one hour. Keep media-type selection configurable in the
  client and retain existing server validation.
- [status: resolved] Should catalog-backed agent selection ship as a default
  library component or only as a headless query/controller plus a replaceable
  picker slot? Resolution: ship both headless hooks/controlled lists and a
  default `AionChatWorkspace`. Its one-panel navigator moves from agent catalog
  to that agent's recent conversations, while fixed-agent and custom layouts
  can omit or replace either level.
- [status: resolved] Which thread-history operations belong in the initial
  transport contract versus remaining entirely host-managed? Resolution: none
  belong in `AionChatTransport`. Add a separate `AionConversationStore` with
  list, load, save, and remove over versioned safe snapshots, an in-memory
  default, and an explicitly scoped browser store. Remote synchronization and
  richer lifecycle operations remain deferred until Aion has a caller-scoped
  server contract.
- [status: resolved] Should server-backed thread discovery and history use the
  Aion `GetContexts` and `GetContext` extensions? Resolution: yes. Add a remote
  `AionConversationDirectory` that uses those methods through direct A2A or
  GraphQL `a2aRpc`, while retaining `AionConversationStore` as the safe local
  cache. The backend must enforce exact caller and agent/environment scoping
  before the directory is enabled; anonymous public history remains disabled
  without a stable per-caller scope.
- [status: resolved] Which React versions must be supported by the first
  published release? Resolution: target React and React DOM `^19.2.0`, matching
  the versions currently used by `aion-agent-cloud`. Do not add a React 18
  compatibility promise or validation matrix until a concrete consumer needs
  it.
- [status: resolved] Should examples use Storybook, a small Vite application,
  or both for visual development and packed-package validation? Resolution:
  begin with a small Vite application using Bootstrap 5.3 and React-Bootstrap
  as example-only dependencies. Add Storybook later only if the component
  inventory makes it materially useful.
- [status: deferred] Does the first browser-extension target use a popup, side
  panel, content-script overlay, or more than one of these surfaces, and which
  manifest/CSP constraints follow from that choice? Deferral: browser-extension
  and customer-page shell selection is outside the current workspace scope.
  Revisit it with a concrete host and delivery model.
- [status: resolved] What measured transcript length and streaming update rate
  should trigger message windowing, and can `content-visibility` satisfy the
  same browser, accessibility, search, and scroll requirements more simply?
  Resolution: use `content-visibility: auto` with
  `contain-intrinsic-size: auto <fallback>` on stable transcript-entry wrappers
  for the initial implementation. Do not add windowing or a retention limit.
  Reconsider virtualization only if long-history and streaming measurements
  demonstrate a material remaining problem.
- [status: deferred] Should the popup behave as a modal dialog with focus
  containment, or as a non-modal chat surface that permits interaction with
  the host page while open? Deferral: decide this only when a concrete popup or
  popover shell becomes active work.
- [status: resolved] Which agent interactions should receive default motion,
  and which icon system should they use? Resolution: add thinking-title shimmer,
  new-delta soft entrances, and pending-to-success/failure activity indicators.
  Use Phosphor icons consistently, drive every transition from normalized
  lifecycle state, avoid simultaneous indefinite effects, and provide an
  immediate reduced-motion path.

## 6) Q&A (Design Decisions Log)

[[SPEC-INSTRUCTION]]
Before implementation begins, freely revise, reorder, or remove Q&A entries so
they reflect the current design. Once implementation begins, Q&A is append-only;
do not delete prior entries and append new Q/A pairs to the end of this section.
When an Open Question is resolved, record the decision here and then update the
question status in Section 5.
[[/SPEC-INSTRUCTION]]

Q: Are we forking or directly depending on CopilotKit's React package?

A: Neither as the default strategy. We will selectively adapt the valuable
MIT-licensed view code into an Aion-owned library, retain attribution, and avoid
the runtime, AG-UI, license-gating, branding, and dependency weight that do not
serve the Aion integration.

Q: Is CopilotKit's headless model the basis of the new runtime?

A: No. The library may preserve useful component composition and headless React
hooks, but Aion/A2A concepts and transport events are the canonical data model.

Q: Should the library duplicate the GraphQL layer from `aion-agent-cloud`?

A: It should own only the small, portable chat integration surface: scoped
schema, operation documents, generated operation types, A2A normalization, and
adapter logic. It should not copy the application Apollo provider, global
link/cache policies, reconnect coordinator, or WorkOS integration.

Q: Will importing the library into `aion-agent-cloud` create two GraphQL
connections that need separate authentication?

A: No. The `aion-agent-cloud` integration must pass its existing Apollo client
to `createApolloAionChatTransport`. The adapter uses that client's established
connection and authentication lifecycle and does not create or dispose another
client. A separate connection exists only when a standalone consumer explicitly
calls the standalone factory.

Q: Why include both direct A2A and a standalone GraphQL factory?

A: Direct A2A is the canonical and smallest chat path when the consumer already
knows an Agent Card or A2A address. The scoped GraphQL route adds Aion-specific
catalog discovery, future uploads, and an optional A2A RPC gateway through one
connection. Keeping both behind the same transport interface lets consumers
choose without coupling the UI to either wire format.

Q: Should the React library have a separate generated GraphQL schema from the
Python SDK chat client?

A: No. Both are Aion chat clients and will share the existing generated
`chat-client-schema.graphql`. Its allowlist becomes the union of approved chat
operations needed by both clients. Existing authenticated fields remain
authenticated, while the new public-safe catalog and distribution RPC behavior
use optional caller context. The shared SDL is still only a code-generation
artifact until the backend mounts a matching runtime schema and optional-auth
controller.

Q: Why not make the existing full GraphQL endpoint optionally authenticated?

A: Authentication currently occurs before the full GraphQL interpreter runs,
and many resolvers assume a concrete `GQLEnvironment.authContext`. Making that
route optional would broaden the attack surface and require auditing the whole
schema. A dedicated allowlisted chat API keeps anonymous reachability small and
testable while leaving existing clients unchanged.

Q: Which distribution access modes exist today?

A: There are three: `Public`, `AionAnyMember`, and `AionSameOrgMember`.
`Public` is globally discoverable and anonymously executable.
`AionAnyMember` is globally discoverable but executable only by an
authenticated Aion member. `AionSameOrgMember` is discoverable and executable
only by an authenticated member of the owning organization.

Q: What does an anonymous catalog return?

A: It follows the existing global-catalog policy: `Public` and
`AionAnyMember` entries may be returned, but each entry exposes whether the
current caller can invoke it. `AionAnyMember` entries are presented as requiring
login. `AionSameOrgMember` entries are omitted without verified owning-org
membership.

Q: How does optional authentication behave?

A: No credential produces an anonymous caller. A valid bearer credential adds
the verified Aion context. A supplied but invalid credential is rejected and
never downgraded to anonymous. The server re-evaluates current distribution
policy for both catalog and RPC access.

Q: Does an authenticated caller invoke a `Public` distribution as themselves?

A: No. To match current direct A2A ingress, `Public` continues to use the public
anonymous principal even if the caller also has an Aion session. A future
personalized-public behavior would require an explicit new server access mode.

Q: Can the anonymous GraphQL RPC target every `CapabilitySubject` currently
accepted by `a2aRpc`?

A: No. The dedicated chat API is limited to distribution-backed public chat
addresses. Environment, deployment, system, keyed capability, and other
internal targets stay on authenticated APIs unless separately designed and
reviewed.

Q: Who owns agent selection?

A: The host owns the selected agent and authorization context. The library
accepts that selection and can render an injected picker slot. A reusable agent
directory may be added through an optional adapter after its API boundary is
resolved.

Q: Who owns file and screenshot capture?

A: The host or component interaction owns capture and user confirmation. An
injected uploader owns transfer. The chat controller owns representing the
result as a URL-backed A2A file part. This keeps sensitive browser capture
permissions and backend storage policy outside the core UI.

Q: Are popup and sidebar separate chat implementations?

A: No. They are presentation shells around the same controlled chat view and
controller. They do not introduce separate data models, transports, or
conversation stores.

Q: What is the role of the current `aion-agent-cloud` Playground code?

A: It is the behavioral reference for transport normalization and lifecycle
parity, then becomes the first production consumer of the new library. Its
application-specific authentication, routing, organization state, and agent
selection remain in `aion-agent-cloud`.

Q: How is chat styling configured consistently across inline, popup, and
sidebar surfaces?

A: Through one theme boundary and one family of semantic
`--aion-chat-*` CSS custom properties. All default component CSS consumes those
tokens. Hosts may set them through a class, stylesheet, or typed `style` value,
but those are normal CSS authoring paths for the same variables rather than
different theme APIs. Later portaled surfaces use a portal container inside the
same boundary. Bootstrap is used only in examples and host bridge styles.

Q: How will assistant Markdown be rendered safely?

A: The default renderer follows CopilotKit's useful replaceable Markdown slot
pattern. CopilotKit's pinned v2 component uses Streamdown, while its related
renderer demonstrates `react-markdown`, GFM, component overrides, and code
blocks. Aion uses its own `react-markdown` plus `remark-gfm` pipeline to avoid
CopilotKit and Tailwind coupling. Raw HTML parsing is disabled, the safe URL
transform remains in place, and Aion components render links, headings, lists,
tables, blockquotes, and code. A consumer may replace the renderer, but doing
so explicitly takes ownership of the replacement's content-safety behavior.

Q: What is the first implementation milestone?

A: A working inline chat with a fake streaming transport, safe Markdown, the
shared CSS-variable theme boundary, a Bootstrap-based Vite example, and the
host-injected authenticated Apollo transport. Popup and sidebar shells are
deliberately deferred until the inline view, controller, and styling contract
have been exercised.

Q: Which CopilotKit implementation details should Subtask G carry into the
composer?

A: Selectively carry over controlled textarea autosizing, IME-safe measurement,
explicit opt-in autofocus, focus restoration after discrete actions, and clear
attachment-queue presentation. Keep attachment state and upload behavior on
Aion contracts. Do not adopt CopilotKit audio/transcription modes, tool menus,
interrupt-pill state, configuration providers, or Tailwind layout machinery.

Q: Should Aion copy CopilotKit's message memoization and virtualization now?

A: No wholesale copy is justified. Subtask U removes the currently proven
quadratic lookup and draft-triggered scroll work by stabilizing transcript
derivation. Subtasks H and I will first memoize stable Aion leaf renderers and
measure realistic large, streaming histories. Windowing or
`content-visibility` is added only after that fixture demonstrates a material
problem and establishes a behavior threshold.

Q: How should CopilotKit's tool-call and activity composition influence Aion
message rendering?

A: Subtask H will retain the useful idea of composable specialized renderers,
but dispatch through Aion typed-part and activity discriminants. Unknown data
must remain visible and diagnosable. CopilotKit message roles, tool runtime,
inspector, feedback system, and agent-state snapshots do not enter the Aion
model.

Q: Which popup and sidebar behavior is worth adapting?

A: Subtask Q should reuse the behavioral ideas of normalized dimensions,
dynamic viewport and safe-area sizing, Escape and outside-pointer cleanup,
focus entry/restoration, responsive overlay behavior, and optional left/right
sidebar docking. The default sidebar must not mutate host body layout; docking
is an explicit opt-in. Popup focus containment remains open until its modal
semantics are selected.

Q: Should Aion adopt CopilotKit's generic slot utility?

A: Only in a smaller Aion-owned form under Subtask X. Component replacement
and partial default-prop customization are useful across multiple planned
surfaces. Implicit class-name strings, Tailwind merging, `any`-typed internals,
and render-prop versions of every component add coupling and are not part of
the planned contract.

Q: What npm scope and package name should the React library use?

A: Use `@terminal-research/aion-chat-react`. It matches the repository and
current package metadata, distinguishes this browser library from the existing
terminal package, identifies the React binding explicitly, and does not assume
control of a separate `@aion` npm scope.

Q: How should the generated chat-client GraphQL schema reach client
repositories?

A: Keep the generated `aion-api2` `chat-client-schema.graphql` as the canonical
source. When its contract changes, a developer manually regenerates it and
copies it into each client repository that needs the schema, currently
`aion-chat-react`. Do not add a versioned schema package, source manifest,
checksum, or automated cross-repository synchronization system. Each client
may still run its normal local code-generation and build checks after the copy.

Q: Should the standalone GraphQL adapter create its own Apollo Client?

A: No. Apollo supports subscriptions through `GraphQLWsLink`, which itself
wraps a `graphql-ws` client, but the standalone adapter does not need Apollo's
cache or link infrastructure. Use native `fetch` for ordinary HTTP GraphQL
operations and `graphql-ws` for lazy streamed subscriptions, asynchronous
connection authentication, retries, cancellation, and disposal. Apollo remains
an optional integration dependency only for hosts that inject an existing
client.

Q: Does the chat-client GraphQL schema subset require dedicated server
endpoints?

A: No. The subset exists for client code generation and does not need a
separate runtime interpreter. Standalone clients use the existing
`POST /api/graphql` and `GET /ws/graphql` endpoints. Those controllers must
treat absent credentials as an anonymous caller, preserve verified context for
valid credentials, and reject invalid supplied credentials. The complete
schema remains mounted, with its subject annotations and operation-level
authorization protecting non-public operations. This supersedes the earlier
plan for a dedicated optional-auth chat route and runtime schema.

Q: Does the initial React agent catalog require a new GraphQL field?

A: No. Reuse the existing authenticated `agentIdentityDetails` field, matching
the catalog approach already used by the Python chat client. The host or
standalone configuration supplies a user JWT and organization ID. The React
operation selects only the presentation and A2A addressing fields it needs;
the server continues to authorize organization visibility.

Q: When should anonymous or public catalog discovery be reconsidered?

A: When a concrete embed cannot provide authenticated GraphQL context. A known
public agent should prefer direct A2A discovery through a configured Agent Card.
If a future embed needs directory browsing, define its public-safe projection,
organization scoping, and credential model from that use case instead of adding
them preemptively.

Q: How will the initial chat library upload screenshots and files?

A: Reuse Aion's authenticated Files HTTP API rather than adding a GraphQL or
chat-specific upload endpoint. Upload multipart content through `POST /files`
with the user JWT, organization ID, `purpose=MessagingMedia`, a stable operation
ID, exact byte size, and an association to the selected Aion identity or
distribution. Then mint an exact-version read grant for at most one hour and
place that grant-bearing URL in the A2A file part. The initial contract keeps
the existing 20 MiB ingest limit, one-hour retention, and generic server
media-type validation; hosts may narrow selectable types in the UI.

Q: What does CopilotKit's current thread UI contribute to Aion's design?

A: Its useful separation is a headless thread collection plus controlled chat
selection, with a convenience drawer that handles recent ordering, New
conversation, responsive collapse/off-canvas behavior, focus, pagination, and
host callbacks. The supplied `CopilotThreadsDrawer` and `useThreads` persistence
depend on CopilotKit Intelligence and a license key, so Aion will use those as
interaction references rather than dependencies or source-of-truth storage.

Q: How should the default Aion agent and conversation selector behave?

A: `AionChatWorkspace` owns a one-panel side navigator. It starts with the
authenticated agent catalog, slides to recent conversations for the selected
agent, and offers Back, New conversation, and context selection. This is a more
compact form of the current Playground's entry-plus-thread sidebar. Controlled
`AionAgentList` and `AionConversationList` components also allow a wide host to
show both lists, a fixed-agent host to omit the catalog, and a fixed-context or
always-new host to omit history navigation entirely. This supersedes the
earlier decision that agent selection must always remain host-rendered; the
host still owns organization/authentication context and may control selection.

Q: Is an Aion chat thread a task or a context?

A: It is an A2A context. The stable conversation key is the selected agent plus
`contextId`; task IDs represent individual executions within that context. A
new conversation receives its context ID before the first send so navigation,
persistence, and the outbound A2A message use one identity from the start.

Q: Where does initial conversation history come from?

A: From an `AionConversationStore`, not `AionChatTransport`. The initial release
provides provider-lifetime memory and an optional browser store requiring a
host-defined user/organization/application scope. Stores receive a versioned,
persistence-safe snapshot rather than raw live state, so in-flight browser
files and temporary grant URLs are excluded. This preserves the current
Playground's local-history behavior without claiming cross-device sync. A
server-backed implementation waits for a caller-scoped Aion directory; an
agent-environment-wide task list is not a safe substitute for that contract.

Q: Which Aion contract supplies the server-backed conversation directory?

A: Use the published `GetContexts` and `GetContext` A2A extensions.
`GetContexts` pages most-recent context IDs with `historyLength` and
`historyOffset`. `GetContext` lazily loads the selected context's ordered
messages, artifacts, and current status. Both direct A2A and GraphQL `a2aRpc`
adapters implement one `AionConversationDirectory`; the send/stream transport
does not gain history methods.

Q: Does the new directory replace browser conversation storage?

A: No. It supersedes the earlier decision to defer all remote synchronization,
but not the separate store boundary. `AionConversationStore` remains a
persistence-safe cache for summaries, restored display state, and optimistic
new contexts. Remote IDs and selected-context history come from the directory,
and cached state cannot bypass a fresh server authorization decision.

Q: How does the conversation list avoid fetching every transcript?

A: `GetContexts` establishes the ordered list of IDs. The navigator joins those
IDs to safe locally cached summaries and shows a neutral fallback for unknown
IDs. It calls `GetContext` only when the user selects a context. If richer
server-provided titles or previews become necessary, add them in a separately
versioned summary contract instead of creating an N-plus-one list flow.

Q: Can an anonymous public caller browse prior contexts?

A: Not initially. Public A2A execution may collapse anonymous callers into one
effective principal, which is not a safe history-ownership boundary. Remote
history is available only when the server can scope both extension methods to
the exact effective caller and selected agent/environment. Anonymous clients
can still use fixed or newly generated context IDs without directory access.

Q: Which React versions does the first library release support?

A: React and React DOM `^19.2.0`, matching the current `aion-agent-cloud`
frontend and the peer dependency range already declared by
`@terminal-research/aion-chat-react`. The initial release does not promise
React 18 compatibility; that range can be broadened later when a concrete host
requires it and the library has a corresponding validation fixture.

Q: Which UI surfaces are in scope for the current library release?

A: The contained `AionChatWorkspace`: an agent catalog, an agent-selection
panel, the selected agent's conversation/context list, and the active chat
panel. It is an importable React surface that the Playground or another host
places inside its own page layout. This supersedes the earlier plan to make
popup and sidebar shells part of the initial release.

Q: How should a future customer-page embed relate to the workspace?

A: A future JavaScript bootstrap may mount the same controlled workspace into
a popover, overlay, sidebar, or another host-page container. The current work
should preserve clean imports, scoped styling, and injected transport/auth
boundaries that make that possible, but it will not design or ship the loader,
custom element, iframe, positioning system, or shell behavior without a
concrete customer integration.

Q: Which agent interaction animations are part of the chat workspace?

A: Three restrained effects: shimmer for an explicit active thinking or
reasoning title, a soft entrance for newly appended streamed text, and a
pending-to-success/failure indicator for response waits and other agent
activities. Existing text, restored history, and inactive statuses remain
static.

Q: When does the waiting spinner become a check?

A: Not when the request is merely admitted or accepted by the transport. For
the response placeholder, it resolves when meaningful agent output begins,
such as assistant content or an artifact. A state that requires user action
resolves to an attention icon instead. Content appears immediately while the
decorative transition finishes. A task or tool activity may use the same
component with actual completion semantics, but its label must make that
distinction clear; failures never pass through a success check.

Q: How are animation references and icons incorporated?

A: Recreate the referenced motion behavior in Aion-owned CSS and React code.
Do not copy Transitions.dev's Pro implementation or its custom SVG paths. Use
tree-shakeable named imports from `@phosphor-icons/react` for default spinner,
check, and failure visuals, matching the icon system already used by
`aion-agent-cloud`. All motion values flow through semantic CSS variables and
all default effects stop under `prefers-reduced-motion: reduce`.

Q: How should the initial library render very long transcripts efficiently?

A: Use browser-native `content-visibility: auto` on stable transcript-entry
wrappers, paired with an `auto` `contain-intrinsic-size` fallback. This keeps
the complete transcript in React state and the DOM while allowing supporting
browsers to skip off-screen rendering work. Do not add JavaScript windowing or
change transcript retention in the initial implementation. Validate scroll
anchoring, restored history, browser search, selection, accessibility, and
rapid streaming; reconsider virtualization only if those measurements expose
a material problem.
