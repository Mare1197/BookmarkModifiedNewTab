# Browser OS New Tab — Complete Product and Behavior Handoff

Prepared: 11 September 2026.

Current-build companion added 8 October 2026: [instructions to reproduce the delivered build](AI_BUILDER_CURRENT_BUILD.md). Use that document for a like-for-like builder comparison. This document retains the full target behavior and earlier requested features, including requirements that remain unfinished. The older starting-point/verification table below is historical; consult the current-build companion and [implementation status](UNIFIED_BRAIN_STATUS.md) for the current branch.

Scope correction: this first consolidation omitted the connected-AI-chat, memory and continuous multi-source direction. On September 18, the user explicitly confirmed AFFiNE/BlockSuite, xTiles, AppFlowy, Anytype and Logseq as references for capabilities inside one New Tab OS with a shared Brain. Read the [connected knowledge addendum](CONNECTED_KNOWLEDGE_ADDENDUM.md) and [current implementation boundaries](UNIFIED_BRAIN_STATUS.md) with this document. This is not an exhaustive reconstruction of every earlier discussion or a claim that all specified features are finished.

This is a standalone specification for an AI builder. It defines what the product must do, how its features interact, and how completion should be judged. It deliberately does not prescribe a technology stack, implementation architecture, or visual design.

## 1. Instructions to the builder

Build or continue a personal, local-first browser workspace that replaces the new-tab page and combines browser organization, research, knowledge management, and task execution.

The initial browser audience is Chrome/Chromium users. Broader browser support is an optional expansion, not permission to weaken the required browser-integrated behavior.

If an existing project is supplied, inspect it first. Preserve working features and existing user data. Do not assume the repository is empty, replace working subsystems merely to match this document, or confuse an older audit with the current state.

Treat sections 3–26 as the complete target behavior, not as a claim that every requirement is already implemented. Section 2 explains the known delivery boundaries. Requirements labeled **deferred** or **optional later** are not prerequisites for completing the core product. Detailed edge-case rules below are proposed product defaults where earlier requirements did not specify them; they are not claims about existing behavior.

Deliver functional, persistent workflows, not demonstrations containing sample browser data. Report implemented, partially implemented, unverified, and deferred work separately. Never call the entire product complete because all its views can be opened.

## 2. Existing project and delivery boundaries

The reference project is **Browser OS New Tab**, in the repository **Mare1197/BookmarkModifiedNewTab**. Other prototypes exist; do not combine unrelated repositories or replace this implementation without an explicit decision.

This handoff was reconciled against the current project README, master product specification, implementation plan including the 8 September update, and prior user decisions. It is a product handoff, not a fresh runtime certification.

| Area | Documented starting point | Remaining target work or verification |
|---|---|---|
| Bookmark desktop and internal windows | Existing bookmark/folder/document operations, multiple movable and resizable windows, search, customization, backup, optional sync | Preserve behavior and existing data throughout changes |
| Browser resources | Actual open tabs, browser windows, history, observed tab provenance, domain metadata | Broader shared Inspector parity and permission/error cases |
| Shared workspace | Persistent boards, shared objects, notes, images/screenshots, relationships, Canvas, Explorer, Mind Map, Graph, search | Full rich-note/file/frame breadth, stronger cross-view parity, large-data validation |
| Workspace folders | Latest documentation records nested folders, membership/folder moves, cycle protection, keyboard alternatives, persistent last-move undo | Manual sibling ordering; native bookmark hierarchy editing from the mixed Explorer |
| Inspector | Shared edits, memberships, backlinks, recent activity; fixes for drafts and selection changes | Complete browser/session/domain/analysis details across object types |
| Productivity | Quick Add, command palette, Inbox, saved filters, captured sessions, basic tasks, Focus Mode, reminders, local clips, templates, auto-layout | Advanced workflows and full history/work-tree behavior |
| Recovery | Trash recovery, versioned export/import, narrowly scoped undo | Automatic restore points, browsable undo/history, comprehensive recovery |
| AI | Optional explicitly invoked Gemini analysis path | Credentialed acceptance, expanded actions, supported NotebookLM workflow |
| New additions in this handoff | Requirements, not completed implementation | All-or-nothing capture; recovery history; Inbox rule previews; recurring tasks/dependencies; session comparison/group restoration; duplicate review/merge |
| Deferred intelligence | No required dependency | GBrain decision, semantic retrieval, deeper external memory |

The latest project plan records verification on 8 September: 26 unit checks, a successful production build, and eight distinct browser regression checks across runs. These historical results must be rerun before a new release; they do not certify features added later. Live clipping permission prompts, operating-system reminder delivery, provider credentials, and large-dataset behavior require specific acceptance evidence.

## 3. Product purpose and non-negotiable principles

The product should let one person capture something immediately, organize it later, relate it to other material, resume work, and find it again without losing its context.

Core principles:

- Core organization, editing, search, boards, tasks, and recovery work locally without an account or an AI provider. Opening external pages and making provider requests naturally require their respective connectivity.
- One logical object may appear in many places. Its content is shared; its placement is not.
- Desktop, Explorer, Canvas, Mind Map, Graph, search, and Inspector are different ways of working with the same information.
- Capturing an open tab does not require bookmarking it.
- Users control destinations, browser-changing actions, indexing, external transmission, and permanent deletion.
- Unknown history or provenance stays unknown. Do not manufacture evidence.
- Ordinary deletion is recoverable. Trash remains until explicitly emptied.
- Existing native bookmarks and existing workspace data remain user-owned and must survive upgrades.

## 4. Product concepts and identity rules

Support these first-class concepts, with durable identities where they represent saved information:

- Web pages and URLs; native bookmark references; live tab instances; browser windows; history visits; domains.
- Plain notes, rich notes/documents, local files, images, screenshots, and web clips.
- Workspace folders, collections, boards, board groups/frames, and placements.
- Tasks, subtasks, workflows, reminders, saved browser sessions, saved searches, favorites/pins, and Inbox membership.
- Typed relationships, backlinks, source references, activity events, analysis results, Trash items, and restore points.
- Browser-resource and tool shortcuts. External research references remain optional.

Separate a page from its occurrences. Two open tabs and three bookmarks may refer to the same page, while retaining their own tab or bookmark identities and metadata. A saved session entry is a historical snapshot, not a live tab.

Each saved object needs a stable identity, type, title, creation/update times, and relevant content, source, and attachment information. Preserve identities through export/import and upgrades whenever possible.

Page matching must be conservative. Keep original captured URLs, including meaningful queries and fragments, for opening and session restoration. Do not merge different application routes simply because their addresses look similar. Changing a saved URL must not silently rewrite unrelated browser bookmarks or past session snapshots.

Keep native bookmark titles/locations and browser page titles as source information. Refreshing browser metadata must not overwrite an intentional workspace title or note.

### Reuse, duplicate, derive, and move

- **Add to board:** create a placement referring to an existing object.
- **Add to folder/collection:** create membership, without removing other memberships.
- **Move membership:** relocate only the selected membership.
- **Move on a board:** change that placement only.
- **Duplicate placement:** make another occurrence of the same shared content.
- **Duplicate object:** create independent content with a `Duplicate Of` relationship.
- **Derive/variant:** create independent content linked as `Derived From` or `Variant Of`.
- **Duplicate board:** copy board organization and placements, while reusing underlying objects. Offer a separate explicit deep-copy operation only if supported.

Never hide these materially different consequences behind an ambiguous “move,” “copy,” or “delete” action.

## 5. Workspace entry and internal windows

Opening a new tab gives access to the user's workspace and browser resources. Preserve the existing desktop as a usable entry point.

Users can launch folders, bookmarks, documents, boards, notes, open tabs, browser windows, history, search, settings, and supported tools. A launcher must perform a real action.

Support several internal working windows simultaneously. Users can move, resize, focus, switch, and close them. Closing a working window does not delete its content or close a real browser window.

Remember useful window/session state according to the user's preference. Restored windows must remain reachable when the available screen area changes. Opening one resource must not discard unsaved work elsewhere.

Preserve existing personalization and optional widgets as user-controlled capabilities; this specification does not dictate their appearance. Widgets must not become a requirement for the local core or introduce undisclosed network activity.

## 6. Bookmarks, browser tabs, windows, and history

### Native bookmarks

- Read the actual browser bookmark tree; create, rename, edit, move, reorder, and delete bookmarks and folders through explicit user actions.
- Preserve nesting, source identities, and multiple bookmarks to the same page.
- Reflect changes made elsewhere in the browser.
- Distinguish deleting a native bookmark from removing a workspace reference or deleting workspace-only content.
- Explain the scope of destructive folder actions and provide recovery where feasible. Never promise to recover browser data the product did not retain.

### Open tabs and browser windows

- List actual current tabs grouped by their actual browser windows.
- Focus an existing tab/window, open a saved page, and close selected tabs/windows only on explicit action.
- Show available tab title, address, pinned state, group membership, and current status.
- Permit adding one or several tabs to boards, folders, Inbox, notes, or a session without first bookmarking them.
- Distinguish “focus existing tab” from “open another tab.” Do not create duplicates accidentally.
- Handle tabs that close or navigate while an action is in progress.

### History and domain information

- Provide user-requested history browsing/search and page/domain summaries from accessible records.
- Distinguish actual browser history from clicks recorded only inside this product.
- Indicate the accessible time range or incomplete coverage where relevant.
- Opening or capturing history results must preserve their source context.
- Permission denial or cleared history must not erase independently saved notes, pages, clips, or boards.
- Downloads may become an optional resource only when supported and explicitly permitted; they are not a core requirement.

## 7. Truthful browser metadata and provenance

For a specific currently open tab, show its opened time only when its creation was observed. Otherwise show **First observed** with the corresponding time, or **Unknown/Not available**. A refresh or reload must not reset it to the current time.

Record **Opened from/Branched from** only when evidence identifies the source tab, page, bookmark, history action, or known duplication action. Preserve the distinction between observed facts and inference.

Record **Opened by search**, search engine, and query only when available through permitted, non-invasive observation. Do not infer a search merely because a page resembles a search result.

Domain first/last opened means earliest/latest **known accessible** visit, not a claim about the user's lifetime browsing. Page visit count and frequency also need a clear evidence scope.

