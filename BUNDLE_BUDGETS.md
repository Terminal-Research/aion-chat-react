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
| Core `dist/index.js` | 112.8 kB | 30.5 kB | 112 KiB | 31 KiB |
| Profile `dist/profile.js` | 15.1 kB | 5.2 kB | 18 KiB | 6 KiB |
| Direct A2A `dist/a2a/direct.js` | 23.8 kB | 7.6 kB | 28 KiB | 9 KiB |
| Apollo `dist/graphql/apollo.js` | 41.2 kB | 13.1 kB | 42 KiB | 13 KiB |
| Standalone GraphQL | 43.5 kB | 13.9 kB | 44 KiB | 14 KiB |
| Testing `dist/testing.js` | 1.3 kB | 0.7 kB | 2 KiB | 1 KiB |
| Uploads `dist/uploads.js` | 5.2 kB | 2.0 kB | 8 KiB | 3 KiB |
| Browser storage `dist/storage/browser.js` | 9.8 kB | 3.2 kB | 16 KiB | 5 KiB |
| Styles `dist/styles.css` | 36.1 kB | 5.9 kB | 36 KiB | 6 KiB |

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

The 2026-09-29 welcome feature remeasurement includes selected-route Agent Card
discovery, the explicit new-thread unary lifecycle, independent welcome/user
response merging, and persisted trigger visibility. Core measured 103,132 raw /
27,873 gzip bytes; Apollo 38,091 / 11,966; standalone 41,183 / 13,033. Only these
three allowances increased. Transport dependencies remain outside core and no
new runtime dependency was added.

The 2026-09-29 inline image preview remeasurement includes ordered image file
parts, expansion through the existing dialog, and delayed-image scroll
handling. Core measured 106,597 raw / 28,832 gzip bytes, an increase of 1,145 /
283 bytes over the preceding thread-selection build. Only the core allowance
increased; no runtime dependency was added and the other entry budgets remain
unchanged.

The 2026-09-29 link-preview remeasurement includes completed-response Markdown
link discovery, compact horizontally scrolling cards, provider-frame media dialogs, and optional Apollo and
standalone metadata sources. Core measured 112,841 raw / 30,532 gzip bytes, a
6,244 / 1,700 byte increase over inline images. Apollo measured 41,191 / 13,103;
standalone measured 43,523 / 13,898. The allowances above cover those additions.
`unified` and `remark-parse` are now direct external dependencies, sharing the
parser versions already used by `react-markdown`; no second parser is bundled.
