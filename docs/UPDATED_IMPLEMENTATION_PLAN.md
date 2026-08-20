# Browser OS New Tab — Updated Implementation Plan

Based on repository audit at commit `183f47d` on 19 August 2026.

## Planning principles

1. Preserve the working bookmark desktop, folder/document windows, drag/drop, search, customization, backup, and optional sync.
2. Introduce browser/persistence adapters before framework or data migrations.
3. Separate global identity, hierarchy, board layout, relationships, browser metadata, and UI state.
4. Keep every slice independently buildable and browser-testable.
5. Keep AI optional and local core behavior fully usable without credentials.
6. Do not implement or infer unavailable provenance.
7. Keep GBrain `DECISION DEFERRED`.

## Slice 0 — Audit and baseline (completed)

Goal: establish the real starting point and migration constraints.

Features:

- Full feature matrix.
- Existing dependency evaluation.
- Target architecture and smallest safe migration path.
- Baseline build verification.

Files/subsystems:

- `docs/CURRENT_STATE_AUDIT.md`
- `docs/OPEN_SOURCE_EVALUATION.md`
- `docs/ARCHITECTURE_ALIGNMENT.md`
- this plan

Dependencies: none.

Migration: none.

Tests:

- `npm install`
- `npm run build`
- record missing test/lint/type-check scripts

Acceptance criteria:

- Working legacy behavior is explicitly preserved.
- Missing and partial features are not reported as implemented.
- High-risk architecture gaps are identified before feature code.

Risk: low.
Modifies existing working behavior: no.

## Slice 1 — Browser Resources + Shared Inspector (completed 19 August 2026)

Goal: make the existing OS desktop a useful browser command center without replacing the current bookmark desktop.

Features:

- Functional desktop launchers for Bookmarks, Open Tabs, History, Search, and Settings.
- Multiple resource windows using the current movable/resizable window manager.
- Current browser windows/tabs listing and focus/open actions.
- MV3 background service worker for tab-session `Opened` tracking.
- Observable opener provenance where available; neutral unknown state otherwise.
- Bounded local history search.
- Domain first/last opened metadata derived from accessible history.
- Reusable collapsible inspector with Details, Tab / Session, Domain, and Actions sections.
- Exact `DD/MM/YYYY HH:mm` formatting.
- No accumulated total-open-time tracking.

Files/subsystems:

- `manifest.json`
- new `background.js`
- new `src/browserData.js`
- new `src/browserResources.js`
- new `src/inspector.js`
- `index.html`
- `style.css`
- `build.js` only if the current script discovery requires it
- window-state persistence compatibility in `src/options.js`

Dependencies: native Chrome `tabs`, `windows`, `history`, `storage`, `bookmarks` APIs; existing window manager. No new npm runtime packages.

Migration:

- Add versioned `chrome.storage.local` tab-session payload.
- Existing `localStorage` and IndexedDB data remain untouched.
- Resource-window persistence uses a new recognized type without changing legacy folder/document records.

Tests:

- Unit tests for date formatting, URL/domain normalization, and provenance neutral states.
- Mock adapter tests for tab grouping and domain aggregation.
- Extension-browser smoke test with seeded tabs/history/bookmarks.
- Verify multiple simultaneous resource/folder/document windows.

Acceptance criteria:

- Every launcher performs a visible action.
- Tabs and history are real browser data, not fixtures.
- A pre-existing tab is marked first-observed; a newly observed creation event has a tracked opened time.
- Missing `Opened From` / search evidence displays `Unknown` or `Not available`.
- Domain timestamps are formatted exactly and history queries are bounded.
- Bookmark desktop behavior and build remain intact.

Risk: medium because new permissions and a service worker are introduced.
Modifies existing working behavior: yes, additively; no bookmark/document behavior should change.

## Slice 2 — Verification harness and legacy safety net

Goal: prevent regressions before data/framework migrations.

Features:

- Test runner and browser API mocks.
- Extension fixture profile with bookmarks, folders, documents, tabs, and history.
- Browser smoke runner for the unpacked `dist` extension.
- Lint/format checks for legacy and new code.
- Accessibility smoke checks for launchers, windows, rows, and inspector.

Files/subsystems: package scripts, tests, test fixtures, CI packaging workflow.

Dependencies: choose a minimal maintained test runner and Chrome extension automation only after a small proof.

Migration: none.

Tests: this slice is the test infrastructure; CI must run build + unit + browser smoke.

Acceptance criteria:

- Existing desktop/folder/document behavior has reproducible smoke coverage.
- Slice 1 metadata cases are deterministic under mocks.
- CI produces a loadable extension artifact rather than deploying raw repository content.

Risk: low.
Modifies existing working behavior: no.

## Slice 3 — Versioned shared workspace model

