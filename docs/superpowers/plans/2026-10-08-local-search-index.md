# Local Search Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the previously selected native execution method; do not start implementation before user review of this plan.

**Goal:** Accelerate selective local searches without changing results, content authority, privacy or recovery.

**Architecture:** A version-6 derived trigram index is invalidated atomically by both existing database writers. A bundled worker builds/searches it cooperatively; exact canonical predicates verify candidates and scan whenever freshness/completeness is uncertain. The UI retains the existing 50-object page and observation contracts.

**Tech Stack:** Existing TypeScript/JavaScript, Dexie/IndexedDB, React/WXT MV3, dedicated module worker, Node tests with fake IndexedDB and isolated Chromium. No new dependency.

**Spec:** [Local search index and background processing](../specs/2026-10-08-local-search-index-design.md).

## Global Constraints

- Canonical objects, content, timestamps, source IDs, placements, links and memory policy are unchanged by indexing.
- Indexed candidates may include false positives, never false negatives. Verify with the existing predicate before returning a result.
- Preserve current order, Unicode ID tie-breakers, page size, cursor rebuilding, filter syntax, relative-date anchoring and scope restrictions. Do not introduce relevance ranking by default.
- Read at most 50 objects per derivation batch; inspect at most 65,536 normalized code units and retain at most 4,096 distinct grams per entity/dialect. Overflow entities always remain candidates.
- Recovery drafts/history, provider credentials and asset bytes are never read by the search index or sent to its worker.
- No remote index/scripts, blob worker URL, account, new permission, canonical backup-format change or UI rebuild.
- Keep `feature/browser-resources-inspector` unchanged. Work on the existing isolated performance branch; preserve `cb36b51` as the application baseline. Never edit mirror `sources/`.

## Review Focus

- A canonical write can fail after partially successful bulk mutation: no committed change may remain untracked; abort rolls back its invalidation (Task 1).
- A phrase spans joined Brain/Smart fields but not separate Explorer fields: narrowing must not silently change matches (Task 2).
- An edit occurs behind a rebuild cursor or during lease takeover: new data stays queued; stale owners cannot publish ready state (Task 3).
- A very common gram, huge body or short query defeats narrowing: fall back without truncation, excessive retained bodies or false-negative paging (Task 4).
- Worker creation/termination fails with an Inspector draft open: navigation, draft and correct search survive (Tasks 5/6).

## File Map and Contracts

Shared legacy-compatible invalidation/schema constants belong in `src/workspace/searchInvalidation.js` with declarations in `src/workspace/searchInvalidation.d.ts`. Worker-safe database construction belongs in `src/react/workspace/workspaceDatabase.ts`; `workspaceClient.ts` re-exports the singleton/class and retains React-only observers. New focused units: `searchIndexTypes.ts`, `searchGrams.ts`, `searchIndexRepository.ts`, `searchCandidates.ts`, `libraryQueryEngine.ts`, `searchWorkerProtocol.ts`, `searchWorker.ts`, `searchWorkerRuntime.ts`, `searchWorkerClient.ts`, `SearchIndexPanel.tsx`.

`SearchDialect = LibraryQuery['dialect']`. `SearchState` has `key: 'main'`, `format: 1`, `locale: string`, numeric `generation`, `indexedGeneration`, `buildGeneration`, `processed`, `leaseUntil`, `fence`, `epoch: string`, `status: 'unbuilt'|'building'|'ready'|'paused'|'error'`, optional `total: number`, `owner: string`, optional `lastId: string`, `scanComplete: boolean`, optional `lastError: string`. The persisted keyset cursor/scan-complete flag distinguishes an interrupted rebuild from catch-up. `SearchChange` has `id: string`, optional `entityId: string`, `generation: number`, `kind: 'entity'|'reset'`. `SearchDocument` has `id: string`, `epoch: string`, `generation: number`, `fingerprint: string`, `explorerGrams`, `brainGrams`, `smartGrams`, `overflowDialects` (all gram/overflow fields string arrays). `SearchControl = 'pause'|'resume'|'rebuild'|'retry'`. All `db` parameters below are the extracted `WorkspaceClient`; initialization accepts the installed Dexie `Transaction` type.

