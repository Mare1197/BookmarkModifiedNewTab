# Browser OS New Tab — Current State Audit

Audit date: 19 August 2026
Repository: `Mare1197/BookmarkModifiedNewTab`
Audited commit: `183f47d` (`master`)
Baseline verification: `npm install` completed; `npm run build` passed; `npm test` is a deliberate failing placeholder; no lint or type-check script exists.

## Executive summary

This repository is a working Manifest V3 bookmark-desktop extension, not an empty project. Its strongest implemented subsystems are the new-tab override, real Chrome bookmark-folder integration, draggable desktop bookmark icons, movable/resizable internal folder and rich-document windows, custom icons/backgrounds, quick bookmark search, keyboard navigation, backup/import, and optional Chrome sync.

The current architecture predates the Browser OS specification. It is vanilla JavaScript with global `window.app` modules, direct Chrome API calls, `localStorage` layout/settings, `idb-keyval` blobs, and rich notes encoded as bookmark `data:` URLs. There is no shared workspace entity model, versioned database, browser tabs/history index, domain model, board/canvas, shared relationships, inspector, graph, mind map, screenshot object, or AI connector layer.

The safest route is an incremental migration. Preserve the existing desktop, bookmark, folder, document, window, backup, and customization behavior while introducing adapters and a versioned workspace model beside it. Do not replace the working desktop in one step.

## Status legend

- **COMPLETE** — implemented and supported by inspected code; runtime behavior may still need extension-browser QA.
- **PARTIAL** — useful implementation exists but does not satisfy the complete specification.
- **MISSING** — no implementation found.
- **CONFLICTING** — current representation conflicts with the required shared architecture.
- **NEEDS VERIFICATION** — code exists, but current automated or browser evidence is insufficient.
- **OBSOLETE / SUPERSEDED** — should not be extended as the long-term implementation.

## Foundation and tooling

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Chrome/Chromium Manifest V3 | COMPLETE | `manifest.json` declares `manifest_version: 3` and minimum Chrome 104. | Yes | Add only permissions justified by implemented features. |
| New-tab override | COMPLETE | `chrome_url_overrides.newtab` points to `index.html`. | Yes | Verify as a loaded unpacked extension after each slice. |
| Extension framework | PARTIAL | Custom static build in `build.js`; no WXT/Plasmo. | Preserve during migration | Build works, but long-term typed entrypoints, service worker tooling, and tests are weak. |
| React | MISSING | No React dependency or components. | N/A | Recommended only for the new application shell after adapters and migration fixtures exist. |
| TypeScript | MISSING | All application modules are global scripts. | N/A | Introduce at subsystem boundaries rather than translating every legacy file first. |
| Build | COMPLETE | `npm run build` emits `dist/`. | Yes, until superseded | Toolchain uses deprecated `uglify-es`, `rimraf@2`, and old lockfile metadata. |
| Unit/integration tests | MISSING | `npm test` exits with “no test specified.” | No | Add tests before data migrations. |
| Lint/type-check | MISSING | No scripts or configuration. | N/A | Add with the typed shell. |
| CI | PARTIAL | Pages deployment workflow exists. | Rework | Deploying raw repository content is not extension packaging or extension-browser QA. |
| Documentation | PARTIAL | Short README describes legacy behavior. | Yes, update | Add permission rationale, architecture, migration, and local load instructions. |

## Desktop and internal windows

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| OS-style desktop | COMPLETE | `index.html`, `style.css`, `src/init.js`, and `src/icon.js`. | Yes | Modernize accessibly without changing the recognizable desktop behavior. |
| Functional bookmark icons | COMPLETE | Icons open bookmarks and support custom images. | Yes | Add non-bookmark workspace object launch behavior. |
| Functional folder icons | COMPLETE | `src/folder.js` opens bookmark folders in internal windows. | Yes | Folder windows currently understand only Chrome bookmark nodes/documents. |
| Functional document icons | COMPLETE | `src/document.js` opens rich documents in internal windows. | Yes | Migrate storage away from bookmark `data:` URLs. |
| Tool/browser-resource launchers | MISSING | No launchers for tabs, history, browser windows, boards, or inspector. | N/A | First implementation slice. |
| Multiple simultaneous internal windows | COMPLETE | `src/window.js` creates independent windows; folders and documents can coexist. | Yes | Add focus/z-order accessibility and test multiple resource windows. |
| Movable windows | COMPLETE | Title-bar pointer handling in `src/window.js`. | Yes | Uses mouse events rather than Pointer Events; touch support is absent. |
| Resizable windows | COMPLETE | Eight resize handles in `src/window.js`. | Yes | Keyboard resizing and viewport clamping are absent. |
| Folder internal windows | COMPLETE | Breadcrumb navigation and live bookmark re-rendering in `src/folder.js`. | Yes | Add mixed workspace objects after model introduction. |
| Board internal windows | MISSING | No board type or renderer. | N/A | Requires shared model and board layout tables. |
| Browser-resource internal windows | MISSING | Browser APIs are used for actions only, not resource views. | N/A | Implement tabs/history/bookmarks launchers first. |
| Current-session window state | PARTIAL | Optional `rememberWindows` stores folder/document geometry in `localStorage`; widget state is separate. | Yes, migrate | No schema/version, no system-resource window type, and state is split across keys. |
| Keyboard window navigation | PARTIAL | Tab cycles windows; Escape closes active window; arrows navigate icons. | Yes | Focus management and ARIA semantics need work. |

