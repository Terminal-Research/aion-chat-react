# Bundle budgets

The Phase 2 release baseline was measured from the minified Vite library
output on 2026-09-03. Budgets include approximately 25–50 percent headroom so
ordinary maintenance does not fail on byte-level noise while material growth
requires an explicit review.

| Entry | Baseline raw | Baseline gzip | Raw budget | Gzip budget |
| --- | ---: | ---: | ---: | ---: |
| Core `dist/index.js` | 36.8 kB | 9.6 kB | 48 KiB | 13 KiB |
| Direct A2A `dist/a2a/direct.js` | 18.1 kB | 5.8 kB | 24 KiB | 7 KiB |
| Apollo `dist/graphql/apollo.js` | 13.3 kB | 4.4 kB | 18 KiB | 5.5 KiB |
| Standalone GraphQL `dist/graphql/standalone.js` | 18.4 kB | 6.3 kB | 24 KiB | 8 KiB |
| Testing `dist/testing.js` | 1.3 kB | 0.7 kB | 2 KiB | 1 KiB |
| Styles `dist/styles.css` | 11.0 kB | 2.3 kB | 16 KiB | 3 KiB |

The core entry includes the default message, activity, Markdown, and motion
renderers. Direct A2A, Apollo, and standalone GraphQL remain isolated in
optional entries. Each budget includes an entry's transitive relative
JavaScript imports, so shared normalization code is counted wherever a
consumer needs it. Run
`npm run package:check` after `npm run build` to enforce these limits, inspect
root import boundaries, pack the npm artifact, install it into a temporary
React 19.2 consumer, and verify exports, notices, and React deduplication.