Use `searchState: 'key'`, `searchChanges: 'id,generation'`, `searchDocuments: 'id,epoch,*explorerGrams,*brainGrams,*smartGrams,*overflowDialects'`. Candidate IDs are compact references, not objects. Limit candidate materialization to 5,000 IDs; seeing a 5,001st candidate chooses scan. This is a fallback decision, not a result limit. Lease duration 15 seconds, renewed at most every 5 seconds; every derived commit verifies owner/fence/epoch. These lease values concern worker ownership, not canonical save acknowledgement.

All repository functions accept an explicit worker-safe database instance. `readSearchStatus` returns `SearchStatus = SearchState & {pending:number}` by counting the durable change queue without reading bodies; worker state responses and controls use `SearchStatus` so the panel cannot invent pending counts. Use existing `tests/helpers/workspaceFixture.js`; extend its resolver for explicit `.js` dependencies and the database leaf without creating a second real test singleton.

### Task 1: Atomic writer invalidation and mirrored schema

**Files:** Create `searchInvalidation.js`, `searchInvalidation.d.ts`, `searchIndexTypes.ts`, `workspaceDatabase.ts`; modify `src/workspace/workspaceDb.js`, `workspaceClient.ts`, root `index.html`, `tests/helpers/workspaceFixture.js`; create `tests/searchSchema.test.js`, `tests/searchInvalidation.test.js`.

**Interfaces:** Produce `installSearchInvalidation(db: Dexie): void`, `initializeSearchState(transaction): Promise<void>`, `invalidateSearch(db: Dexie): Promise<void>` in the shared module. Produce worker-safe `WorkspaceClient` and `workspaceClient`; preserve all existing imports via re-export. Index cache writes must not recursively invalidate entities.

- [ ] Write named tests `both writers upgrade without content changes` and `aborted writes roll back search invalidation`, plus cases for identical schemas, preserved private recovery, same-time updates, add/put/delete/deleteRange, explicit and implicit transactions, partial bulk failure and invalidation-storage failure. Include assertions `assert.equal(db.verno, 6)`, `assert.equal(state.status, 'unbuilt')`, and abort comparison `assert.deepEqual(await readChanges(), beforeChanges)`.
- [ ] Run `node --test tests/searchSchema.test.js tests/searchInvalidation.test.js`; expect RED for missing module/schema, not a harness import error.
- [ ] Implement DBCore transaction-scope extension and mutation invalidation using the installed Dexie types. Deduplicate entity IDs; range deletion writes a reset. Install before opening both clients; include the shared legacy script before `workspaceDb.js` in the existing build block. Upgrade initializes state without scanning all bodies.
- [ ] Run those tests plus `node --test tests/librarySchema.test.js tests/recoverySchema.test.js tests/workspaceDb.test.js`; expect all green. Confirm database leaf imports neither React nor legacy UI. Capture the schema's open/versionchange behavior.
- [ ] Commit only this deliverable as `feat: journal search invalidations across workspace writers`.

### Task 2: Bounded exact-dialect gram derivation

**Files:** Create `searchGrams.ts`, `tests/searchGrams.test.js`; consume Task 1 types without changing canonical `searchTerms`.

**Interfaces:** Produce `deriveSearchDocument(entity: WorkspaceEntity, generation: number, epoch: string, locale: string): SearchDocument`, `queryTextTerms(query: LibraryQuery): string[]`, `queryGrams(query: LibraryQuery): string[]|undefined`. A missing gram strategy means scan, never empty results.

- [ ] Add named failing tests `dialects preserve field boundary semantics` and `overflow retains late substring candidates`, plus UTF-16/parser/unknown-field/locale/whitespace/emoji/CJK/short-term/mutation-free cases. Assert Brain can narrow a title/body boundary phrase while Explorer cannot manufacture a boundary match; assert a match beyond 65,536 units sets that dialect in `overflowDialects`; `assert.ok(doc.brainGrams.length <= 4096)` with equivalent assertions for all dialects.
- [ ] Run `node --test tests/searchGrams.test.js`; expect RED for the missing exports.
- [ ] Implement literal dialect projections using existing `parseSmartQuery` and selector semantics. Include dialect/type/locale/index-format fields in fingerprints; no normalization/fuzzy/stemming. Once a cap is exceeded, flag whole-dialect overflow and discard unnecessary retained grams.
- [ ] Run the gram tests plus existing `libraryQueries.test.js` and `brainRepository.test.js`; expect green and unchanged canonical/source/context behavior.
- [ ] Commit as `feat: derive bounded substring candidates without changing search semantics`.

