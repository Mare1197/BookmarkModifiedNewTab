# New Tab OS — instructions to reproduce the current build

Updated 8 October 2026. Reference branch: `feature/large-library-performance` in `Mare1197/BookmarkModifiedNewTab`; implemented application checkpoint: `c55211078890178c30b2d2776e8cfd0f27bace1b`. Subsequent reporting commits do not change that application checkpoint.

Give this document to a builder when asking for the same functional application. It defines behavior and app logic without prescribing a technology stack or visual design. The [full product handoff](AI_BUILDER_PRODUCT_HANDOFF.md) and [connected knowledge requirements](CONNECTED_KNOWLEDGE_ADDENDUM.md) retain the broader requested roadmap. Features under “Remaining requested features” below are future work, not requirements already satisfied by this reference build.

## Builder instructions

Continue the existing New Tab OS when source is supplied. Inspect its working desktop, browser integration, shared object store, editor, persistence and tests before changing anything. Preserve existing user data and supported behavior. Implement usable persistent workflows rather than sample-data demonstrations.

The New Tab page is the application entry point. Local organization, editing, search, projects, imported conversations, memory review and recovery work without an AI account. External browsing and explicitly requested provider calls require connectivity.

Keep one shared Brain beneath every workspace view. An object is content with a stable identity; a folder membership, project link, board placement and canvas connector are references to that identity. Editing content updates every occurrence. Changing position, size, ordering or a view filter changes presentation only.

Preserve distinctions between native browser resources, captured workspace objects, retained snapshots, live instances, derived content and suggestions. Show missing provenance as Unknown. Never turn an inferred relationship into a confirmed fact or silently overwrite a local edit when a source refreshes.

## 1. Entry point, desktop and browser resources

- New Tab opens the existing bookmark desktop. Bookmarks, native bookmark folders and rich documents have real open/edit actions. Internal folder and document windows can be opened together, moved and resized. Preserve drag/drop, multi-selection, quick search, custom icons/backgrounds, backup/import and optional legacy browser sync.
- The resource dock opens Bookmarks, Open Tabs, History, Search and Settings. Open Tabs lists actual browser windows/tabs, supports available browser actions and shares browser details with an Inspector. History searches accessible browser history and opens real results.
- A browser-resource Inspector exposes available page, tab/session and domain details. Tab creation time is “Opened” only when creation was observed; pre-existing tabs use “First observed” or Unknown. Record opener/search provenance only when evidence exists. Domain first/last visits describe accessible history, not lifetime history. Display browser metadata in local `DD/MM/YYYY HH:mm` time.
- Do not accumulate total-open-time tracking. Clearing history or losing permission must not erase independently saved workspace content.
- Boards opens the shared workspace. Native bookmarks remain editable through the established desktop; their mirrored folders are read-only in workspace organization.

## 2. Shared objects, relationships and sources

Support durable identities for projects, conversations, messages, pages/websites, bookmarks, tabs, browser visits, searches, notes/documents, ideas, memories, tasks, prompts, repositories, files, images/screenshots, clips, analyses, automations/runs, features and implementation references such as sessions/commits. Some types are generic manually created/imported records; a type alone does not imply a live external connector.

Objects retain title, type, content, properties, tags, timestamps and available source/provider references. Browser source references distinguish a page from its separate bookmark/tab/history occurrences. Capture/reconciliation reuses known identities conservatively and preserves workspace-edited titles and notes.

Relationships retain endpoints, type, direction, origin and confirmation state. Generated suggestions retain available confidence, generator and evidence. Project membership uses confirmed links and rejects nested project cycles. Explicit note references by object ID create backlinks when saved. Do not infer relationships from a shared appearance alone.

“Add to board” adds a placement. “Add to folder” adds membership while retaining other memberships. Moving a folder occurrence changes only that membership. Duplicating a placement reuses the object; independent duplication must be explicit. Removing a placement does not delete the object or its shared relationship.

## 3. Boards and interchangeable views

