# Large native BlockSuite board performance

Date: 8 October 2026. Status: written design awaiting user review; not implemented.
Predecessor: [local search/background indexing](2026-10-08-local-search-index-design.md).
Reference application: `c552110`; reporting checkpoint `cb36b51`.

## Intent and scope

Optimize the existing AFFiNE/BlockSuite document, edgeless and mixed workspace after the search stage. Keep original Brain identities, complete page presentation, semantic relationships, rich editing, native connector routing, acknowledged journals and guarded recovery. This is not a new canvas implementation, BlockSuite version upgrade or promise that 50,000 editable cards fit cheaply in memory.

The published benchmark certifies large-board navigation/search only. It opens the native editor on 50-reference boards; baseline native opening on 1,000 cards stalled, including teardown. Start by separating page data loading, projection construction, reference subscriptions, first paint and interaction/save costs. Do not rebrand navigation results as native-editor capacity.

## Existing boundaries

- `AffineWorkspace.tsx` loads a complete canonical page and mounts the native adapter for actual board/mode changes. Generic data refresh must not remount it.
- `blocksuitePageProjection.ts` creates a transient Yjs/BlockSuite page, all reference notes, groups and connectors, then mounts the selected renderers. Group ancestry lookup and child grouping currently revisit arrays.
- `blocksuiteBrainReference.ts` creates object subscriptions and content/asset/rich-editor resources per connected reference.
- `blocksuiteWorkspaceAdapter.ts`, content sessions, layout queue and journals own flush/conflict/recovery. They are correctness boundaries, not disposable optimization scaffolds.

## Chosen approach and alternatives

Keep a complete transient page model, but build it cooperatively and hydrate expensive reference content only when required. Reuse the installed BlockSuite geometry/viewport APIs and adapter boundaries; replace repeated array lookups with canonical-ID maps. Preserve existing rendering components and controllers.

Worker-only page construction is not selected: DOM/editor/Yjs/controller lifecycle is main-thread work. Replacing BlockSuite or persisting its native document would create a much broader refactor and risk a second content authority. Removing offscreen blocks from the page model is rejected: it can break connectors, groups, Fit view, export, selection and recoverable geometry. Deferred content rendering must not mean deleted model references.

## Measurement before optimization

Use disposable synthetic profiles and frozen source/artifacts. Capture separate timings for canonical page load, projection creation, renderer readiness, first visible reference and first usable editing action. Record main-thread long tasks where available, mounted rich editors/subscriptions/assets, heap estimates and input/pan latency. Clear ownership of timers, profiles and processes is mandatory.

Use 50, 250, 500 and 1,000 native placements with notes, conversations, local raster assets, tasks, groups and connectors; document/edgeless/mixed modes have separate results. Repeat successful cases five times. A timed-out native case is a failed capacity probe, not a zero or omitted result. Keep stress tests in a supervised process with bounded owned-profile teardown; do not repeat the prior indefinite teardown problem.

Keep the 1k/10k/50k library matrix for a fixed 50-reference board to expose unrelated-library costs. Once 1,000-reference native cases work, 5,000 is an opt-in follow-up probe, not an acceptance promise. Do not run 50k native stress as an ordinary navigation benchmark.

## Projection construction and cancellation

Build maps for entity, placement, group and connector IDs once per snapshot. Resolve group ancestry with memoized parent lookup and validated cycle guards; build group children in one pass. Sorting retains canonical presentation order and tie behavior.

Create notes, groups and connectors in bounded batches of at most 50 model operations before yielding to the event loop. Do not add listeners until their hydration suppression is established. A cancellation flag is checked between batches; navigation/disposal cannot let late work attach to a new board or publish commands into a closed session. The mount owns and disposes its partial document/collection/resources even if cancelled before returning the adapter. The outer adapter likewise disposes newly created content/layout sessions and timers if projection mounting fails or is cancelled; cleanup must not depend on receiving the final mounted adapter.

Show native workspace preparation progress and a safe cancel/navigation action when there are no edits. Suppress geometry/connector/viewport autosaves caused by initial hydration. Enable interaction only after the complete projection and required controllers are ready; no half-projected user edit is silently accepted. On failure, expose Retry while retaining usable shell navigation and canonical content.

Do not infer successful saves from mount completion. Existing journal acknowledgement and canonical-save status remain separate.

## Lazy reference content

