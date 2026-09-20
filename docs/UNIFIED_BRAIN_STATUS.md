# Unified Brain: implementation status

Updated September 20, 2026. The shared-Brain improvements and persistent BlockSuite workspace build are implemented as the bounded slice below. The full five-reference product specification is **not finished**.

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
- Saves compare revisions and placement fingerprints. Failed/conflicting saves retain drafts and block in-app navigation; retry, draft export, explicit replacement and discard/reload are available. Pending content and layout queues drain before leaving. Backup validation includes rich content, page owners, group/parent cycles, connector references and local asset sizes. Drafts are currently in memory, not crash-durable storage.

## Reuse and dependency decisions

BlockSuite 0.19.5 packages are integrated through an isolated adapter, not an AFFiNE database. The icons package is pinned to 2.1.75 because newer icons removed an export required by these packages. Production bundling preserves constructor names needed by BlockSuite dependency injection. Locally bundled syntax highlighting needs the narrowly scoped WebAssembly allowance documented in [Chrome's MV3 CSP reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy); remote scripts and JavaScript `eval` remain disallowed.

The complete uncompressed extension is approximately 41.16 MB and retains a large lazy editor chunk. The older icons package emits a Node-engine warning on Node 24 despite passing the tested build and browser flows. This is an integrated workspace, not a production-complete AFFiNE replacement. The build includes `THIRD_PARTY_NOTICES.txt` with licenses/source archives, including MPL-2.0 BlockSuite.

AppFlowy, Anytype, Logseq and xTiles remain interaction/data-model references, not additional backends. See [the connected knowledge specification](CONNECTED_KNOWLEDGE_ADDENDUM.md) and [improvements plan](superpowers/plans/2026-09-18-brain-improvements.md).

## Still outside this delivered slice

- Complete native-editor parity: connector endpoint/path rerouting, every native group/style/reorder operation, a full page-outline tree, rich-block deletion/reordering and comprehensive list/heading controls. Use the workspace controls for persistent supported operations; arbitrary native block insertion is rejected visibly.
- Durable crash recovery, version history, multi-user collaboration and cloud sync. The layout undo is session-local and note undo is limited; it is not full historical recovery.
- Live provider ingestion/chat continuation, authenticated GitHub/Codex/automation connectors and a complete browser activity journal.
- Model-powered organization, cluster merge review, arbitrary property schemas, configurable grouping and advanced dashboard/timeline templates.
- All connected actions in every legacy context menu, exhaustive accessibility/responsive testing, and large-library performance benchmarks.
- Forgetting is local retrieval exclusion, not deletion from exports, original sources, past saved analyses or provider-side retention. Actual provider requests were not exercised.

## Verification boundary

Tests use real Dexie with fake IndexedDB plus the built MV3 extension in isolated Chromium profiles. No personal browser profile or provider account was accessed. The in-app browser bridge was unavailable, so the previously approved standalone test harness was used.

Local verification: lint, formatting, both TypeScript checks and 84 unit tests; production build; browser regression suite; production dependency audit (zero reported vulnerabilities). Browser coverage includes import/preview, memory exclusion, shared views, project resume preview, cross-tab refresh, reload, canonical-only document/canvas/mixed editing, native card dragging, keyboard sizing, child-page navigation, explicit conflict replacement, and existing desktop/hierarchy/reminder/search/session/backup workflows. Narrow viewport overflow is tested, but this is not an exhaustive mobile/accessibility audit. Native connector gestures and every combination of object types have not received end-to-end coverage.

Final browser run: **13/13 passed** against the production MV3 build. The native format bar is disabled because canonical notes own formatting; this also avoids its asynchronous selection callback accessing a detached editor. Native drag testing retries projection remounts through Playwright's locator actionability checks.

The independent reviewer reported two save-queue races, now fixed with regression tests, before hitting its usage limit. No completed independent final-review verdict is available; remaining checks were performed locally.

Local checkpoint commits preserve the pre-upgrade state and the canonical page, rich-content and asset layers. The user subsequently authorized publishing the verified upgrade on `feature/browser-resources-inspector`. No deployment or installation into the user's browser is included. The built unpacked extension is in `dist/`; generated build output is not committed.

## Recommended next upgrades

1. Durable local draft recovery, version history and a conflict-diff screen, retaining the shared Brain as the authority.
2. Complete connector routing and native operation persistence, richer block controls and a searchable nested-page outline; add end-to-end gesture coverage.
3. Large-library benchmarks, indexed/paged queries and editor bundle reduction before expanding live provider integrations.