- Create, rename, switch, duplicate and delete persistent boards. Reuse underlying content when duplicating board organization. Provide notes, captured web pages, images/screenshots, files and connected objects where supported.
- Explorer searches and selects canonical objects across the library. Selection resolves the object independently of its current board or search page; Inspector must not mistake an off-page object for deletion.
- Canvas supports placement selection, moving, connections, pan/zoom, duplicates and removal. Mind Map lays out the same objects for topic navigation. Graph uses confirmed relationships, starts with 200 scoped objects and explicitly loads 200 more. Preserve links between already represented endpoints across graph pages.
- Brain switches one filtered dataset between Table, Kanban, Tiles, Timeline and AI Inbox. Filters include text, type, project, status and ordering. Saved views retain their settings. Changing mode never copies content.
- Table exposes name/type/status/activity and workspace actions. Kanban uses Backlog, Next, In Progress, Blocked and Done; moving a card updates the canonical status. Tiles retain object ID, order and width; reordering/resizing is presentation only. Timeline independently pages activities for the objects on the current collection page.
- Project homepages gather confirmed members into recent items, chats, research, tasks, memory and notes/ideas. Preview resume-work gathers the complete project scope, removes duplicate/unsafe URLs, discloses the tabs to open and requires confirmation before opening them.

## 4. Document, canvas and mixed workspace

Provide a real document/edgeless workspace with movable referenced objects, rich notes, local images/files, connectors, free positioning, zoom/pan, nested child pages and mixed document-plus-canvas pages. The reference implementation uses AFFiNE's BlockSuite editor; it stores canonical content and page presentation in the Brain rather than an independent AFFiNE content database.

Open in Canvas/Open in workspace can place the original chat, browser page, project, note or file in that workspace. Opening or dragging a reference must retain the original object's identity. Saved page data contains reference IDs, layout, grouping and connector geometry; transient editor state is not a second content authority.

Rich notes support editing, headings, sequential numbered lists, block movement/deletion and undo of the last canonical text save. Images/files retain local bytes and available metadata; export/download remains available for unsupported previews. File operations must preserve shared references and report errors without claiming success.

Connector style/shape/color/dash are page presentation. Endpoint retargeting creates or reuses a shared relationship; retain the original relationship until explicitly unlinked. Orthogonal connectors support draggable route bends, keyboard movement, reset and cancellation. Escape/pointer cancellation restores the prior geometry. Layout undo and reviewed page history restore are available. Removing a connector from a page differs from confirmed “Unlink everywhere.”

The searchable page outline finds nested pages while retaining ancestor context. Breadcrumbs navigate page parents. Reject page containment cycles. Navigation flushes edits; failed or conflicting saves block leaving until resolved. Generic data refresh must not remount an active editor or discard its draft.

## 5. Folders and Inspector

Workspace folders can be created and nested. Expand a folder to load its member page; collapsed folders do not fetch all object bodies. One object may belong to several folders/boards/projects.

Select a member to move that occurrence, select “Move folder” to reparent a folder, or use drag/drop. Offer equivalent destination controls with search and paging. Moving to Workspace root removes the selected membership only. Reject self/descendant moves. One persistent undo slot restores the last move after reload and refuses to overwrite intervening edits.

Inspector edits canonical titles/plain notes and offers rich-text editing separately. Drafts stay attached to their object when selection changes. A save completing after later typing must not discard the newer draft.

Show available source, related objects, outgoing/incoming links, projects, all board/folder memberships and recent recorded object activity. Provide valid actions to open the original, add to a project/board/folder, open Canvas/workspace, show Graph/backlinks/related items/history, switch Brain views, connect objects, save sourced memory and request optional analysis. Do not imply every action is already present in every legacy context menu.

## 6. Capture, Inbox, search and productivity

- Quick Add and Ctrl/Cmd+K provide local capture and commands. Explicit destinations can include Inbox, the current board, a workspace folder and a relationship. Validate destinations and commit the promised local capture together. A failed save retains the draft and leaves no partially promised placement/membership. Avoid duplicate submission.
- Supported workflows include notes, tasks, URLs/recent tabs, local page-text clips, images/files and workspace screenshots. Visible-page capture is invoked explicitly from the extension action where supported. Preserve capture source and retained text. Clip extraction requests permission for the selected origin, allows review before save and reports unavailable extraction.
- Inbox is a state on the original object, not a copy. Filing/removing Inbox state retains other memberships. Quick Inbox and Brain AI Inbox operate on the same data. Current project suggestions use labeled local keywords and require Accept/Reject; they do not silently reorganize content or call a model.
- Smart Search supports existing text and field syntax, including type, tags, domain, URL, board, source, task status, due/date ranges and recent activity where implemented. Built-in Notes/Recently Updated/Web Clips/With Tasks filters are protected by identity. Custom filters can be saved/deleted, including an empty query for all eligible objects.
- Tasks have a canonical object plus status, optional due date/reminder and related context. Tasks can be filtered, placed and opened in Focus Mode. Focus changes the working scope, not saved membership. Local reminder time survives reload; alarm/notification scheduling is a separate browser outcome from saving the task.
- Sessions capture the current window's safe web tabs, original addresses/fragments, order and pinned state. Saved sessions remain historical snapshots and open in a new window. Session deletion does not close current browser tabs.
- Activity records observed workspace actions with available object/board/session context. Do not represent this as a complete reconstruction of browser history.
- Blank/research/reading/project templates create independently editable boards. Auto-layout changes chosen page geometry and preserves shared content/relationships.