Use **DD/MM/YYYY HH:mm**, 24-hour local time, for user-facing browser metadata. Invalid or missing values use explicit neutral states, never invented dates.

Do not calculate accumulated total-open-time tracking. Do not reconstruct unobserved navigation chains as factual history.

## 8. Universal Quick Add and reliable capture

Provide one capture workflow accessible from the workspace, command palette, and relevant browser/page actions.

Capture sources include a URL, an existing page/tab/history item, a bookmark, typed text, selected page text, a clip, image, screenshot, local file, or task. Support adding context or an associated note during capture.

### Destination behavior — settled requirement

**Always ask for destinations. Allow multiple destinations in one capture.**

Offer Inbox, one or more boards, one or more folders/collections, and references or attachments to existing notes/objects. Suggested or remembered destinations may be prefilled but must not bypass confirmation.

Create or reuse one canonical object, then add the requested placements, memberships, and relationships. Capturing the same page again must not silently overwrite notes or duplicate its global identity. Explicit independent duplication remains available.

### All-or-nothing saving — required addition

Validate content, permissions, and every chosen destination before reporting success. The captured object and all promised local destinations must either save together or remain unchanged together.

If one destination disappears or any local write fails, retain the user's draft, explain the failure, and let them retry or revise the destinations. Do not leave orphaned objects, missing attachments, partial placements, or false activity entries. Repeated submission/retry must not duplicate the capture.

External side effects have separate outcomes. For example, a saved task whose system notification cannot be scheduled remains a saved task with an explicit reminder failure; do not pretend the reminder succeeded or roll back an unrelated browser action.

Support cancel without changes, meaningful progress, prevention of duplicate submission, and recovery after interruption. Do not dismiss unsaved content silently.

## 9. Quick Inbox and suggested organization rules

Inbox is an object state, not another copy of the object. An object may be in Inbox and on several boards at once.

Support viewing, searching, filtering, opening, and batch triaging Inbox objects. Users can add destinations, attach context, create tasks, connect objects, archive from Inbox, or send to Trash. Removing Inbox status does not remove other memberships.

### Rule previews — required addition

Allow user-defined rules based on available domain, URL, type, title/content terms, and tags. Rules can suggest folders, boards, collections, tags, and removal from Inbox after successful filing.

Before applying rules, show affected objects, reasons, proposed changes, conflicts, and missing destinations. Users can accept, edit, skip, or cancel individual suggestions and batches.

Rules must not silently move native bookmarks, delete data, send content externally, or override the always-ask capture requirement. Rule evaluation can suggest destinations during capture; confirmation still happens.

Define rule priority and conflict handling. Reapplying a rule must not duplicate placements or memberships. A failed batch must report precisely what happened and offer recovery; do not claim complete success for a partial result.

## 10. Explorer, folders, collections, favorites, and tags

Provide a persistent expandable hierarchy containing mixed supported objects, including nested folders, pages, notes, files, and board references.

- Create, rename, reparent, organize, search, and filter folders.
- Reject self-parenting and ancestor cycles without changing data.
- Allow the same object to belong to several workspace folders/collections.
- Preserve manual sibling order where supported and required for full completion.
- Clearly distinguish native bookmark organization from workspace-only organization.
- Offer keyboard/menu equivalents for every drag operation.
- When moving from the global object list, adding membership must not remove unrelated memberships. When moving a selected folder occurrence, affect only that occurrence.
- Removing a membership must not delete the global object. Folder deletion must explain whether children are retained, relocated, or also sent to Trash.

Collections provide named membership-based organization without requiring a folder-tree position. Saved searches remain dynamic and are not silently converted into static collections.

Support favorites/pins for quickly returning to selected objects, boards, and collections. They are references, not copies, and do not imply pinning a real browser tab. Support reusable tags with consistent rename/removal behavior across search and rule suggestions.

## 11. Boards and Canvas

Support multiple independent persistent boards with names, descriptions, creation/update times, content placements, groups/frames, associated notes, and optional analysis results.

Users can create, rename, organize, search, switch, duplicate, and recoverably delete boards. Deleting a board must not delete shared objects still used elsewhere.

Each board supports an effectively unbounded working area with pan, zoom, select, multi-select, move, resize, group, ungroup, connect, duplicate, and remove-placement operations.

Supported content includes notes, rich documents, images, screenshots, clips, pages, bookmarks, open-tab references, files, folders/collections, tasks, analysis results, and useful resource shortcuts.

Board placement information is independent of object content. Moving or resizing an item on Board A must not alter its placement on Board B or move a native bookmark.

Groups and frames organize board placements. Grouping does not create folder membership unless the user explicitly requests it. Removing a frame must offer to keep its contents.

Provide a Canvas item index and mini-map/overview navigation so users can find content outside their current working area. Search/select can navigate to an existing placement; it must not add another placement without request. These are navigation capabilities, not prescribed visual designs.

Allow fast note creation directly from the Canvas. The selected board may be preselected as a destination, but the always-ask destination confirmation still applies. Do not create a disconnected note system for this shortcut.

Auto-layout rearranges chosen placements without changing content, shared relationships, native bookmarks, or other boards. Make it reversible.