## Explorer and hierarchy

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Real persistent nested folders | COMPLETE | Chrome bookmark folders are the persistent source; create/move/delete uses `chrome.bookmarks`. | Yes | Workspace-only folders for mixed object types do not exist. |
| Folder contains bookmarks | COMPLETE | Native bookmark children render in windows. | Yes | None for bookmark-only scope. |
| Folder contains rich documents | PARTIAL | Documents are encoded as special bookmark URLs. | Preserve behavior, migrate representation | URL size/security/portability limits; not a real note entity. |
| Folder contains notes, boards, files, mixed objects | MISSING | No workspace hierarchy model. | N/A | Add `entities` and `folderMemberships`. |
| Expand/collapse tree | MISSING | Folder windows are navigational grids, not an explorer tree. | N/A | Implement after shared model. |
| Hierarchy drag/drop | PARTIAL | `src/draggableIcons.js` moves Chrome bookmark nodes between folders/desktop. | Yes | No generic mixed-object move operation. |
| Explorer search/filter | PARTIAL | `src/quickSearch.js` searches bookmarks only in a modal. | Yes | Add folder/page/tab/note/board filters. |
| Current-open-tab indicator | MISSING | No tab query or tab state. | N/A | Add browser data adapter and shared indicators. |

## Notes

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Plain text notes | MISSING | No first-class plain note. | N/A | Add a note entity variant. |
| Rich notes | PARTIAL | Pell editor content is stored inside bookmark `data:` URLs. | Preserve UX, migrate data | Pell is old; no versioned document format or object identity. |
| Notes inside folders | PARTIAL | Special document bookmarks can live in bookmark folders. | Preserve behavior | They cannot live in generic workspace folders yet. |
| Free-floating canvas notes | MISSING | No canvas. | N/A | Depends on boards. |
| Notes attached to pages/assets | MISSING | No relationship model. | N/A | Depends on entity/relationship tables. |
| Notes visible across views | MISSING | Only desktop/folder/document window representations exist. | N/A | Requires shared identity and selectors. |
| AI result saved as analysis card | MISSING | No AI or analysis entity. | N/A | Later optional connector slice. |

## Browser data and metadata

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Bookmarks read/create/update/delete | COMPLETE | Chrome bookmarks API is the primary data source. | Yes | Wrap behind an adapter; retain native bookmark IDs as source references. |
| Bookmark folders | COMPLETE | Native tree plus folder windows. | Yes | Merge with workspace hierarchy without duplicating browser data. |
| Open tabs list | MISSING | Code creates/updates tabs but never queries current tabs. | N/A | Add `tabs` permission and adapter. |
| Browser windows list | MISSING | Code creates windows but never enumerates them. | N/A | Use `chrome.windows.getAll({populate:true})`. |
| Browsing history | MISSING | `bookmarkHistory` records clicks inside this extension only; it is not browser history. | Keep as recency signal only | Add `history` permission and distinguish extension-click history from Chrome history. |
| Global page records | MISSING | URLs live only on bookmarks/DOM datasets. | N/A | Canonicalize URLs into page entities. |
| Global domain records | MISSING | No domain aggregation. | N/A | Add host-keyed domain entities/indexes. |
| Bookmark/current-tab page merge | MISSING | There is no page identity layer. | N/A | Merge through canonical URL while retaining source references. |
| Specific current-tab `Opened` | MISSING | No tab lifecycle tracking. | N/A | Track `tabs.onCreated`; for pre-existing tabs use first-observed time and label accurately. |
| `Opened From` provenance | MISSING | `openerTabId` is not recorded. | N/A | Record only from observable `openerTabId`/history reference; otherwise `Unknown`. |
| `Opened by Search` provenance | MISSING | No navigation provenance. | N/A | Do not infer unless observable evidence is strong; initially show `Unknown`. |
| Domain `First Opened` | MISSING | No Chrome history queries. | N/A | Derive from accessible visits, scoped and cached. |
| Domain `Last Opened / Used` | MISSING | No Chrome history queries. | N/A | Derive from accessible history and current tabs. |
| `DD/MM/YYYY HH:mm` formatting | MISSING | No required browser metadata UI. | N/A | Central formatter required; return neutral state for invalid values. |
| Accumulated total-open-time tracking | COMPLETE | Absent, as required. | Yes | Do not add it. |

