# Native Board Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve native execution; start only after user plan review and the preceding search stage is verified/saved.

**Goal:** Make large native workspaces more responsive without losing objects, connectors, drafts or recovery guarantees.

**Architecture:** Retain the complete transient BlockSuite model. Construct it in cooperative batches using ID maps, then a page-owned coordinator hydrates expensive reference content only when visible/overscan or pinned. Native controllers, canonical sessions and persistent queues remain authoritative for behavior.

**Tech Stack:** Installed BlockSuite 0.19.5, TypeScript, React/WXT MV3, browser visibility/viewport APIs, existing journals and isolated Chromium/Node tests. No package upgrade or new permission.

**Spec:** [Large native board performance](../specs/2026-10-08-native-board-performance-design.md). **Predecessor:** [Local search implementation](2026-10-08-local-search-index.md).

## Global Constraints

- Every canonical placement remains represented in the native page model, with persisted dimensions and object/placement IDs.
- Create notes, groups and connectors in bounded batches of at most 50 model operations before yielding to the event loop.
- Hydrate rich text, conversation display, tasks and assets only for visible/overscan or pinned references, with bounded concurrent loads (initial maximum four).
- One active editor session persists through pan, zoom, list paging, visibility changes and unrelated cross-tab refresh.
- Journal limits, generation checks, saved preimages, Undo and reviewed history restore are unchanged.
- No remote scripts, personal profiles, provider calls, new permissions or canonical migrations are required for this stage.
- No replacement renderer, persistent native Yjs database, silent page truncation or 50k native-capacity claim. Preserve the existing branch/baseline and mirror `sources/`.

## Review Focus

- Projection is cancelled before an adapter is returned: partial documents, sessions, timers and observers must be disposed (Task 3).
- Dirty/focused references leave view or native elements disconnect: retain edits/resources and later save/reconcile correctly (Tasks 4/5).
- Native viewport center is a point object, while events differ: do not repeat the prior coordinate assumption bug (Task 4).
- Collapsed/nested groups and offscreen endpoints participate in Fit/routing: complete geometry/model remains available (Tasks 2/5).
- A stress timeout hangs teardown: stop only the owned profile/process and retain failed evidence (Task 1).

## File Map and Contracts

New leaves: `nativeProjectionPlan.ts` (ID maps/ancestry/order), `cooperativeProjection.ts` (batch scheduler and shared `NativeMountOptions`), `referenceHydration.ts` (resource scheduling and shared `HydrationPins`), `referenceVisibility.ts` (document/edgeless visibility), `referenceDataSource.ts` (bounded canonical shell observation). Integrate in existing `blocksuitePageProjection.ts`, `blocksuiteBrainReference.ts`, `blocksuiteWorkspaceAdapter.ts`, `AffineWorkspace.tsx`, `pageEditorSession.ts`. Reuse native rich-text/assets/routing components rather than rebuild them.

`NativeMountOptions = {signal?: AbortSignal; onProgress?: (done:number,total:number)=>void; onMeasure?: (phase:string,ms:number)=>void}` extends mounting without changing canonical commands. `HydrationPins = {selected:boolean; focused:boolean; dragging:boolean; dirty:boolean}`; any true retains required content. Visibility overscan starts at 200 screen pixels on each edge; normalize by actual viewport zoom for world bounds. Measurements distinguish these tuning values from correctness constraints.

### Task 1: Supervised native baseline and fixtures

**Files:** Create `tests/helpers/nativeBoardFixture.js`, `tests/helpers/nativeProbeRunner.js`, `tests/performance/native-board.spec.js`, `tests/nativeBoardFixture.test.js`; modify performance config for explicit native test selection and owned-profile timeout only.

**Interfaces:** `makeNativeBoardFixture(count:number, mode:'document'|'canvas'|'mixed')` provides 50/250/500/1,000 references, mixed canonical content, valid groups/links/local raster assets. `runOwnedNativeProbe(options:{extensionPath:string;referenceCount:number;mode:'document'|'canvas'|'mixed';timeoutMs:number;sample:number;label:string}):Promise<{ok:boolean;timedOut:boolean;metrics:unknown;errors:string[]}>` owns a single disposable profile/process and bounded teardown. Optional 5,000 uses a separate environment opt-in.

