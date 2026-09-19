# Unified Brain: implementation status

Updated September 19, 2026. The seven approved improvements are implemented as the bounded slice below. The full five-reference product specification is **not finished**.

## Use the new features

Open **Boards → Brain**. The existing desktop, browser capture, Explorer, React Flow canvas and Dexie database remain in place.

- Expand **Create an object or import a conversation** to create canonical objects or preview a local ChatGPT, Claude or normalized JSON export. Nothing imports until **Import conversations**. Local edits are preserved by default; **Take source values** is explicit. The whole batch rolls back on failure. Stable provider/message IDs, parent IDs, original timestamps and attachment metadata are retained. Attachments are not downloaded; missing export messages do not delete existing objects.
- Select an object to access projects, backlinks, graph, shared views, canvas, sourced memory and optional AI. Confirmed project membership links preserve identity across views; nested project cycles are rejected.
- Select a memory for **Exclude from AI**, private/project recall scope, review date, reviewed status and **Forget/Restore**. Forget retains an audit record, not erasure. Backup merge cannot undo existing memory privacy choices. Notes edits update canonical content and backlinks atomically. A confirmed **Contradicts** link excludes the affected memory until that link is removed in Graph after review.
- **Ask AI → Review exact context** shows ranked, whole-item context, inclusion/exclusion reasons and source IDs, capped at 24,000 characters. Forgotten, excluded, overdue, conflicting and out-of-scope private memories are omitted. Connected context is opt-in; policies are rechecked from storage before a request. There are no background provider requests.
- Table, Kanban, Tiles, Timeline and AI Inbox use the same canonical objects. Tables/cards are paginated at 50; Graph caps at 200 after scope selection and reports omitted counts. Saved views and tile settings are validated both on import and use. The AI Inbox still uses explicitly labeled local keyword suggestions with Accept/Reject, not a remote classification model.
- Select a project filter for its homepage: recent objects plus chats, research, tasks, memory and notes/ideas groups. **Preview resume work** excludes unsafe, duplicate and already-open URLs. Only confirmation opens tabs (maximum 20); current membership and open tabs are checked again. No existing tabs are closed.
- Cross-tab changes refresh automatically. Asset blobs load for the active board or paged Assets view instead of every workspace refresh. Metadata still loads in memory; this is bounded rendering, not a fully virtualized large-library database engine.
- **Open in BlockSuite prototype** opens real, locally bundled BlockSuite document and edgeless renderers. Both display/edit the same canonical reference. The custom block schema contains only `entityId`; the transient Yjs document has no persisted Brain content, sync backend or collaboration provider. The surrounding native document is read-only; the custom form writes through the existing repository. The adapter is lazy-loaded and disposed on exit. Continue using the existing Canvas for full layout.

## Reuse and dependency decisions

BlockSuite 0.19.5 packages are integrated through an isolated adapter, not an AFFiNE database. The icons package is pinned to 2.1.75 because newer icons removed an export required by these packages. Production bundling preserves constructor names needed by BlockSuite dependency injection. Locally bundled syntax highlighting needs the narrowly scoped WebAssembly allowance documented in [Chrome's MV3 CSP reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy); remote scripts and JavaScript `eval` remain disallowed.

The prototype increases the complete uncompressed extension to approximately 41 MB and retains a large lazy editor chunk. The older icons package emits a Node-engine warning on Node 24 despite passing the tested build and browser flows. Treat the editor as an experiment, not a production-complete AFFiNE replacement. The build includes `THIRD_PARTY_NOTICES.txt` with licenses/source archives, including MPL-2.0 BlockSuite.

AppFlowy, Anytype, Logseq and xTiles remain interaction/data-model references, not additional backends. See [the connected knowledge specification](CONNECTED_KNOWLEDGE_ADDENDUM.md) and [improvements plan](superpowers/plans/2026-09-18-brain-improvements.md).

## Still outside this delivered slice

- Full rich-text/mixed pages, persistent native BlockSuite layouts, nested document blocks, collaborative editing and native editor attachments.
- Live provider ingestion/chat continuation, authenticated GitHub/Codex/automation connectors and a complete browser activity journal.
- Model-powered organization, cluster merge review, arbitrary property schemas, configurable grouping and advanced dashboard/timeline templates.
- All connected actions in every legacy context menu, exhaustive accessibility/responsive testing, and large-library performance benchmarks.
- Forgetting is local retrieval exclusion, not deletion from exports, original sources, past saved analyses or provider-side retention. Actual provider requests were not exercised.

## Verification boundary

Tests use real Dexie with fake IndexedDB plus the built MV3 extension in isolated Chromium profiles. No personal browser profile or provider account was accessed. The in-app browser bridge was unavailable, so the previously approved standalone test harness was used.

Local verification: lint, formatting, both TypeScript checks and 63 unit tests; production build; browser regression suite; dependency audit. Final browser totals are recorded in the plan's execution ledger. Browser coverage includes import/preview, memory exclusion, shared views, project resume preview, cross-tab refresh, reload, canonical-only BlockSuite document/edgeless editing, and existing desktop/hierarchy/reminder/search/session/backup workflows. The separate review agent hit a usage limit; final review was performed locally.

No commit, push, deployment or installation into the user's browser was performed. The built unpacked extension is in `dist/`.
