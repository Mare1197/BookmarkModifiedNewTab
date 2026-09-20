# Workspace Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover locally acknowledged editor drafts after interruption, retain bounded note/page history, and resolve conflicts through explicit comparisons without replacing newer work silently.

**Architecture:** Extend the existing Dexie database with private journal and revision tables. Canonical content and layout repositories remain authoritative; session-scoped journals are unapplied intent, and snapshots are history. Canonical writes, history capture and journal acknowledgements share one transaction.

**Tech Stack:** Existing TypeScript, React, Dexie, BlockSuite 0.19.5, Node test runner, fake-indexeddb and isolated Chromium MV3 Playwright fixtures. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-workspace-recovery-design.md`, approved by the user's latest "Proceed". This implementation plan awaits review. The user's follow-up authorizes implementing the remaining suggestions with judgment; Native execution is selected under that discretion.

## Global Constraints

- This is upgrade one. Connector controls/page navigation and performance/bundle work remain upgrades two and three.
- Preserve the desktop, browser capture, Explorer, existing Brain identities, privacy controls, backups and BlockSuite adapter.
- Normal editor writes may modify only their own session's pending records.
- Use heartbeat every 15 seconds, expiry after 60 seconds. Lease expiry alone never authorizes takeover or deletion.
- History lists contain 20 entries per page.
- Default retention: at most 50 snapshots per target, 5 MiB of serialized snapshot data per target and 50 MiB globally.
- Pending target records have a 5 MiB serialized limit; total draft payload has a 50 MiB limit. Never evict unresolved drafts automatically.
- Ordinary workspace exports exclude drafts/history by default in both React and legacy export paths.
- No search indexing, graph projection, AI retrieval, provider upload or background sync of recovery records.
- Do not describe this as absolute crash-proof storage: only acknowledged local journal transactions are recoverable.
- No application implementation before plan approval. No modification of parent `sources/`, reset, force-push, personal browser use or deployment.

## Execution and checkpoint boundary

Authoritative checkout: `C:/Users/marko/.codex/.chatgpt-projects/g-p-6a817432f6e08191a17958ef96430522/BookmarkModifiedNewTab`.

Branch: `feature/browser-resources-inspector`. Application baseline: `f68f042`; approved design checkpoint: `884c329`. Preserve both. Execute sequentially in this checkout unless the user selects isolation; do not assume a new worktree or checkout is necessary. Verify status before every commit, stage only named task files, and stop on overlapping unrelated edits.

Selected method: **Native**, because migration, journal, history and editor lifecycle share transaction interfaces. One implementer can keep those interfaces consistent; request an independent whole-change review before final handoff. Do not claim independent review completed if unavailable. Implement all nine tasks and verify upgrade one before starting upgrade two. No additional execution-method question is needed.

## Review Focus

1. A newer draft arrives during a canonical transaction: acknowledging the old operation must advance the base without deleting the new generation (Tasks 2 and 5).
2. A hidden tab's lease expires although it is alive: recovery must copy, never take ownership, and discard must reject a changed generation (Tasks 2 and 7).
3. A legacy Canvas writer or backup import changes a page with no open native editor: its protected history and later conflict checks must remain correct (Tasks 4 and 8).
4. Equal timestamps, oversized records and invalid optional backup tables must not break retention, pagination or atomic rollback (Tasks 1, 3 and 8).
5. A formatting-only conflict, missing connector relation or Unicode-heavy note must remain inspectable without HTML execution, lossy merging or quadratic diff work (Tasks 6 and 7).

## File map and dependency direction

All new repository/UI modules below live in `src/react/workspace/`; contracts live in `src/workspace/`.

| File | Responsibility |
| --- | --- |
| `recoveryTypes.ts` (workspace) | Discriminated draft/version/snapshot/preview contracts and limit constants |
| `recoveryValidation.ts` | Strict read/write validation, payload byte accounting, private-table names |
| `recoveryRepository.ts` | Session journal, generation checks, atomic apply/ack, leases and recovery copies |
| `revisionRepository.ts` | Snapshots, retention, paged summaries, capture and deletion |
| `revisionRestore.ts` | Revision-checked restoration through canonical repositories |
| `recoveryDiff.ts` | Pure bounded text/block/layout comparison and manual block selection |
| `recoveryPreview.ts` | Base/current/draft previews and explicit conflict resolution |
| `RecoveryPanel.tsx`, `HistoryPanel.tsx`, `ConflictPanel.tsx` | User decisions; no direct database mutations |
| `recoveryBackup.ts` | Optional recovery import/export validation and ID remapping |
| Existing session/queue/repositories/schema files | Integration, not replacement |

Keep snapshot projection in `revisionRepository.ts` free of imports from canonical mutation repositories. Restoration imports canonical mutations, not vice versa. The journal does not import history writers: its transaction callback invokes existing writers, which capture history.

## Shared contracts (introduced by Task 1)

Use existing `RichContent`, `PageVersion`, `PageCommand`, `PagePresentation` and `PlacementPresentation`. Define these names exactly in `src/workspace/recoveryTypes.ts`:

```ts
type Target = {kind: 'entity' | 'page'; id: string};
type TargetVersion = {kind: 'entity'; revision: number} | {kind: 'page'; value: PageVersion};
type ContentSnapshot = {kind: 'entity'; entityId: string; title: string; content: RichContent};
type PlacementSnapshot = {
  id: string; entityId: string; kind: BoardPlacement['kind']; x: number; y: number;
  width: number; height: number; zIndex: number; page: PlacementPresentation;
};
type LayoutSnapshot = {
  kind: 'page'; boardId: string; placements: PlacementSnapshot[]; presentation: PagePresentation;
};
type RecoverySnapshot = ContentSnapshot | LayoutSnapshot;
type DraftOperation = {id: string; sequence: number} & (
  {kind: 'entity'; snapshot: ContentSnapshot} |
  {kind: 'page'; command: PageCommand}
);
type DraftRecord = {
  id: string; version: 1; sessionId: string; targetKey: string; target: Target; boardId?: string;
  generation: number; appliedThrough: number; base?: RecoverySnapshot; baseVersion: TargetVersion;
  operations: DraftOperation[]; updatedAt: number; leaseUntil: number; payloadBytes: number;
  recoveredGeneration?: number; recoverySource?: {id: string; generation: number};
};
type RevisionRecord = {
  id: string; version: 1; targetKey: string; target: Target; createdAt: number;
  reason: string; sourceSessionId?: string; canonicalVersion: TargetVersion;
  snapshot: RecoverySnapshot; payloadBytes: number;
};
type DraftSummary = Omit<DraftRecord, 'base' | 'operations'> & {operationCount: number};
type RevisionSummary = Omit<RevisionRecord, 'snapshot'>;
type HistoryCursor = {createdAt: number; id: string};
type HistoryPage = {items: RevisionSummary[]; next?: HistoryCursor};
type DraftPreview = {
  record: DraftRecord; current?: RecoverySnapshot; currentVersion?: TargetVersion;
  proposed?: RecoverySnapshot; activeElsewhere: boolean; blockers: string[];
};
type Resolution = {kind: 'keep-current'} | {kind: 'use-draft'} |
  {kind: 'manual'; snapshot: ContentSnapshot};