## Canvas, boards, and spatial objects

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Endless/effective canvas | MISSING | Desktop grid is finite icon placement, not a pan/zoom canvas. | Preserve desktop separately | Use a maintained node renderer later. |
| Mixed canvas object types | MISSING | Only bookmark/folder/document desktop icons. | N/A | Requires workspace entities and node renderers. |
| Drag on canvas | MISSING | Desktop bookmark drag is not canvas drag. | Reuse interaction lessons only | Needs board layout state. |
| Resize canvas items | MISSING | Only windows resize. | N/A | Later board slice. |
| Pan/zoom | MISSING | No implementation. | N/A | Later board slice. |
| Multi-select | PARTIAL | Desktop/folder icon marquee and modifier selection exist. | Reuse behavior | No canvas model or selection store. |
| Groups/frames | MISSING | No implementation. | N/A | Later board slice. |
| Manual connections | MISSING | No relationship data or renderer. | N/A | Relationships must be model-level first. |
| Duplicate/delete canvas items | MISSING | Bookmark delete exists; no board placement operation. | N/A | Later board slice. |
| Screenshots as object type | MISSING | Background/custom-icon images are blobs, not entities. | Preserve assets | Add screenshot entity and blob reference. |
| Images as object type | MISSING | Images cannot exist independently in workspace. | Preserve assets | Add image entity and blob reference. |
| Files as object type | MISSING | No file object or retained handle. | N/A | Keep permission/browser limitations explicit. |
| AI cards | MISSING | No analysis objects. | N/A | Later provider-neutral slice. |
| Place open tab without bookmarking | MISSING | No boards or tab placements. | N/A | Later board slice after tab adapter. |
| Multiple independent boards | MISSING | No board entity. | N/A | Add board records and board-specific placements. |
| Create/rename/duplicate/delete/switch/search boards | MISSING | No operations. | N/A | Implement together to avoid a single-board dead end. |

## Relationships, mind map, and graph

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Shared relationship records | MISSING | No relationship store. | N/A | Introduce before any renderer-specific edges. |
| Relationship labels/types | MISSING | No implementation. | N/A | Include origin and confirmation state. |
| Same relationship in Canvas/Mind Map/Graph | MISSING | Views do not exist. | N/A | Use shared selectors over one relationship table. |
| Mind Map view | MISSING | No implementation. | N/A | Reuse the canvas renderer when practical. |
| Parent/child mind-map layout | MISSING | No implementation. | N/A | Keep hierarchy membership distinct from general relationships. |
| Graph view | MISSING | No implementation. | N/A | Start with filtered subsets; never render all history by default. |
| AI-suggested vs confirmed edges | MISSING | No implementation. | N/A | Persist provenance and confirmation status. |

## Shared state and inspector

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| One shared object model | CONFLICTING | Chrome bookmarks, DOM datasets, `localStorage`, IndexedDB blobs, and special bookmark documents form separate implicit stores. | Preserve data, replace architecture incrementally | Add stable global IDs and source references. |
| Global IDs | PARTIAL | Chrome bookmark IDs are reused across desktop/folder DOM. | Preserve as external IDs | They cannot identify notes, pages, tabs, domains, boards, assets, or relationships. |
| Board layout separated from object identity | MISSING | No boards; desktop position is keyed by bookmark ID. | Reuse principle only | Add board placement records. |
| Cross-view selection/focus | MISSING | Selection is DOM-local and cleared by many interactions. | N/A | Add UI state store. |
| Rename propagation | PARTIAL | Chrome bookmark events rerender desktop and folder windows. | Yes | Extend to workspace entities and all views. |
| Shared collapsible inspector | MISSING | Bookmark/background properties are modal and type-specific. | Preserve property editors | Add reusable inspector with sections. |
| Details/History/Tab/Domain/Connections/Notes/Boards/AI/Actions sections | MISSING | No shared panel. | N/A | First slice implements the browser metadata subset. |
| Optional card metadata toggles | MISSING | No card model/settings. | N/A | Add after shared cards exist. |

