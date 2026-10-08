# Large-library performance

Work is isolated on `feature/large-library-performance`; the preserved product baseline is `1edd695` on `feature/browser-resources-inspector`. The implementation is saved in `c552110`; source/build checks and the complete 31-case browser suite passed on 8 October 2026. Performance measurement is reported separately below.

## Reproduction

Run `npm test`, then `npm run build`. Tests rebuild legacy compatibility files, so always build the MV3 artifact **after** unit/type checks. Use `WORKSPACE_EXTENSION_PATH` to point browser runs at an immutable copy when running other build commands concurrently.

`npx playwright test -c playwright.performance.config.js --workers=1` uses isolated temporary profiles and synthetic data only. Defaults: 1,000 / 10,000 / 50,000 objects, small-board (50 references) and large-board (every object referenced), five samples each. Override with `PERF_SIZES`, `PERF_SHAPES`, `PERF_SAMPLES`, `PERF_LABEL`. Setup is outside timed measurements. Startup navigates through about:blank to a fresh document; this does not guarantee a fresh renderer process or cold browser/OS/disk caches. Timings include New Tab → Boards, not just the unopened desktop.

`node scripts/bundle-report.js dist` reports unpacked bytes, not startup transfer. Browser request filenames are recorded separately with their on-disk source sizes; extension resource timing may expose no transfer sizes. Memory figures, when available, are diagnostic Chromium heap estimates. Seeding/previous documents and garbage collection can affect them; they are not an allocation profile or proof that fixed-board application memory is independent of library size.

Large-board native-editor stress opening is opt-in with `PERF_LARGE_EDITOR=1`: the initial 1,000-card baseline probe stalled, including teardown. Default large-board tests still exercise navigation/search; they do not certify native editor capacity.

## Initial baseline evidence

Chromium 151.0.7922.34, Windows, viewport 1584 × 1024. Production source `1edd695`; harness HEAD `cf518d9` contained only documentation changes. Baseline unpacked artifact: 41,237,969 bytes. Native BlockSuite adapter chunk: 5,871,709 bytes. No dependency versions changed.

Median milliseconds (five successful samples for the individual operation; whole-case failures are disclosed below):

| Library / board | Startup | Brain open | Next page | Search |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 50 references | 1,751 | 566 | 334 | 331 |
| 1,000 / 1,000 references | 3,228 | 1,416 | 328 | 353 |
| 10,000 / 50 references | 5,867 | 17,988 | 2,384 | 2,373 |
| 10,000 / 10,000 references | 22,407 | 65,777 | 2,183 | 2,425 |

Startup ranges: 1,570–1,868; 3,093–4,232; 5,208–6,521; 22,209–23,170 ms, respectively. Small-board 1,000-object editor-open median: 5,543 ms (4,363–5,724). At 1,000 objects, Explorer rendered 1,001 rows including the seeded starter note. Initial DOM totals were 5,960 for the small board and 21,167 for the large board.

The first immutable 30-case run had **15 passes and 15 failures**. Five 10,000-object small-board cases failed during editor opening. Ten 50,000-object cases failed during setup because a single fixture message exceeded Chromium's protocol buffer; these are **not application performance measurements**. Fixture insertion is now batched and workspace rendering is unmounted during setup. A subsequent 50,000-object small-board baseline completed seeding with a longer setup budget but failed startup: the board title had not resolved when the assertion failed, after 67,863 ms of elapsed startup work. This is not a successful latency. Earlier runs invalidated by mutable `dist` or the about:blank localStorage harness error are excluded.

## Implemented upgrade

- Mirrored Dexie version-5 indexes; unchanged canonical records and ordinary backup format.
- Query-bound 50-object pages, bounded body scanning, exact existing search dialects, locale ordering and cancellation.
- Explicit shell, board, selected-object, project and graph reads. Selected objects and backlinks do not depend on current page membership.
- Independently observed Explorer, Brain and workflow pages, searchable object/project pickers, explicit loading/error/retry states.
- Same-scope refresh retention and invalidated cursor rebuilding without resetting the current page; fresh relative-date anchors and page reset when filters change.
- Windowed Explorer and one aggregate flattened folder viewport, including focus/drag pinning. Folder destinations are searchable/paged; collapsed folders do not hydrate member bodies.
- Separate 50-record activity paging mounted only in Timeline. Other collection modes do not read history bodies.
- Deferred Brain, graph, workflow, analysis/settings and conversation-import modules. Failed imports leave navigation available; Retry and confirmed Reload handle failures, including Chromium's failed-module cache.

The independent review reported no Critical findings and five Important findings: refresh retention, normalization-equivalent ID cursor ties, unbounded Timeline history, stale relative-date anchors and A/B/A filter continuation. Fixes and regression tests are implemented; fixes are author-verified, not independently re-reviewed. The hierarchy aggregate-rendering gap was also addressed. Browser checks additionally reproduced and fixed early-selection clearing during initial board resolution and hidden initialization errors.