### Board templates

Provide blank, research, reading, and project starting templates. Template creation produces independently editable board content; subsequent edits must not change the template or unrelated boards.

Do not require AI for templates. Saving/editing custom templates is an optional later extension, not a currently verified feature.

## 12. Notes, documents, files, and attachments

Support both plain notes and rich documents as durable user-owned content. They can stand alone, appear on boards, live in folders, or attach to pages, images, tasks, and other objects.

Editing one shared note updates its content everywhere. An independent copy must be explicitly duplicated and retain lineage where appropriate.

Provide clear saved, unsaved, saving, failed, and conflicting states. Drafts belong to their specific object. Switching selection must never save one object's draft into another, discard it silently, or overwrite newer typing when an older save completes.

Notes may reference other objects and expose backlinks. Links remain usable after rename or reorganization.

Allow importing supported text/document files and attaching other permitted local files. Explain whether an item is a retained copy or a reference requiring renewed access. Losing access to an original file must not masquerade as deletion of a retained copy.

Unsupported formats should remain attachable/downloadable where safe, with an honest unavailable-preview state. Never promise universal document parsing or executable-file support.

## 13. Web clips, screenshots, and images

### Web clips and explicit indexing

Capture selected text, a supported article extract, or permitted page text locally. Preserve source URL, title, capture time, and extraction scope. Let the user review and edit before saving.

If extraction is incomplete, truncated, blocked, or empty, say so. Offer manual text/URL capture where useful. A clip is a retained snapshot; it must not silently change when the source page changes.

Request access only when needed for the chosen page/action. Denial must leave the rest of the app usable. Do not silently crawl all history or every linked page.

Optional full-page text indexing must have explicit scope, progress, cancellation, retention controls, and a way to remove indexed content. Extracted linked pages are known links, not automatically endorsements or semantic relationships.

### Images and screenshots

Support image upload, screenshot upload, and explicit capture of a permitted visible page. Support a user-selected crop as a derived screenshot while retaining original provenance; full-page screenshot capture is not assumed.

Preserve original image data where retained locally. Keep source page, capture/import time, dimensions, and relationships as available. Images and screenshots work without AI.

Allow placement, attachment, connection, opening, export, and recoverable deletion. Do not delete an asset still referenced by other saved objects. Clearly distinguish a captured website from a capture of the workspace itself.

## 14. Relationships, backlinks, Mind Map, and Graph

Relationships are persistent shared facts or suggestions, not lines belonging only to a single board.

Support labeled and typed relationships such as parent/child, related, reference, same-project, attached-to, opened-from, search-result, duplicate-of, derived-from, and variant-of. Record direction when meaningful, origin, creation/update time, and confirmation state.

Allow creating, editing, and deleting relationships from relevant views. Show incoming backlinks and outgoing connections. Filtering a view hides irrelevant relationships without deleting them.

Keep containment, task dependencies, observed navigation lineage, manual conceptual links, and AI suggestions distinguishable. Do not treat every connection as interchangeable.

Mind Map offers topic-centered parent/child exploration of shared objects, with expandable/collapsible branches and preserved focus. Graph offers connected exploration across objects and boards, with filters and bounded neighborhood expansion. Neither requires a separate copy of the content.

Handle cycles in general relationships without pretending they form a strict tree. Folder containment and task dependencies have their own cycle prohibitions. Switching views or arranging a graph must not rewrite the meaning of relationships.

Suggestions from AI stay unconfirmed until accepted; users can reject them. Removing a suggested link does not delete its source objects.

## 15. Shared Inspector and cross-view context

Every major view must provide access to consistent details and actions for the selected logical object.

Supported information includes content/type, URL/domain, available favicon/source icon, source references, first/last known page visits, scoped visit frequency, known history, live tab/session state, bookmark status and locations, folder/collection memberships, every board containing the object, notes/attachments, tasks, tags, backlinks/connections, and analysis/indexing status with last-run timestamps and results.

Only offer actions valid for the selected object and available permissions. Unknown and unavailable fields must be explicit.

Preserve selection, focused object, relevant filters, and active board when switching views where possible. If the target is not present in a view, explain that rather than silently selecting a different object.

Support optional metadata exposure preferences without prescribing presentation. Changes to content update every relevant view. Changes to a view's working state do not alter content.

Delayed refreshes and saves must not restore an old board/selection over a more recent user action. Concurrent edits must not silently destroy newer content.

## 16. Unified search, saved filters, and command palette

Search locally across supported bookmarks, folders, pages, tabs, accessible history, notes, boards, collections, indexed files/clips, tasks, analysis results, tags, and relationship labels. Explain when content has not been indexed or a permission limits results.

Provide free-text search and composable filters. Preserve existing query capabilities and extend them consistently:

- `type:` — object type.
- `domain:` — page domain.
- `board:` — membership on any board, including inactive boards and quoted multi-word names.
- `after:` — supported absolute dates or relative periods such as `7d` and `24h`.
- `has:task` and `has:backlinks` — associated information.
- `status:` — task/workflow status.
- `is:inbox` — Inbox state.

Define supported values and date boundaries clearly. Invalid syntax should produce helpful feedback rather than silently misleading results. Search can reveal an object without creating a placement or changing membership.

