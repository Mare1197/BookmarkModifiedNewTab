# Large-library performance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement upgrades 1 and 2 without narrowing existing search, editing, recovery or shared-object behavior.

**Architecture:** Replace the universal UI snapshot with explicitly scoped repository reads and query subscriptions. Page canonical records, window long lists, and defer optional view code; preserve full-dataset operations where completeness is required.

**Tech Stack:** Existing React 19, Dexie 4, WXT/MV3, React Flow 12, BlockSuite 0.19.5, Node test runner and Playwright. No new content database or remote service.

**Spec:** `docs/superpowers/specs/2026-10-04-large-library-performance-design.md` (user approved with "Implement it").

## Global constraints

- Work exclusively on `feature/large-library-performance`, starting at `1edd695`.
- Keep `feature/browser-resources-inspector` unchanged as the preserved baseline.
- Do not merge, deploy, access personal browser data, or introduce cloud services.
- Default result pages contain 50 objects.
- Do not substitute token-prefix matching for substring or quoted-phrase matching.
- Private drafts and revision history remain excluded from ordinary search and AI context.
- Do not remount an active editor merely to refresh another view.
- Do not replace the editor or change its dependency versions as part of bundle trimming.
- Benchmark 1,000, 10,000 and 50,000 objects in isolated profiles; no timing promises before measurement.
- Keep partial collections explicitly typed/scoped; never label them complete exports, projects or AI context.
- Preserve the user's branch-only isolation choice; no additional worktree without approval.

## Review focus

1. Same-count background updates and responses arriving after navigation: Task 4 must prove fresh data without replacing an active draft.
2. Equal sort keys, non-ASCII titles/IDs and mutable query inputs: Task 2 must preserve order, invalidate cursors and avoid omissions.
3. Selected objects and relationship targets outside the current page: Tasks 3-5 must fetch by ID rather than assume absence.
4. Focus/drag targets leaving the viewport: Task 6 must pin interactions and preserve accessible navigation.
5. Schema parity, private recovery records and lazy-module failures: Tasks 2, 4 and 7 must verify migration, privacy and usable failure states.

## Execution and evidence

Recommended method: native execution task-by-task, then one fresh whole-change reviewer. Tasks share query and scope contracts, so keeping one implementer reduces interface drift. Await user choice before implementation.

Use the existing `tests/helpers/workspaceFixture.js` for real Dexie/fake-indexeddb tests and `tests/e2e/fixtures.js` for temporary Chromium profiles. Add failing tests before changing product behavior. Each task ends with its focused checks and `npm test`; keep a ledger with red/green evidence, deviations and commit IDs. Shell examples use PowerShell and explicit repository paths.

## Task 1: Repeatable baseline and performance fixtures

**Files:** create `tests/helpers/largeLibraryFixture.js`, `tests/largeLibraryFixture.test.js`, `tests/performance/library.spec.js`, `playwright.performance.config.js`, `scripts/bundle-report.js`; create `docs/LARGE_LIBRARY_PERFORMANCE.md`.

**Interfaces:** `makeLargeLibraryFixture(size: number, shape: 'small-board' | 'large-board')` returns deterministic canonical entities, boards, placements, links, memberships and tasks. `seedLargeLibrary(page, fixture)` uses native IndexedDB from an isolated extension page. Benchmark runner accepts `PERF_LABEL` and `PERF_SIZES`; artifacts include those labels and source revision.

- [ ] Test fixture sizes, stable IDs, valid endpoints and identical data for repeated generation. Assert 50 fixed board references for `small-board` irrespective of library size, and `size` references for `large-board`. Include Unicode, equal timestamps, 1 KiB note bodies and mixed types; no secret or real-user data.
- [ ] Run `node --test tests/largeLibraryFixture.test.js`; expect the new contract to fail before the helper exists, then pass after implementation.
- [ ] Implement the benchmark harness against current UI selectors. Capture cold startup, search, page navigation, scroll, editor opening, DOM counts, JS resources and supported memory metrics. Collect five samples per size/shape; report median, range and failures. Seed outside timed intervals.
- [ ] Implement bundle report with total unpacked size and per-file JS/CSS/WASM bytes. Separately record browser-loaded resources; do not call total extension size startup cost.
- [ ] Run `npm test`, `npm run build`, then `$env:PERF_LABEL='baseline'; npx playwright test -c playwright.performance.config.js --workers=1` and `node scripts/bundle-report.js dist`. Expected: valid reports for all sizes; observed baseline slowness/timeouts are recorded, not hidden by pruning fixtures.
- [ ] Commit helpers, harness and baseline report as `test: establish large-library performance baseline`. Do not commit generated extension output or raw traces.