Broad substring/title/tile queries can still scan the matching scope. Locale/title/custom ordering keeps compact ID/order projections, not note bodies. Timeline orders compact activity index keys before hydrating 50 records. Task due-date ordering projects task metadata to include undated tasks. Project home/resume reads its complete confirmed project scope. Explicit AI preview and provider request validation read complete canonical context on demand to preserve privacy filtering; neither includes private drafts/revision history. Full backup/import operations remain complete. Active boards still load their own complete content; this does not make a 50,000-card native editor inexpensive.

## Correctness verification

On Windows: lint, formatting, both TypeScript checks, **174/174 unit/integration tests**, production MV3 build and **31/31 serial browser regressions** passed. `git diff --check` passed. No dependencies or canonical record shapes changed. Tests use disposable synthetic profiles, not personal data; provider requests are mocked or absent.

After the performance run, the committed Inspector draft/reminder regression passed three additional repetitions (3/3) against the same immutable build. The final reporting change to the benchmark harness corrects only its fresh-document comment; it does not change test behavior or measured application code.

Earlier browser runs exposed a real Fit view bug under visibility culling: offscreen cards lacked DOM measurements. Persisted placement dimensions and declared handle geometry now support fitting and offscreen edges without mounting every card first. The canvas view resets its viewport on board/view changes, not general refresh. Regression coverage retains canonical placements and links.

Test synchronization fixes await persisted connector creation, specific retarget identity, completion of asynchronous captures, fitted native viewport readiness and acknowledged saves before guarded history restore. Horizontal SVG paths are checked by their generated geometry rather than zero-height bounding-box visibility. The recovery guard still refuses restoration over unresolved drafts; recovered audit records are not unresolved drafts. Earlier failures were not excluded from the suite. The final run passed without retries.

## Completed candidate measurements

The immutable artifact from `c552110` passed **30/30 cases in 25.7 minutes**, with no retries or browser page errors: six size/shape groups, five samples each. Source and harness revisions were both `c55211078890178c30b2d2776e8cfd0f27bace1b`. Only handoff/report documentation was dirty during measurement. Browser/viewport match the baseline above. Fixture setup is outside these timings.

Milliseconds, median (minimum–maximum), five successful samples per operation:

| Library / board | Startup | Brain open | Next page | Substring search |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 50 references | 1,183 (1,182–1,739) | 464 (457–931) | 197 (177–209) | 298 (188–313) |
| 1,000 / 1,000 references | 1,318 (1,089–1,656) | 503 (457–987) | 209 (165–233) | 227 (184–312) |
| 10,000 / 50 references | 1,642 (1,554–1,810) | 469 (439–902) | 201 (183–218) | 1,458 (1,435–1,468) |
| 10,000 / 10,000 references | 3,127 (3,017–3,191) | 940 (492–998) | 191 (168–234) | 1,452 (1,425–1,473) |
| 50,000 / 50 references | 3,340 (3,166–4,036) | 478 (458–949) | 201 (194–312) | 6,031 (5,573–6,077) |
| 50,000 / 50,000 references | 12,420 (9,870–12,860) | 987 (522–1,050) | 199 (145–245) | 5,573 (5,503–5,596) |

| Library / board | Wheel + two animation frames | Native editor open |
| --- | ---: | ---: |
| 1,000 / 50 references | 100 (89–110) | 1,737 (1,702–1,775) |
| 1,000 / 1,000 references | 101 (83–115) | Not run |
| 10,000 / 50 references | 94 (89–104) | 1,686 (1,651–1,796) |
| 10,000 / 10,000 references | 94 (91–109) | Not run |
| 50,000 / 50 references | 115 (94–126) | 1,969 (1,777–2,041) |
| 50,000 / 50,000 references | 123 (112–142) | Not run |

Editor opening is measured only on 50-reference boards. “Not run” is not a zero latency or a passed large-editor stress test. The wheel measurement includes automation and two animation frames, not a sustained frame-rate/long-task profile.

Every initial Explorer measurement mounted **18 tree rows**, versus 1,001/10,001 in the corresponding baseline. DOM counts cover the top-level workspace document, not the legacy iframe or all native shadow-tree descendants. Heap values are diagnostic MiB (1 MiB = 1,048,576 bytes), median (minimum–maximum):