## Search and AI

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Bookmark search | COMPLETE | `src/quickSearch.js`, keyboard accessible in basic form. | Yes | Fix edge cases and preserve bookmark recency ranking. |
| Unified local search | PARTIAL | Search scope is bookmarks only. | Yes, expand | Add entity-type indexes and filters. |
| Command palette | MISSING | Quick search is not a command palette. | N/A | Defer until unified search proves need. |
| Provider-neutral AI interface | MISSING | No provider layer. | N/A | Add only after shared objects/selection exist. |
| Gemini integration path | MISSING | No implementation. | N/A | Later explicit connector with opt-in actions. |
| NotebookLM export path | MISSING | No implementation. | N/A | Evaluate supported explicit export workflow later. |
| GBrain | OBSOLETE / SUPERSEDED | No implementation, which is correct for the deferred decision. | Yes | Keep `DECISION DEFERRED`; do not hard-code assumptions. |
| Core works without AI | COMPLETE | Entire current extension is local/browser based. | Yes | Maintain this invariant. |

## Persistence, privacy, and performance

| Feature | Status | Current implementation | Preserve? | Missing work / risks |
|---|---|---|---|---|
| Local-first core | COMPLETE | Chrome bookmarks, `localStorage`, and IndexedDB blobs; no mandatory server. | Yes | Reddit background fetching and optional sync are non-core exceptions. |
| IndexedDB use | PARTIAL | `idb-keyval` stores custom icon/background blobs. | Preserve/migrate | No structured schema, indexes, transactions, or migrations. |
| Versioned database/migrations | MISSING | Only ad hoc defaults and version UI logic. | N/A | Required before shared model expansion. |
| Browser/user/board/UI/AI data separation | MISSING | Settings and layout are mixed in `localStorage.data`; other state is scattered. | N/A | Define separate logical tables/stores. |
| Optional browser sync | COMPLETE | Chunked `chrome.storage.sync` backup can be enabled/disabled. | Preserve as optional | Sync payload is legacy and should not silently absorb future sensitive records. |
| File backup/import | COMPLETE | `src/backup.js` exports/imports settings, positions, and blobs. | Yes | Add versioned workspace export later. |
| Secret handling | NEEDS VERIFICATION | No connector secrets exist. | N/A | Define safe connector credential policy before AI work. |
| Large-dataset design | MISSING | Full bookmark tree renders eagerly; no virtualization or selective indexes. | Preserve for current datasets | Add measurements, indexes, lazy queries, and virtualization only when evidence requires. |
| Accessibility | PARTIAL | Keyboard navigation exists, but custom windows/icons lack robust semantics and focus management. | Preserve behavior | Add ARIA roles, visible focus, dialog/window semantics, and keyboard alternatives. |

## Previously easy-to-miss requirements

| Requirement | Audit result |
|---|---|
| Multiple movable/resizable OS windows | COMPLETE in `src/window.js`. |
| Folders open as internal windows | COMPLETE in `src/folder.js`. |
| Functional desktop launchers | PARTIAL; bookmark/folder/document icons work, browser tools do not exist. |
| Real nested folders | COMPLETE for Chrome bookmarks only. |
| Multiple boards and lifecycle operations | MISSING. |
| Direct open-tab to Canvas without bookmark | MISSING. |
| Screenshot type | MISSING. |
| AI summary/result canvas cards | MISSING. |
| Cross-view state preservation | MISSING. |
| Shared relationships/logical object across views | MISSING. |
| Hidden shared inspector | MISSING. |
| Optional metadata on cards | MISSING. |
| Specific tab `Opened` | MISSING. |
| Reliable `Opened From` and search provenance | MISSING; must never be guessed. |
| Domain first/last opened | MISSING. |
| Exact timestamp format | MISSING. |
| No accumulated total-open-time tracking | SATISFIED by absence. |
| Local-first/no mandatory AI | COMPLETE and must be preserved. |
| Gemini/NotebookLM paths | MISSING. |
| GBrain deferred | SATISFIED; keep deferred. |

## Preserve immediately

- Manifest V3 new-tab override.
- Native Chrome bookmark CRUD and event-driven rerendering.
- Desktop icon positioning and custom icon behavior.
- Internal window manager, folder windows, breadcrumbs, and rich-document windows.
- Bookmark drag/drop and multi-selection behavior.
- Quick bookmark search and bookmark recency.
- Background customization, backup/import, and optional browser sync.

## Build next

1. Browser API adapter plus MV3 tab-lifecycle service worker.
2. Functional browser-resource desktop launchers and internal resource windows.
3. Shared collapsible inspector for tab/history/bookmark/page metadata.
4. Central exact timestamp/provenance handling.
5. Versioned workspace entity model and legacy migration fixtures.
6. Multiple boards and mixed canvas only after identity/layout separation exists.

## Decisions still deferred

- Final WXT versus Plasmo migration timing.
- Final graph renderer.
- Final rich-text editor.
- Dedicated graph engine versus shared node renderer.
- NotebookLM integration mechanism.
- GBrain connector/deeper-memory/hybrid architecture.
- Semantic/local embedding layer.
