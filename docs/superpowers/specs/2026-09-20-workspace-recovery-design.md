# Workspace recovery, version history and conflict comparison

Status: conversational design approved by the user's September 20 "Proceed". This written specification awaits review. No implementation is included in this document.

## Purpose and sequence

The user requested all three recommended upgrades, one by one:

1. Durable local draft recovery, version history and conflict comparison.
2. Complete connector routing, richer block controls and nested-page navigation.
3. Benchmark and improve large-library performance and editor bundle size.

This specification covers only the first upgrade. Finish and verify it before implementing the second; do not bundle unrelated editor features or performance refactors into recovery work.

Success means a user can recover locally persisted unfinished edits after an interrupted editor session, inspect and restore earlier note/page states, and resolve conflicting edits without silently replacing someone else's newer work. Preserve the desktop, browser capture, Explorer, existing Brain identities, privacy controls, backups and BlockSuite adapter.

## Current implementation evidence

- Baseline: commit `f68f042` on `feature/browser-resources-inspector`; the checkout was clean when this design began.
- `pageEditorSession.ts` holds drafts and a single content undo entry in memory. Revision checks retain conflicts only while the session remains alive.
- `pagePersistenceQueue.ts` drains content and layout writes and protects in-flight viewport commands from coalescing. These regression guarantees must remain intact.
- `richContentRepository.ts` writes content, derived text, mentions and activity transactionally.
- `pageRepository.ts` checks page revisions and fingerprints, while its presentation undo map is session-local.
- `workspaceClient.ts` and legacy `src/workspace/workspaceDb.js` both define database version 3. Both must understand the next schema; `schemaCore.js` and export format handling must be updated consistently.
- Both export paths enumerate database tables. New private recovery tables must not accidentally enter ordinary exports, search or AI context.

## Chosen approach

Add recovery records and bounded revision snapshots to the existing local Dexie database. Current entities, placements, relationships and page settings remain authoritative. Recovery records are unapplied intent; history records are explicit past states. Neither is a second live content store or an AFFiNE/Yjs database.

This is preferred over a complete event-replay architecture, which would require converting every legacy writer and make restoration dependent on long event chains. Session storage alone does not meet restart recovery requirements. No cloud service, provider credentials, network transmission, collaboration backend or new runtime dependency is required.

## Data boundaries

Add an additive database version with two indexed tables:

- `workspaceDrafts`: versioned records identified by editor-session ID and target (`entity` or `page`), with board/entity IDs, generation, timestamps, base revision/fingerprint, base snapshot, proposed content or ordered commands, and per-operation IDs. Index session, target, board and updated time. Sessions receive new random IDs, never a shared global "current draft" key.
- `workspaceRevisions`: immutable versioned snapshots with ID, target kind/ID, timestamp, reason, source session when available, source canonical revision, validated snapshot and serialized byte size. Index target plus time and global time for bounded listing/pruning.

Content snapshots contain the note/document title and validated rich content, not arbitrary entity metadata. Page snapshots contain placements and presentation, not embedded object bodies, asset bytes, project membership or memory policies. Connector records retain semantic relationship IDs rather than cloning relations.

Records must have strict type/size validation when written and read. Old database rows are preserved; no bulk history backfill or migration of Yjs documents. Existing targets get a baseline snapshot at their first covered mutation after upgrade.

## Durable editing and save lifecycle

1. Each validated edit updates the visible draft immediately and queues a local journal write without waiting for the 400 ms canonical autosave timer. A single writer per session serializes generations. Rapid edits may coalesce only generations not already being persisted or applied.
2. Display distinct states: saving locally, recoverable draft, saved to Brain, conflict and storage error. Only an acknowledged journal transaction earns the recoverable state; only the matching canonical generation earns saved. If newer edits exist, an older acknowledgement cannot mark them saved.
3. Applying a journaled operation commits the canonical mutation, its revision snapshot, and the exact operation acknowledgement/removal in one transaction. A crash cannot leave a committed connector command looking unapplied. Newer draft generations and other sessions' records remain untouched.
4. Layout commands are acknowledged individually in order, advancing the retained base snapshot/fingerprint. Content and page targets need not form one giant transaction. A failure leaves the remaining work recoverable and clearly identified.
5. Existing navigation guards flush journal writes and canonical operations to quiescence. Closing a component must not erase pending recovery records. Before-unload remains a warning, not the durability mechanism.
6. Quota/write errors retain the in-memory draft, block an unqualified saved state and offer retry/export. Do not silently discard older unresolved drafts to free space.