Save, rename, update, and delete custom filters. Preserve built-ins such as Notes, Recently Updated, Web Clips, and With Tasks. Identify built-ins by their actual identity, not by a naming pattern that accidentally protects user filters. Empty saved queries may represent all eligible objects.

Provide a command palette opened by Ctrl/Cmd+K and a discoverable non-keyboard action. Include search/navigation and common commands such as Quick Add, create board/note/task, switch board/view, capture session, open Inbox, and relevant selected-object actions.

Commands must honor busy/unsaved states and permissions. They must not bypass capture confirmation or destructive-action safeguards. Fuzzy and semantic retrieval are optional later enhancements; basic retrieval must never depend on AI.

## 17. Advanced tasks, workflows, and Focus Mode

Tasks are first-class objects that can be searched, placed on boards, organized in folders, and connected to relevant research or notes.

Support title, description, status, priority, tags, due date/time where set, reminders, subtasks, dependencies, recurrence, linked sources, and completion history. Dates are optional; do not manufacture deadlines.

Provide a usable default workflow including Backlog, Next, In Progress, Blocked, and Done. Also support user-defined statuses and custom workflows, as previously requested.

Changing a workflow must preserve tasks. If a status is removed, require an explicit replacement mapping. Keep completion meaning distinct from a status's display name.

### Dependencies and subtasks — required addition

Allow one task to depend on another, show blockers and dependents, and reject self-dependencies and dependency cycles. Completing a dependency updates availability; reopening it re-exposes the blocker without erasing the dependent's history.

Warn before completing a task with unfinished prerequisites. An explicit override may be allowed and recorded; never silently mark prerequisites complete. Subtasks have their own identity and completion. Completing a parent must not silently complete unfinished children.

### Recurrence — required addition

Support daily, weekly, monthly, and custom-interval schedules, with optional end conditions. Specify whether repetition follows the scheduled date or completion date.

Keep completed occurrence history and create each next occurrence only once. Define skip, reschedule, edit-this-occurrence, and edit-future-occurrences separately. Preserve time-zone intent and document behavior for daylight-saving changes and nonexistent month dates. Proposed default: clamp a requested day to the last valid day of that month.

Do not generate unlimited overdue occurrences or notification storms after a long absence. Present missed occurrences with an explicit catch-up choice.

### Local reminders

Schedule reminders locally, without requiring an external calendar. Editing, completing, deleting, or rescheduling tasks must update/cancel corresponding reminders. Reopening or restoring a task must not duplicate notifications.

Preserve the local time the user selected after save/reload. Explain when browser shutdown, permissions, or system settings prevent timely delivery. On restart, reconcile pending/missed reminders and offer a controlled catch-up summary.

### Focus Mode

Focus on a chosen task and its relevant connected context. Entering/exiting focus changes what is being worked with, not membership or content. Switching boards must not retain an unrelated stale focus. Do not show connections to absent items as if both endpoints are available.

## 18. Saved sessions, comparison, and tab-group restoration

Distinguish live browser state from saved snapshots. Users can capture a window or selected tabs as a named session, associate it with a board, inspect it, reopen it, and create a newer snapshot without overwriting the original silently.

Retain each captured tab's original address, title, order, pinned state, and group information where available. Multiple intentional occurrences of the same URL must remain separate session entries.

Exclude private browsing and unsupported/internal addresses by default and report exclusions. Never silently convert a private session into ordinary saved history.

### Compare sessions — required addition

Compare two snapshots, or a snapshot with current tabs. Identify additions, removals, reordering, pin changes, and group changes. Do not call an address change “navigation of the same tab” unless identity evidence supports it.

Allow selective restoration and an explicit choice between opening a new window and adding to a current window. Do not close current tabs merely to match a snapshot unless the user explicitly requests and confirms that destructive reconciliation.

### Restore groups — required addition

Restore order, exact URLs, pinned state, and supported named group membership. Preserve saved group associations even if the browser cannot recreate them. Explain unsupported properties and offer ungrouped restoration instead of failing silently.

Report failed/blocked entries individually and offer retry for only those entries. Restore retries must not reopen successfully restored entries unintentionally. Browser-side partial success must be reported honestly; this operation is distinct from all-or-nothing local capture.

## 19. Activity, history work tree, and lineage

Keep useful local activity for capture, edits, organization, task changes, relationships, merges, imports, restores, and session actions. Records should identify action, affected objects, time, and available origin.

An activity feed is not complete browsing history. A history/work tree represents observed browsing branches and intentional object derivation where known. Unknown parents remain unknown; do not invent a tree to connect every item.

Allow filtering activity by object, board, action, and period. Distinguish retained history from any recent-only display window. Offer retention controls for activity separately from Trash, and explain gaps caused by retention.

Activity entries, undo data, and restore points have different purposes. A descriptive event must not be advertised as undoable unless sufficient recovery data exists.

## 20. Trash, undo, restore points, and conflict-safe recovery

### Trash

Ordinary deletion sends eligible objects/boards to Trash. Keep them until the user explicitly empties Trash; do not silently age them out.

Retain sufficient content, asset references, relationships, memberships, and placements to explain and restore what was removed. Shared objects/assets must not be destroyed merely because one board or membership was removed.

