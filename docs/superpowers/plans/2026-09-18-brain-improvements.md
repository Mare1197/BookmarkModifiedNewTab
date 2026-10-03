# Brain Improvements Implementation Plan

> Use test-first implementation with task-scoped independent review. User approved all seven recommendations.

**Goal:** Add atomic data safety, controllable memory, ranked bounded context, provider-export import, bounded/reactive views, project homepages/resume and a real reference-only BlockSuite prototype.

**Architecture:** Preserve the existing canonical Dexie entity/relation model and the New Tab shell. Additional source metadata is optional, adapters are replaceable, view structures contain object IDs only. External actions require explicit user interaction.

**Tech Stack:** Existing React/TypeScript/Dexie/React Flow; locally bundled BlockSuite only for an isolated prototype.

**Spec:** The seven recommendations in the conversation followed by the user's "Add them all" approval; the existing five-reference architecture in `docs/CONNECTED_KNOWLEDGE_ADDENDUM.md` remains binding.

## Global Constraints

- Do not rebuild the app or introduce another content database.
- Preserve uncommitted implementation and source IDs; synced parent `sources/` is read-only.
- No commit, push, provider account access, or external AI transmission in this task.
- Imports must preview changes and require explicit application; preserve local edits by default.
- Forgotten/excluded memory must never be retrieved for AI, even when directly selected.
- No recursive project expansion across unconfirmed relations; no automatic opening of external tabs.

## Task 1: Data safety, memory and context

Files: `brainRepository.ts`, `brainSelectors.ts`, `workspaceRepository.ts`, `BrainObjectTools.tsx`, `WorkspaceUtilities.tsx`, `tests/brainRepository.test.js`.

- [x] Write/run failing tests: entity update rollback when backlink/activity write fails; malformed view/tile import rejection; forgotten/excluded/expired memory omitted; ranked whole-item context with exclusion reasons and citations.
- [x] Implement `setMemoryPolicy(entityId, policy)` for status active/forgotten, excludedFromAI, scope project/private, reviewBy, reviewedAt. Editing uses existing Inspector. Forget is a retained tombstone to avoid reimport resurrection; UI names retention explicitly.
- [x] Implement `buildBrainContext(entityId, entities, relationships, options)` returning `{text,included,excluded}` with whole items, bounded length, relevance ordering, explanations, source IDs and conflict flags. Keep `brainContext` as compatibility wrapper.
- [x] Validate saved-view query fields and tile layout at both import and consumption. Wrap entity/backlink/activity writes in one transaction.
- [x] Run focused tests and lint/typecheck.

## Task 2: Provider export adapters and preview

Files owned by worker: `src/react/workspace/chatExportAdapters.ts`, `chatImportService.ts`, `ConversationImportPanel.tsx`, associated `tests/chat*.test.js` and test helpers only.

Interfaces: `parseChatExport(input: unknown): PreparedConversation[]`; each conversation has provider/sourceId/title/url?, createdAt?/updatedAt? (epoch milliseconds), messages with id/role/text and optional createdAt/updatedAt/parentId/attachments. `previewChatImport` reads existing IDs and reports new/updated/conflicted records. Import service calls `importConversation(input, {conflictPolicy: 'preserve-local'|'take-source'})`; root owns that shared method and its type expansion. UI takes onImported/onStatus and renders file/paste input, preview counts and explicit policy before applying.

- [x] Tests first: ChatGPT mapping export, Claude messages export, normalized JSON, invalid records, stable branch IDs/timestamps/attachment references, duplicate inputs, conflict preview and preservation.
- [x] Implement adapters using actual source schemas/primary evidence, with honest unsupported-content warnings; never fetch attachment URLs or execute exported text.
- [x] Implement local preview/import service and UI without modifying shared repository, global app or package files.
- [x] Focused tests, typecheck and concise report; no commits/subagents.

## Task 3: Bounded reactive views and project homepage

Files: `WorkspaceApp.tsx`, `BrainWorkspace.tsx`, new `ProjectHome.tsx`, `brainSelectors.ts`, `workspaceRepository.ts`, tests.

- [x] Tests first: page slices stable IDs, focused graph cap with honest omission counts, project context excludes other projects, resume deduplicates only HTTP(S) sources and requires explicit confirmation.
- [x] Load blobs only for visible placements/assets; split metadata reads from blob reads; subscribe to Dexie liveQuery for cross-tab refresh and suppress stale results.
- [x] Paginate tables/tiles and limit graph rendering; replace nested repeated searches with maps/sets where relevant.
- [x] Project homepage groups confirmed members into recent chats/research/tasks/memory and exposes project canvas plus previewed Resume work.

## Task 4: BlockSuite reference-only prototype

Files: isolated editor adapter/component, package manifest/lock, tests; integration owned by root.

- [x] Research current package APIs and CSP compatibility before installation.
- [x] Prove custom reference block stores only canonical object ID; document and edgeless presentations read/write canonical content through an adapter.
- [x] Test edits, reload, adapter disposal and source-of-truth separation; keep prototype labeled and lazy-loaded. Do not substitute an iframe or claim a mock is BlockSuite.

## Task 5: Verification and handoff

- [x] Read current browser skill and try in-app browser; user approval to "add them all" includes the recommended browser interaction tests using the previously described isolated test setup.
- [x] Add/run browser flows for import → project → memory → views → reload; saved-view navigation; memory exclusion; project resume preview; editor reference behavior.
- [x] Run full tests/build, task and final review, update `UNIFIED_BRAIN_STATUS.md` with actual completion and limitations.

## Execution ledger

Ruling: Work in the current feature checkout — required prior implementation is untracked and absent from HEAD, so creating a clean worktree would omit it. No unrelated edits will be staged.

Ruling: Preserve user's dirty checkout instead of skill-default commits; review new files and focused changed files directly with test evidence. No Git history mutation is needed for these requested features.

Preflight: Task 1 produces importConversation options/types consumed by Task 2; root owns shared repository. Task 2 owns isolated adapter/service/component only. Tasks 1/3 share selectors and UI integration and remain root-owned. Task 4 research is read-only while Task 2 implements; only one implementation worker at a time. Task 5 tests all interfaces. Each task's tests match its stated boundary; no second content store is permitted.

September 19 verification ledger:
- All seven bounded recommendations implemented; the broader five-reference specification remains unfinished and is itemized in UNIFIED_BRAIN_STATUS.md.
- Red/green checks exposed and fixed batch-import partial writes, backup input mutation, missing project grouping, BlockSuite production service registration, local WASM CSP and the edgeless selection layer covering the reference form.
- Production build passed (41.11 MB uncompressed, lazy editor chunk warning). Third-party notices/source archive links are included.
- Full isolated MV3 Chromium regression suite: 10/10 passed, including real document and edgeless edits, reload and runtime reference-schema/no-content-copy assertions. Existing desktop/mobile/accessibility smoke remains passing.
- npm test: lint, format and both type checks plus 63/63 unit tests passed. npm dependency audit: zero reported vulnerabilities after compatible js-yaml patch.
- Browser bridge unavailable; previously approved isolated Playwright fallback used. No live-provider calls or personal-profile installation.
- Independent review agent was unavailable due to a usage limit; root performed local code review and added the batch atomicity and immutable-backup regressions. This is not claimed as a completed independent review.
- Existing dirty checkout and branch preserved. No staging, commit, push or deployment.