Guarantee boundary: recovery covers journal transactions that completed before interruption. A process/device failure before acknowledgement can lose the latest unpersisted input. Browser storage removal, extension uninstall and disk failure are outside this local guarantee. Do not describe this as absolute crash-proof storage.

## Recovery discovery and ownership

Show a Recovery entry in the workspace shell with pending-session counts, page/object names, timestamps and active-session indicators. It must be reachable even when a draft's original page is not selected. Fetch summaries first and payloads only for preview.

Normal editor writes may modify only their own session's pending records. Explicit user recovery/discard actions may mark or discard another session's reviewed generation, with generation checks, but cannot rewrite its draft payload. Use a short-lived local lease stored with the session's records (heartbeat every 15 seconds, expiry after 60 seconds); an unexpired lease is shown as active elsewhere, not assumed crashed. Hidden/throttled tabs can outlive leases, so lease expiry alone never authorizes takeover or deletion.

Recovery defaults to **Preview**, followed by an explicit copy into a new recovery session. The source draft remains until the user explicitly discards it; successful recovery marks that source generation as recovered so it is not advertised as unresolved. A later generation from the original session remains pending. Compare-and-swap generation checks protect every acknowledgement, discard and recovery marker.

Preview compares the stored base with current canonical state. Unchanged bases can restore through normal revision-checked save operations. Changed bases open conflict comparison; commands never auto-replay onto a changed page. Missing targets are exportable/discardable and are not silently recreated. A valid draft from an active session can be previewed but copying it requires an explicit warning/confirmation.

## Version history and retention

Expose History for the selected note/document and the current page. List newest first, 20 entries per page, with timestamp, source/reason and a preview. No full-library payload load is needed.

Capture meaningful changes through rich-text saves, note/document Inspector edits, history restores, supported page commands and page reference/layout mutations. Before backup import replaces an existing covered target, preserve its current state. Audit the legacy Canvas placement writers as part of implementation and route their covered layout writes through the same history boundary. Browser visits, chat imports and arbitrary entity types do not gain content history in this upgrade.

Deduplicate consecutive identical snapshots; an explicit restore records a new revision even when it matches an older historical snapshot. Do not create history entries for viewport-only pan/zoom changes; keep those changes in normal persistence and pending recovery. Initial target creation is recorded as a baseline. Board deletion retains existing history; board recovery uses the existing Trash mechanism before page history can be restored.

Default retention: at most 50 snapshots per target, 5 MiB of serialized snapshot data per target and 50 MiB globally. Prune oldest history records first within the same successful history-writing transaction; expose that history is bounded. Never prune pending drafts or canonical content. If a single proposed history record exceeds 5 MiB, reject the protected mutation with an actionable export/error rather than silently making an unversioned change. These are payload limits, not a promise about physical IndexedDB disk usage.

Provide explicit, confirmed deletion of history for a target. Keep unresolved drafts until explicit discard; no automatic expiry. Reuse existing rich-content validation limits and set a 5 MiB serialized limit per pending target record. At 50 MiB total draft payload, reject further journal growth with a storage warning and export option, not automatic cleanup. Allow acknowledgements/discards and shrinking edits to release space.

## Restore semantics

Restoring a content revision is a new canonical revision, with normal search/mention updates and an activity entry. Restore only the snapshot's title/content fields; preserve current identity, source, tags, project memberships and privacy metadata.

Restoring page history replaces only that page's presentation and references after preview. It does not delete objects/assets or recreate/delete shared semantic relationships. Validate every referenced object and connector relationship against current state. If required references are missing or semantic endpoints changed, block the restore, explain the missing dependencies and allow export; do not silently omit them or resurrect deleted content.

Read the latest canonical revision when preview opens and check it again transactionally when restoring. Another tab's intervening edit invalidates the preview and requires review again. Existing pending edits on the same target must be saved, exported/discarded or resolved first. Historical snapshots remain historical after restore and after backup import; they are never blindly bulk-applied as current state.

## Conflict comparison

Replace the blind conflict-replacement path with an explicit comparison of **Base**, **Current saved** and **Your draft**. Show title, rich block changes, formatting differences and text additions/removals. Use stable rich-block IDs where available; legacy content falls back to text comparison. Render all content as inert text/validated local rich content, never raw HTML.

Available choices:

- Keep current: confirm and discard only the reviewed draft generation.
- Use my draft: confirm replacement of the reviewed current revision; if it changed again, return to comparison.
- Combine manually: select current/draft versions per block and edit the resulting draft using the existing rich-content model. Preserve formatting and validate the result before committing. No automatic AI merge.
- Export draft: remains available regardless of conflict or missing target.

Layout comparison lists affected cards, geometry, groups, presentation and connector references. Users can retain current layout or explicitly apply the reviewed proposed layout under a fresh version check. Automated layout rebasing and semantic-link merging are not included. No option silently deletes or changes a shared relationship to make a page restore succeed.

## Privacy and export compatibility

Drafts/history are private local recovery data: no search indexing, graph projection, AI retrieval, provider upload or background sync. Historical content may contain information the user has since removed; state this in History and export descriptions.

Ordinary workspace exports exclude drafts/history by default in both React and legacy export paths. Add an explicit "Include recovery data and history" option with a sensitive-content warning. Draft JSON export remains available independently. Export compatibility advances to the new format version while continuing to accept versions 2 and 3.

Optional recovery imports are validated, size-bounded and namespaced with fresh local session/history IDs; they cannot overwrite local unresolved records, claim a live lease or restore canonical content automatically. Imported drafts start as inactive previews. If validation or limits fail, the import rolls back rather than partially importing recovery data. Ordinary imports leave existing local recovery tables untouched. Existing memory-policy preservation remains unchanged.

## Responsibility boundaries

- Recovery repository: validated records, generation checks, local leases, acknowledgement and recovery-copy lifecycle.
- History repository: snapshot capture, bounded queries/retention, preview and guarded restore.
- Session/queue integration: journal before canonical apply, truthful save status and retained in-flight generation guarantees.
- Comparison utilities: deterministic bounded block/text differences, no persistence or provider calls.
- React panels: recovery discovery, history preview and explicit conflict decisions; reuse current workspace navigation/session guards.
- Database/export adapters: matching additive schema on both entry points and intentional handling of private recovery tables.

The implementation plan should separate these modules and avoid turning the existing large workspace repository into a second recovery subsystem. Reuse mature local Dexie transactions and existing validation rather than introducing another editor/backend store.

## Acceptance and verification

1. Upgrade a populated v3 database through both entry points; reopen it through each without losing legacy data. An old open connection requests reload on version change rather than indefinitely blocking the upgrade.
2. Persist a draft, terminate the isolated browser session without normal editor cleanup, reopen the same profile and recover the exact acknowledged generation. Test content and layout independently.
3. Interrupt between journal creation and canonical commit, and after canonical commit. Replay never applies the same non-idempotent operation twice.
4. Two tabs edit the same object; their pending drafts remain separate. Compare shows base/current/draft, explicit resolution is revision-checked, and neither tab acknowledges the other's later generation.
5. Storage/quota failure, invalid drafts and journal-write failure remain visible; pending changes survive retry and export. No false saved/recoverable indicator.
6. Make several rich-note and layout edits, restart, list their history and restore a past snapshot as a new revision. Identity and other pages' object content remain unchanged.
7. Restore fails safely when current content changes after preview or when a page dependency is missing. Export remains possible.
8. Verify retention boundaries, identical-content deduplication, viewport exclusions and pending-draft non-eviction. Confirm history deletion removes only the named target's history.
9. Verify title edits, legacy Canvas layout writes and backup replacement participate in the documented history boundary; unrelated browser/provider capture still works.
10. Default exports and AI context exclude recovery tables. Explicit recovery export/import is validated and preserves existing local drafts and memory privacy choices.
11. Keep existing save-queue race regression tests; add real Dexie/fake-IndexedDB tests plus isolated MV3 browser tests for recovery, history and conflict decisions. No personal browser or provider account is needed.
12. Run lint, formatting, both TypeScript checks, all unit tests, production build and the full browser regression suite before calling upgrade one complete. Report actual results, limitations and independent-review availability.

## Scope exclusions and next gate

No cloud backup, multi-user collaboration, account integration, AI merge, complete audit history for every entity type, universal undo, connector-editor enhancements or large-library optimization in this first upgrade. Browser storage persistence is not an off-device backup.

Review this written specification before creating the implementation plan. The implementation plan will define the ordered changes, test cases and execution method; that plan needs approval before code changes. Subsequent upgrades remain queued, not completed by this document.