Provide browsing/searching Trash, item restore, batch restore, and permanent deletion. Explain the exact scope before emptying Trash. Restoration must handle missing destinations and changed content without overwriting newer work.

### Undo and restore history — required addition

Provide reversible edits and organization actions, including capture, moves, auto-layout, duplicate merges, and recoverable deletion. Group one user action into one understandable undo operation.

Persist meaningful recovery history across reloads. Offer redo where valid, and explain why an operation can no longer be replayed safely. Do not overwrite intervening edits simply to make undo succeed.

Create automatic local restore points before imports, merges, bulk destructive actions, and significant multi-object changes. Retain revision history for meaningful content edits without requiring a snapshot for every keystroke.

Let users inspect restore-point time, scope, and affected objects, then preview a targeted restore. Restoring a board should not unexpectedly roll back shared notes used elsewhere; separate placement recovery from global content recovery.

Restore-point retention can be configurable, with storage warnings and explicit cleanup. This does not change the separate rule that Trash remains until explicitly emptied. Offer backup before irreversible cleanup.

## 21. Duplicate review and safe merging

Identify possible duplicates using strong page identity evidence or clearly labeled similarity suggestions. Similar titles, domains, or AI suggestions alone are not proof.

Provide a review workflow showing candidate objects, why they match, distinct source references, content differences, memberships, placements, tasks, relationships, attachments, and relevant timestamps.

The user chooses the surviving object and how conflicting fields/content are retained. Preserve alternative notes and provenance rather than silently selecting the latest value.

Redirect references to the survivor, preserve intended board occurrences and folder memberships, remove accidental repeated memberships, and handle self-links created by merging explicitly. Keep separate session occurrences and historical snapshots intact.

Do not merge incompatible task states or unrelated assets automatically. Native duplicate bookmark deletion requires separate explicit authorization; merging workspace objects does not grant it.

A merge must either complete consistently or leave the candidates unchanged. Keep a recoverable record of the merge and support conflict-aware undo. A normal refresh must not resurrect the same duplicate as a new independent object.

## 22. Optional AI and research integrations

The entire core product must remain useful with all providers disabled.

Support deliberate actions such as analyze this page, selected objects, screenshot, image, or board; summarize; suggest categories/relationships; generate a note; or ask about selected material.

Before external transmission, show the selected scope and provider. Do not silently include unrelated tabs, history, notes, attachments, or credentials. Expanding from selected excerpts to whole documents needs explicit consent.

Results retain source links, action, provider/model where available, time, and whether they are generated suggestions. Save output as a separate analysis object or explicitly requested note, never a silent replacement of source content.

Support cancellation, timeouts, invalid credentials, provider limits, unavailable network, and removal of configuration. Failed analysis must not damage local data. Provider-generated text is content, not authority to perform browser or destructive actions.

Gemini is an existing optional analysis direction, not a mandatory dependency. NotebookLM is a desired selected-source/research-bundle handoff; offer export when supported, and do not claim a direct integration until verified.

**GBrain remains decision deferred.** Do not add mandatory external memory, synchronization, or data ownership changes. Any future proposal must address consent, retained data, deletion, identity, offline behavior, and reversibility before implementation.

Optional later intelligence remains part of the long-term feature inventory:

- Semantic retrieval: find conceptually relevant saved material beyond exact text matches; distinguish local-only operation from any external processing and preserve ordinary search as a fallback.
- Board analysis: summarize selected board contents, identify themes, and reference the source objects supporting an answer.
- Cross-board synthesis: compare explicitly selected boards without silently including the whole workspace.
- Relationship discovery: suggest explainable connections with cited source objects; users accept or reject them.
- Smarter grouping: suggest topic groups, collections, or destinations with a preview; never silently reorganize source material.
- Knowledge questions: answer questions about chosen saved material, identify supporting sources and uncertainty, and allow saving the answer separately.
- Optional deeper-memory/GBrain workflows only after the deferred decision and explicit approval.

Keep these features in the roadmap, but do not present them as implemented or make the core depend on them. Keep AI suggestions distinct from user-confirmed facts.

## 23. Import, export, backups, and optional synchronization

Provide portable versioned exports containing the requested workspace content, boards, placements, hierarchy, memberships, relationships, tasks, sessions, tags, saved searches, and retained assets. Explain exclusions, including unretained external files or unavailable browser data.

Exclude secrets and private browsing data from ordinary exports. Let users choose whether to include activity, Trash, and recovery history; a “full recovery backup” must state its scope explicitly.

Validate imports before mutation. Show version compatibility, proposed additions/conflicts, missing references/assets, and any rejected records. Reject invalid or unsafe content with useful diagnostics; never reset existing data as a fallback.

Offer explicit merge behavior. Reimporting the same export must not multiply identities or memberships. Preserve intentionally distinct objects even when titles match. Unsupported future versions must not be guessed at destructively.

Create a restore point before applying an import. Failed imports must leave the prior workspace usable and avoid half-connected content. Round-trip retained assets and all supported relationships, not just text labels.