## Task 2: Canonical cursor queries and schema parity

**Files:** create `src/react/workspace/libraryQueries.ts`, `libraryQueryTypes.ts`, `libraryOrdering.ts`; modify `workspaceSearch.ts`, `brainSelectors.ts`, `workspaceClient.ts`, `src/workspace/workspaceDb.js`; create `tests/libraryQueries.test.js`, `tests/librarySchema.test.js`.

**Interfaces:** `LibraryQuery` carries `dialect: 'smart' | 'brain' | 'explorer'`, `text`, optional `boardId`, `projectId`, `type`, `status`, `inbox`, `sort: 'id' | 'updated' | 'title' | 'tiles'`, optional `tileScope`, and `referenceTime`. `LibraryPage` carries `items: WorkspaceEntity[]`, `nextCursor?: LibraryCursor`, `hasMore`, optional exact `total`, and `scanned`. `queryLibraryPage(query, {cursor?, signal?, onProgress?}): Promise<LibraryPage>` returns at most 50 objects. Cursors are opaque, query-bound and not persisted as canonical content.

- [ ] Test empty/final pages, 123 matches traversed as 50/50/23, duplicate sort keys, Unicode titles/IDs, rejected foreign-query cursors, aborts, sparse matches and missing optional fields. Compare complete stable-dataset results with existing selectors, including quoted phrases, all smart filters, Brain tags/project/status and Explorer title/type/URL rules.
- [ ] Test custom tile orders spanning pages and default-order ties. Assert scanner progress precedes completion for sparse text matches; an aborted request publishes no results. Reading hooks must distinguish scanned records from final page hydration.
- [ ] Run `node --test tests/libraryQueries.test.js tests/librarySchema.test.js`; expected new query/schema assertions fail.
- [ ] Add version 5 compound indexes for stable indexed reads: entities `[updatedAt+id]`, placements `[boardId+id]`, relationships `[fromEntityId+id]` and `[toEntityId+id]`, memberships `[folderId+position+id]`. Declare the same additions in both constructors; preserve all old tables and indexes. No mandatory new entity field or content migration.
- [ ] Implement index-narrowed candidate selection and 250-record scan batches. Preserve dialect-specific predicates rather than conflating the three existing searches. Query companion tasks/links/memberships only for relevant candidate IDs or requested scopes; never infer backlinks from active-board-only links.
- [ ] Implement exact ordering: ID-index paging for Explorer; updated timestamp groups with locale-aware ID ties for Brain; ephemeral compact `{id,title,updatedAt,order?}` projections for locale title/custom tile ordering. Do not retain bodies in projections. Timestamp-group continuations record the last locale-ordered ID, not a reversed compound-key assumption. Cache only an active query generation; release on invalidation/navigation. Disclose projection memory and scan costs.
- [ ] Test version-4 upgrade through both constructors, then open them together and capture new records through the legacy writer. Assert no schema warnings, unchanged IDs and byte-equivalent recovery records. Test stale open-tab version-change notification.
- [ ] Rerun focused tests and `npm test`; expected all pass. Commit as `feat: add canonical paged library queries`.

## Task 3: Explicit shell, board, object and neighborhood reads

**Files:** create `src/react/workspace/workspaceReadModels.ts`, `workspaceReads.ts`; modify `workspaceRepository.ts`, `pageRepository.ts` only where shared initialization is extracted; create `tests/workspaceReads.test.js`.

