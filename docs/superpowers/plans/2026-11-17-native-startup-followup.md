# Native Startup Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task with the previously selected native execution method. Preserve the approved scope and carry it through without routine confirmation prompts.

**Goal:** Remove the profiled startup searches and reduce cancellation delay for complete 1,000-reference native workspaces.

**Architecture:** Indexed React labels and first-open layout controls; a temporary per-Doc lookup overlay around controlled native construction/read-only mounting; time-budgeted batches. Native writers, canonical persistence, complete models and controllers remain intact.

**Tech Stack:** Existing TypeScript/React/WXT, BlockSuite 0.19.5 public APIs, Y.Doc beforeTransaction event, existing supervised Chromium fixtures. No dependency upgrade, new permissions or migration.

**Spec:** [Approved-scope design](../specs/2026-11-17-native-startup-followup-design.md). Baseline `b0c97d0`, immutable application digest `879cd42e9f58e9a165dccbf87a7d11ac755742ded6f7f7497a29856407484bd7`.

## Global constraints

- Preserve every canonical object/placement ID, geometry, group and connector; no offscreen model removal or second content authority.
- Retain original native validation/writes/notification order and restore original Doc descriptors before editing.
- Each explicitly approved operation permits its first Yjs transaction only; unowned/reentrant transactions fall back before mutation. Fixed installed schema defaults inside the approved transaction are trusted; arbitrary same-transaction plugin mutation is excluded.
- Preserve deliberate form drafts when a layout disclosure closes/reopens and when acknowledged snapshots refresh untouched fields.
- Retain the maximum 50 operations per slice and add an 8 ms work budget; synchronous individual operations cannot be preempted.
- Keep body loading at most four concurrent initial requests, all dirty/focused/dragged retention and existing journal/recovery guards.
- Preserve old branches; publish only `MiniPCCodex/native-startup-performance` under existing push authority. No PR/merge/deploy/personal profile.

## Review focus

1. Reentrant/alternate-handle native writes during mount: the overlay must fall back before unowned transactions or topology changes, and leave native methods/descriptors intact (Tasks 2/3).
2. Native writer logs a failure but returns an ID: absent/mismatched final models or parent edges must fail preparation and release ownership, never report ready (Tasks 2/3).
3. Close/reopen disclosure or acknowledge native geometry while a form is edited: retain explicit draft fields, refresh untouched defaults and keep camera/session identity (Task 1).
4. Abort/error on a budget boundary or native render: no late operations/progress, no fake journals, complete fresh retry and idempotent restoration (Tasks 3/4).
5. New speed claims after an instrumented timeout: separate CPU diagnostics from unprofiled five-sample measurements; keep every failure and capacity qualification (Task 5).

### Task 1: Indexed layout lookups and first-open controls

**Files:** Create `src/react/workspace/pageLookups.ts`, `tests/pageLookups.test.js`; modify `src/react/workspace/AffineWorkspace.tsx`, `tests/e2e/native-windowing.spec.js`.

**Interfaces:** `createPageLookups(snapshot: Pick<PageSnapshot, 'entities' | 'placements'>)` returns `entitiesById`, `placementsById` and `titleForPlacement(id: string, fallback?: string): string`. Default fallback is `Missing object`. Memoize per snapshot arrays in the component. Keep existing labels/selection actions and geometry component.

- [ ] Add unit RED `page labels resolve shared/missing references with linear identity reads`, with 1,000 entities/placements and ID getter counters. Assert correct titles, duplicate entity references, missing fallback and at most 2,000 ID reads to build/resolve all endpoint titles.
- [ ] Add browser RED `layout controls defer until first open and retain an unfinished geometry form across disclosure changes`: initial selected-card options/style fieldsets count zero, open shows every fixture option, edit width to 450, close/reopen retains 450, save/native move semantics remain.
- [ ] Run the unit and browser test against the frozen baseline; retain failures before implementation.
- [ ] Implement indexed lookups, `useMemo` reuse, and a first-open latch that keeps loaded controls mounted afterward. Replace nested entity/placement searches in labels and chosen-card resolution; preserve all options.
- [ ] Run unit/source checks, build, focused browser group; verify actual labels and prior native snapshot/draft regressions. Commit `perf: index native layout labels and defer closed controls`.

