---
name: Aion Chat React Library
date_created: 2026-08-31
date_started: 2026-08-31
date_completed: <incomplete>
date_updated: 2026-09-01
---

# Aion Chat React Library

## 1) Description

Build an importable React chat library in the `aion-chat-react` repository for
interactive conversations with Aion agents. The library will provide a shared
chat view plus popup and sidebar shells that can be used by:

- the Playground in `aion-agent-cloud`;
- browser-extension popup and sidebar experiences; and
- other first-party websites that want to embed an Aion agent chat.

The visual starting point will be selected MIT-licensed CopilotKit chat source,
pinned initially to CopilotKit commit
`65bd05e3682ced8f424023f75627f8f833e52745`. We will adapt the useful view,
composer, message, popup, sidebar, scrolling, and slot patterns into Aion-owned
components. We will not carry over CopilotKit runtime, AG-UI, hosted-service,
license-gating, or branding dependencies.

The first working milestone is intentionally narrower than the complete
library: an inline chat interface with fake streaming, safe Markdown, one
CSS-variable theme boundary, a Bootstrap-based example, and the injected
Apollo transport used by `aion-agent-cloud`. Popup and sidebar shells follow in
a later phase after the inline chat contract has been exercised.

The runtime architecture will have three distinct layers:

1. A transport-neutral Aion chat model and controller.
2. Controlled React presentation components.
3. Optional backend adapters for direct A2A and Aion's GraphQL chat surface.

The core package will never create a GraphQL or Apollo client implicitly. In a
host such as `aion-agent-cloud`, the GraphQL adapter will receive the host's
existing authenticated `ApolloClient`. This shares the host's cache, HTTP and
WebSocket links, token lifecycle, reconnect policy, and connection.

For independent embeds, direct A2A will be the canonical chat transport when
the caller already has an Agent Card or A2A address. The adapter will discover
the target's advertised security requirements and request a bearer credential
only when required. An authenticated standalone GraphQL adapter may reuse the
existing identity catalog and A2A RPC operations through Aion's existing
GraphQL HTTP and subscription endpoints. Authenticated file and screenshot
uploads use Aion's existing Files HTTP API and return a bounded exact-version
grant URL for the outbound A2A file part.

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
- `CopilotPopupView` for responsive popover behavior;
- `CopilotSidebarView` for docked and mobile sidebar behavior;
- the slot-based customization pattern and relevant scoped styles.

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

## 1a) Goals

- Publish an Aion-owned React library with a stable, documented public API.
- Provide reusable inline chat, popup, and left/right sidebar surfaces that all
  compose the same controlled chat view.
- Preserve the strongest CopilotKit UI behavior where it provides material
  value, including responsive shells, accessibility, focus management,
  auto-scroll behavior, streaming-friendly rendering, composer states,
  attachment affordances, and replaceable render slots.
- Use one styling contract for every surface: scoped component CSS consuming
  documented semantic `--aion-chat-*` custom properties from a shared theme
  boundary.
- Render assistant Markdown conveniently and safely, including GitHub-flavored
  Markdown and replaceable element renderers, without parsing raw HTML or
  permitting executable URL schemes.
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
- Owning application navigation, organization selection, agent authorization,
  or the full agent-catalog experience.
- Persisting credentials, refresh tokens, or access tokens in the library.
- Adding voice input, transcription, or real-time voice chat in the initial
  implementation unless it is explicitly added as a later subtask.
- Reproducing every CopilotKit renderer, action system, or generative-UI
  feature before a concrete Aion use case requires it.

## 1c) Assumptions and Dependencies

- The initial consumers use React and can install the library as a normal npm
  dependency or workspace package.
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
- React and React DOM must be peer dependencies. Apollo Client and its GraphQL
  transport dependencies must remain optional and isolated to adapter exports.
- All default component styling must consume semantic `--aion-chat-*` CSS
  custom properties from one theme boundary. Do not add a parallel JavaScript
  theme object, per-component color props, or shell-specific theme system.
