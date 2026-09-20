# AFFiNE Workspace Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the single-object BlockSuite prototype with persistent multi-object document, edgeless and mixed workspaces connected to the existing Brain.

**Architecture:** Dexie entities remain the content authority, existing placements own geometry, relationships own semantic links, and validated settings own page presentation. BlockSuite is a transient, replaceable renderer/editor; its serialized document is never a second persistent content database. Conflict detection and save-session lifecycle are shared by every editor mode.

**Tech Stack:** Existing WXT, TypeScript, React, Dexie, Lit and BlockSuite 0.19.5. Keep React Flow available. Keep the existing compatible package pins, MV3 CSP, lazy-loading and notice generation.

**Spec:** `docs/superpowers/specs/2026-09-19-affine-workspace-design.md`, approved by the user's "Save current state and do the upgrade" and subsequent execution follow-ups.

**Execution update (September 20):** Canonical pages, rich content, safe assets, the writable multi-object adapter, document/canvas/mixed UI and backup/lifecycle integration are implemented. Lint, both TypeScript checks, 84 unit tests and the production build pass. Save-queue review findings have regression coverage. Full acceptance is not claimed: native connector path/rerouting parity, comprehensive native-operation and mobile/accessibility coverage, and a completed independent final review remain outstanding. See `docs/UNIFIED_BRAIN_STATUS.md` for the delivered boundary. The latest user request authorizes committing and pushing the verified build on the existing feature branch.

## Checkpoint and execution boundary

Local commit `09013d3` preserves all previously tracked/untracked application work and the proposed design. No remote was changed. It is a code checkpoint, not an export of the user's browser database. The checkout was clean after committing.

Do not recreate this checkpoint, reset the checkout, edit the parent `sources/`, or stage unrelated files. Execute in the authoritative `BookmarkModifiedNewTab` checkout. Task commits below are local, scoped checkpoints after tests; no push or deployment is included.

Recommended execution: **Native**, with bounded research/test review delegated where useful and an independent final review. Most work crosses the same persistence/editor interfaces, so separate simultaneous implementers would create unnecessary integration risk. Subagent-driven sequential implementation is an alternative if the user prefers per-task independent reviews.

## Global constraints

- Preserve the existing desktop, Explorer, Brain identity model, browser capture, React Flow canvas and local persistence.
- Treat the parent `sources/` folder as read-only.
- Do not add a second persistent content store, cloud sync, account access or automatic AI transmission.
- Native BlockSuite IDs are runtime IDs; canonical entity, placement and relationship IDs survive remount/export/import.
- A page reference removal never deletes its object, file, other project memberships or source content.
- Native interactions with no Brain adapter must be disabled/rejected visibly, not saved invisibly.
- Local file limit: 25 MiB per file. Preview only validated raster images; never execute uploaded HTML/SVG/scripts or auto-download remote attachments.
- Existing memory governance applies to all new views. Rendering a memory or chat never authorizes a provider request.
- No completion claim until all ten specification acceptance cases are exercised or an explicit remaining blocker is recorded.

## Review focus

1. An old React Flow writer changes a placement while a page is open: stale editor updates must conflict even if the legacy writer does not know about a page revision. Covered in Task 1 using a snapshot fingerprint plus revision.
2. A page/view closes while an edit is saving or a write fails: retain the draft and correct target; never apply the old page's save to the new page. Covered in Task 4's session-state tests and Task 7 browser navigation test.
3. A formatted note is edited through the old Inspector or restored from an old backup: no silent formatting destruction, stale plain-text projection or duplicated entity. Covered in Tasks 2 and 6.
4. A connector references a removed card or duplicate placement: distinguish placement identity from object identity and remove presentation without deleting semantic links. Covered in Tasks 1 and 4.
5. Asset metadata lies about MIME/type or contains active content; external embeds try to load a provider account: reject active previews and prevent unsolicited network execution. Covered in Tasks 3 and 7.

## Shared interfaces and file boundaries

Create `src/workspace/pageTypes.ts` for all interfaces below. Add optional `richContent` and `contentRevision` to `WorkspaceEntity` in `src/workspace/types.ts`; use a type-only import. Do not add IndexedDB tables or indexes for these optional fields/settings.