**Interfaces:** `loadShell(): Promise<WorkspaceShell>` returns navigation metadata, saved filters and counts, not object bodies. `loadBoard(boardId): Promise<BoardReadModel>` returns that board, placements, referenced entities/assets and links whose endpoints are represented. `loadObject(entityId): Promise<ObjectReadModel | null>` returns the canonical selected object, its memberships, task, complete direct links, referenced counterpart objects and latest 50 activities. High-degree link groups expose their scope and can be paged in UI. `loadNeighborhood(scope, cursor?): Promise<GraphPage>` accepts a discriminated library/board/project/entity scope and returns up to 200 entities plus confirmed links between loaded endpoints, scope totals when exact, and a continuation.

- [ ] Add tests with a 50-object board and 1k/10k unrelated objects: assert unrelated entity, placement and relationship bodies are never hydrated. Repeat reads with selected objects on another board, missing endpoints, self-links and deleted objects.
- [ ] Assert object reads retain off-board backlinks/project memberships without duplicating links; graph expansions preserve canonical IDs and disclose unexpanded neighbors. Board exports remain complete and independent of these read models.
- [ ] Run `node --test tests/workspaceReads.test.js`; expected new scoped-read contracts fail.
- [ ] Implement indexed reads, deduplicated `bulkGet`, explicit model types and consistent read transactions. Separate initialization from routine refresh; preserve seeding/idempotence. Keep `loadWorkspace` as a named complete legacy/export compatibility operation until all UI consumers move, not a scoped drop-in replacement.
- [ ] Run focused tests and `npm test`; expected pass. Commit as `refactor: introduce explicit workspace read scopes`.

## Task 4: Scoped subscriptions and safe app-shell migration

**Files:** create `src/react/workspace/useWorkspaceQuery.ts`, `WorkspaceObjectPanel.tsx`, `WorkspaceGraphView.tsx`; modify `WorkspaceApp.tsx`, `WorkspaceInspector.tsx`, `BrainObjectTools.tsx`, `AffineWorkspace.tsx`; create `tests/e2e/scoped-workspace.spec.js` and `tests/queryLifecycle.test.js`.

**Interfaces:** `useWorkspaceQuery<T>(key: string, read: (signal: AbortSignal) => Promise<T>)` returns `{data?: T, loading, refreshing, error?: Error, retry(): void}`. Callers supply stable readers. Each subscription owns cancellation/generation checks and queries its actual records. `WorkspaceObjectPanel` consumes `entityId`, not the active board's entity array. Graph consumes `GraphPage`/scope, not a full library snapshot.

- [ ] Test rapid A/B/A scope changes, delayed A results, same-count content updates in a second Dexie connection, deletion, failure/retry and unmount cancellation. Assert a background refresh keeps prior successful same-scope data visible but does not relabel old-scope content as new-scope results.
- [ ] Add browser tests selecting an off-board search result, editing a note during unrelated updates, deleting the selected object, and navigating during a save conflict. Assert correct Inspector, no lost draft, existing flush guard and explicit errors.
- [ ] Run focused unit/browser cases against the current build; expect the new scoping/read-volume assertions to fail while existing recovery tests still describe baseline behavior.
- [ ] Replace broad table-count subscriptions with `liveQuery` reads over each relevant scope. Do not perform asynchronous work outside observable query tracking without explicit dependency observation. For cancellable batch queries, track candidate ranges/filter dependencies and invalidate continuation generations on changes, including unseen matching inserts.
- [ ] Wire shell, board, Inspector and graph reads. Preserve editor keys except intentional board/recovery transitions; never tie them to generic query generations. Make graph expansion explicit and retain already loaded nodes by ID. Replace full-library target/project selects with searchable paged canonical-ID pickers.
- [ ] Run `npm test`, `npm run build`, `npx playwright test tests/e2e/scoped-workspace.spec.js tests/e2e/recovery-panels.spec.js tests/e2e/recovery-restart.spec.js --workers=1`; expected pass. Commit as `refactor: refresh workspace scopes without remounting editors`.

## Task 5: Migrate collections, workflows and project consumers

**Files:** modify `WorkspaceExplorer.tsx`, `BrainWorkspace.tsx`, `WorkspaceWorkflows.tsx`, `WorkspaceUtilities.tsx`, `ProjectHome.tsx`, `BrainObjectTools.tsx`, `WorkspaceApp.tsx`; create `LibraryObjectPicker.tsx`, `tests/e2e/paged-library.spec.js`; extend `libraryQueries.ts` and `workspaceReads.ts` only through their declared contracts.

