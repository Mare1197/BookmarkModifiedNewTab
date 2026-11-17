# Native startup follow-up — November 17, 2026

This pass keeps the complete native model and the existing canonical Brain. It removes repeated view/native lookups, yields construction by elapsed work, and batches page validation so camera saves do not hold visible content reads behind thousands of serial requests. No dependency upgrade, migration, new backend, native-reference truncation or second content authority is introduced.

Application source is `753ed9275cedb58429ebf09e4c669b3559f0d205`; the frozen Windows production artifact has SHA-256 `0106195fa37d85fe069e15a877f013f983eb21400e43fbf2e5b948e22e639749` and is 41.44 MB. Documentation/evidence commits after that source do not change the measured application. The separate branch is `MiniPCCodex/native-startup-performance`; the prior performance and inspector branches are preserved.

## What changed

- Layout labels use memoized entity/placement maps. Progress updates reuse those maps. Pages/layout controls are created on first opening and remain mounted when closed, retaining unfinished geometry fields and every available choice.
- A replaceable per-Doc preparation adapter accelerates known parent/root/single-surface reads. Native IDs, writers, schema checks and notifications remain authoritative. Unplanned topology operations or unowned/reentrant transactions restore native descriptors before mutation. Actual model existence, flavour and parent edges are verified after construction and before editing, including the last reference.
- The adapter restores original APIs before readiness and during owned cleanup. Retained native callbacks delegate correctly after the preparation owner closes; explicit late owned work remains rejected. Nonempty/incompatible documents retain native behavior with creation verification.
- Construction yields after 8 ms of elapsed work or 50 operations. One indivisible synchronous operation can still exceed the budget. Cancellation retains reverse-order ownership cleanup, no fake draft/history, and Retry from a freshly saved snapshot.
- Page commands validate unique referenced entities in batches of 100 inside the same atomic transaction and use maps/sets for placement matching. Missing references, stale versions, rollback, history, undo and canonical identities remain guarded. This changes scheduling and repeated searches, rather than dropping validation.

The preparation boundary trusts this adapter's fixed installed schema defaults and original native writer inside its approved transaction. Arbitrary third-party code rewriting topology inside that same transaction is outside that construction contract. Unowned transactions through other Doc/collection/Yjs handles fall back before mutation.

## Diagnostic evidence and reproduced failures

The [diagnostic archive](evidence/native-startup-diagnostics.json) retains exact source/artifact fields, raw failures, CPU aggregations and capture/transformation scripts. Compressed [baseline CPU](evidence/native-startup-baseline.cpuprofile.gz) and [follow-up CPU](evidence/native-startup-followup.cpuprofile.gz) files retain their uncompressed SHA-256 values in the archive. Decompress them before opening in a CPU-profile viewer.

The original instrumented 1,000-reference document capture used source `b0c97d0` and artifact `879cd42e9f58e9a165dccbf87a7d11ac755742ded6f7f7497a29856407484bd7`. It failed readiness after 120,345 ms at preparation 4055/4105, then hit the owned supervisor deadline. The 140,944 ms profile contains 65,442 samples. Inclusive connector-label callbacks account for about 59,714 ms, native parent lookups 47,835 ms and surface queries 14,996 ms. These categories overlap and must not be summed. Schema validation was a small cost, so it was retained rather than speculatively cached. The retained exact temporary profile was removed only after verifying no Chromium process used that path; the failed result remains archived.

After indexed preparation, three unprofiled 1,000-reference pilots opened document/canvas/mixed at 6,522/12,784/16,139 ms. Document and mixed passed completely; canvas failed the unchanged five-second image-reveal assertion after opening. These are single pilots, not five-sample capacity results.

A separate instrumented canvas profile on source `977e57f` no longer has the repeated parent/root searches among its main costs. Native DOM rendering/layout, including about 1,387 ms in bounding-client-rectangle reads, remains significant. This capture opened at 13,961 ms and reproduced the image failure. Its timings are excluded from acceptance medians; its input mode also differs from the original document diagnostic.

A logging-only transformation of a copied frozen artifact recorded 74 content lifecycle events. The image had correct geometry, camera position and an uncollapsed body, but four loads remained pending. Newly visible entity reads waited about 3.5 seconds behind page-save work, with asset reads then queued. The trace did not show a cancellation deadlock. A source regression reproduced 1,002 serial entity reads for a 1,000-reference pan save; batching leaves two serial snapshot-owner reads and retains all reference checks. Missing-reference rejection and rollback have an additional regression.

The post-batching canvas pilot uses the final source/digest above: readiness 13,391 ms, all three revealed content kinds in 855 ms total, and complete model/geometry/group/connector, edit/save, release and owned teardown checks pass. The unchanged image assertion now passes. This remains one pilot and does not establish a sub-ten-second canvas median.

## Cancellation

[Five serial samples per mode](evidence/native-startup-cancellation.json), with no retries, pass cancellation, no late editor panes, unchanged journals/history and a fresh complete 50-reference Retry after an independent saved-page edit.

| Mode | Confirmation ms, median [min–max] | Click event to status feedback ms, median |
| --- | --- | --- |
| Document | 316 [248–475] | 3.2 |
| Canvas | 242 [198–427] | 3.4 |
| Mixed | 252 [194–262] | 4.2 |

Confirmation retains the previous definition: automation click through observed cancelled status, absence of editor panes and two animation frames. It includes automation overhead. The separate event metric starts at a capture-phase click listener and ends at observed cancelled-status DOM feedback. These cases cancel after preparation progress first appears; they do not certify every cancellation phase or preempt individual synchronous operations.

The repeated run used artifact `0db1bc38540eceb859fd3786c602b4b2231fce77794b8dbc0b94814491b88b97`, before the retained-callback compatibility fix. Its exact source plus scheduler patch is archived, rather than called a clean-source benchmark. The corrected callback build separately passes all three cancel/retry cases at 260/230/240 ms and the real retained-callback browser regression. Later final-harness coverage is recorded separately.

## Verification and measurement rules

The final application passes lint, formatting, both type checks, **305 source tests**, and the production build. The existing supervised native harness retains all canonical identities/dimensions, two fixture groups, complete unique connectors, body-load concurrency at most four, edit/save/reveal/release assertions and bounded owned teardown. CPU/logging diagnostics never enter acceptance medians.

Native 50/250/500/1,000-reference measurements use Chromium 151.0.7922.34 on Windows, a 1584 × 1024 viewport, disposable synthetic profiles, serial execution and no automatic retries. Readiness retains the earlier harness definition; visible content and explicit reveal remain separate. A failed case stops further repetitions for its group, and an active owned worker or unexpected supervisor error stops the entire remaining matrix. No 5,000/50,000 native-reference capacity is claimed. Main-thread heap excludes workers, and long-task capture is not a smooth-frame guarantee.

The prior [native report](NATIVE_BOARD_UPGRADE.md) and its failures/skips remain historical evidence. Unrelated-library memory/setup/save scaling is a separate follow-up, not solved by this native startup pass.
