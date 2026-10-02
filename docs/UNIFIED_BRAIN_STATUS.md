# Unified Brain: implementation status

Updated October 2, 2026. The shared-Brain improvements, persistent BlockSuite workspace, and local recovery upgrade are implemented and verified as the bounded slice below. The full five-reference product specification is **not finished**.

## Use the new features

Open **Boards → Brain**. The existing desktop, browser capture, Explorer, React Flow canvas and Dexie database remain in place.

- Expand **Create an object or import a conversation** to create canonical objects or preview a local ChatGPT, Claude or normalized JSON export. Nothing imports until **Import conversations**. Local edits are preserved by default; **Take source values** is explicit. The whole batch rolls back on failure. Stable provider/message IDs, parent IDs, original timestamps and attachment metadata are retained. Attachments are not downloaded; missing export messages do not delete existing objects.
- Select an object to access projects, backlinks, graph, shared views, canvas, sourced memory and optional AI. Confirmed project membership links preserve identity across views; nested project cycles are rejected.
- Select a memory for **Exclude from AI**, private/project recall scope, review date, reviewed status and **Forget/Restore**. Forget retains an audit record, not erasure. Backup merge cannot undo existing memory privacy choices. Notes edits update canonical content and backlinks atomically. A confirmed **Contradicts** link excludes the affected memory until that link is removed in Graph after review.
- **Ask AI → Review exact context** shows ranked, whole-item context, inclusion/exclusion reasons and source IDs, capped at 24,000 characters. Forgotten, excluded, overdue, conflicting and out-of-scope private memories are omitted. Connected context is opt-in; policies are rechecked from storage before a request. There are no background provider requests.
- Table, Kanban, Tiles, Timeline and AI Inbox use the same canonical objects. Tables/cards are paginated at 50; Graph caps at 200 after scope selection and reports omitted counts. Saved views and tile settings are validated both on import and use. The AI Inbox still uses explicitly labeled local keyword suggestions with Accept/Reject, not a remote classification model.
- Select a project filter for its homepage: recent objects plus chats, research, tasks, memory and notes/ideas groups. **Preview resume work** excludes unsafe, duplicate and already-open URLs. Only confirmation opens tabs (maximum 20); current membership and open tabs are checked again. No existing tabs are closed.
- Cross-tab changes refresh automatically. Asset blobs load for the active board or paged Assets view instead of every workspace refresh. Metadata still loads in memory; this is bounded rendering, not a fully virtualized large-library database engine.
- **Open in workspace**, or **Boards → Workspace**, opens real, locally bundled BlockSuite document, edgeless and mixed renderers. Add multiple existing objects, create notes, upload local files, navigate child pages, and edit canonical rich text. Reference blocks store only `entityId` and `placementId`; transient Yjs state is not a second persistent database. Existing Canvas remains available.
- Native card dragging and the keyboard geometry controls save canonical placements. Workspace controls persist order, groups, collapse, colors, semantic connectors and viewport. Project workspaces reuse project identity and can explicitly add missing members. Removing a reference does not delete its object. Duplicating a page creates new presentation references, not copies of its objects.
- Notes support formatted runs and paragraph, heading, list, check, quote and code blocks. Chats/messages, tasks, memories, browser sources, repositories and files resolve through the existing Brain. Local uploads are limited to 25 MiB; raster previews require matching signatures, and other accepted files download as inert attachments. No remote attachments are fetched.
- Saves compare revisions and placement fingerprints. Each edit is journaled locally before canonical autosave; only acknowledged journal transactions are recoverable after interruption. Failed/conflicting saves retain drafts and block navigation; the shell **Recovery** action remains accessible. Preview Base/Current saved/Your draft, use a reviewed draft, combine rich text manually, export, or retain current content. Other unsaved targets and newer generations are preserved.
- **Page history** and Inspector **Content history** preview, export, restore and delete bounded local revisions. Restoration creates a new revision and checks the current version and dependencies. Retention is 50 snapshots or 5 MiB per target and 50 MiB globally; pending drafts have 5 MiB per-record and 50 MiB total limits and are never automatically evicted. Missing objects must be restored separately, not reconstructed from history.
- Ordinary backups exclude private drafts/history. Settings offers explicit **Include private recovery drafts and history**, with a removed/private-content warning. Optional imports receive fresh inactive identities, never auto-apply, and reject malformed/over-limit input atomically. Canonical exports read one consistent transaction; covered import replacements retain preimages, including unopened legacy boards. Recovery tables are not searched or sent to AI.

## Reuse and dependency decisions