**Interfaces:** `LibraryObjectPicker` accepts query restrictions, selected canonical ID and `onSelect(id)`; selection labels load independently by ID. Collection views use `LibraryQuery`/`LibraryPage`. Explicit project/analysis operations fetch the complete intended scope on demand rather than reuse a page.

- [ ] Browser tests traverse beyond 50 objects in Explorer, Table, Tiles, Timeline, Kanban and Inbox; select an off-page project/target; change queries rapidly; update status; customize tile order across pages; open saved smart filters. Assert expected identities/order and no silent total truncation.
- [ ] Test project resume includes eligible URLs beyond the first page with existing deduplication/approval. Test Ask AI preview remains policy-filtered and labels its actual scope. Provider calls remain mocked; no credentials or network access required.
- [ ] Test Tasks, Activity, Sessions, Templates and Assets acquire data only when opened and expose continuation where necessary. Error/retry must remain distinct from empty state.
- [ ] Run new browser tests after build; expected failures from current snapshot coupling.
- [ ] Wire every collection to independent queries; retain 50-object pages and transparent loaded/total labels. Project members use confirmed project-member relations; user-requested project resume gathers its complete scoped URL set before approval. Analysis loads only on user request and preserves memory exclusions. Full backup/import/restore stays on full repository operations.
- [ ] Remove UI calls to `loadWorkspace` and implicit full-library prop assumptions once the consumer inventory is migrated. Search the app for remaining whole-table reads and document justified full-operation exceptions.
- [ ] Run `npm test`, `npm run build`, `npx playwright test tests/e2e/paged-library.spec.js tests/e2e/brain.spec.js tests/e2e/extension.spec.js --workers=1`; expected pass. Commit as `feat: connect shared views to paged canonical queries`.

## Task 6: Window Explorer/hierarchy and optimize graph rendering

**Files:** create `src/react/workspace/WindowedObjectList.tsx`, `windowRange.ts`; modify `WorkspaceExplorer.tsx`, `WorkspaceHierarchy.tsx`, `WorkspaceGraphView.tsx`, `workspaceReads.ts`, `workspace.css`; create `tests/windowRange.test.js`, `tests/e2e/windowed-library.spec.js`.

**Interfaces:** `getWindowRange({count, rowHeight, viewportHeight, scrollTop, overscan, pinnedIndices})` returns visible indices and spacer sizes. `WindowedObjectList` receives stable IDs, row renderer, focused/dragged IDs and load-more callback. `loadFolderMembers(folderId, cursor?)` returns 50 ordered memberships plus referenced entities; order is position then ID and expands only on demand.

- [ ] Unit-test empty/short lists, fractional scrolling, resize, end-of-list, duplicate pinned indices and removal. At 36px rows, 360px viewport and overscan 5, assert at most 20 regular rows plus unique pinned interaction rows.
- [ ] Browser-test keyboard movement across windows/pages, scroll-to-selected, a dragged row leaving view, cancelled drag, nested folders with cycles, native read-only folders, move/undo and viewport resizing. Assert one accessible control per rendered object and stable selection.
- [ ] Run new tests; expected unbounded rendering/interaction assertions fail.
- [ ] Window fixed-height Explorer rows with truncated text and full accessible names, flatten expanded hierarchy rows with cycle protection, and load folder members on expansion. Preserve explicit move controls and drag restrictions. Use resize observation and bounded overscan; release pinned rows after blur/drag completion.
- [ ] Enable the installed React Flow `onlyRenderVisibleElements` support in its isolated view. Verify fit/focus, offscreen connections and dragging before retaining it. Profile native BlockSuite separately without deleting projected content.
- [ ] Run `npm test`, `npm run build`, `npx playwright test tests/e2e/windowed-library.spec.js tests/e2e/hierarchy.spec.js tests/e2e/affine-workspace.spec.js --workers=1`; expected pass. Commit as `perf: window large workspace lists and graph elements`.

