# Browser OS New Tab

A local-first Chrome/Chromium Manifest V3 new-tab desktop built on Super Bookmark Desktop.

The New Tab desktop remains the entry point. Browser research, projects, notes, tasks,
imported AI chats and reviewed AI memory share one canonical Brain; switching views
does not create separate copies. This is a working incremental build, not a claim of
complete AFFiNE parity or completion of the entire product specification.

## Current features

- Desktop bookmark, folder, and rich-document icons.
- Movable/resizable internal folder and document windows.
- Bookmark create/edit/delete, nested folders, drag/drop, multi-select, and quick search.
- Custom backgrounds/icons, backup/import, and optional browser sync.
- Browser-resource dock with Bookmarks, Open Tabs, History, Search, and Settings.
- Real open-tab and history windows that can remain open together.
- Shared collapsible inspector with tab/session and domain metadata.
- Tab `Opened` tracking and observable opener/search provenance without guessing.
- Domain first/last opened metadata from accessible browser history.
- Typed WXT/React new-tab shell with the verified legacy desktop available by default.
- Durable Dexie workspace identity shared by boards, Canvas, Explorer, Inspector, Mind Map, Graph, Search, and Assets.
- Multiple persistent boards with notes, recent web tabs, images, workspace screenshots, relationships, Trash recovery, and versioned export/import.
- Universal Quick Add and command palette with explicit multi-destination capture to boards, folders, Inbox, and relationships.
- Quick Inbox triage, smart query syntax with saved filters, restorable window sessions, task focus mode, local reminders, and an activity timeline.
- Local page-text clips with review-before-save, built-in board templates, and non-destructive board auto-layout.
- Optional Gemini analysis that is disabled until configured and explicitly invoked.
- User-facing browser metadata timestamps in `DD/MM/YYYY HH:mm` format.
- Unified Brain with Table, Kanban, Tiles, Timeline, Graph, project homepages and saved views.
- Preview-first local ChatGPT, Claude and normalized JSON conversation imports, stable
  message identity, provider-sequence display, and preserve-local conflict handling.
- Sourced AI memory with exclusion, private/project scope, review dates, forgetting and
  exact-context previews before optional provider requests.
- Real locally bundled BlockSuite document, edgeless and mixed workspaces over canonical
  object references, with rich notes, local files/images, child pages and persistent layouts.
- Private local draft recovery, Base/Current/Draft comparison, manual rich-text combination,
  generation-checked disposal with confirmation, and guarded content/page history restore.
- Browser recapture preserves workspace-edited titles and notes and keeps retained text searchable.
- Rich-note block move/delete controls, last-save undo, three heading levels and sequential numbered lists.
- Connector shape/color/dash controls and a searchable nested-page outline with breadcrumb navigation.
- Native connector endpoint retargeting, orthogonal route bends, cancellation and persistent layout undo.
- Scoped database reads, 50-object collection pages, separate Timeline paging, viewport-bounded
  Explorer/folder rendering, searchable destination pickers and deferred optional views with retry.

The extension does not calculate accumulated total-open time and does not require an AI provider.

## Brain, workspace and recovery

Open **Boards → Brain** to create objects or preview conversation exports. Select an object
to access its Inspector, projects, backlinks, source, shared views or optional **Ask AI**.
AI Inbox suggestions currently use local keywords and require explicit acceptance;
opening a chat or memory never triggers a provider request.

Use **Open in workspace** or **Boards → Workspace** for document/canvas/mixed editing.
Notes and files remain canonical Brain objects; BlockSuite's transient document stores
reference IDs, not a second persistent content database. AppFlowy, Anytype, Logseq and
xTiles are interaction/data-model references, not additional backends.

Use each note's block toolbar to move or delete blocks and choose heading levels.
**Undo text change** restores the last canonical save, not an unlimited action history.
Connector controls change page presentation; **Remove from page** retains the shared
relationship, while **Unlink everywhere** requires confirmation. **Page outline** searches
page titles and retains ancestors for context; breadcrumbs navigate through saved page parents.