- [ ] Write RED tests `native fixtures preserve complete identities and endpoints` and `probe timeout stops only its owned profile`, plus independent modes and bounded teardown. Assert `assert.equal(result.ok, false)` and `assert.equal(result.timedOut, true)` for timeout, never a successful zero latency or broad Chrome termination.
- [ ] Run `node --test tests/nativeBoardFixture.test.js`; expect RED for the missing helper.
- [ ] Implement synthetic fixtures and bounded process ownership with Windows-hidden launches. Preserve raw fixture invalidation from the search stage. Record canonical load, projection mount, renderer/reference readiness, first usable edit, long tasks, content resources, pan/input/save costs and diagnostic heap when available. No logs of personal content.
- [ ] Run fixture tests, build and frozen baseline probes: 50/250/500/1,000 in each mode, five successful repetitions; retain failures explicitly and stop repeated hangs safely. Fixed 50-reference 1k/10k/50k library checks remain separate from native-card counts.
- [ ] Commit harness only as `test: measure native board construction and content costs safely`.

### Task 2: Linear projection lookup and group planning

**Files:** Create `nativeProjectionPlan.ts`, `tests/nativeProjectionPlan.test.js`; modify only planning loops in `blocksuitePageProjection.ts`.

**Interfaces:** `planNativeProjection(snapshot:PageSnapshot): NativeProjectionPlan` produces `{placements:Array<{p:BoardPlacement;presentation:PlacementPresentation}>;entitiesById:Map<string,WorkspaceEntity>;placementsById:Map<string,BoardPlacement>;groupsById:Map<string,PagePresentation['groups'][number]>;collapsedByPlacement:Map<string,boolean>;groupChildren:Map<string,string[]>;connectors:PagePresentation['connectors'];connectorsById:Map<string,PagePresentation['connectors'][number]>}`. Connector endpoints must exist; child lists contain direct placement IDs (nested group IDs remain in their existing presentation records). It does not mutate snapshot or create native models.

- [ ] Add RED test `projection plan preserves complete ordered geometry` for order ties, nested/collapsed groups, missing endpoints and shared entity placements; `assert.equal(plan.placements.length, snapshot.placements.length)` and deep snapshot equality after planning. Add `cyclic group ancestry fails without recursion`; valid connectors with offscreen endpoints must remain planned.
- [ ] Run `node --test tests/nativeProjectionPlan.test.js`; expect RED.
- [ ] Replace repeated `.find`/all-placement per-group loops with maps and one-pass child membership, retaining existing validated presentation/order semantics. Malformed ancestry reports an explicit failure without infinite recursion or fabricated content.
- [ ] Run planning tests and existing page/routing tests; build and native focused regression; expect same saved geometry/content and a measured construction comparison.
- [ ] Commit as `perf: plan native page references and groups with indexed lookups`.

### Task 3: Cooperative mount lifecycle and complete cleanup

**Files:** Create `cooperativeProjection.ts`, `tests/cooperativeProjection.test.js`; modify `blocksuitePageProjection.ts`, `blocksuiteWorkspaceAdapter.ts`, `AffineWorkspace.tsx`; create `tests/e2e/native-preparation.spec.js`.

**Interfaces:** `runProjectionBatches(operations:readonly (()=>void)[], options:NativeMountOptions):Promise<void>` executes ≤50 operations then yields/checks signal; progress reports actual operations. `mountPageProjection(..., options?:NativeMountOptions)` and `mountWorkspaceEditor(host,input,options?:NativeMountOptions)` propagate the same signal. Existing returned session methods remain compatible.