Goal: introduce one durable identity and relationship foundation beside legacy stores.

Features:

- Dexie schema and migrations.
- Entities, source refs, pages, domains, folders/memberships, boards, placements, relationships, tab sessions, assets, settings.
- Canonical URL/domain normalization.
- Chrome bookmark projection with native source IDs.
- Read-only migration report for legacy layout/documents/blobs.

Files/subsystems: new typed data/model layer, browser adapters, migration tests.

Dependencies: Dexie; TypeScript boundary. Do not combine with full UI framework migration.

Migration:

- Copy/project legacy records into new tables without deleting sources.
- Record migration version and per-record errors.
- Support read-through fallback during transition.

Tests:

- Fresh DB, upgrade, interrupted migration, duplicate URL/bookmark, malformed legacy document, and rollback/read-through cases.

Acceptance criteria:

- One page entity can be referenced by several bookmarks/tabs/boards.
- Board placements are independent of entity identity.
- Legacy data remains recoverable and the old UI still opens.

Risk: high.
Modifies existing working behavior: adds a parallel model; legacy writes remain authoritative until parity.

## Slice 4 — Typed WXT/React shell migration

Goal: replace the fragile global-script build without a feature rewrite.

Features:

- WXT MV3 config and entrypoints.
- React + TypeScript application shell.
- Typed browser adapters and model hooks.
- Compatibility mounting of legacy desktop modules or one-by-one component replacement.
- Extension artifact packaging and dev profile workflow.

Files/subsystems: build config, new-tab entrypoint, service worker, package scripts, CI.

Dependencies: WXT, React, TypeScript. Plasmo is not installed.

Migration: no user data migration; compatibility adapter reads existing local state.

Tests: old/new build parity, manifest permission diff, unpacked load, bookmark CRUD, resource windows.

Acceptance criteria:

- No loss of legacy desktop features.
- Typed build, lint, tests, and extension packaging pass.
- New shell reads existing user data without reset.

Risk: high.
Modifies existing working behavior: infrastructure and rendering ownership; must be staged behind parity evidence.

## Slice 5 — Multiple boards + mixed Canvas

Goal: deliver the first complete shared-model workspace view.

Features:

- Board create, rename, duplicate, delete, switch, organize, search.
- Mixed placements for pages, bookmarks, open tabs, folders, plain/rich notes, images, screenshots, files where allowed, groups, frames, and analysis cards.
- Drag, resize, multi-select, pan, zoom, duplicate, delete, grouping, persistence.
- Direct current-tab placement without bookmarking.

Files/subsystems: board repositories/selectors, Canvas components, asset storage, board windows.

Dependencies: React Flow / XYFlow after a focused spike.

Migration: legacy desktop positions remain desktop-only; do not silently convert the desktop into a board.

Tests: reload persistence, multiple-board independence, same entity on several boards, direct tab placement, asset round trips.

Acceptance criteria:

- All board lifecycle operations work and persist.
- Same page identity is reused across placements.
- Moving on one board does not affect another or native hierarchy.

Risk: high.
Modifies existing working behavior: adds boards; desktop remains available.

## Slice 6 — Explorer + shared organization

Goal: add the mixed-object hierarchy without duplicating bookmark/page/note data.

Features:

- Expandable tree, persistent mixed workspace folders, search/filter, open-tab indicators.
- Drag/drop reorganization with explicit distinction between native bookmark moves and workspace membership moves.
- Shared rename and selection/focus.

Files/subsystems: folder membership model, explorer components, browser projections, shared UI state.

Dependencies: revalidate React Complex Tree; avoid paid core requirements.

Migration: project native bookmark tree and workspace folders into one typed tree while retaining source distinctions.

Tests: cross-view rename/move, duplicate prevention, deep nesting, keyboard navigation, large trees.

Acceptance criteria:

- No shadow copies are created.
- Edits propagate to Desktop, Explorer, Canvas, and inspector.
- Native bookmark moves happen only after an explicit matching action.

Risk: high.
Modifies existing working behavior: extends folder semantics; preserves native bookmark behavior.

## Slice 7 — Complete inspector + card metadata

Goal: make the Slice 1 inspector universal across all entity types and views.

Features:

- Details, History, Tab / Session, Domain, Connections, Notes, Boards, AI / Analysis, Actions.
- Optional metadata toggles on cards.
- Shared selection/focus across Desktop, Explorer, Canvas, and later graph views.

Files/subsystems: inspector registry, selectors, UI state, card settings.

Dependencies: shared model and core views.

Migration: map legacy bookmark/document property actions into inspector action adapters.

Tests: same entity/selection across views, unavailable metadata states, action authorization, card preference persistence.

Acceptance criteria:

- Inspector content is entity-derived, not view-copied.
- Minimal cards remain possible.
- Unknown provenance remains neutral everywhere.