### Task 2: Disposable native preparation lookup overlay

**Files:** Create `src/react/workspace/nativePreparationIndex.ts`, `tests/nativePreparationIndex.test.js`; add a focused fake native Doc helper only if it improves test clarity.

**Interfaces:** `createNativePreparationIndex(doc: Doc)` returns `{addBlock: Doc['addBlock']; mutate<T>(action: () => T): T; verify(): void; dispose(): void}`. Use native `generateBlockId` and original add writer for controlled creation. Override only per-instance public APIs/root getter. Empty supported native documents get the optimization; incompatible/nonempty instances use the original APIs with the same creation verification.

The overlay indexes known parent/root/surface IDs and returns original models/Block wrappers. Exact single-surface queries return a fresh array; mixed/other flavour queries pass through. Native API guards cover direct add/move/delete and callback/children updates. `spaceDoc.beforeTransaction` disables the overlay for unowned transactions, including alternate handles and nested observer writes. Save/restore property descriptors exactly; captured wrappers after deactivation delegate to original APIs. Keep verification records when falling back, releasing them on final dispose.

- [ ] Add RED cases for native-equivalent parent/root/surface queries through both model and ID, 10,000 repeated reads with no repeated full scans, native ID generator count and fresh arrays. Assert mixed/unknown queries pass through.
- [ ] Add RED cases for pre-delegation fallback on direct/unexpected creation, duplicate/move/delete, callback/children updates; direct/alternate-handle beforeTransaction; and a reentrant transaction during an approved write.
- [ ] Add RED cases for descriptor/receiver restoration, captured-wrapper fallback, nonempty/incompatible documents, repeated disposal, and errors/aborts during creation.
- [ ] Add RED cases where the native writer logs/returns but publishes no model or the wrong flavour; assert throws. Verify actual `model.children` edges independently, including the final reference and parent changes after overlay fallback.
- [ ] Run `node --test tests/nativePreparationIndex.test.js`; expect RED before the helper exists. Implement against installed public API semantics, including deletion events arriving before native model removal.
- [ ] Run focused tests, lint/format and both type checks. No browser/build claim until integration. Commit `perf: index controlled native preparation lookups`.

### Task 3: Integrate and verify complete native preparation

**Files:** Modify `src/react/workspace/blocksuitePageProjection.ts`, `tests/e2e/native-windowing.spec.js`; extend existing cooperative mount tests only for new ownership behavior.

**Interfaces:** Consume Task 2's overlay. Install after loading the new Doc; register its scope owner before the Doc disposal owner so native teardown can use the index. Use its `addBlock` for root/surface/note/reference and `mutate` for controlled surface/group writes. Verify after construction and again before readiness; dispose the overlay before interaction starts.

The guarded `doc.updateBlock` wrapper approves ordinary property objects automatically: this explicitly includes initial edgeless/collapse/xywh presentation and every per-note index update. Callback/children updates fall back before delegation.

- [ ] Add browser RED `a missing final native reference fails preparation and retries without canonical loss`. Capture the actual Doc prototype from a synthetic initial workspace, return an ID without adding the final embed on a subsequent mount, assert visible failure/no editor panes/no fake journals and unchanged canonical references, restore prototype, retry successfully.
- [ ] Add browser RED `an unowned native transaction before mount restores original lookups`. Intercept the owned editor append in the test, mutate an unrelated transient Y map through public `spaceDoc`, assert original descriptors restored immediately, and verify complete ready models/geometry. Restore the test interception.
- [ ] Extend existing order/completeness test to assert no own overlay descriptors remain after ready. Keep all prior native delete/collapse/resize/camera/recovery assertions.
- [ ] Implement scoped integration, explicit missing-model errors and independent parent-edge verification. Do not suppress native creation errors into false success.
- [ ] Run full source checks → build → focused native browser tests serially. Run one unprofiled 1,000-reference pilot per mode under the existing supervisor before full acceptance; archive failures and inspect remaining hotspots if needed.
- [ ] Commit `perf: apply verified lookup indexes during native startup`.