- [ ] Add RED tests `projection batches yield after at most fifty operations` (`assert.deepEqual(batchSizes, [50, 50, 23])` for 123 operations) and `cancelled mount disposes allocations before returning`, plus yield/progress, cancelled-before-start, late callbacks, throw cleanup, double dispose and no initial user journal/save commands. Use an injected scheduler in unit tests; aborted work cannot attach to a new board.
- [ ] Run `node --test tests/cooperativeProjection.test.js`; expect RED.
- [ ] Cooperatively create the complete model with hydration suppression active. Wrap all mount allocations in cleanup paths, including content/layout sessions created before the projection promise resolves. Disable editing until complete/controller-ready; show preparation/progress and safe cancel/retry. Actual board/mode transitions still use flush guards; generic refresh remains stable.
- [ ] Run unit/lifecycle/recovery tests, build, `npx playwright test tests/e2e/native-preparation.spec.js tests/e2e/recovery-panels.spec.js --workers=1`; expect no leaked late mounts, cleared drafts or fake history after cancellation.
- [ ] Commit as `perf: construct native pages cooperatively with cancellable ownership`.

### Task 4: Visibility and pinned content hydration coordinator

**Files:** Create `referenceVisibility.ts`, `referenceHydration.ts`, `tests/referenceVisibility.test.js`, `tests/referenceHydration.test.js`; add read-only `isDirty(entityId:string):boolean` to `pageEditorSession.ts` with tests; extend `ReferenceContext` in `blocksuiteBrainReference.ts`.

**Interfaces:** `referenceWorldBounds(viewport:GfxController['viewport']):{x:number;y:number;width:number;height:number}` uses the installed point/rect/zoom contract. `createReferenceHydration(options:{maxConcurrent:number}):{register(id:string,load:(signal:AbortSignal)=>Promise<()=>void>):()=>void; setVisible(id:string,visible:boolean):void; setPins(id:string,pins:HydrationPins):void; dispose():void}` owns load generations and cleanup; production passes `{maxConcurrent:4}`. ContentSession adds only `isDirty`, not a new persisted draft model.

- [ ] Write RED tests `viewport bounds use point center and normalized overscan`, `hydration never exceeds four inflight loads` (`assert.ok(peakInflight <= 4)`) and `dirty invisible references remain pinned`, plus collapsed clean cards, obsolete requests, all pin classes, dirty→saved release, unregister/reconnect, resource disposal and selected shared-entity occurrences. Invisible dirty/focused records stay active; late asset completions are disposed instead of published.
- [ ] Run `node --test tests/referenceVisibility.test.js tests/referenceHydration.test.js tests/pageEditorSession.test.js`; expect RED only for missing behavior.
- [ ] Implement a page-owned coordinator and viewport/document observers. Read native API signatures from the installed package rather than guess tuple/object shapes. Pin selection/drag/focus and session dirtiness; released resources cancel generations/revoke URLs/detach observers. Coordinator disposal must never flush/discard canonical drafts implicitly.
- [ ] Run those tests plus existing content-session/recovery suites; expect green and unchanged journal generations/privacy.
- [ ] Commit as `perf: coordinate visible and pinned native reference content`.

### Task 5: Connect lightweight shells, scoped observation and full operations

**Files:** Create `referenceDataSource.ts`; modify `blocksuiteBrainReference.ts`, `blocksuitePageProjection.ts`, `blocksuiteWorkspaceAdapter.ts`, `AffineWorkspace.tsx`; create `tests/nativeReferenceScope.test.js`, `tests/e2e/native-windowing.spec.js`. Reuse `LibraryObjectPicker.tsx` for expensive option lists only when baseline demonstrates their cost.