```ts
export type PageMode = 'document' | 'canvas' | 'mixed';
export type RichKind = 'paragraph' | 'heading' | 'bullet' | 'numbered' | 'check' | 'quote' | 'code';
export interface RichRun {
    insert: string;
    attributes?: {bold?: boolean; italic?: boolean; underline?: boolean;
        strike?: boolean; code?: boolean; link?: string};
}
export interface RichBlock {
    id: string; kind: RichKind; runs: RichRun[];
    level?: 1 | 2 | 3; checked?: boolean; language?: string;
}
export interface RichContent {version: 1; blocks: RichBlock[]}
export interface PageVersion {revision: number; fingerprint: string}
export interface PageGroup {id: string; label: string; parentId?: string; collapsed: boolean}
export interface PageConnector {
    id: string; relationshipId: string; fromPlacementId: string; toPlacementId: string;
    points: Array<{x: number; y: number}>; color: string; dashed: boolean;
    mode: 'straight' | 'orthogonal' | 'curve';
}
export interface PagePresentation {
    version: 1; ownerEntityId: string; revision: number; mode: PageMode;
    viewport: {x: number; y: number; zoom: number};
    groups: PageGroup[]; connectors: PageConnector[];
}
export interface PlacementPresentation {
    order: number; groupId?: string; collapsed: boolean;
    color: 'default' | 'blue' | 'green' | 'yellow' | 'purple';
}
```

Store `PlacementPresentation` under `placement.metadata.page`. Store `PagePresentation` in `settings` key `workspace-page:${boardId}`. Content and file bytes do not belong in either. Group labels are user-authored presentation labels, not duplicated object titles.

`PageSnapshot` is exported by `pageRepository.ts`: `{board: BoardRecord; owner: WorkspaceEntity; presentation: PagePresentation; version: PageVersion; placements: BoardPlacement[]; entities: WorkspaceEntity[]; relationships: RelationshipRecord[]; parent?: WorkspaceEntity; children: WorkspaceEntity[]}`. It contains only assets' canonical entity metadata, not blobs.

## Task 1: Persistent pages, nesting and safe presentation operations

**Files:** Create `src/workspace/pageTypes.ts`, `src/react/workspace/pageValidation.ts`, `src/react/workspace/pageRepository.ts`, `tests/pageRepository.test.js`, `tests/helpers/workspaceFixture.js`. Modify `src/workspace/types.ts` and `src/react/workspace/brainValidation.ts`.

**Interfaces:**

```ts
createWorkspacePage(title: string, parentEntityId?: string): Promise<PageSnapshot>
openWorkspacePage(boardId: string): Promise<PageSnapshot>
openProjectWorkspace(projectEntityId: string): Promise<PageSnapshot>
loadPageSnapshot(boardId: string): Promise<PageSnapshot>
addPageReference(boardId: string, entityId: string): Promise<PageSnapshot>
refreshProjectReferences(boardId: string): Promise<PageSnapshot>
setPageParent(pageEntityId: string, parentEntityId?: string): Promise<void>
applyPageCommand(boardId: string, expected: PageVersion, command: PageCommand): Promise<PageSnapshot>
undoPageCommand(boardId: string, undoToken: string): Promise<PageSnapshot>
validatePagePresentation(value: unknown): asserts value is PagePresentation
validatePlacementPresentation(value: unknown): asserts value is PlacementPresentation
```

Define `PageCommand` as a discriminated union: `move-resize` with placement IDs and finite geometry; `reorder` with the exact ordered placement ID list; `group` with group/placement IDs; `ungroup` with group ID; `collapse` with placement/group ID and boolean; `style` with selected placement IDs and allowed color; `view` with mode and viewport; `remove-reference` with placement IDs; `connect` with endpoint placement IDs/type/label; `connector-style` with connector ID/geometry/style; `remove-connector` with connector ID and `scope: 'page' | 'everywhere'`.

- [ ] Extract the existing real-Dexie/fake-indexeddb/transpiled-module fixture pattern into the new helper without refactoring unrelated tests. Export `workspaceFixture(t)` returning `{db, load(relativeTsPath)}`; keep one isolated database per test and delete only that test database afterward.
- [ ] Add failing tests using the real repository. The first test must exercise identity and nested-cycle rollback:

```js
test('pages reference original objects and nesting rejects cycles', async t => {
    const {db, load} = await workspaceFixture(t);
    const pages = load('pageRepository.ts');
    const brain = load('brainRepository.ts');
    const root = await pages.createWorkspacePage('Research');
    const note = await brain.createBrainObject({type: 'note', title: 'Shared note'});
    await pages.addPageReference(root.board.id, note.id);
    await pages.addPageReference(root.board.id, note.id);
    assert.equal(await db.placements.where('[boardId+entityId]').equals([root.board.id, note.id]).count(), 1);
    const child = await pages.createWorkspacePage('Details', root.owner.id);
    await assert.rejects(pages.setPageParent(root.owner.id, child.owner.id), /cycle/i);
    assert.equal((await pages.loadPageSnapshot(child.board.id)).parent.id, root.owner.id);
});
```

- [ ] Add a stale-layout test: load `before`, call existing `workspaceRepository.updatePlacement` directly, then call `applyPageCommand` with `before.version`; assert conflict and unchanged later geometry. Add rollback via an activities-table throwing hook, missing owner/endpoint tests, invalid geometry, group cycle, group deletion/reparent tests, reorder permutation rejection and page-only connector removal preserving the relationship.
- [ ] Run `node --test tests/pageRepository.test.js`; verify failures name the missing behavior.
- [ ] Implement page ownership with one canonical document object plus existing board/setting, or existing project object plus the deterministic project board from `openBrainCanvas`. For existing boards, create ownership lazily without rewriting placements. Page creation/parentage/activities are one transaction. Parent relations use `page-parent`; require valid page/project parents and one parent, then detect cycles inside the write transaction.
- [ ] Implement `PageVersion.fingerprint` as stable sorted JSON of current relevant board/placement/presentation/connector relationship records. Compare both revision and fingerprint inside the same transaction before any mutation. This catches old writers without relying on timestamps. Ignore referenced object bodies in layout fingerprints so a note text edit is not a false layout conflict.
- [ ] Implement commands as scoped patches, not wholesale database replacement. Validate x/y within ±1,000,000, sizes from 80 to 10,000, zoom 0.1–4, integer finite order, exact endpoint membership and allowlisted colors/modes. Record layout undo tokens with only pre/post presentation/relationship state. Undo compares the affected current records to the recorded post-state before restoring; no content or asset deletion.
- [ ] Run focused tests and `npm run typecheck`. Inspect settings to prove they contain IDs/layout but no note/chat body. Commit only Task 1 files after green checks.

## Task 2: Canonical rich text and safe plain-text compatibility

**Files:** Create `src/react/workspace/richContent.ts`, `src/react/workspace/richContentRepository.ts`, `tests/richContent.test.js`. Modify `workspaceRepository.ts`, `WorkspaceInspector.tsx`, `workspaceSearch.ts` only if its existing body search needs a selector, and Task 1's types.

**Interfaces:**

```ts
validateRichContent(value: unknown): asserts value is RichContent
plainToRichContent(text: string): RichContent
richContentToPlainText(content: RichContent): string
readRichContent(entity: WorkspaceEntity): RichContent
saveRichContent(entityId: string, expectedRevision: number, content: RichContent): Promise<WorkspaceEntity>
```

- [ ] Add failing round-trip/validation tests for every formatting attribute and block kind, duplicate block IDs, unsafe links, unknown attributes, non-string inserts, 2,001 blocks, and more than 100,000 characters. Missing legacy rich content maps to paragraph text without saving until edited.
- [ ] Add the canonical concurrent-edit test:

```js
test('formatted content keeps one canonical body and detects stale edits', async t => {
    const {db, load} = await workspaceFixture(t);
    const brain = load('brainRepository.ts');
    const rich = load('richContentRepository.ts');
    const note = await brain.createBrainObject({type: 'note', title: 'Decision'});
    const content = {version: 1, blocks: [{id: 'p1', kind: 'paragraph', runs: [{insert: 'One source', attributes: {bold: true}}]}]};
    const saved = await rich.saveRichContent(note.id, 0, content);
    assert.equal(saved.metadata.body, 'One source');
    assert.equal(saved.contentRevision, 1);
    await assert.rejects(rich.saveRichContent(note.id, 0, content), /conflict/i);
    assert.equal(await db.entities.count(), 1);
});
```