| Library / board | Initial DOM elements | Initial heap MiB | Final DOM elements | Final heap MiB |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 50 references | 1,023 (1,021–1,023) | 17.4 (17.2–22.2) | 1,756 (1,756–1,774) | 45.9 (43.7–46.8) |
| 1,000 / 1,000 references | 2,484 (2,482–2,484) | 25.1 (24.3–33.1) | 321 (321–339) | 32.8 (31.6–38.6) |
| 10,000 / 50 references | 1,023 (1,021–1,023) | 76.6 (68.4–77.5) | 1,756 (1,756–1,774) | 100.1 (98.6–122.7) |
| 10,000 / 10,000 references | 2,484 (2,482–2,484) | 110.1 (109.2–111.4) | 321 (321–339) | 136.0 (134.5–136.8) |
| 50,000 / 50 references | 1,023 (1,021–1,023) | 240.3 (235.5–249.8) | 1,756 (1,756–1,774) | 331.9 (306.1–370.0) |
| 50,000 / 50,000 references | 2,484 (2,482–2,484) | 494.0 (484.6–509.1) | 321 (321–339) | 577.2 (576.4–582.7) |

Final measurements are taken after editor opening for small boards, but after Brain search for large boards; they are not the same screen. Initial requested source bytes were 1,027,840 in every candidate case. Final requested source bytes were 7,874,635 for small boards and 1,042,638 for large boards. Native shadow DOM and browser/OS memory are not exhaustively counted.

At 10,000 objects with a 50-reference board, median Brain opening changed from 17,988 to 469 ms, initial DOM elements from 50,960 to 1,023, and substring search from 2,373 to 1,458 ms. The candidate also opens that board's editor successfully in all five samples; the five baseline editor openings failed. These gains do not remove broad-search scan costs: the 50,000-object substring query still took roughly 5.5–6.1 seconds, and complete 50,000-reference board startup took roughly 9.9–12.9 seconds. Heap estimates still grow with library size and cannot establish fixed-board allocation independence.

There is **no successful comparable 50,000-object baseline latency**, so no 50k speedup ratio is claimed. Five samples on one Windows machine are diagnostic, not hardware-independent performance guarantees. Large native-editor capacity, sustained rendering responsiveness and application-only allocation profiling remain follow-ups. The approved paging/windowing/lazy-loading implementation and default measurement matrix are complete; the broader product roadmap is not.

## Bundle and requested resources

Unpacked extension bytes: baseline **41,237,969**, candidate **41,273,636** (+35,667, approximately +0.09%). The BlockSuite adapter chunk is **5,872,075** bytes versus **5,871,709** before. The heavy editor dependency was not replaced or materially reduced.

In the five 1,000-object small-board samples, files requested by New Tab → Boards totaled **1,027,840 source bytes** versus **1,078,880** before (about 4.7% less). After Brain/search/editor opening, requested source bytes totaled **7,874,635** versus **7,879,164** before: effectively unchanged. These are unique requested JS/CSS/WASM files' unpacked source sizes, not measured network transfer or compressed download size. Deferring optional views lowers unnecessary initial requests but does not shrink the entire packaged extension.

## Acceptance evidence map

| Requirement | Regression evidence |
| --- | --- |
| Fixed-board hydration excludes unrelated bodies | `workspaceReads.test.js`: 50 entities/50 placements/50 outgoing relationships read at both 1k and 10k; shell counts hydrate no entity bodies |
| Stable 50-object pages, exact dialects/order, cursor safety and cancellation | `libraryQueries.test.js`: complete traversal, sparse scans, filter parity, timestamp batching, Unicode ties, tile/inbox ordering and rebuilt continuations |
| Mirrored schema upgrade without content/recovery loss | `librarySchema.test.js`, `recoverySchema.test.js`, `workspaceDb.test.js` |
| Independent selected object/backlinks/project scope and bounded history | `workspaceReads.test.js`, `paged-library.spec.js`, `brain.spec.js` |
| Refresh retention, stale-query protection, errors/retry and same-count updates | `queryLifecycle.test.js`, `windowed-library.spec.js`, `scoped-workspace.spec.js` |
| Aggregate bounded DOM, keyboard/focus/drag and folder move/undo | `windowRange.test.js`, `hierarchyRows.test.js`, `windowed-library.spec.js`, `hierarchy.spec.js` |
| Offscreen canvas connections and Fit view | `windowed-library.spec.js`; persisted dimensions/handle geometry support visibility culling |
| Optional module loading/failure recovery | `lazy-workspace.spec.js`: real extension resource requests plus isolated production-boundary fault injection |
| Native editor gestures/content/identity and guarded recovery | `affine-workspace.spec.js`, `brain.spec.js`, `recovery-panels.spec.js`, `recovery-restart.spec.js` |
| Legacy workflows, reminders, sessions and full backups | `extension.spec.js`, `workspace-review.spec.js`, existing repository/backup suites |
| Real-browser timing, DOM, heap and requested resource costs | `tests/performance/library.spec.js`, isolated synthetic profiles; hardware-dependent timings are diagnostic, not CI thresholds |

Complete project reads, full export/import and explicit AI-context validation are intentional complete-scope operations. The full suite also retains memory privacy and private-recovery exclusion checks; a faster paged view is not permission to truncate these operations.
