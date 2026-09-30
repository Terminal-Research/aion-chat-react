# Changelog

All notable changes to this package are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## Unreleased

- Add optional link-preview sources, completed-response cards in Markdown order,
  Open Graph/oEmbed metadata adapters, and click-to-expand image, YouTube, Vimeo,
  and isolated X post rendering. Failed previews preserve the original links.

- Connect Delete chat to server-confirmed context deletion through direct A2A
  and existing GraphQL clients, with pending/retry states, local cache cleanup,
  and protection against stale history reads and writes restoring the thread.

- Reconcile summary events against persisted `summaryUpdatedAt` from directory
  reads, preventing delayed events/reads from replacing newer generated text.
  Keep event `createdAt` distinct from the payload's persisted `updatedAt`.

- Add optional principal-wide conversation updates using existing Apollo or
  standalone GraphQL clients, with a workspace-scoped Zustand store, background
  task indicators, transient completion checks, and generated-title reveals.
- Preserve authorized generated metadata in directory reads without saving it
  into local conversation snapshots; reconcile current state after reconnect.

- Allow authenticated agent catalogs to select A2A or Playground
  distributions explicitly.

## 0.1.0 - 2026-09-03

Initial pre-1.0 release of the Aion React chat library.

- Add transport-neutral chat state, reducers, controllers, accessible inline
  views, safe Markdown, typed renderer slots, attachments, and interaction
  motion with reduced-motion support.
- Add the contained agent and conversation workspace, headless catalog and
  conversation hooks, safe memory/browser stores, and caller-scoped remote
  context directories.
- Add direct A2A, host-owned Apollo, and standalone GraphQL transport adapters,
  plus the authenticated Aion Files attachment uploader.
- License the public source under MIT and support pinned GitHub dependencies by
  compiling distribution artifacts during npm's `prepare` lifecycle.
- Add package-boundary, bundle-budget, transport-conformance, accessibility,
  and example application validation for React 19.2.