- [ ] Run `node --test tests/richContent.test.js`; verify expected failures.
- [ ] Implement allowlisted structured validation, plain projection and transactional saves over entities/relationships/activities. Derive `metadata.body` and `searchTerms`, update explicit backlinks, and increment `contentRevision`. Route ordinary title/body writes through revision updates too; preserve revision fields in browser/source reconciliation. Reject plain-body overwrites of formatted content unless the same call supplies validated replacement rich content.
- [ ] Add `onOpenRichText(entityId)` to the Inspector integration contract. A formatted note shows a plain read-only preview plus an Edit rich text action; saving an unchanged body/title must not trigger a formatting overwrite. Existing plain notes retain the old editor. Test both behaviors with server-render tests and repository assertions.
- [ ] Run focused tests, existing Brain tests, type check. Commit only Task 2 files after green checks.

## Task 3: Canonical local files and image references

**Files:** Create `src/react/workspace/pageAssets.ts`, `tests/pageAssets.test.js`. Extend current image upload wrapper and Assets view in `workspaceRepository.ts`/`WorkspaceApp.tsx` without replacing existing capture.

**Interfaces:**

```ts
validatePageFile(file: Pick<File, 'name' | 'size' | 'type'>): void
addPageFile(boardId: string, file: File): Promise<{entityId: string; assetId: string}>
loadPageAsset(entityId: string): Promise<AssetRecord | undefined>
```

- [ ] Write failing tests: one entity/asset shared by two page placements; over-25-MiB and active HTML/SVG/JS MIME/extensions rejected before reading; transaction failure rolls back entity, asset and placement together; wrong/empty MIME handled as an inert file instead of an image; removing a placement preserves bytes.
- [ ] Run `node --test tests/pageAssets.test.js`; inspect the intended failures.
- [ ] Implement file validation and atomic entity/asset/placement/activity insertion using existing tables. Raster preview types are PNG/JPEG/GIF/WebP/AVIF with matching decoded signature/type; unrecognized safe files remain download-only. Existing stored active assets remain retained but never embedded/executed by new views. Never fetch imported remote attachment URLs.
- [ ] Extend Assets UI to choose files and show an Open in workspace action; keep screenshot capture and existing image routes. Manage blob URLs in the consuming renderer, creating only for displayed assets and revoking on change/unmount. Read blobs by `entityId`, not all-assets loads.
- [ ] Run focused tests, type check, existing workspace tests. Commit Task 3 files after green checks.

## Task 4: Real BlockSuite page adapter and recoverable edit sessions

**Files:** Refactor `src/react/workspace/blocksuiteAdapter.ts` into the exported mount boundary and new `blocksuitePageProjection.ts`, `blocksuiteBrainReference.ts`, `blocksuiteRichText.ts`, `pageEditorSession.ts`. Create `tests/pageEditorSession.test.js` and `tests/e2e/affine-workspace.spec.js`.

**Interfaces:**

```ts
interface PageEditorSession {
    flush(): Promise<void>;
    reload(): Promise<void>;
    replaceConflictingDraft(entityId: string): Promise<void>;
    getStatus(): 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error';
    dispose(): void;
}
mountWorkspaceEditor(host: HTMLElement, input: {
    snapshot: PageSnapshot; mode: PageMode;
    onSelect: (entityId: string, placementId?: string) => void;
    onOpenPage: (boardId: string) => void;
    onAction: (entityId: string, action: 'source' | 'inspector' | 'graph' | 'ai') => void;
    onStatus: (status: string) => void;
}): Promise<PageEditorSession>
```

