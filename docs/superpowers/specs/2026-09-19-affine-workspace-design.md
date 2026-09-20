# Integrated AFFiNE-style workspace completion

Status: design and execution approved by the user's follow-ups. The September 20 build implements the persistent multi-object workspace slice; remaining acceptance gaps are recorded in `docs/UNIFIED_BRAIN_STATUS.md`. This design is not evidence that every native AFFiNE feature is complete.

## Intent and agreed constraints

The user asked to implement the missing AFFiNE-style workspace features inside the existing New Tab OS, after explicitly identifying the current BlockSuite integration as a prototype. Success is a useful persistent workspace for multiple notes, chats, browser sources, files, tasks, memories and nested project pages. It is not a separate AFFiNE installation or another demonstration.

Preserve the existing desktop, Explorer, Brain identity model, browser capture, React Flow canvas, local persistence and uncommitted work. Treat the parent `sources/` folder as read-only. Do not add a second persistent content store, cloud sync, account access or automatic AI transmission.

The approved scope includes all of the following:

- Multiple canonical objects on a document/canvas page.
- Rich-text notes, images, files and embedded object cards.
- Persistent free positioning, sizing, ordering, groups, collapsed state, connectors and view state.
- Document and edgeless views of the same page, plus mixed document/canvas use.
- Nested workspace/project pages.
- Connections to existing chats, messages, browser research, repositories, tasks and AI memory.

## Evidence from the existing project

- `blocksuiteAdapter.ts` already mounts real BlockSuite 0.19.5 PageEditor and EdgelessEditor. Its custom block persists only an entity ID, reads canonical Dexie content, and writes through `updateEntity`.
- The adapter currently creates one transient note/reference, sets the document read-only and discards the document on exit. No multi-object layout or native editor creation persists.
- `workspaceRepository.ts` already owns entities, board placements, assets, activity, backups and atomic object/backlink updates.
- `openBrainCanvas` already opens a deterministic project board and places its confirmed members without copying objects. Reuse this identity and placement mechanism.
- `BoardPlacement` already contains coordinates, dimensions and metadata. Settings can hold presentation records; existing relationships can express page parentage and object links.
- Existing memory policies and AI context selection must apply unchanged in the new workspace. A new presentation must not bypass them.

## Approach and alternatives

Recommended: expand the existing replaceable BlockSuite adapter over Brain repositories. Use native BlockSuite document/edgeless rendering and its rich-text components, translating supported user edits into canonical content and presentation transactions.

Rejected: persist an independent AFFiNE/Yjs content database and synchronize it to Brain afterward. This would introduce conflicting owners and violate the user's central requirement.

Rejected: implement the requested editor using only custom React cards or embed the AFFiNE website. That would not complete the requested component reuse and local integration.

BlockSuite may hold transient editor text while typing, just as an input holds a draft. Persisted content belongs only to Brain. Do not store a serialized native document containing copies of chats, notes or files.

## 1. Canonical page and presentation persistence

A workspace page is a canonical `document` object marked as a workspace page, or an existing `project` object owning its project page. The existing board is its layout container. A validated setting maps the board to its owning entity; titles come from the canonical owner rather than a second editor title store.

Existing boards remain valid and open without destructive conversion. Opening an ordinary object does not turn that object into a document. It opens the current page and adds/selects a reference; project actions resolve the deterministic project board. Users may explicitly create a new page containing the selected object.

Keep position and dimensions in existing placements so the same objects and coordinates remain meaningful in the current Canvas. Extend placement metadata for page order, group membership and collapsed state. Page settings hold view mode, viewport and group/connector presentation, containing IDs and geometry only.

Connectors are confirmed canonical relationships plus page-local endpoint/geometry/style records. Drawing a connector creates the relationship explicitly. Removing it offers distinct actions: remove from this page, or unlink the canonical relationship everywhere. Removing a card from a page never deletes its object, file or membership in other projects.