### Task 3: Restartable leased rebuild and incremental catch-up

**Files:** Create `searchIndexRepository.ts`, `tests/searchIndexRepository.test.js`; consume invalidation state and gram derivation.

**Interfaces:** Produce `readSearchStatus(db:WorkspaceClient): Promise<SearchStatus>`, `claimSearchLease(db:WorkspaceClient, owner: string, now: number): Promise<SearchLease|undefined>`, `runSearchIndexBatch(db:WorkspaceClient, lease: SearchLease, options: {signal?: AbortSignal; now?: number}): Promise<SearchState>`, `controlSearchIndex(db:WorkspaceClient, command:SearchControl): Promise<SearchStatus>`. `SearchLease = {owner: string; fence: number; epoch: string}`. One batch reads ≤50 entities.

- [ ] Write RED tests `stale fences cannot publish or drain newer edits` and `ready requires complete scan and drained invalidations`, plus full keyset traversal, deduplicated queue drain, deletion, paused resume, worker loss, lease takeover, edit-before/after-cursor, reset and quota cases. Assert stale worker returns/rejects without deleting a newer change; `assert.equal(state.indexedGeneration, state.generation)` only when complete and `assert.equal(await db.searchChanges.count(), 0)`.
- [ ] Run `node --test tests/searchIndexRepository.test.js`; expect RED.
- [ ] Implement short consistent transactions, one owned batch at a time, persisted cursor/progress, explicit derived-store allowlist for rebuild and generation comparisons. A resumed interrupted build may restart safely; it must not guess completion from record counts. Use an injected clock in tests; never a long blocking sleep.
- [ ] Run Tasks 1–3 tests; expect all green. Prove read volume ≤50 per derivation batch and canonical records/timestamps unchanged. Errors mark cache unusable without clearing content.
- [ ] Commit as `feat: rebuild and refresh local search with fenced worker ownership`.

### Task 4: Fresh candidate narrowing with exact paged verification

**Files:** Create `searchCandidates.ts`, `libraryQueryEngine.ts`, `tests/searchCandidates.test.js`, `tests/searchParity.test.js`; modify `libraryQueries.ts`, `useLibraryPage.ts` only for extraction/observation wiring.

**Interfaces:** Produce `readSearchCandidates(db: WorkspaceClient, query: LibraryQuery, signal?: AbortSignal): Promise<{kind:'scan'; reason:string}|{kind:'indexed'; ids:readonly string[]; generation:number; epoch:string}>`. Define `IndexedReadOptions = LibraryReadOptions & {indexMode?: 'auto'|'scan'}` in `libraryQueryEngine.ts`. Produce `readLibraryPage(db: WorkspaceClient, query: LibraryQuery, options: IndexedReadOptions): Promise<LibraryPage>` and `readLibraryPosition(db: WorkspaceClient, query: LibraryQuery, index: number, cursors: Array<LibraryCursor|undefined>, options: IndexedReadOptions): Promise<LibraryPage & {pageIndex:number; cursors:Array<LibraryCursor|undefined>}>`. Existing public names `queryLibraryPage`/`queryLibraryPosition` retain their call signatures.

- [ ] Write differential RED test `indexed pages equal complete scanner traversal` using `assert.deepEqual(indexedIds, scannedIds)` for every dialect/sort/filter, Unicode ties, phrase/field boundaries, overflow, 5,001 candidates, short/empty queries and changing generation. Add `mutation discards stale candidates` and `foreign query cursors are rejected`; assert no stale indexed result publishes after a mutation.
- [ ] Run `node --test tests/searchCandidates.test.js tests/searchParity.test.js`; expect RED. Reuse real selector predicates and fixed reference clocks, not a second approximate matcher.
- [ ] Extract the existing query engine into a worker-safe leaf with explicit database injection; retain exact matching, indexed scopes, keysets, scan bounds and compact custom-order projections. Narrow only with a proven ready generation. Recheck readiness/current generation before publishing; stale index chooses the full exact scanner. Observe `searchState` transitions without resetting an unrelated editor.
- [ ] Run Tasks 1–4 and existing `libraryQueries.test.js`, `queryLifecycle.test.js`, `workspaceReads.test.js`; expect green. Measure selective indexed hydration and retain correct broad-query fallback.
- [ ] Commit as `perf: narrow library search through fresh verified index candidates`.