Every canonical placement remains represented in the native page model, with persisted dimensions and object/placement IDs. Its lightweight reference shell supports identity, title, selection and declared geometry without loading conversation bodies, file bytes or creating a rich-text editor for an offscreen card.

Use a page-owned hydration coordinator rather than independent unbounded eager work. Document/mixed panes observe visible reference elements with overscan. Edgeless visibility uses actual BlockSuite viewport coordinates and placement bounds; confirm the installed viewport center/rect types and supported lifecycle before integration. Explicitly pin selected, focused, dragged and dirty references. Collapsed references retain valid shells and no unnecessary body resources.

Hydrate rich text, conversation display, tasks and assets only for visible/overscan or pinned references, with bounded concurrent loads (initial maximum four). Cancel obsolete requests by generation; revoke object URLs and dispose observers on actual release. A reference becoming offscreen cannot discard a dirty canonical session, detach a focused input or interrupt a drag. Keep dirty content resources until saved/reconciled or the existing explicit discard flow completes.

Use scoped, batched object observation for the currently needed shells/content rather than a complete-library subscription. Cross-tab canonical changes still update visible objects; save conflict checks read fresh storage. A background metadata refresh must not reset camera, selection or content sessions. Objects missing from storage show unavailable state rather than being reconstructed from cached editor content.

Complete conversation content remains canonical and unchanged. This slice defers hydration; it does not truncate a conversation or change message order. Extremely long visible conversations/rich documents remain a separate rendering limit unless measured and explicitly addressed in this stage's implementation plan.

## Operations and invariants

- Fit view includes offscreen placements using persisted geometry. Connectors between represented endpoints survive culling; native routing, anchors, orthogonal bends, retarget/cancel and semantic relationships retain their current contracts.
- Page-only remove and unlink-everywhere remain distinct. Groups/collapse/order retain canonical presentation; no shadow tree database is added.
- Toolbar/picker options backed by large page arrays become searchable/paged/windowed controls where measurement confirms mounted-option cost. A selected off-page ID still resolves independently. Do not silently truncate possible endpoints or pages.
- Open/duplicate/export/history remain complete-scope operations. Deferred bodies are fetched explicitly when a complete operation needs them, not exported as empty placeholders.
- One active editor session persists through pan, zoom, list paging, visibility changes and unrelated cross-tab refresh. Real board/mode transitions still flush or refuse to leave on conflict/failed saves.
- Journal limits, generation checks, saved preimages, Undo and reviewed history restore are unchanged. Cancelling preparation before editing creates no fake user history entry.
- No remote scripts, personal profiles, provider calls, new permissions or canonical migrations are required for this stage.

## Validation and success

Unit tests cover map/ancestry equivalence, visibility bounds and coordinate handling, hydration scheduling/pinning, cancellation generation, disposal and complete-operation behavior. Red/green regressions reproduce each confirmed hotspot/lifecycle bug before changing its implementation.

Real production MV3 browser tests cover native document/edgeless/mixed editing, scrolling/panning away and back, cross-tab updates, selected/dirty offscreen retention, Fit view, offscreen connectors, drag/retarget/bend/cancel, pending preparation cancellation/retry, child navigation, canonical reload, undo and acknowledged crash/restart recovery. Keep existing privacy and full backup tests intact.

Run full lint/format/types/unit/build and complete browser suites before claiming completion. Compare all successful native sizes/modes with five samples and report ranges, read/body/subscription/resource counts, long tasks and available memory. Separate initial construction improvements from body deferral and library scan improvements.

Success requires no correctness regressions, bounded expensive content hydration for offscreen clean references, responsive cancellation, and measured improvement over the native baseline. A 1,000-reference board should become usable in the supervised probe; if complete BlockSuite model allocation still prevents that, report the failed capacity honestly and retain the safe prior path rather than claim certification. Median latency and memory targets are not reasons to remove objects, weaken assertions or hide failures.

## Delivery boundary

Implement after the search stage is independently verified and saved. Remain on the isolated performance branch; preserve `feature/browser-resources-inspector` and the pre-stage commit. Record fixed findings separately from reviewer approval. Update README, current-build builder instructions, status and native-performance report with measured limits. Do not claim advanced Canvas parity, continuous provider ingestion, cloud sync or universal undo is included.

This written spec defines the selected design, not delivered features. Written-spec review and a reviewed implementation plan are still required before code changes.