```

`targetKey` is `JSON.stringify([target.kind, target.id])`; do not concatenate ambiguous user-controlled IDs. `payloadBytes` counts UTF-8 JSON of `base`/`operations` for drafts and `snapshot` for history using `TextEncoder`, not JS string length. Metadata fields are independently bounded. IDs/sequences are immutable once journaled; a new edit gets a larger generation and sequence. `base` is required for nonempty operations; it is absent only on completed receipts. Completed rows retain `appliedThrough` as compact receipts but no content payload once empty, until their session closes safely. The plan does not introduce a separate receipt table. Import `BoardPlacement` and `RichBlock` from the existing type files; export all shared types for consumers.

### Task 1: Add compatible private storage and validated contracts

**Files:** Create `src/workspace/recoveryTypes.ts`, `src/react/workspace/recoveryValidation.ts`, `tests/recoverySchema.test.js`. Modify `src/react/workspace/workspaceClient.ts`, `src/workspace/workspaceDb.js`, `src/workspace/schemaCore.js`, `src/react/workspace/workspaceRepository.ts`, `tests/helpers/workspaceFixture.js`, `tests/workspaceDb.test.js`.

**Interfaces:** Produce `validateDraft(value: unknown): asserts value is DraftRecord`, `validateRevision(value: unknown): asserts value is RevisionRecord`, `payloadBytes(value: unknown): number`, `targetKey(target: Target): string`, and `PRIVATE_RECOVERY_TABLES: readonly string[]`. Both database clients expose `workspaceDrafts` and `workspaceRevisions`.

- [ ] Add schema tests that populate version 3, open with legacy v4, reopen with React v4, and compare table/index specifications and original entity/placement IDs. Extend the fixture loader with an explicit real-client loading option so React migration tests do not accidentally use the existing `workspaceClient` mock.

```js
test('private tables do not enter default exports', async t => {
  const {db, load} = await workspaceFixture(t);
  assert.ok(db.tables.some(table => table.name === 'workspaceDrafts'));
  const exported = await load('workspaceRepository.ts').exportWorkspace();
  assert.equal(exported.schemaVersion, 4);
  assert.equal('workspaceDrafts' in exported.tables, false);
  assert.equal('workspaceRevisions' in exported.tables, false);
});
```

- [ ] Run `node --test tests/recoverySchema.test.js tests/workspaceDb.test.js`; confirm failure because v4/private-table behavior is absent.
- [ ] Add matching v4 schemas to both clients, preserving versions 1–3. Set `CURRENT_SCHEMA_VERSION` to 4; support ordinary export versions 2, 3 and 4. Filter private tables from both default exporters immediately, so this migration cannot leak data even before Task 8. Until Task 8 enables validated recovery import, explicitly reject incoming private tables rather than letting generic validation admit them.

```ts
this.version(4).stores({
  workspaceDrafts: 'id,sessionId,targetKey,boardId,updatedAt',
  workspaceRevisions: 'id,targetKey,createdAt,[targetKey+createdAt],[targetKey+createdAt+id]'
});
```

- [ ] Implement strict validators using existing rich/page/geometry validators. Reject non-finite numbers, invalid kind/base combinations, duplicate/out-of-order sequences, mismatched target IDs, unknown commands, cyclic groups, invalid formatting URLs and payloads above 5 MiB. Validate byte counts rather than trusting supplied values. Bound metadata IDs/reasons to 500 characters and operation count to 2,000.
- [ ] Test an invalid kind, duplicate operation sequence, unsafe link, Unicode byte size and oversized entry. Add version-change callbacks that close old connections and expose reload-required state to the shell; do not erase drafts on that event.
- [ ] Re-run focused tests and `npm run typecheck`; commit named files as `feat: add private recovery schema and validated records`.

### Task 2: Persist session-owned journal operations atomically

**Files:** Create `src/react/workspace/recoveryRepository.ts`, `tests/recoveryRepository.test.js`. Modify `src/react/workspace/recoveryValidation.ts` only if strict journal validation needs tightening.

**Interfaces:** Consume Task 1 contracts. Produce:

```ts
writeDraft(record: DraftRecord, expectedGeneration: number | null): Promise<DraftRecord>;
readDraft(id: string): Promise<DraftRecord | undefined>;
listDrafts(): Promise<DraftSummary[]>;
touchSession(sessionId: string, now: number): Promise<void>;
releaseSession(sessionId: string): Promise<void>;
discardDraft(id: string, expectedGeneration: number): Promise<void>;
copyDraft(id: string, expectedGeneration: number, newSessionId: string): Promise<DraftRecord>;
commitDraftOperation<T>(id: string, sequence: number, write: (
  operation: DraftOperation, baseVersion: TargetVersion
) => Promise<{value: T; nextBase: RecoverySnapshot; nextVersion: TargetVersion}>):
  Promise<{status: 'applied'; value: T} | {status: 'already-applied'}>;