- The theme boundary must provide complete usable defaults, accept normal
  `className` and `style` overrides for its custom properties, and expose or
  own the portal container used by later popup surfaces so portaled content
  remains inside the same CSS-variable inheritance boundary.
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
  behavior.** **Mitigation:** preserve message memoization, threshold-based
  virtualization, batched event reduction, and explicit pinned/manual scroll
  modes; validate with long and rapidly streaming transcripts.
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
- **Risk: browser-extension security policies differ from normal web apps.**
  **Mitigation:** keep endpoints and token acquisition injectable, avoid dynamic
  code execution, document required extension permissions, and validate the
  standalone adapter under the target extension manifest/CSP before release.
- **Risk: the new component diverges from Playground behavior during
  migration.** **Mitigation:** build a transport conformance suite from current
  Playground cases, migrate behind a temporary application-level switch if
  useful, and remove the old implementation only after parity checks pass.

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
- Verify popup and sidebar shells support controlled and uncontrolled open
  state, Escape, outside interaction where appropriate, focus restoration,
  mobile layout, safe areas, left/right placement, and reduced motion.
- Verify message rendering covers Markdown, plain text, reasoning/status
  presentation, A2A artifacts, non-text parts, tool/activity placeholders,
  errors, copy, and retry/regenerate hooks where supported.
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
- Run accessibility checks plus keyboard-only interaction tests for inline,
  popup, and sidebar fixtures.
- Exercise visual fixtures at desktop, narrow/mobile, and extension-popup
  dimensions with long text, code, attachments, task states, and streaming.
- Integrate into `aion-agent-cloud` and rerun its existing Playground tests,
  adding parity coverage for streaming, unary fallback, status, artifacts,
  agent changes, thread changes, and authentication/reconnection behavior.
- Build the packed npm artifact, install it into an isolated fixture, validate
  ESM/types/style exports, check for duplicate React copies, and record bundle
  sizes before setting release budgets.
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

### Subtask G — Complete the composer and attachment UI (status: not started)

- Expand the composer for processing state, multiline input, keyboard
  interaction, attachment drafts, removal, and host-supplied actions.
- Define an attachment draft model and uploader interface independent of
  GraphQL.
- Preserve the simple send/stop path established by the walking skeleton and
  avoid copying CopilotKit's full action/runtime system.

### Subtask H — Build Aion message and activity renderers (status: not started)

- Implement default renderers for task status, reasoning/status disclosure,
  errors, typed parts, artifacts, file attachments, and extensible
  tool/activity content around the safe Markdown renderer from Subtask E.
- Preserve renderer customization through typed slots or registries while
  keeping unknown content visible and diagnosable.
- Add memoization and virtualization only where transcript behavior proves it
  useful.

### Subtask I — Validate inline behavior and packaging (status: not started)

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

### Subtask M — Implement the direct A2A transport (status: not started)

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

### Subtask N — Implement the standalone GraphQL gateway adapter (status: not started)

- In `aion-chat-react`, add a separate standalone export for Aion's existing
  GraphQL routes with explicit HTTP/subscription URLs, an optional
  asynchronous bearer-token getter, and transport lifecycle options.
- Reuse catalog/RPC operation documents and GraphQL-to-core normalization with
  the injected adapter while owning only the minimal standalone connection.
- Make connection creation lazy, credential changes explicit, and disposal
  idempotent.
- Document browser-extension CSP, origin, token-refresh, login transition, and
  permission requirements.

### Subtask O — Implement upload integration (status: not started)

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

### Subtask Q — Adapt popup and sidebar shells (status: not started)

- Adapt responsive popup and left/right sidebar shells around the established
  shared chat view.
- Support controlled/uncontrolled state, dimensions, safe areas, focus,
  Escape/outside interactions, body-layout effects where explicitly enabled,
  mobile behavior, and slot-based headers/toggles.
- Resolve portals through a container owned or supplied by the shared theme
  boundary so popup content inherits the same CSS variables without a second
  shell theme API.
- Ensure shell-specific code does not own transport or conversation state.

### Subtask R — Add popup and sidebar integration examples (status: not started)

- Provide examples for a host-owned Apollo connection and a standalone browser
  extension/embed connection.