## 7. AI conversations and shared memory

Conversation import previews local ChatGPT, Claude or normalized JSON exports. Import happens only after confirmation; a batch fails atomically. Reimport uses stable provider/conversation/message identities and preserves local edits by default. Taking source values is explicit. Missing messages do not silently delete saved material.

Retain available author/role, provider order, message-parent/branch references, original timestamps, source URL and attachment metadata. Display provider order consistently after reimport/reload. Attachment metadata does not mean attachment bytes were downloaded. The current integration is import/reconciliation, not live access to all provider accounts.

Chats and messages link directly to projects, notes, research, tasks and memories. A user can save a reviewed statement as memory with its source and confirmed project links. Saving memory does not verify the statement or call a model.

Memory controls include reviewed status/date, review deadline, project/private recall scope, Exclude from AI, Forget and Restore. Forgotten memory remains as an audit record but is excluded from future provider context. Forgetting memory does not delete its source chat. Backup merge cannot silently undo an existing privacy choice. A confirmed Contradicts relationship excludes affected memory pending resolution.

Ask AI is optional and explicitly invoked. Review exact context before sending: show included/excluded records, reasons and supporting object IDs. Include whole ranked items up to the current 24,000-character budget. Exclude forgotten, excluded, overdue, contradictory and out-of-scope private memory. Connected context is opt-in. Recheck policies from current storage immediately before transmission. Private drafts/revision history are excluded.

Save an analysis separately from its source objects and keep proposed relationships unconfirmed until accepted. Opening a view, importing a conversation or reading memory never starts a provider request. The current configured provider workflow is Gemini; other named services must not be advertised as live connectors without implementation and acceptance evidence. Disclose provider credential storage and offer clearing it: the current key is unencrypted in the local browser profile, not a secure credential vault.

## 8. Persistence, backups, Trash and recovery

Preserve working native bookmark and legacy backup/sync behavior alongside the shared Brain. Workspace backup/export/import covers canonical objects, sources, placements, relationships, memberships, tasks, sessions, filters, supported assets and page presentation. Validate versions and malformed input before applying changes; preserve original identities. Full export must not export only the current page of results.

Workspace Trash offers reviewed restoration of supported deletions. Do not conflate deleting a native bookmark with workspace Trash. Asset lifetime follows retained references. Permanent deletion is explicit.

Document/canvas edits have private local draft journals. Only acknowledged journal writes are recoverable after renderer crash/profile restart. Recovery offers Base/Current/Draft comparison, manual rich-text combination, fresh generation checks and confirmation before discarding a draft. Reconciliation applies only the reviewed operations and preserves newer pending work.

Content history and page history preview saved revisions and check current state before restoration. Page geometry is page-local; restoring shared content can affect every reference and must be disclosed. Ordinary backups omit private drafts/history; including recovery data is explicit. Recovery cannot repair erased browser storage, uninstall or disk loss.

## 9. Large-library behavior and failure states

Collection reads return at most 50 objects, with Previous/Next controls; selected objects and complete explicit operations use their actual intended scope. A fixed board must not hydrate unrelated library content. Stable traversal must return every match once, including equal timestamps and normalization-equivalent Unicode IDs.

Explorer uses viewport-bounded rendering; expanded folders use one aggregate hierarchy viewport rather than a separate rendered list per branch. Include overscan and focused/dragged rows. Keyboard navigation scrolls targets into view. Searchable project/object/folder pickers page candidates and independently retain a selected ID's label. Canvas renders visible cards; Fit view exposes offscreen placements without removing their saved content.