BlockSuite 0.19.5 packages are integrated through an isolated adapter, not an AFFiNE database. The icons package is pinned to 2.1.75 because newer icons removed an export required by these packages. Production bundling preserves constructor names needed by BlockSuite dependency injection. Locally bundled syntax highlighting needs the narrowly scoped WebAssembly allowance documented in [Chrome's MV3 CSP reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy); remote scripts and JavaScript `eval` remain disallowed.

The complete uncompressed extension is approximately 41.20 MB and retains a large lazy editor chunk. The older icons package emits a Node-engine warning on Node 24 despite passing the tested build and browser flows. This is an integrated workspace, not a production-complete AFFiNE replacement. The build includes `THIRD_PARTY_NOTICES.txt` with licenses/source archives, including MPL-2.0 BlockSuite.

AppFlowy, Anytype, Logseq and xTiles remain interaction/data-model references, not additional backends. See [the connected knowledge specification](CONNECTED_KNOWLEDGE_ADDENDUM.md) and [improvements plan](superpowers/plans/2026-09-18-brain-improvements.md).

## Still outside this delivered slice

- Complete native-editor parity: connector endpoint/path rerouting, every native group/style/reorder operation, a full page-outline tree, rich-block deletion/reordering and comprehensive list/heading controls. Use the workspace controls for persistent supported operations; arbitrary native block insertion is rejected visibly.
- Multi-user collaboration, cloud sync and universal undo. Recovery covers locally acknowledged journals, not power loss before acknowledgement, erased browser storage, disk failure or extension uninstall. It is not an off-device backup.
- Live provider ingestion/chat continuation, authenticated GitHub/Codex/automation connectors and a complete browser activity journal.
- Model-powered organization, cluster merge review, arbitrary property schemas, configurable grouping and advanced dashboard/timeline templates.
- All connected actions in every legacy context menu, exhaustive accessibility/responsive testing, and large-library performance benchmarks.
- Forgetting is local retrieval exclusion, not deletion from exports, original sources, past saved analyses or provider-side retention. Actual provider requests were not exercised.

## Verification boundary

Tests use real Dexie with fake IndexedDB plus the built MV3 extension in isolated Chromium profiles. No personal browser profile or provider account was accessed. The in-app browser bridge was unavailable, so the previously approved standalone test harness was used.

Local verification: lint, formatting, both TypeScript checks and 123 unit/integration tests; production build; browser regression suite; production dependency audit (no high-severity findings, one low-severity DOMPurify advisory). Browser coverage includes import/preview, memory exclusion, shared views, project resume preview, cross-tab refresh, reload, canonical-only document/canvas/mixed editing, native card dragging, keyboard sizing, child-page navigation, conflict comparison/manual editing, acknowledged content/layout recovery after renderer crash and profile reopen, guarded history restoration, committed connector replay prevention, and existing desktop/hierarchy/reminder/search/session/backup workflows. Narrow viewport overflow is tested, but this is not an exhaustive mobile/accessibility audit. Native connector gestures and every combination of object types have not received end-to-end coverage.

Final browser run: **17/17 passed** against the production MV3 build. The native format bar is disabled because canonical notes own formatting; this also avoids its asynchronous selection callback accessing a detached editor. Native drag testing retries projection remounts through Playwright's locator actionability checks. Toolbar actions remain reachable in separate scrollable rows and board-specific actions wait for initial board loading.

A fresh independent recovery review completed with three Important findings and no Critical findings. Unopened-board import preimages, asynchronous recovery reconciliation, and inspectable formatting/layout comparisons were fixed with failing-then-passing regression tests. Earlier save-queue race tests also remain green. The reviewer did not re-review the fixes; final author-run verification is documented in [the recovery verification report](WORKSPACE_RECOVERY_VERIFICATION.md), together with deferred minors and decision costs.

Local checkpoint commits preserve the pre-upgrade state and the canonical page, rich-content and asset layers. The earlier baseline through `f68f042` was published on `feature/browser-resources-inspector`; this recovery upgrade is local on that branch and has not been pushed. No deployment or installation into the user's browser is included. The built unpacked extension is in `dist/`; generated build output is not committed.

## Recommended next upgrades

1. Recovery follow-ups: lightweight indexed draft-summary pagination and confirmation before inactive Keep current discards. The initial durable journal/history/comparison implementation passed the final verification gate above.
2. Complete connector routing and native operation persistence, richer block controls and a searchable nested-page outline; add end-to-end gesture coverage.
3. Large-library benchmarks, indexed/paged queries and editor bundle reduction before expanding live provider integrations.
