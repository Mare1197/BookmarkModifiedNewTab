# Large-library loading and rendering design

## Intent and scope

Implement the user's selected upgrades 1 and 2: faster library loading/search and
lighter rendering/editor loading. Extend the current New Tab OS, preserve all
canonical Brain objects, and keep the existing interface and supported workflows.
This is a targeted architectural refactor, not a rebuild or editor replacement.

Work exclusively on `feature/large-library-performance`, starting at `1edd695`.
Keep `feature/browser-resources-inspector` unchanged as the preserved baseline.
Do not merge, deploy, access personal browser data, or introduce cloud services.

## Verified starting point

- `workspaceRepository.loadWorkspace` loads all entities, placements,
  relationships, folder memberships and tasks for its shared snapshot.
- Explorer filters this complete entity array and renders every matching row.
- Brain Table/Tiles paginate rendered items, but derive them from the full library.
- Workspace refresh subscribes broadly to table counts and reloads the snapshot.
- Page relationship reads are already indexed; retain those improvements.
- BlockSuite is already lazy-loaded. Preserve its canonical adapter, constructor
  names required by dependency injection, recovery journal and save guards.
- Both `workspaceClient.ts` and `workspaceDb.js` declare database schemas.
- Existing smart search supports substring text, quoted phrases, board, domain,
  type, time, inbox, task-status and relationship-related filters.

## Approach and alternatives

Use scoped repository queries and independently subscribed views over the existing
Dexie database. This removes whole-library work from routine board interactions
without creating another content store.

Rendering-only optimization is smaller but leaves database hydration and broad
refresh costs intact. A separate search engine/worker-backed content store adds
synchronization and migration complexity before measurements justify it. Neither
is the selected approach for this milestone.

## 1. Data access boundaries

Replace the universal UI snapshot contract incrementally with these read scopes:

- Shell: board/folder navigation metadata, saved views and aggregate counts.
- Active board/page: its placements, referenced objects, assets and necessary links.
- Library: a query result page, continuation information and loading/error state.
- Inspector: selected object by ID, plus its projects, memberships, tasks, incoming
  and outgoing relationships and bounded activity results.
- Expanded hierarchy: children/members for the expanded branch, fetched on demand.
- Graph: explicit board, project or selected-object neighborhood scope. Larger
  scopes load progressively, disclose partial results and provide expansion.
- Auxiliary dialogs: load their data when opened, rather than through shell startup.

Full exports, imports and explicitly requested whole-library analysis can still
process the full dataset. Do not disguise partial data as a complete export,
relationship collection, project, count or AI context.

Every migrated consumer must declare its scope. Do not silently pass a partial
array to a helper that assumes it contains all Brain objects. Fetch object details
by canonical ID when selecting a result outside the active board.

## 2. Paging, ordering and search

Use keyset/cursor paging with an ID tie-breaker wherever the selected ordering has
an appropriate index. Default result pages contain 50 objects. Continuations are
bound to the query, scope, ordering and fixed reference time for relative dates.
Changing these inputs resets continuation state and returns to the first page.

Reuse the existing search parser and matching rules as the behavioral reference.
Do not substitute token-prefix matching for substring or quoted-phrase matching.
Use indexes to narrow candidates when they preserve those rules. Unsupported
predicates use bounded, cancellable candidate batches with an explicit searching
state; broad substring searches may still examine many records. They must not
accumulate full object bodies or block the interface until a full scan completes.

Keep existing title/status/project and saved-view behavior. Ordering that cannot
be reproduced by a database index needs an explicit compact query projection or
incremental ordering strategy, not an unnoticed change of sort semantics. Derived
indexes/projections must remain rebuildable from canonical data, never content
authorities. Document their memory cost separately from hydrated object bodies.

Preserve customized tile order across page boundaries. No duplicates or omissions
in a stable dataset, including duplicate titles/timestamps and missing optional
fields. During concurrent writes, reset an affected cursor chain and refresh the
visible page; do not promise a frozen snapshot across multiple user interactions.
Distinguish a confirmed empty result from loading, cancellation or query failure.