- Demonstrate controlled agent selection, open state, theming, slots,
  screenshot/file attachment, cleanup, and auth-error handling.
- Validate that multiple visual instances can share one host transport without
  accidentally creating multiple backend clients.

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

### Subtask X — Define reusable typed slot values (status: not started)

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

### Subtask Z — Reuse the authenticated identity catalog (status: not started)

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
│   ├── components/
│   │   ├── AionChatTheme.tsx     # CSS-variable and portal boundary
│   │   ├── AionChatView.tsx      # controlled inline chat surface
│   │   ├── AionChatComposer.tsx  # draft, send, stop, attachment UI
│   │   ├── AionChatTranscript.tsx
│   │   ├── AionChatPopup.tsx
│   │   ├── AionChatSidebar.tsx
│   │   ├── renderers/
│   │   │   ├── MarkdownRenderer.tsx # safe Markdown-to-React rendering
│   │   │   └── ...               # message/part/activity renderers
│   │   └── slots.ts              # public customization contracts
│   ├── styles/
│   │   ├── variables.css         # semantic theme tokens
│   │   └── aion-chat.css         # scoped component styles
│   ├── a2a/
│   │   ├── agentCard.ts          # discovery and security requirements
│   │   └── directTransport.ts    # direct HTTP/SSE A2A adapter
│   ├── graphql/
│   │   ├── operations.ts         # Aion chat GraphQL documents
│   │   ├── normalize.ts          # GraphQL/A2A to core events
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
│   └── standalone-embed/
├── specs/
│   └── aion-chat-react-library-spec.md
└── THIRD_PARTY_NOTICES
```

Planned entry points:

- Package root: models, controller/hooks, inline/popup/sidebar components, and
  transport interfaces, including the shared theme boundary and safe Markdown
  renderer.
- `./styles.css`: opt-in base styles and variables.
- `./a2a`: Agent Card discovery and direct A2A streaming transport.
- `./graphql`: GraphQL documents, normalization, and caller-owned Apollo
  adapter. Importing it performs no connection setup.
- `./graphql/standalone`: explicit standalone transport/client factory for
  Aion's existing GraphQL routes.
- `./uploads`: upload contracts plus the authenticated Aion Files adapter.
- `./testing`: fake transport and transport conformance helpers.

`aion-agent-cloud` remains responsible for application concerns around the
library: obtaining its Apollo client from the existing provider, selecting the
organization and agent, authorizing access, routing, and deciding when the
Playground is visible.

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
- The theme boundary provides the default portal container for later popup
  shells. A custom portal container is allowed, but it must be placed under a
  theme boundary rather than receiving copied computed styles.
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
- Inline, popup, and sidebar variants consume the same provider and can also be
  driven through controlled headless hooks.
- The walking skeleton implements `AionChatView` first. Popup and sidebar
  compose this established view in Phase 5 rather than defining the initial
  controller or styling contract.
- Hosts may own thread/context state and persist it externally through
  callbacks rather than a mandatory library store.

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
- [status: open] Should catalog-backed agent selection ship as a default library
  component or only as a headless query/controller plus a replaceable picker
  slot?
- [status: open] Which thread-history operations belong in the initial
  transport contract versus remaining entirely host-managed?
- [status: open] Which React versions must be supported by the first published
  release?
- [status: resolved] Should examples use Storybook, a small Vite application,
  or both for visual development and packed-package validation? Resolution:
  begin with a small Vite application using Bootstrap 5.3 and React-Bootstrap
  as example-only dependencies. Add Storybook later only if the component
  inventory makes it materially useful.
- [status: open] Does the first browser-extension target use a popup, side
  panel, content-script overlay, or more than one of these surfaces, and which
  manifest/CSP constraints follow from that choice?
- [status: open] What measured transcript length and streaming update rate
  should trigger message windowing, and can `content-visibility` satisfy the
  same browser, accessibility, search, and scroll requirements more simply?
- [status: open] Should the popup behave as a modal dialog with focus
  containment, or as a non-modal chat surface that permits interaction with
  the host page while open?

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