- [ ] Write failing session tests with injected repository functions (no browser mocking): serialize two edits to the same object, flush pending edits before navigation, preserve failed/conflicting drafts, reject late saves after disposal, recover via explicit reload/replace, suppress echoed liveQuery updates, and maintain content-specific undo without reverting another tab's edits.
- [ ] Add browser tests using the existing isolated MV3 fixture. Create a page with two notes and an existing conversation via UI. Assert native PageEditor and EdgelessEditor exist, all references render, and no network requests occur on open. Edit using real rich-text keyboard/pointer controls, not direct database writes. Initially the new workspace action must be absent and the test must fail.
- [ ] Run the focused unit/browser tests and record expected failures.
- [ ] Build one transient BlockSuite collection/document per active page session, with one native note container per existing placement and stable runtime-ID mappings. Custom reference schemas contain entity/placement IDs only. Project layout updates into `xywh` and ordering while a write-back suppression guard is held. Subscribe to native geometry/surface events and commit canonical commands after each completed interaction; all persistence goes through Tasks 1–3.
- [ ] Render document and edgeless editors over the same session. Mixed mode mounts both presentations with shared entity sessions/selection. Keep document order separate from x/y layout. Native group and connector projections resolve placement IDs to runtime node IDs and semantic relationship IDs; native IDs never enter backup identity.
- [ ] Use the installed exported `RichText` component with a transient `Text`/Y.Text per rich block. Its `yText`, `inlineEditor`, `readonly`, `enableClipboard`, `enableFormat`, `enableUndoRedo` and `inlineEventSource` properties are available in installed `@blocksuite/affine-components/dist/rich-text/rich-text.d.ts` and re-exported by `@blocksuite/blocks`. Bind allowlisted formatting toolbar/block controls to current range; project deltas to canonical RichContent. Intercept paste before default rich clipboard ingestion; unsupported content becomes plain text, never arbitrary native blocks.
- [ ] Enable native movement/resize/pan/zoom/connector operations while preventing unmapped paragraph/file/surface mutations. Do not globally make the document read-only again. Unsupported tools must be absent or visibly rejected with a rebuild from the current canonical snapshot. Session drafts remain recoverable during that rebuild.
- [ ] Render typed reference cards: conversation messages via confirmed `message-of`, browser/repository safe source links, tasks via existing status/reminder methods, memory via existing policies, assets via Task 3, child pages via owner/board mapping. Preserve the selection-mask fix without preventing selection/drag handles. External content is a safe reference preview, never an authenticated remote iframe.
- [ ] Run real drag/resize/connector tests, including screenshots that prove the card is visually present and controls receive clicks. Switch modes/reload and assert identities, layout and formatting persist. Dispose all subscriptions, native editors, transient documents and blob URLs.
- [ ] Run focused tests/type check/build. Commit Task 4 files after green checks.

### Verified native API notes for Task 4

Read-only package audit and root spot checks on the installed 0.19.5 sources confirmed:

- `Doc.updateBlock` refuses writes in read-only mode, and surface element mutation/resize also require a writable transient document. There is no per-flavour read-only hook. `inoperable` selection would disable the required resize controls. Keep application authority in the adapter allowlist rather than using either restriction as a shortcut.
- `doc.slots.blockUpdated.on` exposes add/delete/update with update `props: {key}`; read the current mapped note model for geometry. The native note's auto-height observer also updates `xywh`, so filter/hydrate with an origin guard and bounded validation rather than assuming every event is a drag.
- Persist note `xywh`, `index`, `edgeless.collapse`, `collapsedHeight` and `scale`. Reordering document children uses `doc.addBlock` parent index or the corresponding move operation; do not derive document order from canvas coordinates.
- `getSurfaceBlock(doc)` is exported by `@blocksuite/blocks`. Its `addElement` accepts `type: CanvasElementType.CONNECTOR`, an enum `ConnectorMode.Straight/Orthogonal/Curve`, and `source`/`target` with runtime note IDs and attachment positions. `elementAdded`, `elementUpdated` and `elementRemoved` expose local-origin metadata; native draw starts with incomplete endpoints. Persist only when both endpoints map to valid canonical placements. Incomplete draw state remains transient and cannot survive reload as a broken connector.
- Edgeless viewport offers `viewportUpdated.on(({zoom, center}) => ...)` and `setViewport(zoom, center)`. The page setting's x/y are world-center coordinates for this adapter, not React Flow translation offsets; convert if a shared view later consumes them.
- `<rich-text>` needs a Y.Text attached to a live Y.Doc. Construct each canonical rich block's transient text in `new DocCollection.Y.Doc()`, seed from validated runs, observe `toDelta()` and ignore a dedicated hydration origin. Heading/list/quote/code semantics come from RichBlock, since RichText itself renders inline spans. Multiple rendered references share a canonical edit session instead of independent autosave writers.
- An absolute `.affine-note-mask` intercepts pointer events at z-index 1. Keep the editable form above it and provide a separate native selection/drag handle. Do not stop propagation on the entire card and thereby disable moving it.
- Default root specs also register native clipboard/tools/toolbar commands. Removing a tool extension alone can leave visible controls targeting missing tools. Capture unsupported creation/paste/drop/delete/clone interactions, provide a visible explanation, and reconcile unexpected runtime changes from canonical state without discarding drafts.
- Await editor `updateComplete` before accessing `editor.std`. Retain and dispose the objects returned by `Slot.on`; unsubscribe Dexie, flush/cancel scheduled writes using a page-instance token, remove editor DOM, destroy transient rich-text docs, then dispose the main doc/collection.