Preserve existing backup and optional browser-sync capabilities. Do not assume legacy sync covers the entire newer workspace. Clearly state what syncs, what stays local, and what conflict behavior applies. No silent cloud sync or mandatory account.

## 24. Privacy, permissions, and safe content handling

- Request only access needed for a user-facing capability; explain why it is needed.
- Denial, revocation, offline state, or unavailable resources must produce useful limited behavior rather than a broken workspace.
- Do not collect private browsing data by default or bypass browser restrictions.
- Do not silently upload browsing history, notes, clips, screenshots, files, or analytics.
- Do not include credentials, private content, or full browsing trails in ordinary diagnostic logs. Any development logging must remain privacy-safe.
- Treat imported files, clipped pages, rich documents, URLs, and provider output as untrusted content. They must not execute instructions or gain authority to change unrelated data.
- Explain credential storage limitations honestly; never claim encryption or protection not actually provided. Allow clearing credentials and disconnecting services.
- Offer deletion of optional indexed/derived data without deleting independent user-authored content.

## 25. Reliability, accessibility, and large-workspace behavior

Support keyboard operation for navigation, selection, capture, organization, window actions, dialogs, and editing. Provide accessible names and state information, predictable focus, escape/cancel behavior, and focus restoration after dialogs.

Do not make drag-and-drop, hover, color recognition, or a large viewport the only way to complete a workflow. Keep core actions reachable in a narrow workspace and at increased text size. This is a functional requirement, not a visual prescription.

Handle empty workspaces, loading, partial permissions, malformed inputs, unsupported URLs, quota limits, missing assets, canceled actions, and concurrent windows explicitly.

Durability rules:

- A successful save survives reload/restart.
- A failed save retains the draft and does not show false success.
- Older responses do not overwrite newer navigation, selection, or edits.
- Background updates do not destroy drafts.
- Changes made in another open workspace become visible without corrupting local edits.
- Storage exhaustion must not trigger silent deletion, especially of Trash or original assets.

Large collections of bookmarks, deep folders, many tabs/history records, multiple boards, and connected objects must remain usable. Limit initial exploration to useful scopes; do not load an entire browsing history into Graph by default.

Long actions need progress and cancellation where possible. Publish measured limits and benchmark results before claiming large-data readiness; do not invent performance guarantees.

## 26. Acceptance scenarios

Use real persisted behavior and controlled failures, not just successful screen rendering, to verify these scenarios:

1. Open several folders/documents/resources simultaneously, switch focus, restart with state restoration enabled, and confirm content is intact and windows reachable.
2. Edit a native bookmark in the browser and see its source update without erasing a custom workspace note/title.
3. Put one page on two boards and in two folders. Edit its shared note once; all relevant views agree. Move one placement; other placements and native bookmarks do not move.
4. Capture a tab without bookmarking it. Select Inbox, multiple boards, a folder, and a note reference; only one canonical page is created/reused.
5. Fail one capture destination write. No partial capture remains; the draft is retained. Retry once and confirm no duplicates.
6. Cancel capture or deny clipping access. No unintended object, permission-dependent action, or external transmission occurs.
7. Preview an Inbox rule batch, reject some suggestions, and apply the rest. Only approved changes occur; repeated application is harmless.
8. Move a folder under a descendant and confirm rejection. Move one object membership and confirm its other memberships remain.
9. Duplicate a board and edit shared content. Both boards see the content change, while their placements remain independent. Explicitly duplicate a note and confirm independent edits and lineage.
10. Remove a placement, delete a board, and delete an object as separate actions. Confirm each has the promised distinct scope and recovery.
11. Add, crop, export, import, and reopen a screenshot; retained original content and provenance survive without AI.
12. Edit Object A, switch to B, edit B, return to A, and complete delayed saves. Drafts and saved content never cross identities.
13. Search a quoted inactive board name and find its objects. Save and delete a custom filter without affecting built-ins. Round-trip an empty saved query.
14. Connect objects on Canvas and see the same relationship in Graph, Mind Map, Inspector, and backlinks. Filter it out and confirm it still exists.
15. Inspect a newly observed tab and a pre-existing tab. Creation versus first-observed labels are truthful. Missing opener/search history remains Unknown.
16. Restore a session containing repeated URLs, fragments, pinned tabs, and groups. Verify exact addresses/order and supported grouping, with honest exclusions/failures.
17. Compare sessions and restore only selected missing entries. Existing tabs are not closed, and retry does not duplicate successful entries.
18. Change a custom workflow and remove a status. Task mapping is explicit and no tasks disappear.
19. Create a dependency cycle and confirm rejection. Complete/reopen a prerequisite and verify dependent-task state without falsifying completion history.
20. Complete a recurring task twice or retry its save. Exactly one next occurrence is created. Test month-end and daylight-saving rules.
21. Set a local reminder, reload, restart, change the task, and deny notifications. Selected time remains correct and failed delivery is reported honestly without duplicate alerts.
22. Enter task Focus Mode and switch boards/views. Context remains valid and leaving focus changes no underlying content.
23. Merge duplicate pages with distinct notes, attachments, memberships, and relationships. Preserve user-selected content and references; do not delete native bookmarks implicitly.
24. Fail a merge midway and confirm candidates remain consistent. Undo a merge after another edit and verify conflict-safe recovery.
25. Restore a deleted board/object from Trash after reload. Keep shared data intact. Empty Trash only after explicit permanent-deletion confirmation.
26. Preview a restore point and recover selected content without silently reverting newer shared edits elsewhere.
27. Import malformed, duplicate, older supported, and unsupported future-version exports. Preserve the prior workspace and explain conflicts/rejections.
28. Export/import a representative full workspace with assets, tasks, sessions, relationships, memberships, filters, and selected recovery data. Verify identities and content, not just counts.
29. Disable all AI/network services and complete local capture, organization, editing, search, task, and recovery workflows.
30. Run explicit analysis on selected content. Only that scope is transmitted; cancellation/failure preserves sources; results remain separate and suggestions unconfirmed.
31. Use keyboard-only and narrow-workspace operation to complete capture, organization, editing, and recovery with predictable focus.
32. Test large representative data, simultaneous workspace windows, interrupted saves, cleared browser history, revoked permissions, and storage pressure. Record actual limits and unresolved failures.

