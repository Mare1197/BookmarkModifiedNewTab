# Native workspace upgrade — November 17, 2026

The complete native model is retained, with indexed planning, cooperative construction, pre-render ordering and bounded visible/pinned content hydration. No references are removed to improve timings. The [acceptance archive](evidence/native-board-acceptance.json) contains all 68 emitted attempts: **66 passed, two failed**. Seven later native repetitions were skipped. The native matrix is **51 passed / two failed / seven skipped**, and the separate fixed-board library matrix is **15/15 passed**, not a 75/75 acceptance claim. The [baseline and implementation checkpoints](NATIVE_BOARD_PERFORMANCE_VERIFICATION.md) retain earlier results.

## Measurement scope

Five-sample measurements use frozen source `39af325e5d17dd9d89a0bb4c6acdf8f7b464fac4`, artifact SHA-256 `55b7557d1204a98b2770650538248043cff649a8ae2e117ecb934095ce53338c`, Chromium 151.0.7922.34 on Windows, 1584 × 1024, synthetic disposable profiles, serial execution and no retries. Source/artifact fields accompany each case. Subsequent review fixes are separately verified below; these timings describe the pre-review artifact, not byte-identical measurements of those fixes. Read-only review, regression-test text and documentation drafting added uncontrolled workstation noise; no concurrent build, browser regression or other stress run was used. OS/browser caches and hardware variability are uncontrolled.

Workspace readiness retains the baseline definition: canonical load, local import, complete projection and native shell/controllers. Initial visible content is separately awaited before editing and resource capture. Explicit chat/task/image reveal replaces the predecessor's eager mixed-content phase and is **not** an identical latency comparison. Projection phases measure elapsed time, not isolated CPU. Read counts count requests rather than returned rows. Main-thread heap excludes workers, and long-task capture windows differ from the eager baseline.

## Native references in one workspace

Readiness in milliseconds, median [min–max], five successful samples except where stated:

| References | Document | Canvas | Mixed |
| --- | --- | --- | --- |
| 50 | 1723 [1677–2345] | 2369 [2224–3069] | 2648 [2427–3241] |
| 250 | 3200 [2769–3812] | 4411 [4020–5610] | 5354 [4848–5675] |
| 500 | 10754 [9890–11490] | 12908 [11655–14800] | 16801 [15822–18374] |
| 1,000 | 103255 [100081–104715] | One full pass at 113804; next case failed image reveal after opening at 105247 | Failed readiness at 120164 |

At 500 references, document readiness fell from the predecessor's 65.2-second median to 10.8 seconds, and canvas from 98.2 to 12.9 seconds. Mixed completes five samples at a 16.8-second median where the baseline failed its 120-second readiness limit. These are substantial improvements, but not smooth-frame guarantees. Recorded 500-reference long-task totals have medians of 9.4/8.2/12.1 seconds for document/canvas/mixed. Median first-edit action latencies after readiness are 279/245/504 ms, and saves 756/925/1124 ms.

**The usable 1,000-reference goal and responsive cancellation target are not met.** Document eventually completed five functional cases, but startup took 100–105 seconds, recorded long-task totals were 97–102 seconds, the median edit took 1.67 seconds and save 5.42 seconds. Canvas sample two failed to attach its revealed image within the unchanged five-second assertion. Mixed remained at preparation 4055/4105 when its unchanged 120-second readiness assertion failed. Three later canvas and four later mixed repetitions were skipped. The one canvas success and eventual document completion do not certify capacity. No 5,000 or 50,000 native-reference probe was attempted.

Before reveal, every successful case verifies complete canonical identities/dimensions, two fixture groups and all unique connector models. After reveal, it verifies reference and connector counts; the harness does not repeat the full identity/geometry/group assertions at that point. A mixed workspace shares one native document. Initially hydrated occurrence resources are 3 document / 9 canvas / 11 mixed in this fixture, despite all 50–1,000 reference models remaining present. Peak concurrent initial loads never exceeds four. Offscreen clean resources release; canonical edits and post-pan saves are verified. These counts describe this fixture/capture point, not a universal constant.

## Library size with a fixed 50-reference canvas

| Additional library objects | Readiness ms, median [min–max] | Fixture setup ms, median | Main-thread heap bytes, median | Save ms, median |
| --- | --- | --- | --- | --- |
| 1,000 | 2138 [2013–2784] | 2874 | 54074973 | 229 |
| 10,000 | 2160 [2013–2541] | 21015 | 110625516 | 313 |
| 50,000 | 2188 [2163–2497] | 125022 | 285223920 | 996 |

Five samples per size pass. Scoped shells/resources remain at nine hydrated occurrences and peak four loads, but **allocation independence is not established**: heap, fixture setup and save costs grow substantially. Fixture setup is not workspace-opening latency. Library-search capacity is also distinct from references in one native page.

## Cancellation and intermediate evidence

Two three-mode cancellation runs at 1,000 references confirm cleanup, no fake journals/history, and Retry reading an independently changed complete 50-reference snapshot. The latest measured confirmation took 8621/8038/8162 ms for document/canvas/mixed. This includes automation actionability, rendering and two animation frames, not a pure click-handler measurement; it still cannot support an instant-cancellation claim.

