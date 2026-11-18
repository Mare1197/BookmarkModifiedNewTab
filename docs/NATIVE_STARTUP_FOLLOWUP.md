# Native startup follow-up — November 18, 2026

This pass keeps the complete native model and the existing canonical Brain. It removes repeated view/native lookups, yields construction by elapsed work, and batches page validation so camera saves do not hold visible content reads behind thousands of serial requests. No dependency upgrade, migration, new backend, native-reference truncation or second content authority is introduced.

The final application source and benchmark harness are at commit `213e82e68e32b2f8bcfef711ece66b400a7db22e` on `MiniPCCodex/native-startup-performance`. The 41.45 MB Windows benchmark build has SHA-256 `50f4df47111b005b5153ec8d4285ae226246e87fdc662cd1e8e9e48b6b144ca9`. The GitHub workflow packages a separate build from the same commit.

## What changed

- Layout labels use memoized entity/placement maps. Progress updates reuse those maps. Pages/layout controls are created on first opening and remain mounted when closed, retaining unfinished geometry fields and every available choice.
- A replaceable per-Doc preparation adapter accelerates known parent/root/single-surface reads. Native IDs, writers, schema checks and notifications remain authoritative. Unplanned topology operations or unowned/reentrant transactions restore native descriptors before mutation. Actual model existence, flavour and parent edges are verified after construction and before editing, including the last reference.
- The adapter restores original APIs before readiness and during owned cleanup. Retained native callbacks delegate correctly after the preparation owner closes; explicit late owned work remains rejected. Nonempty/incompatible documents retain native behavior with creation verification.
- Construction yields after 8 ms of elapsed work or 50 operations. One indivisible synchronous operation can still exceed the budget. Cancellation retains reverse-order ownership cleanup, no fake draft/history, and Retry from a freshly saved snapshot.
- Page commands validate unique referenced entities in batches of 100 inside the same atomic transaction and use maps/sets for placement matching. Missing references, stale versions, rollback, history, undo and canonical identities remain guarded. This changes scheduling and repeated searches, rather than dropping validation.
- The review fixes restrict property-write grants to explicit construction operations and reject unexpected native models, including an extra root or surface. Connector forms retain edited fields when a route save is acknowledged, refresh untouched fields, and apply the style against the latest saved route.

The preparation boundary trusts this adapter's fixed installed schema defaults and original native writer inside its approved transaction. Arbitrary third-party code rewriting topology inside that same transaction is outside that construction contract. Unowned transactions through other Doc/collection/Yjs handles fall back before mutation.

## Diagnostic evidence and reproduced failures

The [diagnostic archive](evidence/native-startup-diagnostics.json) retains exact source/artifact fields, raw failures, CPU aggregations and capture/transformation scripts. Compressed [baseline CPU](evidence/native-startup-baseline.cpuprofile.gz) and [follow-up CPU](evidence/native-startup-followup.cpuprofile.gz) files retain their uncompressed SHA-256 values in the archive. Decompress them before opening in a CPU-profile viewer.

The original instrumented 1,000-reference document capture used source `b0c97d0` and artifact `879cd42e9f58e9a165dccbf87a7d11ac755742ded6f7f7497a29856407484bd7`. It failed readiness after 120,345 ms at preparation 4055/4105, then hit the owned supervisor deadline. The 140,944 ms profile contains 65,442 samples. Inclusive connector-label callbacks account for about 59,714 ms, native parent lookups 47,835 ms and surface queries 14,996 ms. These categories overlap and must not be summed. Schema validation was a small cost, so it was retained rather than speculatively cached. The retained exact temporary profile was removed only after verifying no Chromium process used that path; the failed result remains archived.

After indexed preparation, three unprofiled 1,000-reference pilots opened document/canvas/mixed at 6,522/12,784/16,139 ms. Document and mixed passed completely; canvas failed the unchanged five-second image-reveal assertion after opening. These are single pilots, not five-sample capacity results.

A separate instrumented canvas profile on source `977e57f` no longer has the repeated parent/root searches among its main costs. Native DOM rendering/layout, including about 1,387 ms in bounding-client-rectangle reads, remains significant. This capture opened at 13,961 ms and reproduced the image failure. Its timings are excluded from acceptance medians; its input mode also differs from the original document diagnostic.

A logging-only transformation of a copied frozen artifact recorded 74 content lifecycle events. The image had correct geometry, camera position and an uncollapsed body, but four loads remained pending. Newly visible entity reads waited about 3.5 seconds behind page-save work, with asset reads then queued. The trace did not show a cancellation deadlock. A source regression reproduced 1,002 serial entity reads for a 1,000-reference pan save; batching leaves two serial snapshot-owner reads and retains all reference checks. Missing-reference rejection and rollback have an additional regression.