Primary local evidence: `@blocksuite/store/src/store/doc/doc.ts`, `@blocksuite/block-std/src/gfx/model/surface/surface-model.ts`, `@blocksuite/block-std/src/gfx/viewport.ts`, `@blocksuite/affine-components/src/rich-text/rich-text.ts`, `@blocksuite/blocks/src/note-block/note-edgeless-block.ts`, and `@blocksuite/affine-model/src/consts/connector.ts` under `node_modules`.

## Task 5: Full workspace UI, page hierarchy and connected entry points

**Files:** Replace `BlockSuitePrototype.tsx` with `AffineWorkspace.tsx`; create `WorkspacePages.tsx`, `WorkspacePageToolbar.tsx`, `affineWorkspace.css`. Modify `WorkspaceApp.tsx`, `WorkspaceExplorer.tsx`, `BrainWorkspace.tsx`, `BrainObjectTools.tsx`, `ProjectHome.tsx`, and `WorkspaceInspector.tsx` integration.

- [ ] Add browser tests for all entry points: Inspector/Brain/project/file → Open in workspace; ordinary object added to current page; project opens its own deterministic page. Opening twice must not duplicate placements. The existing React Flow Canvas remains selectable.
- [ ] Add nested-page browser coverage: create child, navigate breadcrumbs, move to valid parent, reject descendant parent, and verify native bookmark tree unchanged.
- [ ] Add keyboard picker and drag/drop tests using stable entity IDs. Accept existing `text/brain-object` after verifying the ID exists; do not interpret arbitrary dropped text as an ID or source URL. Extend Explorer's object drag payload without breaking its protected native folder move path.
- [ ] Run `npx playwright test tests/e2e/affine-workspace.spec.js`; inspect expected missing-control failures.
- [ ] Implement the normal workspace UI with Document/Canvas/Mixed tabs, Add existing object, New note, Upload file, New child page, Group/Ungroup, Collapse, style controls, connector actions, undo and save status. Object selection opens the existing Inspector. Provide numerical geometry/order controls alongside pointer interactions for keyboard access.
- [ ] Use a guarded navigation callback shared by every route out of the editor, including Back/Return to desktop, board changes and view tabs:

```ts
async function leaveEditor(next: () => void) {
    try {
        await editorSession.current?.flush();
        next();
    } catch (error) {
        setNavigationError(String(error));
    }
}
```

Keep the editor mounted and the draft intact when flushing fails. Offer Retry, export draft as local text/JSON, or explicit Discard draft; never navigate implicitly after a failed write. A pending dirty draft installs `beforeunload` protection until saved/discarded.
- [ ] Implement child-page tree and breadcrumbs from confirmed `page-parent` links, separate from existing folder/project membership. Project navigation displays categories and an explicit Add missing project members action. Existing arranged placements retain geometry.
- [ ] Run browser task flows at 1584×1024 and 390×844, check overflow, keyboard focus and named controls. Do not disable the existing mobile Explorer/Inspector behavior. Commit Task 5 files after green checks.

## Task 6: Backup compatibility, stale-writer protection and scoped undo

**Files:** Modify `workspaceRepository.ts`, `brainValidation.ts`, `pageValidation.ts`, `pageRepository.ts`, `richContentRepository.ts`; add `tests/pageBackup.test.js`, extend `tests/pageEditorSession.test.js`.