### Task 4: Time-budgeted construction and cancellation

**Files:** Modify `src/react/workspace/cooperativeProjection.ts`, `tests/cooperativeProjection.test.js`, `tests/e2e/native-preparation.spec.js`.

**Interfaces:** Extend `runProjectionBatches(operations, options?, yieldControl?, now?: () => number)` with injectable monotonic clock. Default work budget 8 ms; maximum 50 operations remains. Order/progress/abort behavior stays compatible.

- [ ] Use a constant injected clock for existing exact 50-operation tests. Add RED fake-clock assertions for ten operations costing 3 ms each:

```js
assert.deepEqual(slices, [3, 3, 3, 1]);
assert.deepEqual(progress, [3, 6, 9, 10]);
```

- [ ] Add RED budget-boundary abort, empty/single long operation, final-slice and operation-error cases. Assert no late progress or work after cancellation and no starvation under the 50-operation cap.
- [ ] Implement elapsed-time yielding after each operation; preserve owned mount/cancellation cleanup and error propagation.
- [ ] Retain the existing end-to-end cancellation measurement and add event/feedback attribution if useful. Run all three-mode cancel→fresh50 retry invariants; measure five serial confirmations per mode with no automatic retry, stopping repeated failures.
- [ ] Run source checks → build → native preparation/windowing browser checks; commit `perf: yield native construction by elapsed work budget`.

### Task 5: Repeated acceptance, review and publication

**Files:** Extend `docs/NATIVE_BOARD_UPGRADE.md`, create `docs/NATIVE_STARTUP_FOLLOWUP.md` and evidence under `docs/evidence/`; update `README.md`, `docs/AI_BUILDER_CURRENT_BUILD.md`, `docs/UNIFIED_BRAIN_STATUS.md` with actual results only. Preserve previous evidence. Save the baseline CPU profile/aggregation and enough diagnostic reproduction instructions to identify its exact source and instrumentation.

- [ ] Run full lint/format/types/source checks → production build → complete serial browser suite. Freeze the final artifact; do not run source preparation over it during measurement.
- [ ] Run the same 50/250/500/1,000 × document/canvas/mixed native matrix with five samples for successful groups. Preserve errors/skips and owned-process/profile failures. Keep all complete-model/resource/edit/save assertions and deadlines. Report progress/cancel and startup goals against actual outcomes.
- [ ] Use a follow-up CPU profile only if needed to attribute remaining cost; never mix profiled timings into acceptance medians. Large-library matrix is separate and repeats only if shared scope/data changes or evidence warrants it.
- [ ] Request one fresh whole-branch code review per executing-plans. Re-grade findings by user effect, rule every declined item, fix Important/Critical findings in one author RED→GREEN pass and rerun affected/full checks. No independent fix-review claim.
- [ ] Record actual capacity, remaining limits, all implementation rulings/costs and deferred minors. Keep builder instructions functional; no new stack/appearance prescriptions. A missed target remains visible.
- [ ] Commit, ordinary-push only the new branch, verify old performance branch still `b0c97d0` and prior preserved branch unchanged. Run its build/test-only GitHub workflow if available, record exact source/result/artifact and update documentation only. No PR/merge/deployment.

## Self-review

The plan covers the approved profile→construction/cancel optimization→repeated comparison sequence. Task 1 owns the React hotspot/form contract; Tasks 2/3 own live native API equivalence/failure/restoration; Task 4 owns exact scheduling and cancellation; Task 5 owns honest measurements/review/publication. Library memory/save work remains a subsequent independent pass. All proposed targets are reported as targets until measured.