### Task 5: Bundled worker protocol and safe query service

**Files:** Create `searchWorkerProtocol.ts`, `searchWorkerRuntime.ts`, `searchWorker.ts`, `searchWorkerClient.ts`, `tests/searchWorker.test.js`, `tests/e2e/search-worker.spec.js`; modify `libraryQueries.ts` to delegate, and WXT configuration only if a real production worker bundle requires it.

**Interfaces:** Produce `createSearchWorkerRuntime(db: WorkspaceClient, post: (response: SearchWorkerResponse)=>void): {handle(request:SearchWorkerRequest):Promise<void>; dispose():void}` and `createSearchWorkerClient(factory?:()=>Worker): SearchWorkerClient`. Define `SearchWorkerClient = {query(query:LibraryQuery, options:LibraryReadOptions):Promise<LibraryPage>; ensureIndex():Promise<SearchStatus>; control(command:SearchControl):Promise<SearchStatus>; status():Promise<SearchStatus>; dispose():void}`. In `searchWorkerProtocol.ts`, requests share `protocol:1, requestId:string` and are a tagged union: `{type:'query';queryKey:string;query:LibraryQuery;cursor?:LibraryCursor}`, `{type:'control';command:SearchControl}`, `{type:'ensureIndex'}`, `{type:'status'}`, `{type:'dispose'}`, `{type:'cancel';targetId:string}`. Responses share the protocol/request ID and are `{type:'page';queryKey:string;page:LibraryPage;generation:number;epoch:string}`, `{type:'state';state:SearchStatus}`, `{type:'progress';scanned:number}`, `{type:'cancelled'}`, or `{type:'error';message:string}`. Cancel targets and progress cannot complete unrelated requests. `ensureIndex` schedules catch-up but never silently unpauses a user-paused index. Signals stay local: cancellation posts request IDs and aborts worker-owned controllers. Worker creation uses `new Worker(new URL('./searchWorker.ts', import.meta.url), {type:'module'})` through the existing bundler.

- [ ] Add RED runtime/client tests `cancelled and late replies cannot cross query scopes` and `worker failure falls back to exact scan` using `assert.deepEqual(fallback.items, scanned.items)`, plus query priority during rebuild, unmount disposal, unsupported protocol commands and owner loss. Assert A/B/A replies cannot cross query keys and cancelled requests never resolve as a new scope. Add a real MV3 worker test using existing temporary-profile fixtures.
- [ ] Run `node --test tests/searchWorker.test.js`; expect RED.
- [ ] Implement one rebuild scheduler per owner, yield between ≤50-object batches, lease renewals and query-priority scheduling. Delegate query engine in the worker. On worker failure, use the same yielding/cancellable engine on the main thread, exposing error/status without dropping successful rows. Log counts/timings only in development, never query/body/credentials.
- [ ] Run worker tests, `npm test`, then `npm run build`, then `npx playwright test tests/e2e/search-worker.spec.js tests/e2e/paged-library.spec.js tests/e2e/lazy-workspace.spec.js --workers=1`; expect green and actual extension worker requests without remote/blob scripts or new CSP permissions.
- [ ] Commit as `feat: run restartable local search work outside the UI thread`.

### Task 6: Index controls, cross-tab refresh and privacy/export boundaries

**Files:** Create `SearchIndexPanel.tsx`, `tests/searchIndexPrivacy.test.js`, `tests/e2e/search-index.spec.js`; modify `WorkspaceWorkflows.tsx`, `WorkspaceApp.tsx`, `workspaceRepository.ts`, `src/workspace/workspaceDb.js`, `tests/helpers/largeLibraryFixture.js`, and schema/privacy tests as required.

**Interfaces:** `SearchIndexPanel(props:{service:SearchWorkerClient})` consumes the Task 5 service and exposes status, processed/remaining when exact, pending changes, error and Pause/Resume/Rebuild/Retry. Task 3 status derives pending counts without hydrating canonical bodies. Workspace startup schedules cooperative catch-up after usable UI; no index build awaited by shell initialization.

