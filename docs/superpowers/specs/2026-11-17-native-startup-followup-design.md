# Native startup and cancellation follow-up

Date: November 17, 2026. The user approved the recommendation to profile native construction/rendering, optimize the measured operations and cancellation, then repeat five-sample benchmarks. Continue the previously selected native execution method. Routine implementation choices below are the author's calls within that approved scope. Work on `MiniPCCodex/native-startup-performance`, preserving published `feature/large-library-performance` at `b0c97d0`.

## Intent

Make a complete 1,000-reference document/canvas/mixed workspace usable and keep cancellation responsive. Preserve the existing New Tab entry point, canonical Brain, complete native model, original object/placement identities, geometry, groups, semantic connectors, rich editing, acknowledged journals and recovery. Large-library memory/save costs follow this pass; no provider or unrelated feature expansion is included.

## Evidence before changing product code

The unchanged `b0c97d0` application was copied into an immutable diagnostic artifact. One synthetic 1,000-reference document probe captured a Chromium CPU profile around workspace opening. It failed the original 120-second readiness assertion at preparation 4055/4105 and the owned 180-second deadline; profile output survived. A locked generated profile was retained in the structured failure, then removed only after checking that no live Chrome process used its exact path. This is an instrumented diagnostic, not an acceptance latency sample.

The approximately 141-second capture contains about 59.7 seconds in connector-label callbacks in `AffineWorkspace`, 47.8 seconds under native `getParent`, and 15.0 seconds under surface/flavour queries. These are overlapping inclusive stack categories and must not be added as independent CPU totals. The label callbacks repeatedly search entities and placements inside each other on every progress-driven render. Installed BlockSuite 0.19.5 implements parent lookup by walking the native tree, root lookup by scanning all Yjs blocks, and flavour lookup by scanning all models. Tiny repeated queries therefore revisit an increasingly large document.

## Approaches considered

1. **Indexed view lookups and temporary preparation indexes, then time-budgeted slices — selected.** Remove the measured repeated searches while preserving native writes and notification timing. Keep the indexes local to the disposable view/document and restore native methods before editing starts. This fits the approved approach and keeps the editor/storage architecture. Risk: an index could become stale or change native API semantics; explicit fallback, restoration and equivalence tests are mandatory.
2. **Batch multiple native writes inside outer transactions.** This might reduce observer work, but our next operation reads models created by the previous one. Installed models are published by transaction observers, and the transaction wrapper catches/logs errors. An outer transaction can change model availability and error behavior. Defer unless the selected changes leave a measured bottleneck requiring it.

The existing requirements rule out removing offscreen model references, introducing another content database, replacing the renderer or upgrading BlockSuite as a shortcut. Only expensive content bodies remain deferred as before.

## View work

Build memoized entity and placement maps from each acknowledged page snapshot. Resolve selected cards, endpoint titles and connector labels through those maps, preserving missing-object labels and duplicate references. A progress/status update must reuse the maps.

Create layout controls on their first disclosure opening. Keep them mounted after that so closing/reopening the disclosure retains an unfinished geometry/style form. All cards and endpoints remain selectable; no list truncation is introduced. Native snapshot acknowledgements still refresh untouched fields and prune deleted choices without remounting the editor or discarding deliberate form edits.

## Preparation index

Add one replaceable, per-document adapter using public installed APIs only. It is installed on a newly loaded empty transient document and owns a parent-ID map plus known root/surface IDs. All projection block creation goes through its `addBlock`, which obtains IDs from native `doc.generateBlockId`, passes those IDs to the original native writer, and registers parent/root/surface metadata before native model-construction callbacks. Original schema validation, transactions and notifications are retained.

During this controlled construction/mount phase, `getParent`, the root getter and exact single-surface queries can resolve through the derived indexes and native `getBlock`. Surface queries return fresh arrays of the original Block wrappers. Other flavour queries pass through unchanged. Known targets accept both model and string forms; unknown targets use the original implementation.