Counts must describe their actual scope. Use indexed counts where available;
otherwise show loaded-result counts and whether more results remain instead of
inventing a total or eagerly rescanning solely for a page count.

If new indexes are necessary, update both database constructors consistently and
test upgrade from version 4 with existing records, open-tab version changes and
background capture. Preserve canonical IDs and all private recovery tables.

## 3. Refresh and editing safety

Subscribe each scope to the records/ranges it actually reads. Handle inserts,
updates, deletes, cross-tab writes and background captures, including mutations
that do not change row counts. Coalesce bursts; ignore obsolete query responses.

Keep current content visible during background refresh. Reserve blocking loading
states for initial loading or a scope with no usable data. Report errors with a
retry action; never represent failed queries as an empty library.

Maintain selection by canonical ID. Fetch independently when the selected object
is outside the current result page. Clear it only after confirmed deletion or an
existing navigation rule, not because a page refresh omitted it.

Do not remount an active editor merely to refresh another view. Preserve existing
flush-before-navigation, revision conflicts, acknowledged recovery journals,
restore guards and protections against out-of-order requests. Private drafts and
revision history remain excluded from ordinary search and AI context.

## 4. Rendering and bundle work

Window long Explorer lists and expanded hierarchy results. Keep table/tile page
sizes bounded; window additional long collections where measurement shows a need.
Keep the focused or dragged item mounted until the interaction finishes. Provide
keyboard navigation that scrolls new targets into view, correct accessibility
positions and names, and no inaccessible offscreen duplicate controls.

Use the existing graph library's supported visibility optimizations before adding
custom culling. Preserve persisted nodes/connectors, selection, hit testing and
offscreen-to-onscreen navigation. Profile the native BlockSuite canvas separately;
do not remove canonical objects just to improve a rendering benchmark.

Measure initial New Tab resources, first editor-open resources and total extension
size separately. Audit eager graph/editor-related imports and defer optional heavy
views and tools until needed. Remove unused imports/assets only with dependency
and license checks. Keep local syntax highlighting, MV3 CSP, pinned compatible
BlockSuite dependencies and required constructor names working. Do not replace
the editor or change its dependency versions as part of bundle trimming.

## 5. Verification and acceptance

Create reproducible isolated-profile fixtures with 1,000, 10,000 and 50,000 objects.
Cover both a small active board with a large unrelated library and a large active
collection/graph. Include relationships, folder memberships, tasks, representative
note bodies and duplicate sort keys. Never seed the user's personal profile.

Capture baseline and upgraded measurements on the same machine and production
build settings: cold startup, warm query/page navigation, typing/search latency,
scroll interaction, mounted node counts, hydrated records, resource bytes and
available browser memory metrics. Record fixture shape, browser/build versions,
sample count, medians and variability. Separate database-only tests from real
browser results. Do not advertise a speedup until it is measured.

Deterministic gates:

- Loading a fixed board must not hydrate unrelated library object bodies or all
  placements/relationships. Result hydration is bounded by the requested scope.
- A library page returns at most 50 objects; scanning work is measured separately.
- Indexed page navigation does not skip an ever-growing number of preceding rows.
- Mounted list rows stay bounded by viewport, overscan and pinned interaction rows.
- Stable-dataset traversal returns every match exactly once in the expected order.
- Out-of-order queries, concurrent edits and deletions do not corrupt selection or
  saved content; same-count cross-tab updates become visible.
- Core workflows, keyboard operation, native connector gestures, backup/restore,
  recovery and source-linked object identity retain regression coverage.
- Report measured bundle reductions and all remaining heavy dependencies honestly.

Run lint, formatting, both TypeScript checks, the full unit/integration suite,
production MV3 build and browser regression suite after implementation. Add
failing-first tests for new query/refresh behavior and regressions. Finish with an
independent review focused on incomplete scopes, ordering, stale results, schema
parity, keyboard/drag behavior and recovery safety.

## Delivery boundary

Deliver changes, benchmark tooling/results and updated documentation on the new
branch only. Upgrades 3-7, cloud sync, live provider connectors and new AI behavior
are out of scope. A faster microbenchmark alone does not complete this milestone.

This written spec awaits user review before the implementation plan is written.
