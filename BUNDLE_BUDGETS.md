# Bundle budgets

The release baseline was measured from the minified Vite library output on
2026-09-03 and remeasured after adding remote context-directory adapters. The
profile entry and stylesheet allowance were added with the lazy identity
profile on 2026-09-10. The profile baseline was remeasured after restoring its
Catalog presentation and copy controls later that day.
The conversation subscription/store/thread-feedback baseline was measured on
2026-09-12. Its core entry is approximately 91 kB raw / 24.4 kB gzip, including relative
imports; Zustand remains an external direct dependency rather than a bundled
second copy. The updated allowances below cover this explicit feature growth.
Budgets retain practical headroom so ordinary maintenance does not fail on
byte-level noise while material growth requires an explicit review.

| Entry | Baseline raw | Baseline gzip | Raw budget | Gzip budget |
| --- | ---: | ---: | ---: | ---: |
| Core `dist/index.js` | 91.0 kB | 24.4 kB | 96 KiB | 26 KiB |
| Profile `dist/profile.js` | 15.1 kB | 5.2 kB | 18 KiB | 6 KiB |
| Direct A2A `dist/a2a/direct.js` | 23.8 kB | 7.6 kB | 28 KiB | 9 KiB |
| Apollo `dist/graphql/apollo.js` | 34.1 kB | 10.8 kB | 36 KiB | 12 KiB |
| Standalone GraphQL | 37.4 kB | 11.9 kB | 40 KiB | 13 KiB |
| Testing `dist/testing.js` | 1.3 kB | 0.7 kB | 2 KiB | 1 KiB |
| Uploads `dist/uploads.js` | 5.2 kB | 2.0 kB | 8 KiB | 3 KiB |
| Browser storage `dist/storage/browser.js` | 9.8 kB | 3.2 kB | 16 KiB | 5 KiB |
| Styles `dist/styles.css` | 31.9 kB | 5.2 kB | 36 KiB | 6 KiB |

The core entry includes the default message, activity, Markdown, motion,
conversation storage, and workspace navigation. The profile view is loaded
only when opened. Direct A2A, Apollo, standalone GraphQL, browser storage, and
Files uploads remain isolated where their host dependencies or browser APIs
are optional. Each budget includes an entry's transitive relative JavaScript
imports, so shared normalization code is counted wherever a consumer needs it.
Run
`npm run package:check` after `npm run build` to enforce these limits, inspect
root import boundaries, pack the npm artifact, install it into a temporary
React 19.2 consumer, and verify exports, notices, and React deduplication.