**Interfaces:** In `referenceDataSource.ts`, define `ReferenceShell = {id:string;title:string;type:WorkspaceEntity['type'];updatedAt:number;missing:boolean}` and `createReferenceDataSource(db:WorkspaceClient,snapshot:PageSnapshot):{readShell(entityId:string):ReferenceShell;subscribe(listener:(changedIds:readonly string[])=>void):()=>void;dispose():void}`. Missing shells retain the requested ID and use an explicit missing-object label, never invent content. Page-owned canonical shell observation supplies title/type by canonical ID; geometry stays with placement/presentation maps. IndexedDB records necessarily include canonical fields; project immediately to shells, retain no additional body copies and read no conversation/asset tables for shell updates. Content work is requested through Task 4, not one eager subscription per offscreen reference. Mount/query options from Task 3 remain unchanged. Toolbar endpoint/page selection must resolve selected IDs independently and expose the complete candidate scope through paging/search.

- [ ] Add RED tests `offscreen shells load no conversation or asset records` (`assert.equal(conversationReads + assetReads, 0)`), `shell updates preserve canonical identity` and `dirty references survive native disconnect`, plus same-count cross-tab updates, missing object state and complete duplicate/export/history operations. Browser assertions retain original connector IDs after Fit/pan/retarget/cancel/reload and save/recover an offscreen dirty note.
- [ ] Run `node --test tests/nativeReferenceScope.test.js`; run the browser regression on the baseline artifact to reproduce eager-content cost and ownership failure without weakening old assertions.
- [ ] Seed lightweight shell maps from the existing complete page snapshot and observe needed canonical IDs in scoped batches. Retain complete native notes/groups/connectors with persisted dimensions; defer only expensive body/editor/conversation/asset resources. Dirty/focused resources survive native disconnect through coordinator ownership; if installed rendering lifecycle cannot support it, stop and refine that mechanism before removing eager safety. Do not truncate conversation display, page data or complete export operations.
- [ ] Run source tests, build, focused native-windowing plus affine/brain/routing/recovery regressions. Assert camera/session stability on generic refresh, cancellation/cleanup, no duplicate observers and correct three-mode behavior.
- [ ] Commit as `perf: hydrate native workspace content without truncating page identity`.

### Task 6: Native acceptance, review and builder handoff

**Files:** Extend `tests/performance/native-board.spec.js`; create `docs/NATIVE_BOARD_PERFORMANCE_VERIFICATION.md`; update `README.md`, `AI_BUILDER_CURRENT_BUILD.md`, `UNIFIED_BRAIN_STATUS.md` only after actual implementation checks.

**Interfaces:** Consume Task 1's supervised runner and Task 3 timings, Task 4 resource counts and actual browser metrics. Report reference/model count separately from hydrated content/DOM count and unrelated library size.

- [ ] Run `npm test`, then `npm run build`, then complete serial browser suite; expect no correctness regressions. Freeze an immutable artifact before measurement; never run `npm test` over the measured `dist` artifact.
- [ ] Re-run the same successful native baseline sizes/modes with five samples, retain failures, opt-in 5k only after usable 1k cases. Repeat fixed 50-reference library checks. Verify complete model/connector counts, ≤4 concurrent content loads, resource release and responsive cancellation. Report medians/ranges, long tasks, preparation/first usable edit and diagnostic memory separately.
- [ ] Apply requesting-code-review for a fresh whole-stage review; fix findings with failing/passing evidence and repeat affected/full checks. Do not claim author fixes were independently re-reviewed unless they were.
- [ ] Self-review both specs' coverage; update functional instructions without stack/appearance prescriptions, record native capacity actually demonstrated and remaining limits. An unusable 1k probe is a failed capacity result, not a reason to hide it or remove cards.
- [ ] `git diff --check`; commit measured release evidence. Push only the isolated branch under existing user publication authority, verify remote hash and unchanged preserved branch. No merge, PR, deployment or personal-profile installation.

## Self-Review and Handoff

Coverage: supervised baseline Task 1; maps/ancestry Task 2; cooperative preparation/cancel/cleanup Task 3; native visibility/resource pins Task 4; scoped shells/full operations Task 5; regression/review/measurement/report Task 6. Every review-focus condition has a named test owner. Installed BlockSuite controllers and canonical session/queue behavior are preserved.

Await user review of this plan; native execution remains selected. The search stage must be verified and saved first. These checkboxes are planned work, not delivered features.