```

- [ ] Write a real-transaction regression: create a valid entity draft, apply its operation, then invoke `commitDraftOperation` again with the same sequence and a callback that throws if executed. Expect `already-applied`; canonical content and generation must remain unchanged.

```ts
return db.transaction('rw', db.tables, async () => {
  const record = await readDraft(id);
  if (!record) throw new Error('Recovery record unavailable.');
  if (sequence <= record.appliedThrough) return {status: 'already-applied'} as const;
  const head = record.operations[0];
  if (!head || head.sequence !== sequence) throw new Error('Journal sequence conflict.');
  const result = await write(head, record.baseVersion);
  await db.workspaceDrafts.put({...record, base: result.nextBase, baseVersion: result.nextVersion,
    operations: record.operations.slice(1), appliedThrough: sequence});
  return {status: 'applied', value: result.value} as const;
});
```

The final implementation recalculates payload sizes, updates timestamps, strips payload from empty receipts and marks only matching recovered source generations in that same transaction. The snippet pins transaction order, not a second write path.

- [ ] Run `node --test tests/recoveryRepository.test.js` and confirm the new API is absent.
- [ ] Implement read/validate, generation-checked writes and ordered apply/ack. New writes read the latest persisted base/applied-through values transactionally and retain acknowledged progress; never resurrect an acknowledged operation from an older in-memory record. Enforce the 50 MiB aggregate draft cap inside the transaction; allow removals and shrinking writes when over cap.
- [ ] Implement 15-second heartbeat ownership and 60-second active indicators using injected times, not sleeps in tests. Copying uses a new session/record ID, no inherited lease, and records the reviewed source generation. Ordinary session disposal releases its lease and deletes only empty acknowledged receipts; unresolved payloads survive.
- [ ] Add tests for newer edits during an apply, two independent sessions, expired-but-live lease, stale discard/copy, quota failure, transaction rollback and a crash-equivalent reopened database. Verify a recovered generation does not hide a later source generation.
- [ ] Re-run focused tests and existing `tests/pagePersistenceQueue.test.js`; commit as `feat: persist isolated draft journals with atomic acknowledgements`.

### Task 3: Capture bounded revision snapshots and paged history

**Files:** Create `src/react/workspace/revisionRepository.ts`, `tests/revisionRepository.test.js`. Modify `src/react/workspace/recoveryTypes.ts` only for contract corrections shared with later tasks.

**Interfaces:** Produce `contentSnapshot(entity: WorkspaceEntity): ContentSnapshot`, `layoutSnapshot(page: PageSnapshot): LayoutSnapshot`, `captureTransition(before: {snapshot: RecoverySnapshot; version: TargetVersion} | undefined, after: RecoverySnapshot, version: TargetVersion, reason: string, sessionId?: string): Promise<void>`, `listHistory(target: Target, cursor?: HistoryCursor): Promise<HistoryPage>`, `readRevision(id: string): Promise<RevisionRecord | undefined>`, `deleteHistory(target: Target): Promise<void>`. Capture runs inside its caller's write transaction and never imports canonical mutation repositories. Define `createRevisionRepository(options?: {now?: () => number; limits?: {perTargetCount: number; perTargetBytes: number; globalBytes: number}})` returning those six methods; production exports delegate to its default instance. The before-version comes from the actual preimage, never the post-save revision.

- [ ] Write retention tests with 51 distinct revisions, tied timestamps and a second target. Use compact synthetic byte limits injected into a repository factory for boundary tests; production constants remain 50/5 MiB/50 MiB.

```js
assert.equal((await history.listHistory(target)).items.length, 20);
const first = await history.listHistory(target);
const second = await history.listHistory(target, first.next);
assert.equal(new Set([...first.items, ...second.items].map(r => r.id)).size, 40);
assert.equal(await db.workspaceRevisions.where('targetKey').equals(key).count(), 50);
```

- [ ] Run `node --test tests/revisionRepository.test.js`; confirm missing repository/API failure.
- [ ] Project only explicit allowlisted fields. Capture first preimage and postimage, skip consecutive equal states, force a new postimage for explicit restore. Compare page meaning without volatile timestamps, page revision or viewport; mode/layout changes still count. Store current viewport as context in snapshots, but viewport-only writes do not add history.
- [ ] Use compound keyset ordering `(createdAt,id)` newest first, fetch 21 entries to identify the next cursor, and omit snapshots from returned summaries. Apply per-target count/bytes, then global bytes; delete oldest records first with deterministic tied-time ordering. Do not touch journal records. Reject a single snapshot over 5 MiB before any canonical mutation can commit.
- [ ] Test identical saves, forced restore, UTF-8 accounting, oldest-first global pruning, missing/deleted targets, confirmed target-specific deletion and oversized capture rollback.
- [ ] Run focused tests and typecheck; commit as `feat: retain bounded private note and page revisions`.

### Task 4: Integrate history with canonical and legacy writers

**Files:** Modify `src/react/workspace/richContentRepository.ts`, `src/react/workspace/pageRepository.ts`, `src/react/workspace/workspaceRepository.ts`, `src/react/workspace/brainRepository.ts`, `src/react/workspace/pageAssets.ts`. Create `tests/revisionWriters.test.js`.

**Interfaces:** Preserve existing public signatures unless adding optional `sourceSessionId`. Add `saveContentSnapshot(entityId: string, expectedRevision: number, snapshot: ContentSnapshot, sourceSessionId?: string): Promise<WorkspaceEntity>` to `richContentRepository.ts`; keep `saveRichContent` as a compatibility wrapper. Add `restorePageLayout(boardId: string, expected: PageVersion, layout: LayoutSnapshot, sourceSessionId?: string): Promise<PageSnapshot>` to `pageRepository.ts` for Task 6. Both use normal canonical validation, history capture and activity writes in one transaction.

- [ ] Add integration tests starting with `createWorkspacePage`, `createBrainObject`, `addPageReference`, `saveRichContent`, Inspector `updateEntity` and legacy `updatePlacement`. Check recorded content and geometry through `listHistory`/`readRevision`, not mock call counts.

```js
const before = await pages.loadPageSnapshot(board.id);
await legacy.updatePlacement(before.placements[0].id, {x: 321});
const entries = await history.listHistory({kind: 'page', id: board.id});
assert.ok(entries.items.length >= 2);
await assert.rejects(pages.applyPageCommand(board.id, before.version,
  {type: 'view', mode: 'canvas', viewport: {x: 0, y: 0, zoom: 1}}), /conflict/i);
