# Native board performance

## Baseline recorded November 15, 2026

This is the predecessor baseline for the approved native-board optimization. Production optimization is still pending. Application source `838cb4844e43cc7a4a91fd806ed344aa3510e386` was frozen before measurement. The harness checkpoints are `4de2de7` (initial matrix) and `dd5eac1` (persistent failure markers). The [raw archive](evidence/native-board-baseline.json) includes source/harness revisions, artifact digest, dirty-tree flag, all emitted results, failed phases, DOM/resource diagnostics and errors.

Chromium 151.0.7922.34, Windows, 1584 × 1024, temporary synthetic profiles. Five samples per successful size/mode; serial execution, no retries. Every successful case verifies complete native reference identity count, chat/image/task readiness, an actual editable note, durable canonical save, and camera movement for canvas/mixed. Connector models are counted by unique ID: the installed native layer lists each twice, and the archive retains both raw entries and IDs.

Editor readiness is milliseconds, median [min–max]. It includes canonical loading, local module import, projection and rendering; it is not isolated projection CPU time. Fixture setup and fresh-document startup are separately recorded. Browser/OS cache state is not controlled.

| Native references | Document | Canvas | Mixed |
| --- | --- | --- | --- |
| 50 | 2567 [2291–3415] | 3111 [2758–4336] | 3204 [2962–4068] |
| 250 | 12591 [12446–14330] | 22267 [20075–22852] | 23911 [18487–25658] |
| 500 | 65181 [57832–66341] | 98202 [96546–103300] | Readiness failed after 120 seconds |
| 1,000 | Supervised 180-second deadline | Readiness failed after 120 seconds | Supervised 180-second deadline |

These successful large cases are slow: recorded main-thread long-task totals at 500 references had medians of 62.9 seconds (document) and 96.5 seconds (canvas). Completion is not a smooth-interaction claim. Heap values are point-in-time main-thread diagnostics and exclude workers. Read counters count requests, not returned rows; visible image/editor counts are distinct from complete model counts. Cancel/retry preparation and bounded content hydration are subsequent work.

With a fixed **50-reference canvas**, five cases each passed in libraries containing 1k/10k/50k additional unrelated objects. Editor-readiness medians were 2716 [2493–3334], 3420 [2683–3833], and 3298 [2747–4309] ms respectively. Fixture data also includes message/page-owner objects. Large setup costs and end-to-end outliers remain in the archive; these results do not certify 50k editable native cards.

The combined evidence contains **55 passing attempts and five failing attempts**. The initial matrix was stopped after two 500/mixed failures exposed a harness bug: Playwright restarts workers after failure, which erased an in-memory skip marker. One active case was interrupted and two later repetitions were never started. A failing/passing regression now verifies persistent markers across worker processes. The resumed run correctly skipped the twelve later repetitions after its three 1,000-card failures, and passed all fifteen fixed-card library cases. Do not describe this as a 75/75 pass or discard the repeated failures.

The supervisor owns one child process and one generated profile per case. Deadlines include teardown. A hung case stops only that owned process tree; a separate live child survives the timeout regression. A reported result followed by hung cleanup is still a failure. Partial completed-phase metrics survive timeouts. The manually interrupted run's verified profile was removed after its browser descendants exited.

Harness verification: lint, formatting, both type checks and **247 source tests passed**. The production build passed at 41.42 MB. Preliminary 50-card all-mode diagnostics passed 3/3 after correcting test initialization/selection and unique connector counting; earlier diagnostic failures are retained locally. No application optimization or fresh whole-stage review is claimed by this baseline.

To repeat: build/freeze an extension; set `WORKSPACE_EXTENSION_PATH` and `NATIVE_SOURCE_REVISION`; use `NATIVE_SIZES=50,250,500,1000`, `NATIVE_MODES=document,canvas,mixed`, `NATIVE_SAMPLES=5`, `NATIVE_LIBRARY_SIZES=1000,10000,50000`, then run `npx playwright test -c playwright.performance.config.js tests/performance/native-board.spec.js --workers=1 --retries=0`. Start from a clean harness checkout. Preserve all output, including skips/failures, and never rebuild the frozen artifact during measurement.