**Recovery**, **Page history** and Inspector **Content history** support reviewed local
recovery and restoration. Only successfully acknowledged local journal writes are
recoverable. Ordinary backups exclude private drafts/history; including them is explicit.
Recovery does not protect against erased storage, extension uninstall or disk failure.

## Organize workspace folders

Open **Boards** and use the Explorer's **Folders** section. Choose a destination and
enter a new folder name to create a workspace folder (including nested folders).
Select an object in the object list, choose a destination and press **Move selected**
to add its shared identity to that folder. Existing memberships are retained when
adding from the global object list.

To move an existing membership, select the object inside its folder first. Drag it
onto another workspace folder's heading, or use **Destination folder** and
**Move selected** with the keyboard. **Workspace root** removes only that selected
membership. Select **Move folder [name]** to reparent a folder; cycles are rejected.
**Undo move** restores the latest move and survives reload. It refuses to overwrite
intervening edits; folder creation itself is not undone by this control.

Native bookmark folders are visibly read-only in this section. Use the existing
bookmark desktop for native bookmark organization. Board layouts and other folder
memberships are independent. The Inspector lists every board/folder membership,
recent recorded workspace activity, and incoming backlinks for the selected object.

## Native connector routing

In Workspace → Canvas, select a connector and drag its endpoint onto another object
card. Attachment positions persist. Retargeting creates or reuses a shared Brain
relationship; the original relationship remains available to other pages until you
explicitly unlink it.

For orthogonal lines, **Add route bend** creates a draggable waypoint. Arrow keys move
a focused bend (Shift for larger steps), Delete removes it, and **Reset route** restores
automatic routing. Escape or pointer cancellation restores the previous route.
**Undo layout** reverses the latest saved layout operation; **Page history** provides
reviewed restoration. Curve/straight lines keep native automatic routing, not manual
Bezier control points. Geometry stays page-local; objects are never copied.

Page loads use indexed endpoint queries and connector-ID lookups, avoiding a scan of
unrelated library relationships. See [routing and performance verification](docs/ROUTING_PERFORMANCE_VERIFICATION.md).

## Known limitations

- Workspace moves have one persistent undo slot; sibling manual ordering and native
  bookmark drag/drop within this new section are not implemented.
- Inspector history is the recent recorded workspace activity window, not a complete
  browser-history reconstruction. Unobserved provenance is shown as Unknown.
- Full Tab / Session, Domain and AI inspector parity, rich/file/frame Canvas breadth,
  large-graph profiling and credentialed provider acceptance remain separate work.
- Nested lists, code-language controls and manual curve control points remain
  follow-up editor work. The searchable outline is not a drag/reparent tree. This branch adds
  database-backed collection paging, windowed Explorer/folder rows and deferred optional views.
  Broad substring/title searches still scan their scope, and large native-editor capacity is
  not certified. Total editor dependency size is not reduced; supported controls are not full native-editor parity.
- Live provider synchronization, authenticated GitHub/Codex connectors, multi-user
  collaboration, universal undo and model-powered organization are not implemented.

## Verification checkpoint

The isolated `feature/large-library-performance` upgrade is documented in
[large-library performance](docs/LARGE_LIBRARY_PERFORMANCE.md), including scoped reads,
50-object collection pages, independently paged Timeline activity, searchable destination
pickers, background-refresh retention and lazy-view failure recovery. All **30 benchmark
cases** passed (five samples for both board shapes at 1k/10k/50k objects); timings,
variability and unmeasured large native-editor capacity are reported separately. The original
`feature/browser-resources-inspector` branch is preserved.

The October 8 performance refactor (`c552110`) passed local lint/formatting, both
TypeScript checks, **174 unit/integration tests**, **31 serial browser tests** and the
production MV3 build. The immutable build also passed the 30-case synthetic performance
matrix. This is the current-build checkpoint; the older results below
describe earlier releases, not the complete requested roadmap.