Risk: medium.
Modifies existing working behavior: replaces some modals only after parity.

## Slice 8 — Shared relationships + Mind Map + filtered Graph

Goal: make relationships reusable and renderer-independent.

Features:

- Manual typed/labeled relationships with origin/confirmation.
- Canvas connection tools backed by relationship records.
- Topic-centered Mind Map using shared objects/edges.
- Filtered Graph view with selective loading.
- Cross-view selection and inspector.

Files/subsystems: relationships repository/selectors, Canvas edges, Mind Map layout, Graph filters.

Dependencies: XYFlow first; dedicated Cytoscape/Sigma decision remains evidence-based.

Migration: no renderer edge may become the source of truth.

Tests: create/update/delete relationship in one view and observe every other view; load/performance limits.

Acceptance criteria:

- One relationship ID is reused across views.
- User and AI-suggested relationships are distinguishable.
- Full history is never rendered by default.

Risk: high.
Modifies existing working behavior: adds views and connection tools.

## Slice 9 — Unified local search

Goal: search every supported local object without cloud services.

Features:

- Search bookmarks, folders, pages, domains, tabs, notes, boards, files, analysis cards, and relationships.
- Type/source/board filters and keyboard navigation.
- Preserve existing bookmark recency behavior.
- Add command actions only if they improve measured workflows.

Files/subsystems: local indexes, search service, search UI, optional command registry.

Dependencies: shared model; virtualization only if measured.

Migration: import legacy bookmark click recency as a separate signal, not browser history.

Tests: ranking, filters, large data, offline behavior, permission-denied states.

Acceptance criteria:

- Core search works with all connectors disabled and offline.
- Results reuse entity identity and selection.

Risk: medium.
Modifies existing working behavior: expands/replaces quick search after parity.

## Slice 10 — Screenshots and assets

Goal: add first-class local image/screenshot objects.

Features:

- Upload images/screenshots.
- Capture visible tab only after explicit user action and justified permission.
- Attach assets to pages/notes, place on boards, connect by relationships.
- Preserve original blob and metadata locally.

Files/subsystems: asset repository, capture adapter, board nodes, inspector.

Dependencies: `activeTab` permission only when capture ships; no `<all_urls>` by default.

Migration: existing custom icons/background blobs remain separate unless explicitly imported.

Tests: permission grant/denial, capture limits, blob persistence, reload, export/import.

Acceptance criteria:

- Images work without AI.
- Screenshot is a dedicated entity type.
- Capture is explicit and scoped.

Risk: medium.
Modifies existing working behavior: additive.

## Slice 11 — Optional AI connector layer

Goal: add explicit provider-neutral analysis after the local workspace core is useful.

Features:

- Connector action interface.
- Gemini page/image/selection/board analysis adapter.
- Save result as analysis entity or note.
- Relationship suggestions remain unconfirmed until user action.
- NotebookLM explicit source-bundle export evaluation and implementation if supported.

Files/subsystems: connector registry, credential/config storage, action UI, provenance, exports.

Dependencies: provider setup chosen at implementation time; no mandatory provider.

Migration: none; AI records are separate and removable.

Tests: connector disabled, invalid credentials, cancellation, provenance, no silent writes/sync.

Acceptance criteria:

- Entire app remains usable without provider configuration.
- Every cloud action is explicit.
- AI output never overwrites source content silently.

Risk: high for privacy/provider drift.
Modifies existing working behavior: additive and optional.

## Slice 12 — GBrain decision only

Goal: decide, not assume, whether GBrain is a connector, deeper memory layer, or hybrid.

Deliverable: `GBRAIN_INTEGRATION_DECISION.md` comparing data ownership, duplication, sync, offline behavior, security, runtime/API needs, value, complexity, and overlap.

Dependencies: stable shared model and evidence from real workflows.

Migration: none until approved.

Acceptance criteria: documented recommendation reviewed before implementation.

Risk: decision risk only.
Modifies existing working behavior: no.

## Ongoing performance and reliability gates

At every slice:

- Test large bookmarks, deep folders, many tabs/history records, boards, and filtered graph subsets appropriate to the slice.
- Prefer bounded queries, indexes, lazy loading, and debounced writes before adding virtualization.
- Measure initial load, memory, DOM/node count, query time, and interaction latency.
- Preserve local-only behavior and explicit permission-denied states.
- Keep backup/export versioned before irreversible migrations.

## Immediate execution order

1. Slice 1 implementation and verification completed on 19 August 2026.
2. Next: add the Slice 2 safety harness before any structured-data migration.
3. Review the Slice 3 schema and migration fixture plan before installing Dexie.
4. Do not start Canvas/Graph or AI work on top of the current implicit stores.