- [ ] Write RED tests `search cache is excluded from both export modes` (`assert.equal(Object.hasOwn(payload, 'searchDocuments'), false)` and equivalent for the other derived stores), `imports reject derived cache tables` and `worker failure preserves draft and AI privacy`, plus replacement reset, credentials/drafts/history never read, off-page selection and same-count cross-tab edits. Assert canonical off-page objects present; a remembered memory remains locally searchable but excluded from forbidden AI context. Reject only the derived-cache addition with an actionable message; preserve acceptance of existing supported backup versions.
- [ ] Run `node --test tests/searchIndexPrivacy.test.js`; expect RED.
- [ ] Add panel controls with explicit loading/error copy, guard ready status by generation/queue state, and use supported-data export allowlists. Keep schemaVersion 4 exports and existing import/recovery semantics. Teach the owned raw synthetic seeder to invalidate search once its fixture is complete; never instrument or access personal profiles.
- [ ] Run Task 6 tests and existing recovery/backup/privacy suites; `npm test`, build, and the new plus legacy search/draft/browser tests; expect green. Cancel/terminate worker and restart profile to prove durable catch-up and usable search.
- [ ] Commit as `feat: expose local index controls with privacy-safe fallback and backups`.

### Task 7: Measured search acceptance and release evidence

**Files:** Create `tests/performance/search-index.spec.js`; modify performance config only for independent discovery/time budgets; update `docs/LOCAL_SEARCH_INDEX_VERIFICATION.md` (new), `README.md`, `AI_BUILDER_CURRENT_BUILD.md`, `UNIFIED_BRAIN_STATUS.md` after verification. Keep the earlier performance report as dated evidence.

**Interfaces:** Extend the synthetic fixture/harness with explicit scanner versus ready-index measurements, index storage estimates and single-edit catch-up. Keep browser/viewport/source/harness revision and working-tree metadata, source-byte request costs and timing ranges. Native editor capacity is not certified by this stage.

- [ ] Add failing test `benchmark readiness requires generation parity not counts` to `tests/largeLibraryFixture.test.js`: seed reset makes cache incomplete, explicit ready wait does not pass on counts alone, and `assert.deepEqual(resultIds, [fixture.selectiveEntityId])`. Run that unit file; expect RED for the missing setup/index-ready behavior.
- [ ] Implement setup and separate measurements: 1k/10k/50k, both board shapes, five samples each; ready selective substring, broad/short scanner fallback, cold rebuild time, single edit catch-up, input responsiveness and index storage/heap diagnostics. Preparation is outside ready-query timing but reported, never omitted. Preserve supervised owned-profile cleanup and no retries for measured cases.
- [ ] Run all source checks, build, complete serial browser suite, freeze immutable artifact, then `npx playwright test -c playwright.performance.config.js tests/performance/search-index.spec.js --workers=1` with `WORKSPACE_EXTENSION_PATH` set to that artifact. Do not rebuild/modify it during measurement. Record all failures and ranges; no hardware-independent latency promise.
- [ ] Self-review spec coverage, then obtain a fresh whole-stage review with the requesting-code-review workflow; fix findings using RED→GREEN evidence and rerun affected/full checks proportionately. Distinguish author verification from reviewer re-review. Do not finish over unresolved Important/Critical findings.
- [ ] Update functional handoff without prescribing stack/appearance, document implemented/measured/unverified boundaries, `git diff --check`, commit release evidence. Publish only under the user's requested branch authority; no merge/PR/deployment. Save the verified stage before native-board work.

## Self-Review and Handoff

Coverage: atomic/mirrored writes Task 1; bounded semantics Task 2; restart/concurrency Task 3; exact query/paging Task 4; worker protocol/fallback Task 5; UI/privacy/export Task 6; complete validation/report Task 7. Review-focus cases are explicitly assigned. Shared types/signatures are defined before consumers. No library migration, fuzzy ranking, live connector or memory-policy change is included.

Execution remains pending user plan review. Native execution is retained from the prior approved branch workflow; implementation itself requires the executing-plans skill. This plan is not completion evidence.