Guard direct/unplanned block creation, move/delete and callback/children updates before delegating to native writers. Also use the public `doc.spaceDoc` Y.Doc `beforeTransaction` event: outside an explicitly approved adapter write, disable the overlay before the transaction proceeds, regardless of which Doc/collection/undo/direct-Yjs handle initiated it. Each approved operation permits its first transaction only; an additional/reentrant observer transaction disables the overlay. Pane mounting is read-only with respect to this overlay, so any native write during mounting falls back. Unknown add/delete or a topology signal outside the expected parent is an additional fallback guard.

Ordinary `doc.updateBlock` props objects are approved non-topology writes, including initial edgeless/collapse/geometry and per-note index assignment. Their wrapper permits the first transaction automatically. Callback updates and objects containing children use native fallback. Controlled surface/group writes use an explicit mutation wrapper.

The boundary trusts the fixed installed schema defaults and original writer inside that one approved transaction. Arbitrary third-party schema/plugin code rewriting topology inside the same transaction is outside this adapter's supported construction contract. No plugins or user editing run during preparation. This boundary is an explicit author call, rather than a claim that post-observation alone makes arbitrary Yjs mutation safe.

Preserve original method/property descriptors, receiver semantics and captured-function fallback after disposal. Any uncertain mutation falls back to native APIs rather than guessing a parent. No private Yjs/BlockSuite fields, raw Y-map names, global prototypes or persistent caches are changed.

Restore the original APIs before declaring the page editable. Cancellation/error cleanup retains the lookup owner long enough for native pane/document disposal, then restores it idempotently; late work cannot reuse an active index on a closed document. The complete object/reference dataset remains native and canonical.

If a native writer logs/swallows a creation failure and returns an ID without the expected published model/flavour, the projection boundary throws and disposes; fallback alone is insufficient. Verify all known models and their actual `model.children` parent edges after construction and again before readiness, independently of the indexed parent getter. This includes the final reference so a last-operation failure cannot become false readiness. These two contracts answer the fresh builder check; they do not require a new user-facing feature choice.

## Work scheduling and cancellation

Retain the maximum of 50 operations per slice, and add an 8 ms elapsed-work budget checked after each operation. Yield before starting another operation once either limit is reached. Use the existing abort fence before/after operations and yields, with one injectable clock for deterministic tests. Preserve order, progress totals, error propagation and empty/last-slice behavior.

One synchronous native operation cannot be preempted; report observed slice/input/cleanup delays instead of promising an absolute bound that the library cannot honor. Keep the existing end-to-end cancellation measurement, and add event/feedback/cleanup attribution where useful. Cancel/retry must still create no canonical draft, revision or activity record, release owned resources and reload a fresh complete snapshot.

## Validation and delivery

Reproduce the expensive lookup/control behavior before changing it. Tests cover native-equivalent root/parent/surface results, fresh arrays, unknown/mixed queries, preserved IDs and descriptors, unexpected topology/creation fallback, nested/cancelled disposal, empty/nonempty documents, time-budgeted yields and operation failures. Browser checks cover initially deferred controls, retained form drafts across disclosure changes, complete models/connectors, native move/delete/collapse, camera/session identity, cancel/retry and crash/recovery.

Run source checks, build, then browser checks sequentially. Freeze artifacts before measurements. Measure 50/250/500/1,000 references in document/canvas/mixed modes, five samples for successful groups, retaining failures and stopping repetitions after failure. Record full-model counts, body concurrency at most four, initial visible readiness, edit/save/reveal/pan, long tasks, cancellation and diagnostic heap separately. CPU profiles are diagnostics and do not enter latency medians. Repeat fixed-board library checks only if shared data/scope changes or evidence justifies them; full 50k native stress remains excluded.

Aim for a 1,000-reference readiness median below 10 seconds and cancellation confirmation below one second on the benchmark machine. These are goals to measure, not promises or reasons to alter deadlines/assertions. If a target remains unmet, identify the remaining hotspot and retain the failed result. Preserve all earlier evidence and use a clean final build/CI check before pushing only the new branch. No PR, merge, deployment or personal-profile installation.