- [ ] Add failing tests exporting all page/rich-text/asset records to a fresh database and comparing IDs/bytes/formatting/layout/relationships after import. Existing v2/v3 backups with no new fields must still load.
- [ ] Add invalid cases before any writes: cyclic/duplicate parents, missing page owner/board, invalid connector placement IDs, wrong group IDs, unsupported rich-text version, unsafe link, mismatched file data URL/type/size, and non-finite layout. Frozen input backups must not be mutated.
- [ ] Add undo tests for safe own-operation reversal and rejection after an intervening legacy Canvas edit. Removal/undo of one reference cannot affect another page or asset bytes. Content undo is scoped to the canonical entity revision and its transient session history; do not persist note/chat copies inside layout settings.
- [ ] Run `node --test tests/pageBackup.test.js tests/pageEditorSession.test.js`; inspect expected failures.
- [ ] Extend record validation for optional RichContent and page settings, and validate required foreign keys against the effective merged state inside the write transaction. Decode file data only after size/type validation. Existing importer only accepts `data:image/`; extend it deliberately for supported inert file records without introducing remote fetch. Retain memory-policy preservation.
- [ ] On legacy board duplicate/delete and placement removal paths, copy/rekey or clean presentation links without orphaning ownership, deleting canonical objects, or copying asset content. Add tests for duplicate page versus duplicate reference behavior with clearly named UI actions.
- [ ] Run new and existing backup, hierarchy, Brain and workspace tests. Commit Task 6 files after green checks.

## Task 7: End-to-end acceptance and handoff

**Files:** Extend `tests/e2e/affine-workspace.spec.js` and `tests/e2e/brain.spec.js`; update `docs/UNIFIED_BRAIN_STATUS.md` and this execution ledger.

- [ ] Use the browser-testing skill and the previously approved isolated extension harness. Capture snapshots under the OS temp directory, not the user's profile or repository design directory.
- [ ] Exercise one combined page containing chat, browser source, formatted note, task, memory, image and file. Test document/canvas/mixed mode, ordering, grouping/collapse/style, connector geometry, pan/zoom, child pages and reload/export/import. Compare canonical counts and source IDs before/after mode switching.
- [ ] Add two-tab edit conflict and save-failure navigation tests with repository fault injection in the isolated test context only. Assert visible unsaved/conflict recovery and preserved drafts, not merely a console error.
- [ ] Record network requests while opening chat/memory/browser cards and editor modes; assert no provider requests without explicit Ask AI. Exclude/forget a memory in another tab and verify the next context preview omits its body.
- [ ] Assert page presentation/settings contain no canonical text/blob content and no persisted serialized BlockSuite collection. Temporary rich-text editing state is permitted in memory only; canonical content persists in entities/assets.
- [ ] Run `npm test`, `npm run build`, `npx playwright test tests/e2e --output=<OS-temp>/affine-upgrade-results`, `npm audit`, and `git diff --check`. Read full outcomes, inspect desktop/mobile screenshots and console errors. Existing regression tests must remain passing, not merely the new flows.
- [ ] Obtain independent whole-change review if agent capacity permits; disclose if unavailable rather than calling local review independent. Fix verified data-loss/privacy/interaction defects before handoff.
- [ ] Update status with actual tests and any remaining blocked capability. Remove prototype wording only after the full acceptance matrix passes. Keep real multi-user collaboration/live provider ingestion explicitly outside this local workspace upgrade.
- [ ] Save a local verified-upgrade commit scoped to this plan; do not push. Report both the pre-upgrade checkpoint and upgrade commit, build location, verified behavior and limitations.

## Coverage and preflight review

| Specification acceptance | Owning tasks |
| --- | --- |
| 1. Multi-object modes and stable IDs | 1, 4, 5, 7 |
| 2. Canonical rich text and concurrent drafts | 2, 4, 7 |
| 3. Persistent geometry/style/viewport | 1, 4, 6, 7 |
| 4. Nested pages without bookmark mutation | 1, 5, 7 |
| 5. Shared file bytes and safe previews | 3, 6, 7 |
| 6. Idempotent project refresh | 1, 5, 7 |
| 7. Memory privacy and no unsolicited requests | 4, 7 |
| 8. Failed-save/navigation recovery | 4, 5, 7 |
| 9. Empty/missing/legacy/malformed states | 1, 2, 6, 7 |
| 10. Regression, real interactions, visual QA | 4, 5, 7 |

No application implementation has started under this plan. The checkpoint and baseline verification are complete independently of plan approval. Fresh baseline: 63/63 unit tests, lint/format/both type checks and production build passed. The existing 41.11 MB bundle and large-chunk warning remain unchanged. The native API audit is complete; it is research, not implementation or an independent code review of the future upgrade.