```

- [ ] Run `node --test tests/revisionWriters.test.js`; expect missing history for legacy writes.
- [ ] Add history table to transaction scopes, capture before/after within those transactions, and retain existing search/mentions/privacy updates. Add guarded title+content saving via `saveContentSnapshot`. Do not let callers change identity or privacy through snapshots.
- [ ] Cover writer entry points explicitly: new note/document creation (`addNote`, `quickAdd`, `createBrainObject`), `updateEntity`, `renameBoard`, page creation/reference/command/undo, `updatePlacement`, `removePlacements`, `duplicatePlacements`, `autoLayoutBoard`, `addEntityToBoard`, board duplication, Trash restore, asset placement and connector removal that changes page presentation. For legacy boards with no page setting, establish a canonical page owner only when needed for history, using `openWorkspacePage` within the same outer transaction. Keep native browser bookmark projection outside note history.
- [ ] Keep parent/project membership out of layout snapshots; preserve semantic relations on page-history restore. Validate referenced entities, relationship endpoint IDs, board ownership and group cycles before restoration; reject rather than partially restore. Preserve unrelated placement metadata on existing placement IDs.
- [ ] Test creation baseline, title-only edits, viewport-only omission, semantic relation deletion, reference removal, board Trash recovery and file placement. Inject capture failure and assert canonical write rollback.
- [ ] Run `node --test tests/revisionWriters.test.js tests/pageRepository.test.js tests/richContent.test.js tests/pageAssets.test.js`; commit as `feat: version canonical and legacy workspace mutations`.

### Task 5: Journal editor sessions before autosaving

**Files:** Modify `src/react/workspace/pageEditorSession.ts`, `src/react/workspace/pagePersistenceQueue.ts`, `src/react/workspace/blocksuiteWorkspaceAdapter.ts`, `src/react/workspace/blocksuitePageProjection.ts`, `src/react/workspace/AffineWorkspace.tsx`, `tests/pageEditorSession.test.js`, `tests/pagePersistenceQueue.test.js`. Create `tests/recoverySession.test.js`.

**Interfaces:** Preserve `PageEditorSession.flush/reload/exportDrafts/dispose`; replace blind `replaceConflictingDraft` use with `getDraftIds(): string[]` for the comparison UI. Add save states `saving-local` and `recoverable`; retain `saved`, `saving`, `unsaved`, `conflict`, `error`. `flush()` drains both durable journal writes and canonical operations. Expose `flushJournal(): Promise<void>` on the session for deterministic tests and explicit recovery status.

- [ ] Write deferred-promise tests for edit A followed by edit B during local persistence, then during canonical save. Assert only B's acknowledgement can mark B recoverable/saved; reload from the database must find B if canonical save fails.

```js
session.edit(note.id, rich.plainToRichContent('Recover after restart'));
await session.flushJournal();
assert.equal(session.getStatus(), 'recoverable');
session.dispose();
const draft = await recovery.readDraft(session.getDraftIds()[0]);
assert.equal(draft.operations.at(-1).snapshot.content.blocks[0].runs[0].insert,
  'Recover after restart');