Validate finite coordinates, positive bounded sizes, valid referenced IDs, connector endpoints and acyclic group membership. Persist related changes atomically. Use revision-based conflict detection instead of silently applying whole-page last-writer-wins updates from another tab.

## 2. Rich-text content owned by Brain

Add a versioned canonical rich-text representation to note/document content. Support paragraphs, headings, bold, italic, underline, strike-through, inline code, safe links, bullet/numbered/check lists, quotes and code blocks. Store structured text, not arbitrary executable HTML.

Reuse the installed BlockSuite rich-text components. Rendering or editing a note from another page resolves the same entity and revision. Plain text used by search, backlinks, existing cards and AI is derived from the rich content; it is not independently editable competing content.

Existing plain notes remain readable and editable without a migration that rewrites every record. Convert a note lazily when the user edits it with rich-text controls. Route formatted notes from the Inspector to the rich-text editor rather than silently destroying formatting through the old textarea. Existing plain-text consumers still receive the derived body.

Only allowlisted formatting and HTTP(S) links are accepted from paste/import. Render unsupported pasted HTML as text. Do not execute scripts, load remote embeds, or enable arbitrary BlockSuite blocks that have no Brain persistence adapter.

Show saving/saved/error/conflict states. Switching view/page flushes pending edits; a failed write keeps the draft available and does not claim success. Conflicting edits offer reload or explicit replacement without erasing a local draft. Undo applies scoped canonical operations, rejects conflicting external changes and cannot undo another tab's unrelated edits.

## 3. Document, canvas and mixed pages

Replace the prototype entry with a normal workspace editor that opens all references on a page. Preserve lazy loading and explicit adapter disposal.

- Document mode presents the ordered references as editable sections. Support inserting an existing object, creating a note, moving sections and removing a reference.
- Canvas mode uses BlockSuite's edgeless surface for pan/zoom, move/resize, selection and connectors. Supported native interactions write to existing placements and relationships through the adapter.
- Mixed mode displays document sections and the canvas region for the same page, with synchronized selection and canonical edits. Switching modes never duplicates objects or resets layout.
- Group/ungroup, collapse/expand, basic card style and connector style persist separately from content. Keyboard-accessible controls supplement dragging and native surface interactions.
- Document ordering and free-position coordinates are independent presentation properties; reordering a document must not destroy its canvas layout.

The adapter suppresses write-back while applying external updates, avoids rebuilding the entire editor on every keystroke, disposes listeners/blob URLs on navigation and guards against late saves targeting the wrong page.

## 4. Images, files and embedded objects

Use the existing assets table for locally selected or dropped files. A new file/image creates one canonical entity, one asset and its first page placement in a transaction. Reusing it on another page creates only another reference.

Render supported raster images with managed local blob URLs; show filenames, size/type and explicit download/open actions for other files. Do not execute HTML/SVG/script uploads or automatically download remote attachments. Use a 25 MiB per-file limit with an actionable rejection before reading an oversized file. Do not claim file parsing, OCR or attachment downloading in this scope.

Embedded chats, messages, websites, repositories, tasks and memories are live canonical cards, not copied snippets. Provide source navigation, Inspector/Graph/backlinks actions and task-status updates through existing repositories. Render a safe preview card when a remote website cannot be embedded; do not bypass frame restrictions or load private provider sessions.

Conversation cards show their confirmed message references. Memory cards retain policy controls and source links. Displaying a memory never authorizes including it in an AI request. Displaying imported chat attachments does not imply their binary data exists locally.

## 5. Nested pages and project workspaces

Use an explicit confirmed `page-parent` relation from child workspace page to parent workspace page/project, separate from project membership. Allow one navigational parent per workspace page and reject cycles atomically, including concurrent reparent attempts. An object may still be referenced on many pages or belong to multiple projects.

Provide create child page, breadcrumbs, child-page links and move-to-parent controls in the existing workspace shell/Explorer. Nested projects retain the existing project-membership semantics and cycle checks; do not repurpose native browser bookmark folders.