Same-count cross-tab changes update their affected scopes. Preserve prior successful rows during same-scope refresh; show errors separately from empty results. Rebuild invalidated continuations while retaining the current page where possible. Changing filters resets pagination and renews relative-date anchoring. Cancel obsolete reads and prevent old queries from publishing into a newer scope.

Optional views load when used. Failed view loading must leave navigation available and provide Retry/confirmed Reload. Warn about unsaved edits before reload. Initialization failures must be visible and retryable.

Broad substring/title/custom-order queries still have scope-sized scan/metadata costs; active boards load their complete own content. Do not promise unlimited native-editor capacity or hardware-independent latency. Reproduce measurements using isolated synthetic profiles; report sample count, variability, mounted rows, read volume and unavailable metrics honestly.

## 10. Roles of the five product references

- **Anytype:** typed object/property/source/relationship concepts define the common Brain.
- **Logseq:** direct backlinks, graph navigation, explicit references and chronological activity.
- **AFFiNE/BlockSuite:** document, edgeless and mixed workspace editing over original Brain object references.
- **AppFlowy:** structured collection properties, filtering, ordering and Kanban over one dataset; current views cover a bounded subset rather than the full external application.
- **xTiles:** resizable tiles, mixed project pages, quick capture and approval-based Inbox organization. It is an interaction reference, not a backend dependency.

Do not create five content databases or force users to leave New Tab OS to use these capabilities. Evaluate reusable components and their actual licenses; retain replaceable view adapters around the shared model.

## 11. Remaining requested features

Preserve these requirements when continuing toward the full product. They are broader than matching the current build:

- Complete rich-note/file/frame/group Canvas operations, nested lists, code-language controls, outline drag/reparent, curve control points and broader Inspector/context-menu parity.
- Manual folder sibling ordering; full native bookmark hierarchy operations in mixed Explorer; favorites/pins/tags/collections management beyond current support.
- Inbox rule previews and batch conflict handling; Move/Merge/Create Project suggestions; model-generated organization with evidence, confidence and approval.
- Task priorities, subtasks, dependency cycle checks, custom workflows/status migration, recurring occurrences and controlled missed-reminder reconciliation.
- Session comparison, selective missing-tab restore and supported tab-group restoration.
- Recoverable duplicate review/merge, explicit lineage and broader safe undo/redo/restore points.
- Opt-in full-page text indexing, scoped linked-page exploration, semantic retrieval, cross-board synthesis and sourced knowledge questions.
- Ongoing enabled-source reconciliation for multiple browsers/profiles, live supported AI chats, GitHub/Codex project context and automation definitions/run history, with scope, pause/disconnect and update/conflict reporting.
- Supported NotebookLM handoff; additional provider integrations. GBrain remains an evaluation candidate with integration deferred, while connected user-controlled memory remains a product requirement.
- Multi-user/cloud sync is optional; no mandatory account or automatic external transmission. Broader accessibility, browser support and credentialed provider acceptance require their own evidence.

## 12. Builder acceptance checklist

1. Capture a page to several destinations; edit it once and see that shared content in every view. Fail one write and verify the prior workspace and capture draft survive.
2. Import a chat, link a message/project/research note/task, save sourced memory and reopen the project. Reimport twice without duplication or loss of local edits.
3. Exclude/forget/expire/conflict a memory; preview and recheck context to verify it cannot reach the provider. Verify no request occurs on ordinary navigation.
4. Edit rich text and geometry, retarget a connector, cancel a gesture, reload and undo/restore. Verify original objects and page-specific presentation remain consistent.
5. Move a folder membership, retain other memberships, reject a cycle, undo after reload and reject undo after an intervening edit. Keep native mirrored folders read-only.
6. Traverse more than 50 objects in each collection, search/select an off-board object, expand graph pages, keep focus/drag while scrolling and refresh from another tab without discarding rows or drafts.
7. Set a local reminder and restore a session containing fragments/pinned tabs after reload. Verify saved state and external outcomes separately.
8. Crash/restart after acknowledged edits, review conflicts and restore only a fresh reviewed draft/revision. Export/import complete canonical content, including off-page objects, while keeping private recovery data excluded by default.
9. Revoke permissions, reject storage/module loads and switch views with unsaved edits. Preserve usable navigation, explicit errors and retry/recovery paths.
10. Build from the supplied branch, run its checks and provide implemented/pending/verified results with reproducible evidence. Do not claim the broader roadmap is finished merely because the current-build checklist passes.