```

- [ ] Run `node --test tests/recoverySession.test.js tests/pageEditorSession.test.js tests/pagePersistenceQueue.test.js`; confirm new durable behavior fails.
- [ ] Queue immediate journal persistence on validated content edits and layout commands. Keep one serialized journal writer per session; sequence edits independently per target. Preserve immutable in-flight operations, coalesce only unsent tail operations, and use `commitDraftOperation` before shifting a durable queue head. Include geometry collected from native dirty-note buffers before navigation flush; do not falsely claim pointer motion is durable before it produces a validated operation.
- [ ] Handle `already-applied` by loading current canonical state, not repeating the mutation. Capture typed draft counts instead of parsing exported JSON for every save. Clear a draft only through generation-checked acknowledgement or explicit discard.
- [ ] On lease/version-change/storage failure show actionable status and retain exports. Dispose subscriptions and heartbeat timers without deleting unresolved payloads. Replace comparisons of literal status strings in navigation guards with an explicit dirty/error predicate so `recoverable` still means unsaved canonical work.
- [ ] Re-run all session/queue tests and a focused built browser test for editing/navigation. Commit as `feat: make workspace drafts durable before canonical autosave`.

### Task 6: Compare and restore with fresh revision checks

**Files:** Create `src/react/workspace/recoveryDiff.ts`, `src/react/workspace/recoveryPreview.ts`, `src/react/workspace/revisionRestore.ts`, `src/react/workspace/pagePresentationCommands.ts`, `tests/recoveryDiff.test.js`, `tests/recoveryRestore.test.js`. Modify `src/react/workspace/pageRepository.ts` to share its pure presentation logic.

**Interfaces:** Produce:

```ts
type TextPart = {kind: 'equal' | 'added' | 'removed'; text: string};
type BlockDifference = {id: string; before?: RichBlock; after?: RichBlock;
  text: TextPart[]; formattingChanged: boolean};