## Task 7: Defer heavy views and trim measured bundle costs

**Files:** modify `WorkspaceApp.tsx`, `WorkspaceGraphView.tsx`, `WorkspaceUtilities.tsx`, `BrainWorkspace.tsx`, `AffineWorkspace.tsx`, `scripts/bundle-report.js`; create `tests/e2e/lazy-workspace.spec.js`. Change `wxt.config.ts` only if module evidence requires it; retain `keepNames: true` and current CSP.

**Interfaces:** lazy modules expose existing view props through narrow named/default exports. Retryable lazy boundaries report a failed load without hiding shell navigation or discarding active edits. Bundle report compares baseline and candidate manifests/resources.

- [ ] Browser-test cold New Tab resource requests, first Brain/graph/editor opening and revisiting. Assert inactive optional views do not load their JS merely because the shell imports a shared type; graph may load immediately only when it is the active initial view.
- [ ] Test rejected module loads with a retry/reload action and confirm navigation/recovery remain usable. Keep this fault injection in browser-test request interception, not product test hooks.
- [ ] Run new tests on the existing build; expect eager optional-view resource assertions to fail.
- [ ] Move all React Flow runtime imports/provider into the graph module. Lazy-load optional workflow, analysis/settings and conversation-import components; keep type imports erased. Inspect BlockSuite/package outputs for safely removable unused imports/assets, keeping syntax highlighter resources, third-party notices and existing supported operations intact.
- [ ] Run `npm test`, `npm run build`, `node scripts/bundle-report.js dist`, and `npx playwright test tests/e2e/lazy-workspace.spec.js tests/e2e/affine-workspace.spec.js --workers=1`; expected pass with lower unnecessary initial resource bytes. Report editor-open/total size separately, even if unchanged.
- [ ] Commit as `perf: defer optional workspace modules and report bundle costs`.

## Task 8: Full validation, benchmarks, documentation and review

**Files:** update `docs/LARGE_LIBRARY_PERFORMANCE.md`, `docs/UNIFIED_BRAIN_STATUS.md`, `README.md`, benchmark harness; add regression tests for any review fixes in the owning task's test files.

**Interfaces:** final report maps spec acceptance criteria to tests/measurements and distinguishes implemented, measured, unverified and deferred scope.

- [ ] Run `npm test`, `npm run build`, `npx playwright test tests/e2e --workers=1`, `git diff --check`; expected all pass. Report named failures rather than weakening assertions or silently excluding suites.
- [ ] Run `$env:PERF_LABEL='candidate'; npx playwright test -c playwright.performance.config.js --workers=1` for the same fixtures/settings as Task 1. Compare all sizes/shapes and five samples; separate hydration improvements from scan cost, rendering cost and memory measurements. If browser metrics are unavailable, mark unavailable rather than substituting fake-indexeddb timings.
- [ ] Add deterministic volume gates for fixed-board hydration and bounded DOM nodes to normal tests. Keep hardware-dependent timing numbers diagnostic, not fragile CI thresholds.
- [ ] Document actual bundle/resource changes, remaining large editor costs, broad-substring scan behavior and large-board limitations. Do not claim completion from one microbenchmark.
- [ ] Dispatch one independent whole-change review against `1edd695`, the spec, this plan and the execution ledger, checking all five Review Focus items. Resolve Critical/Important findings with failing-first tests and a green full suite; record deferred minors and verification boundaries.
- [ ] Commit as `docs: report large-library performance verification`. Hand off on `feature/large-library-performance` only; no merge/deployment and no edits to the preserved branch. Follow the user's existing push instructions when publishing, then verify remote commit identity.

## Plan self-review

Coverage: Task 1 provides the baseline; Tasks 2-5 cover scoped data, paging, exact search and refresh; Task 6 covers bounded rendering; Task 7 covers deferred loading; Task 8 verifies/report results. The full-operation escape hatch is explicit, not a hidden UI fallback. Locale ordering and substring scans retain honest O(n) cases with bounded body retention. Schema changes are mirrored across both writers. All scope/query interfaces are introduced before UI consumption.

Status: ready for user review and execution-method choice. No application changes have been made by writing this plan.