## 27. Delivery sequence and completion report

Preserve the working baseline throughout. Suggested sequence, based on data-loss risk and dependencies:

1. Audit current behavior and protect existing data; reconcile this handoff against the actual checkout.
2. Make multi-destination local capture all-or-nothing and retry-safe.
3. Complete restore points and conflict-safe recovery needed for subsequent bulk operations.
4. Add Inbox rule previews and duplicate review/merge using those safeguards.
5. Complete advanced tasks, custom workflows, recurrence, dependencies, and reliable reminder recovery.
6. Add session comparison and supported group restoration.
7. Close existing breadth/parity gaps: rich notes/files/groups, organization ordering, complete Inspector, history work tree, search, and cross-view consistency.
8. Verify permissions, accessibility, privacy, backup recovery, and large-workspace behavior.
9. Expand optional analysis only through explicit user-controlled scope. Keep deferred integrations deferred.

This order is a delivery recommendation, not an assertion that existing features must be rebuilt.

For each delivery, report the exact completed behaviors, preserved behaviors, acceptance evidence, data changes, unresolved limitations, and remaining scope. Do not conflate a local change with a published release or a configured integration with a tested integration.

## 28. Explicit non-goals and deferred decisions

The core does not require multi-user collaboration, mandatory cloud accounts, continuous cloud synchronization, automatic full-history ingestion, background surveillance, external-calendar integration, accumulated total-open-time tracking, or a public hosted service.

GBrain integration, deeper external memory, semantic search, broad autonomous crawling, custom-template editing, and unsupported external research integrations remain optional or deferred as stated above. They must not block a complete, reliable local workspace or be reported as implemented without evidence.

This document intentionally leaves technology choices and visual appearance unspecified.

## 29. Earlier planned features that must not be dropped

This checklist is included to prevent a builder from interpreting the current implementation as the complete scope. Each item is specified above, including those not yet built:

- [ ] Multiple internal working windows, real nested mixed-object folders, and all shared workspace views.
- [ ] Full mixed Canvas content, rich notes, files, groups/frames, multiple boards, and independent placements.
- [ ] Universal Quick Add, always-ask destinations, multiple destinations, and all-or-nothing saving.
- [ ] Direct tab capture without bookmarking, fast Canvas notes, local clips, original images, and cropped screenshots.
- [ ] Quick Inbox, previewed organization rules, favorites/pins, tags, collections, and clear move/copy/duplicate semantics.
- [ ] Explicit Duplicate Of, Derived From, and Variant Of lineage; incoming backlinks and persistent shared relationships.
- [ ] Canvas item index/mini-map, board templates, and reversible auto-layout.
- [ ] Advanced task objects, subtasks, priorities, custom workflows, dependencies, recurring occurrences, and local reminders.
- [ ] Task Focus Mode and connected working context.
- [ ] Living sessions: capture, inspect, resume, compare, selectively restore, and restore supported tab groups.
- [ ] Universal local search, smart filters, saved searches, command palette, and keyboard shortcuts.
- [ ] Full shared Inspector, truthful page/domain/tab metadata, and cross-view edit/selection consistency.
- [ ] Activity timeline, history work tree, observed browsing provenance, and unknown-state handling.
- [ ] Keep-until-emptied Trash, undo/redo where safe, restoration, automatic restore points, and revision history.
- [ ] Duplicate review and recoverable merges that preserve notes, attachments, sources, and references.
- [ ] Portable export/import, full-scope recovery backups, compatibility with existing data, and explicitly scoped optional sync.
- [ ] Permission-aware optional full-page text indexing and linked-page exploration.
- [ ] Explicit Gemini analysis, selected-source NotebookLM handoff where supported, and saved analysis objects.
- [ ] Later semantic retrieval, cross-board synthesis, smarter grouping, knowledge questions, and relationship discovery.
- [ ] GBrain evaluation remains on the roadmap, with integration deferred until approved.
- [ ] Local-first operation, privacy controls, accessible interaction, large-data verification, and reliable recovery from failure.

Unchecked boxes are scope-tracking placeholders, not a statement that all listed capabilities are absent. The builder must replace them with evidence-backed completion status after auditing the supplied project.