diffContent(before: ContentSnapshot, after: ContentSnapshot): BlockDifference[];
chooseBlocks(current: ContentSnapshot, draft: ContentSnapshot,
  choices: Array<{id: string; from: 'current' | 'draft'}>, title: string): ContentSnapshot;
previewDraft(id: string): Promise<DraftPreview>;
resolveDraft(preview: DraftPreview, decision: Resolution): Promise<void>;
restoreRevision(id: string, expected: TargetVersion): Promise<void>;
```

- [ ] Write tests for formatting-only edits, deleted/reordered blocks, repeated text, Unicode, stale previews, deleted entities and missing connector relations. A stale restore must leave canonical state, history and source drafts unchanged.

```js
const preview = await recoveryPreview.previewDraft(draft.id);
await legacy.updateEntity(note.id, {title: 'Changed after preview'});
await assert.rejects(recoveryPreview.resolveDraft(preview, {kind: 'use-draft'}), /conflict/i);
assert.ok(await recovery.readDraft(draft.id));
```

- [ ] Run `node --test tests/recoveryDiff.test.js tests/recoveryRestore.test.js`; confirm absent API failures.
- [ ] Implement deterministic block-ID comparison; for text use common prefix/suffix and bounded line comparison. At more than 200,000 comparison cells, show removed/added blocks instead of quadratic fine-grained diff. Report formatting changes separately, validate output, and never render source strings as HTML. `chooseBlocks` consumes explicit output order and rejects duplicate/missing chosen IDs.
- [ ] Preview loads current snapshots and computes proposed layout using a pure presentation reducer extracted from `pageRepository` into `pagePresentationCommands.ts`; define `projectPresentation(base: LayoutSnapshot, commands: PageCommand[]): LayoutSnapshot` there. Commands creating/removing semantic relationships on a changed base produce blockers rather than silently rebasing. The pure reducer rejects semantic commands with a typed error that preview turns into a blocker/operation description; it never fabricates relationship IDs. Unchanged-base recovery can apply validated original commands through normal journal transactions after explicit confirmation.
- [ ] Resolve with the reviewed generation and canonical version inside one outer transaction. Keep-current discards only that generation. Use-draft/manual creates a fresh recovery-session copy and applies via normal writers; mark the source recovered only after success, and never mark a newer generation recovered. Validate active-session confirmation in the UI, with backend generation checks remaining mandatory.
- [ ] `restoreRevision` checks target kind/version, rejects pending unresolved drafts on that target (including other sessions), validates dependencies, then invokes `saveContentSnapshot` or `restorePageLayout`. Force a new history entry and preserve current privacy/source/memberships. Export remains possible when restoration is blocked.
- [ ] Re-run focused tests and typecheck; commit as `feat: add guarded history restore and local conflict comparison`.

### Task 7: Deliver recovery, history and conflict panels

**Files:** Create `src/react/workspace/RecoveryPanel.tsx`, `src/react/workspace/HistoryPanel.tsx`, `src/react/workspace/ConflictPanel.tsx`, `src/react/workspace/recovery.css`, `tests/e2e/recovery-panels.spec.js`. Modify `src/react/workspace/WorkspaceApp.tsx`, `src/react/workspace/AffineWorkspace.tsx`, `src/react/workspace/WorkspaceInspector.tsx`, `src/react/workspace/blocksuiteRichText.ts`.

**Interfaces:** `RecoveryPanel({onOpenConflict: (preview: DraftPreview) => void})`; `HistoryPanel({target: Target, onRestored: () => void})`; `ConflictPanel({preview: DraftPreview, onClose: () => void, onResolved: () => void})`. Use repositories above, never direct table writes from JSX. The existing rich editor gains a callback-based manual-draft host, without persisting conflict edits until confirmation.

- [ ] Add browser assertions for the initially absent shell action, preview, compare labels and history restore confirmation.

```js
await page.getByRole('button', {name: 'Recovery', exact: true}).click();
await expect(page.getByRole('region', {name: 'Workspace recovery'})).toBeVisible();
await page.getByRole('button', {name: 'Preview draft', exact: true}).first().click();
await expect(page.getByRole('heading', {name: 'Current saved', exact: true})).toBeVisible();
await expect(page.getByRole('heading', {name: 'Your draft', exact: true})).toBeVisible();
```

- [ ] Build the current application and run `npx playwright test tests/e2e/recovery-panels.spec.js`; verify missing UI failures rather than unrelated fixture errors.
- [ ] Add a shell Recovery action reachable from every workspace view, summary counts, timestamp/page labels and active indicators. List 20 summaries at a time; load payloads only on preview. Include recovered-source rows in a separate filter so users can explicitly discard them without advertising them as unresolved.
- [ ] Add note/document History in Inspector and page History in workspace controls. Show retention/privacy warning, preview, export, confirmed restore and confirmed target-history deletion. Deleted boards direct users to existing Trash rather than silently reconstructing them.
- [ ] Render Base/Current saved/Your draft safely, a title choice, block-level selection and validated editable manual result. Wire explicit Keep current/Use draft/Combine manually/Export controls; disable commit while stale, blocked or saving. Active-draft copying and discard both require confirmation. Keep source draft visible on failure.
- [ ] Verify keyboard focus enters panels and returns to the triggering control, Escape does not discard work, narrow screens stack comparison columns, and all error messages use an accessible status. Do not intercept the existing native editor shortcuts globally.
- [ ] Build and run the panel test plus `tests/e2e/affine-workspace.spec.js`; update the old direct replacement test to go through comparison. Commit as `feat: expose recovery history and conflict review in workspace`.

### Task 8: Make recovery backup explicitly opt-in and atomic

**Files:** Create `src/react/workspace/recoveryBackup.ts`, `tests/recoveryBackup.test.js`. Modify `src/react/workspace/workspaceRepository.ts`, `src/workspace/workspaceDb.js`, `src/react/workspace/WorkspaceUtilities.tsx`, `tests/pageBackup.test.js`, `tests/workspaceDb.test.js`.

**Interfaces:** Extend `exportWorkspace(options?: {includeRecovery?: boolean}): Promise<WorkspaceExport>` and legacy `exportSnapshot(options?: {includeRecovery?: boolean})`. Produce `prepareRecoveryImport(tables: Record<string, unknown[]>): {workspaceDrafts: DraftRecord[]; workspaceRevisions: RevisionRecord[]}`; this pure function validates/remaps, while existing import transaction enforces aggregate limits and writes. Do not relax unknown-table rejection.

- [ ] Test default exclusion, opt-in inclusion, versions 2/3 without recovery, version 4 with recovery, colliding session/history IDs and malformed optional records.

```js
const ordinary = await repository.exportWorkspace();
assert.equal('workspaceDrafts' in ordinary.tables, false);
const explicit = await repository.exportWorkspace({includeRecovery: true});
assert.ok(Array.isArray(explicit.tables.workspaceDrafts));
const before = await db.entities.toArray();
explicit.tables.workspaceDrafts.push({version: 99});
await assert.rejects(repository.importWorkspace(explicit), /recovery|draft/i);
assert.deepEqual(await db.entities.toArray(), before);
```

- [ ] Run `node --test tests/recoveryBackup.test.js`; expect absent opt-in/remapping behavior to fail.
- [ ] Add the explicit settings checkbox with the warning that recovery may contain removed/private text. Filter private tables in both exporters unless enabled. Ensure ordinary imports do not clear local journals/history; namespace optional imported IDs, remove live leases and recovery-source pointers, and mark imported records inactive for preview only.
- [ ] Preserve pre-import covered canonical snapshots inside the import transaction before applying replacements. Reject malformed, oversized or aggregate-over-limit optional recovery input atomically. An optional import exceeding history limits is rejected, not silently truncated; routine local history retention still prunes normally.
- [ ] Verify a legacy default export excludes the private tables and an explicit export includes them. Test memory-policy preservation, no AI-context inclusion and no provider requests. Never recreate deleted entities from a recovery snapshot during import.
- [ ] Run recovery/legacy/page backup tests and typecheck; commit as `feat: add private opt-in recovery backup compatibility`.

### Task 9: Verify restart recovery, regressions and handoff

**Files:** Create `tests/e2e/recovery-restart.spec.js`, `tests/e2e/helpers/restartableExtension.js`. Modify `docs/UNIFIED_BRAIN_STATUS.md` and this plan's completion ledger only after verified results.

**Interfaces:** Test helper `launchRestartableExtension(profilePath: string): Promise<{context: BrowserContext; extensionId: string; crashPage(page: Page): Promise<void>}>`. Use a task-owned temporary profile, never a personal profile; the helper launches the same `dist/` extension flags as the existing fixture. `crashPage` uses an isolated Chromium CDP session `Page.crash`; it must not terminate any unrelated browser/Codex process.

- [ ] Write restart tests that create a durable pending content/layout edit, confirm its journal acknowledgement, crash the editor renderer without before-unload, close the test context, relaunch the exact profile and use Recovery through the UI.

```js
await expect(page.getByRole('status').filter({hasText: 'Recoverable draft'})).toBeVisible();
await runtime.crashPage(page);
await runtime.context.close();
runtime = await launchRestartableExtension(profilePath);
const reopened = await runtime.context.newPage();
await reopened.goto(`chrome-extension://${runtime.extensionId}/newtab.html`);
// Open Boards, then Recovery, preview the acknowledged draft and explicitly restore.
```

Hold canonical persistence through an isolated test database lock/fault injection after journal acknowledgement; release/close that lock during crash cleanup. Do not ship production test hooks. Also test commit-before-crash so completed connector operations are not replayed. Browser restart after a renderer crash is evidence for the stated acknowledged-journal guarantee, not disk/power-loss durability.

- [ ] Run the new restart test and fix the specific failed behavior. Retain failures that uncover production defects as regression cases; do not replace the crash test with graceful navigation.
- [ ] Run `npm test`, `npm run build`, then `npx playwright test tests/e2e`. Run `npm audit --omit=dev --audit-level=high` when network is available; report any unavailable check explicitly. Run `git diff --check`.
- [ ] Inspect desktop/narrow screenshots of recovery, formatted conflict and history; assert no page/console errors in new flows and no unexpected HTTP requests. Recheck earlier save-queue, hierarchy, reminder, search, import and memory tests.
- [ ] Request independent final review under the selected execution method; resolve confirmed issues and repeat affected tests/build. If unavailable, report that limit without claiming approval.
- [ ] Update status with exact counts, limitations, journal acknowledgement guarantee, retention defaults and exported privacy boundary. Stage only verified task files; commit as `test: verify workspace restart recovery and guarded restoration`.
- [ ] Report upgrade one completed only when the spec's acceptance cases pass. Preserve the feature branch/checkouts. Do not claim upgrades two/three completed or start them before this gate; their designs/plans are separate work.

## Plan self-review and acceptance mapping

| Spec acceptance | Owning tasks |
| --- | --- |
| 1: migration and connection compatibility | 1, 9 |
| 2–3: interrupted saves and replay safety | 2, 5, 9 |
| 4–5: simultaneous tabs and storage failures | 2, 5, 6, 7 |
| 6–8: history, guarded restore, retention | 3, 4, 6, 7 |
| 9: legacy/Inspector/backup writers | 4, 8 |
| 10: privacy and optional backups | 1, 8 |
| 11–12: regression coverage and build | 5, 7, 9 |

Self-review checks: named interfaces agree across tasks; private tables are excluded at migration time; stable ordered operation acknowledgements avoid replay; expired leases are not ownership transfer; layout snapshots never recreate shared semantic relations; retention does not evict drafts; imports preserve preimages and fail atomically; actual build/QA results are required. Tasks remain unchecked until executed.