The October 3 routing/indexed-read follow-up passed local lint, formatting, both
TypeScript checks, **141 unit/integration tests**, **24 browser tests** and the
production MV3 build. See the [verification report](docs/ROUTING_PERFORMANCE_VERIFICATION.md)
for review fixes, benchmark methodology and remaining limitations.

The October 3 editor follow-up (`8a27de7`) passed a clean install, lint, formatting,
both TypeScript checks, **133 unit/integration tests**, **23 browser tests** and the
production MV3 build in [GitHub CI](https://github.com/Mare1197/BookmarkModifiedNewTab/actions/runs/37093827265).
No flaky browser cases were reported. The packaged extension is attached to that run.
Local source checks/build also passed, but Windows Chromium shutdown timed out after
the corrected rich-block assertions; the clean browser-suite result is from Linux CI,
not the local runner. See [current status](docs/UNIFIED_BRAIN_STATUS.md).

The October 2 reliability batch (`eb9f132`) passed lint, formatting, both TypeScript
checks, **131 unit/integration tests**, **20 isolated Chromium browser tests**, a clean
npm 10.9.9 install and the production MV3 build. See the
[verification report](docs/RELIABILITY_BATCH_VERIFICATION.md) for scope and review evidence.
These are dated test results, not a guarantee of future CI or every planned feature.

The checkpoint's production dependency audit reported zero vulnerabilities after the
DOMPurify 3.4.16 patch. The full audit still reported a development-only `brace-expansion`
advisory. Existing legacy-tool deprecations, the older BlockSuite icons engine warning
and the large lazy editor chunk remain known limitations.

## Development

```powershell
npx --yes npm@10.9.9 ci
npm test
npm run build
npm run test:smoke
```

Load the generated `dist/` folder from `chrome://extensions` with Developer mode enabled.
CI uses Node 22 and npm 10.9.9; local verification also passed on Node 24.13.0.
For serial browser verification use `npx playwright test tests/e2e --workers=1`.
The browser suite uses disposable profiles, not your personal Chrome profile.

## Test this exact build

For a separate test checkout:

```powershell
git clone --branch feature/large-library-performance --single-branch https://github.com/Mare1197/BookmarkModifiedNewTab.git NewTabOS-test
cd NewTabOS-test
```

Use the `feature/large-library-performance` branch. Install dependencies, run the
checks, then build and load `dist/` as an unpacked extension using the commands above.
Open a new browser tab, choose **Boards**, then test **Brain**, **Workspace**, **Canvas**,
**Graph**, **Search**, **Tasks**, **Activity**, **Assets** and **Recovery**. AI is optional.
Build after running `npm test`: its compatibility preparation replaces generated files.
For browser tests, install the matching Chromium once with `npx playwright install chromium`.

Try this connected workflow: create a project; preview/import a local chat export;
link it and a captured browser page to the project; create a note/task and sourced memory;
open the same objects in Table, Kanban, Tiles and Canvas; edit a shared note; review exact
AI context; reload and inspect backlinks/history. Use a separate test browser profile
if you want to experiment without changing your usual extension data.

## Instructions for another AI builder

The complete stack-independent, appearance-independent instructions for reproducing
this build are in [Current-build product instructions](docs/AI_BUILDER_CURRENT_BUILD.md).
They cover every implemented subsystem, shared identity rules, view behavior, browser
resources, capture, chats, memory, native editing/connectors, tasks/sessions, persistence,
recovery, performance and acceptance scenarios.

Core app logic:

- The New Tab OS remains the entry point. Preserve existing working features and user data.
- Browser captures, chats/messages, projects, notes, files, tasks and memory share one
  typed object/relationship store. Every view references the same stable objects.
- Object content and source identity are shared. Board geometry, tile ordering and
  connector presentation are separate. Removing an occurrence does not delete its object.
- Desktop, Explorer, Table, Kanban, Tiles, Timeline, Canvas, Mind Map and Graph are
  interchangeable ways to use that data, with one consistent Inspector and search.
- Projects link chats, browser research, repositories, notes, tasks and reviewed memory.
  Capture and project resume disclose destinations/browser actions before applying them.
- Conversations import with preview, stable source/message identities and preserved
  local edits. Derived memories retain sources and project links; AI suggestions need approval.
- Memory exclusion, forgetting, review deadlines, private scope and contradictions
  govern every optional AI request. Show exact context and recheck policies before sending.
- Edits persist across views/reload. Keep acknowledged recovery drafts and saved history
  private, compare conflicts and verify fresh state before restore/disposal.
- Page collections, keep selected-object reads independent, bound list rendering,
  retain rows during background refresh and expose loading/error/retry separately.

The five references are included: **Anytype** for the object model, **Logseq** for
backlinks/graph/activity, **AFFiNE/BlockSuite** for document/canvas editing,
**AppFlowy** for structured views and **xTiles** for tiles/quick organization. Their
capabilities operate inside New Tab OS over its Brain.

To test a builder against the same delivered build, provide the current-build document
and this branch. To ask it to complete everything we previously wanted, also provide
[Full product requirements](docs/AI_BUILDER_PRODUCT_HANDOFF.md) and
[Connected chats and memory requirements](docs/CONNECTED_KNOWLEDGE_ADDENDUM.md).
Those retain the requested but unfinished work: advanced tasks/workflows, Inbox rules,
duplicate merging, session comparison/groups, complete Canvas/Inspector breadth,
continuous source connectors, semantic retrieval, NotebookLM and GBrain evaluation.
The current-build document labels those limits explicitly.

## Permissions

- `bookmarks`: render and manage the user's native bookmark hierarchy.
- `favicon`: show browser-provided favicons.
- `storage`: persist settings, optional sync data, and observed tab-session metadata.
- `tabs`: list/focus/close current tabs and read the title, URL, and favicon shown in the Open Tabs window.
- `history`: show user-requested local history and derive domain first/last visit metadata.
- `activeTab`: capture the visible tab only from an explicit extension-toolbar popup action.
- `alarms`: schedule user-created task reminders locally.
- `notifications`: show those scheduled task reminders.

No `downloads` permission is requested. `scripting` and broad website access are optional:
the extension asks for the exact page origin only when the user chooses **Clip recent page**,
extracts page text locally, and lets the user review it before saving. The optional Gemini
host permission is requested at runtime only when the user explicitly runs Gemini analysis.
The Gemini key is stored unencrypted in the local browser profile and can be cleared from the
Analysis view.

## Project documents

- [Current Unified Brain implementation and limitations](docs/UNIFIED_BRAIN_STATUS.md)
- [Reliability batch verification](docs/RELIABILITY_BATCH_VERIFICATION.md)
- [Workspace recovery verification](docs/WORKSPACE_RECOVERY_VERIFICATION.md)
- [Complete product handoff](docs/AI_BUILDER_PRODUCT_HANDOFF.md)
- [Current-build instructions for another AI builder](docs/AI_BUILDER_CURRENT_BUILD.md)
- [Connected knowledge specification](docs/CONNECTED_KNOWLEDGE_ADDENDUM.md)
- [Shared workspace schema](docs/SHARED_WORKSPACE_SCHEMA.md)
- [GBrain integration decision](docs/GBRAIN_INTEGRATION_DECISION.md)
- [`docs/MASTER_PROJECT_SPEC.md`](docs/MASTER_PROJECT_SPEC.md)
- [`docs/CURRENT_STATE_AUDIT.md`](docs/CURRENT_STATE_AUDIT.md)
- [`docs/ARCHITECTURE_ALIGNMENT.md`](docs/ARCHITECTURE_ALIGNMENT.md)
- [`docs/OPEN_SOURCE_EVALUATION.md`](docs/OPEN_SOURCE_EVALUATION.md)
- [`docs/UPDATED_IMPLEMENTATION_PLAN.md`](docs/UPDATED_IMPLEMENTATION_PLAN.md)