Intermediate evidence remains separate in the archive: three single-sample smoke cases; 24 successes before the intentional stop and interrupted next attempt on the earlier eager-index build; and three 250-reference pre-render-index pilot cases. The retained preindex log has 24 unique successful keys, correcting the earlier in-progress observation of 22; no samples are discarded. None contributes to final medians. Pre-render ordering has a failed/passing regression for zero mounted initial index updates. Batched tail keys use the exact already-installed fractional-indexing 3.4.0 utility and native seed. This promotes an existing locked dependency without upgrading its version or package tree.

## Review and final verification

The fresh Sol Ultra whole-stage code review found four Important findings, no Critical findings and no actionable Minors. Author fixes cover:

1. Native deletion followed by viewport hydration, retaining the original object.
2. Acknowledged snapshots updating controls and pruning removed choices without replacing the editor/session; untouched geometry fields refresh while deliberate form edits remain.
3. Native collapse/expand state across document/canvas occurrences, bounded resources and retained dirty editors, and canonical expanded dimensions including pending resizes.
4. Supervisor exceptions retaining structured partial metrics/errors/profile details and persistent markers before reporting. A still-active owned worker or unexpected supervisor error stops the whole remaining matrix. Termination/removal remains scoped to the exact owned fork/profile.

Author-fix source is `fb696661c9832aac5b5ba64881c811997a05e697`; its 41.44 MB production artifact has SHA-256 `879cd42e9f58e9a165dccbf87a7d11ac755742ded6f7f7497a29856407484bd7`. Full lint/format/both type checks and **281 source tests pass**. The six new browser regressions pass. Local browser coverage includes all **55 unique cases across serial runs**: all 48 cases outside the affected native file pass in the complete attempt, and all seven affected cases pass after test ownership cleanup. This is **not a single-command local 55/55 result**: the complete attempt reports 54/55 because native drag/navigation finished its app assertions but context shutdown timed out. The seven native tests now leave through the real desktop flush guard before owned-context close; direct crash/restart tests and stress deadlines are unchanged.

The [release-check archive](evidence/native-release-checks.json) retains source/build logs, RED/GREEN evidence and unsuccessful runs. An earlier full attempt was stopped after eight emitted cases (five passed/three failed); two failures were context shutdown after passing app assertions, and another lost its browser protocol session. An unchanged isolated three-case group passed. The first fixed focused group passed five of six; its initially-collapsed setup raced the toolbar's intentional remount. Waiting for the replacement editor and asserting its collapsed state produced six of six, with original assertions/deadlines retained. Direct native button-handler events reproduce collapse shrink (310→100); the first forced-coordinate diagnostic missed the button and is not height-failure evidence. The reviewer does not independently re-review author fixes.

The final frozen artifact above passed a separate **6/6 one-sample follow-up** at 50 and 500 references in all three modes, source/harness `d9d320b1170cfca05d54b7e03ee5fc141aaeaee8`, clean tree. [Follow-up raw evidence](evidence/native-board-review-smoke.json) retains every case and artifact digest. At 50 references, readiness was 1759/2365/2344 ms for document/canvas/mixed; at 500 it was **11085/15308/19043 ms**. All complete identities/dimensions, group/connector checks, content/edit/save/reveal/release assertions and owned teardown passed; initial resources remained 3/9/11 and peak loads at most four. These individual values do not replace the earlier five-sample medians or establish a statistical regression comparison. No new 1,000-reference capacity or large-library certificate is claimed. The later three-mode cancellation confirmation was 8059/9069/8119 ms, including automation/render overhead; responsiveness remains limited.

The same fresh reviewer completed the evidence/capacity/handoff audit with **no outstanding Important findings**, accepting this documented bounded delivery. Its judgment verifies retained evidence, arithmetic, scope and handoff accuracy. It does not independently re-review author fixes or certify the unmet capacity targets.

## Remaining limits

Complete native model construction and layer work dominate large pages. One already-visible huge rich note/conversation is not internally virtualized. Page card/endpoint options still represent the complete page; global object pickers are searchable/paged, but isolated mounted-option cost has not been profiled, so no option-list performance certification is claimed. Worker-only construction, replacement rendering and persistent native content storage remain excluded. Windows descendant cleanup is tested; non-Windows process-tree stress cleanup is not certified. Portable source/unit checks are not evidence of portable native stress supervision.

This ships a bounded improvement while retaining the complete model and safe previously supported workflows. It does not satisfy every initial responsiveness target or the broader product roadmap. The [delivery decision record](NATIVE_BOARD_DELIVERY_DECISIONS.md) contains every implementation ruling and its cost.

## Repeat the measurements

Use Windows for the certified stress harness. Build/freeze an immutable extension, set `WORKSPACE_EXTENSION_PATH` and its actual `NATIVE_SOURCE_REVISION`, and retain complete console output. For the native matrix set `NATIVE_SIZES=50,250,500,1000`, `NATIVE_MODES=document,canvas,mixed`, `NATIVE_SAMPLES=5`, and empty `NATIVE_LIBRARY_SIZES`. Run `npx playwright test -c playwright.performance.config.js tests/performance/native-board.spec.js --workers=1 --retries=0`. Then set `NATIVE_LIBRARY_SIZES=1000,10000,50000` and use `--grep "fixed 50 native references"` for the library matrix.

Never rebuild the frozen artifact, run concurrent stress/browser checks, increase failed deadlines or silently retry failed groups. Retain all failures/skips and owned-process/profile errors. Resolve any reported still-active owned worker before starting another matrix: failure markers stop the current run, and a new run clears them. Ordinary correctness checks run source → build → browser sequentially because source preparation replaces `dist`.