Opening a project initially references its confirmed chats/messages, browser research, notes, repositories, tasks and memory, grouped by category for quick navigation. Reopening is idempotent. Offer an explicit refresh/add-missing-members action; do not unexpectedly rearrange the user's authored layout when membership changes.

Dragging a Brain/Explorer object onto the workspace adds its stable ID. Support a keyboard-accessible object picker for the same operation. Add workspace actions in the shared Inspector, project homepage, Brain rows and asset/file surfaces; preserve the existing React Flow Canvas as an available view.

## 6. Backups, failure handling and privacy

Extend existing backup validation to all added rich-text/page/presentation records. Import must reject invalid structures and dangling required page references before writes, preserve existing memory policies and leave old-format backups valid. Export/import into an empty test profile must restore pages, links, rich text and asset bytes with the same IDs.

The adapter is replaceable: native BlockSuite block IDs are runtime IDs, not application identity. Deleting/rebuilding its transient Yjs collection must not remove persisted pages or content. Unsupported native actions are disabled or rejected with a visible explanation, never silently saved to a hidden secondary store.

No provider network calls, GitHub mutations, authentication or cloud collaboration are introduced. Existing Ask AI remains explicitly invoked and uses current canonical content/policies. Realtime multi-user collaboration and live provider synchronization are separate scope, not prerequisites for these requested local workspace features.

## Acceptance tests required before completion

1. Put a chat, browser page, formatted note, task, memory, image and file on one page. Switch document/canvas/mixed modes and reload; IDs and content counts remain unchanged.
2. Edit a note's text and formatting; verify every reference, search/body projection and backup reads the same canonical content. Edit the same note in two tabs and verify conflicts cannot silently overwrite either draft.
3. Move/resize/reorder/group/collapse cards, style and reroute a connector, pan/zoom, close/reopen and restore from backup. Verify presentation persists and content is not copied into page settings or serialized native documents.
4. Create nested pages, navigate breadcrumbs and reparent a child. Reject self/descendant cycles without partial writes. Native bookmark folders remain untouched.
5. Add one asset to two pages and verify there is one asset record. Remove one reference and verify the other and its bytes remain. Reject active/oversized uploads safely and revoke released blob URLs.
6. Open a project twice and refresh missing members; no duplicate canonical entities, relationships or placements appear. Layout already arranged by the user remains unchanged.
7. Change memory exclusion/forgetting while its cards are open; the next AI preview/request respects the policy. No external requests occur from merely opening an editor or embedding a chat.
8. Inject a persistence failure and navigate during a pending save. The correct page retains a recoverable draft and no unsaved change is falsely marked saved.
9. Test empty pages, missing/deleted references, malformed backup content and legacy plain notes. Show actionable states without crashing or deleting data.
10. Run existing unit/type/lint/build and MV3 browser suites plus real keyboard/pointer rich-text, drag/resize, connector and nested-page tests. Inspect desktop and narrow-screen screenshots, not only DOM visibility.

## Implementation boundaries and review

Likely modules: new focused page repository, rich-text validation/projection module, BlockSuite page adapter and canonical block renderers; replace `BlockSuitePrototype`; extend the current repositories/types and existing shell, Inspector, Explorer and project homepage. Avoid turning the adapter or `WorkspaceApp.tsx` into another monolithic persistence layer.

Keep the installed compatible BlockSuite versions for this work unless a verified capability requires a narrowly scoped dependency change. Preserve MV3 CSP, lazy loading and third-party notices. Primary references checked: https://blocksuite.io/guide/store and https://blocksuite.io/guide/block-schema; installed 0.19.5 package APIs are the implementation authority where documentation differs.

Workflow: review this written design, then prepare/review the implementation plan and execute test-first in independently verifiable stages. This document does not reduce the user's requested scope to a prototype. Implementation completion requires all ten acceptance cases or an explicit, evidenced blocker—not merely a successful build.

Git boundary: the user subsequently authorized saving the current state. Local commit `09013d3` preserves the entire pre-upgrade implementation. No push or personal-browser installation is included. Preserve this checkpoint and unrelated work during implementation.