The post-batching canvas pilot used pre-review source `753ed9275cedb58429ebf09e4c669b3559f0d205` and artifact `0106195fa37d85fe069e15a877f013f983eb21400e43fbf2e5b948e22e639749`. It opened in 13,391 ms and revealed all three content kinds in 855 ms total. Complete model, geometry, group, connector, edit, save, release and teardown checks passed in this pilot. The repeated matrix below includes a later image-reveal failure.

## Cancellation

[Five serial samples per mode](evidence/native-startup-cancellation.json), with no retries, pass cancellation, no late editor panes, unchanged journals/history and a fresh complete 50-reference Retry after an independent saved-page edit.

| Mode | Confirmation ms, median [min–max] | Click event to status feedback ms, median |
| --- | --- | --- |
| Document | 316 [248–475] | 3.2 |
| Canvas | 242 [198–427] | 3.4 |
| Mixed | 252 [194–262] | 4.2 |

Confirmation retains the previous definition: automation click through observed cancelled status, absence of editor panes and two animation frames. It includes automation overhead. The separate event metric starts at a capture-phase click listener and ends at observed cancelled-status DOM feedback. These cases cancel after preparation progress first appears; they do not certify every cancellation phase or preempt individual synchronous operations.

The repeated run used artifact `0db1bc38540eceb859fd3786c602b4b2231fce77794b8dbc0b94814491b88b97`, before the retained-callback compatibility fix. The archive includes its exact source and scheduler patch. GitHub Actions exercised cancellation on the final commit once in each mode with confirmation times of 187, 137 and 174 ms respectively. Those CI timings use a different environment.

## Repeated native measurements

The frozen final build recorded **53 passes, two failures and five skips** across 60 planned cases. The table shows readiness in milliseconds. Complete groups report the median and range of five samples. [Raw measurements and failure diagnostics](evidence/native-startup-acceptance.json).

| References | Document | Canvas | Mixed |
| ---: | ---: | ---: | ---: |
| 50 | 1,878 [1,714–2,263] | 2,298 [2,281–2,738] | 2,447 [2,446–2,500] |
| 250 | 2,593 [2,270–2,611] | 3,945 [3,423–4,034] | 4,264 [3,934–5,004] |
| 500 | 3,673 [3,372–5,739] | 6,156 [5,605–6,877] | 7,361 [7,153–7,981] |
| 1,000 | 7,385 [6,647–7,776] | Three passes [12,396–13,821], one failure and one skip | One failure after opening at 17,406 ms, four skips |

At 1,000 references, document mode reached the sub-ten-second median target and improved from the predecessor's 103,255 ms median. The other modes still exceed the target. Canvas sample four and mixed sample one both failed the unchanged five-second image-attachment assertion after readiness. Canvas had four active content loads and a visible image shell with an empty body in the failure capture. The mixed assertion targeted the document pane. The capture inspected both panes and found one hydrated image occurrence and a second empty occurrence. Those observations leave the remaining delay unresolved and support profiling the time between reveal, load dispatch and attachment under 1,000-card load.

## Fixed 50-card board with unrelated library growth

One Canvas smoke case at each library size passed all assertions. These individual runs illustrate the cost of larger libraries, with 50 references in the tested native board.

| Additional library objects | Readiness | Save | Fixture setup | Main-thread heap |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.32 s | 280 ms | 3.42 s | 53.8 MB |
| 10,000 | 2.21 s | 264 ms | 23.21 s | 103.3 MB |
| 50,000 | 2.57 s | 538 ms | 168.80 s | 291.9 MB |

## Verification

The exact final application passed lint, formatting, both type checks, **308 source tests**, the 41.45 MB production build and **61 browser tests** on GitHub Actions. The Windows focused run also passed the three regressions that previously reproduced the review findings. An earlier local full run passed 57 of 58 cases and failed during Explorer fixture seeding before its app assertions. The final Linux suite passed that case and all three added regressions without reported flaky cases. [GitHub run](https://github.com/Mare1197/BookmarkModifiedNewTab/actions/runs/44227156870) · [Extension package](https://github.com/Mare1197/BookmarkModifiedNewTab/actions/runs/44227156870/artifacts/14393602442) · [Verification evidence](evidence/native-startup-verification.json).

The existing supervised native harness checks canonical identities and geometry, two fixture groups, unique connectors, up to four concurrent body loads, editing, saves, reveal, resource release and owned teardown. Acceptance medians use unprofiled samples.

Native 50/250/500/1,000-reference measurements use Chromium 151.0.7922.34 on Windows, a 1584 × 1024 viewport, disposable synthetic profiles, serial execution and no automatic retries. Readiness retains the earlier harness definition; visible content and explicit reveal remain separate. A failed case stops further repetitions for its group, and an active owned worker or unexpected supervisor error stops the entire remaining matrix. No 5,000/50,000 native-reference capacity is claimed. Main-thread heap excludes workers, and long-task capture is not a smooth-frame guarantee.

See the [predecessor report](NATIVE_BOARD_UPGRADE.md) for its historical measurements and failures. Unrelated-library memory, setup and save scaling remain follow-up work.
