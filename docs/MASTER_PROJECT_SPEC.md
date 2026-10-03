# Browser OS New Tab — Master Project Specification

## 1. Project Goal

Create a local-first Chrome/Chromium Manifest V3 new-tab replacement that behaves like a lightweight personal browser operating system and knowledge workspace.

The project must unify browser data, user-created notes/files, spatial organization, hierarchical organization, graph relationships, and optional AI-assisted analysis without making any external AI provider mandatory.

The application must remain fully functional offline/local-first for its core functionality.

---

## 2. Core Architectural Principle

Do **not** build Desktop, Explorer, Canvas, Mind Map, and Graph as separate applications.

Use one shared underlying data model and render the same objects through multiple synchronized views.

Core flow:

Browser Data + Notes + Files
↓
Unified Local Knowledge Model
↓
Desktop / Explorer / Canvas / Mind Map / Graph
↓
Shared Details / Inspector
↓
Optional AI Connectors and Analysis

Changes made in one view must propagate to all other relevant views.

Selection, filters, focused object, and relevant workspace state should be preserved when switching views whenever practical.

---

## 3. Core Object Types

Treat the following as first-class workspace objects:

- Bookmark
- Bookmark folder
- Browser tab
- Browser window
- Browsing-history page
- URL / webpage
- Text note
- Rich note
- Image
- Screenshot
- Local text/document file where browser permissions allow
- Board / canvas
- Group / frame
- Collection
- Relationship / connection
- AI-generated summary or analysis card
- Browser-system tool / resource shortcut
- Future external memory or research reference

A bookmark, URL, note, or other object must remain the same logical object regardless of whether it is shown on Desktop, Explorer, Canvas, Mind Map, or Graph.

---

## 4. Main Views

### 4.1 Desktop / OS View

The default experience should feel like an OS-style desktop.

Requirements:

- Functional desktop icons
- Icons can launch:
  - folders
  - boards
  - notes
  - bookmarks
  - browser resources
  - tools
  - panels
- Multiple internal windows
- Internal windows should be movable
- Internal windows should be resizable
- Multiple windows can remain open at the same time
- Folders can open as actual internal windows
- Boards can open as internal windows
- Browser resources can open as internal windows
- Windows should preserve useful state during the current session

Potential browser resource launchers:

- Bookmarks
- History
- Open Tabs
- Browser Windows
- Boards
- Notes
- Downloads if browser APIs and permissions allow
- Search
- Settings

---

### 4.2 Explorer / Tree View

Provide a VS Code / Windows Explorer-like expandable hierarchy.

Requirements:

- Real persistent nested folders
- Folders may contain:
  - folders
  - bookmarks
  - notes
  - boards
  - files where supported
  - links
  - mixed supported item types
- Expand/collapse behavior
- Drag/drop reorganization
- Shared objects with other views
- Search/filter support
- Current-open-tab status where relevant

The hierarchy must not be merely visual grouping. Folder relationships must persist in the underlying model.

---

### 4.3 Endless Canvas / Mood Board

Provide an infinite or effectively endless spatial canvas.

Supported canvas items:

- Text notes
- Rich notes
- Images
- Screenshots
- Bookmark cards
- URL/page cards
- Open-tab cards
- File cards
- Folder cards
- AI summary/analysis cards
- Groups / frames
- Manual connections
- Linked pages
- Browser resource shortcuts where useful

Requirements:

- Free placement
- Drag
- Resize
- Group
- Frame
- Connect
- Delete
- Duplicate
- Multi-select
- Zoom
- Pan
- Multiple independent boards
- Create boards
- Rename boards
- Switch boards
- Duplicate boards
- Organize boards
- Place an already-open browser tab directly onto a board without requiring it to be bookmarked first

The same browser page may appear on multiple boards while referring to one shared underlying page object.

---

### 4.4 Mind Map View

Provide a mind-map-oriented representation of shared objects and relationships.

Requirements:

- Parent/child organization
- Topic-centered layouts
- Manual relationships
- Reuse relationships already created elsewhere
- Support bookmarks, notes, folders, pages, and selected other objects
- Where technically practical, reuse the same node/edge infrastructure as Canvas instead of creating an entirely separate renderer

---

### 4.5 Graph / Connections View

Visualize relationships between:

- pages
- bookmarks
- notes
- folders
- boards
- topics
- linked pages
- AI-discovered relationships
- manually created relationships

Relationships created in Canvas must also exist in Graph/Mind Map as shared model relationships rather than being canvas-only lines.

For larger graphs, evaluate whether a dedicated graph renderer is necessary.

---

## 5. Notes System

Notes are a core built-in feature, not an optional connector feature.

Requirements:

- Plain text notes
- Rich notes
- Free-floating canvas notes
- Notes inside folders
- Notes connected to bookmarks/pages/images/files
- Notes attachable to individual browser pages
- Notes visible in Tree, Canvas, Mind Map, and Graph where relevant
- Notes can be grouped into boards/projects
- Notes can be used without any AI provider
- AI-generated summaries may be saved as first-class note/analysis cards

---

## 6. Browser Page and Tab Metadata

### 6.1 Open Tab Metadata

For an **actual currently open tab**, show the following where technically possible:

1. **Opened**
   - Timestamp for when that specific currently open tab was opened or first observed by the extension during its tracked lifetime/session.
   - Do not attempt to calculate accumulated total time open.

2. **Opened From / Branched From**
   - If browser APIs or extension-observable navigation data make this reliably available, show the page/tab from which the tab was opened.
   - Examples:
     - opened from another tab/link
     - duplicated from another tab
     - opened from a bookmark
     - opened from history
   - If this cannot be reliably determined, show `Unknown` rather than guessing.

3. **Opened by Search**
   - Where reasonably inferable from navigation/referrer/search-engine information, indicate that the page/tab was opened through a search.
   - If the source search engine or search query is available without invasive tracking, it may be shown.
   - Never fabricate missing provenance.

### 6.2 Domain-Level Metadata

For the domain corresponding to a page/tab, show:

1. **Domain First Opened**
   - Earliest known visit/open timestamp for that domain based on accessible browser history/indexed data.

2. **Domain Last Opened / Used**
   - Most recent known visit/open timestamp for that domain.

The earlier idea of accumulated total-open-time tracking is explicitly **not required**.

### 6.3 Timestamp Format

All user-visible timestamps for this metadata must use:

**DD/MM/YYYY HH:mm**

Examples:

- `16/08/2026 09:42`
- `03/01/2025 18:07`

Use 24-hour time.

If a timestamp is unavailable, display an explicit neutral state such as:

- `Unknown`
- `Not available`
- `Not tracked`

Do not manufacture approximate timestamps.

---

## 7. Page-Level and Domain-Level Intelligence

Allow users to explicitly choose:

- Analyze this page
- Index this page
- Analyze selected items
- Analyze this board
- Analyze selected browser data

Store useful metadata where browser APIs and permissions allow:

- URL
- title
- favicon
- domain
- first-known page visit
- last-known page visit
- visit count/frequency
- domain first opened
- domain last opened/used
- currently open or closed
- current browser window/tab information
- bookmarked/not bookmarked
- bookmark location
- associated notes
- boards containing the item
- manually connected objects
- discovered relationships
- AI analysis/indexing status
- last analysis/indexing timestamp
- source/provenance information when reliably known

Automatic crawling/indexing should remain controlled and opt-in or explicitly configured.

Do not silently crawl the user's entire browsing history.

---

## 8. Hidden Details / Inspector

Use a shared collapsible inspector instead of overloading cards.

Suggested sections:

- Details
- History
- Tab / Session
- Domain
- Connections
- Notes
- Boards
- AI / Analysis
- Actions

The inspector should work across all major views.

Optional card-level metadata toggles may expose selected fields directly on cards, such as:

- currently open
- domain last used
- bookmarked
- last indexed
- selected timestamp fields

The user should be able to keep cards visually minimal.

---

## 9. Linked Pages and Relationships

A webpage should be able to become more than a bookmark.

Requirements:

- View manually connected pages
- View known linked/related pages where explicitly indexed
- Place related pages onto Canvas
- Convert/select relationships for Mind Map
- Visualize relationships in Graph
- Attach notes to a page
- Attach images/screenshots to a page
- Allow relationship labels/types
- Keep relationships reusable across views

Potential relationship types:

- parent
- child
- related
- reference
- opened-from
- search-result
- same-project
- manual
- AI-suggested

AI-suggested relationships must remain distinguishable from user-confirmed relationships.

---

## 10. Screenshots and Images

Support screenshots as a dedicated object type.

Possible flows:

- Capture visible page where extension/browser permissions allow
- Add an uploaded screenshot
- Attach screenshot to a page
- Place screenshot on Canvas
- Connect screenshot to notes/bookmarks/pages
- Analyze selected screenshot with an enabled AI provider
- Preserve original image locally where practical

Images and screenshots must not require AI processing.

---

## 11. Multiple Boards

The project must explicitly support multiple independent canvases/boards.

Each board may have:

- name
- description
- created timestamp
- updated timestamp
- items
- groups
- spatial layout
- connections
- optional board-level notes
- optional AI summaries

Users should be able to:

- create
- rename
- duplicate
- delete
- organize
- switch
- search boards

---

## 12. Cross-View State and Relationship Consistency

Important rule:

A relationship created in one view is part of the shared model.

Examples:

- Connecting a note to a bookmark on Canvas must make that relationship visible in Graph.
- A nested folder created in Explorer must be the same folder represented on Desktop/Canvas.
- Selecting a page in Graph and switching to Canvas should preserve focus/context where practical.
- Renaming a bookmark/folder/note should update everywhere.
- Moving an object spatially on one board changes that board layout only, not the object's global identity.

Separate:
- global object identity/data
- view-specific layout
- board-specific layout
- session UI state

---

## 13. Search and Retrieval

Provide unified local search across:

- bookmarks
- folders
- history/indexed pages
- tabs
- notes
- boards
- files where indexed
- AI summaries
- relationship labels

Later enhancements may include:

- fuzzy search
- filters
- command palette
- semantic search if an optional AI/local embedding layer is added

Core search must work without cloud AI.

---

## 14. AI Layer

AI is optional and must enhance the workspace rather than own it.

Potential connectors:

### Gemini
Potential uses:
- page analysis
- image analysis
- screenshot analysis
- board analysis
- summarization
- categorization
- relationship suggestions
- note generation

### NotebookLM
Potential uses:
- explicitly send/export selected sources
- selected notes
- selected pages
- board collections
- research bundles

### GBrain
**Decision intentionally deferred.**

Do not lock GBrain into a simple connector architecture yet.

During later evaluation, compare at least:

1. connector-only model
2. deeper memory/knowledge layer
3. optional hybrid

No implementation decision for GBrain should be treated as final until that evaluation is completed.

### AI Rules

- Core app works without AI
- No silent cloud sync
- Explicit/manual actions by default
- Provider-neutral connector interface
- Clear provenance for AI-generated content
- Never overwrite source notes/pages silently
- Allow AI results to be saved as first-class analysis cards/notes

Example actions:

- Analyze with Gemini
- Analyze selected items
- Analyze this board
- Send sources to NotebookLM
- Save analysis as note
- Suggest relationships
- Ask about selected items

---

## 15. Local-First Storage

Prefer local browser storage for the core application.

Evaluate IndexedDB through a suitable abstraction such as Dexie.

Separate logical layers:

- browser-derived metadata
- user-created objects
- board layouts
- relationships
- settings
- connector credentials/configuration
- optional cached AI results

Provide migration/versioning strategy from the start.

Avoid storing secrets in plain text where a safer browser-supported option exists.

---

## 16. Open-Source-First Rule

Before building a major subsystem from scratch, search for and evaluate existing maintained open-source libraries/components/templates.

Do not install every candidate automatically.

Evaluate:

- maintenance
- license
- bundle size
- extension compatibility
- React compatibility
- TypeScript support
- accessibility
- performance
- virtualization
- local-first compatibility
- customization
- long-term risk
- whether one library can cover multiple required views

Initial candidates to investigate:

- WXT
- Plasmo
- React
- TypeScript
- Dexie
- IndexedDB
- React Flow / XYFlow
- React Complex Tree
- MUI Tree View
- Cytoscape.js
- Sigma.js
- suitable rich-text editor libraries
- suitable local-file handling libraries
- drag/drop libraries only if not already provided by chosen renderer

Prefer reusing one renderer for Canvas + Mind Map + modest Graph workloads if it meets requirements.

Do not custom-build a graph/canvas engine unless necessary.

---

## 17. Browser Extension Foundation

Target:

- Chrome/Chromium
- Manifest V3
- new-tab override
- local-first functionality

Evaluate WXT vs Plasmo before choosing.

Architecture should keep browser-specific APIs behind adapters where practical so later browser support is easier.

Likely permissions must be kept minimal and justified.

Potential permissions to evaluate:

- bookmarks
- history
- tabs
- storage
- activeTab
- scripting only where required
- downloads only if feature scope requires it

Do not request broad permissions without a feature requiring them.

---

## 18. Performance Expectations

This project may handle very large bookmark/history/tab datasets.

Design for:

- lazy loading
- virtualization
- incremental indexing
- selective graph loading
- database indexes
- debounced persistence
- avoiding unnecessary React rerenders
- view-specific queries
- background processing where browser APIs permit
- graceful degradation with very large datasets

Do not attempt to render the user's entire history as thousands of graph nodes by default.

---

## 19. Recommended Implementation Slices

### Slice 0 — Audit Existing Build + Open-Source Evaluation

Before implementation:

1. Inspect the existing repository.
2. Map every existing feature to this specification.
3. Identify:
   - complete
   - partial
   - missing
   - conflicting
   - obsolete
4. Preserve working implementation where appropriate.
5. Evaluate open-source libraries before replacing/custom-building subsystems.
6. Produce a new implementation plan based on actual repo state.

Do not assume the project is empty.

### Slice 1 — Browser OS Foundation

- MV3 extension shell
- new-tab override
- React/TypeScript
- base routing/state
- local database
- permissions
- OS-style desktop
- window manager foundation
- desktop icons/launchers

### Slice 2 — Unified Browser Data

- bookmarks
- real nested bookmark/folder representation
- current tabs/windows
- history integration
- shared object IDs/model
- page/domain records
- basic metadata indexing
- exact timestamp formatting

### Slice 3 — Notes + Mixed Canvas

- text notes
- rich notes
- images
- screenshots
- URLs
- bookmarks
- open tabs
- files where supported
- canvas placement
- drag/resize
- groups
- multiple boards
- persistence

### Slice 4 — Shared Organization and Cross-View State

- Explorer/Tree
- Desktop synchronization
- Canvas synchronization
- shared identity
- cross-view selection/focus
- folder handling
- reusable relationships

### Slice 5 — Details + Browser Intelligence

- shared inspector
- page metadata
- domain first opened
- domain last opened/used
- specific-tab opened timestamp
- opened-from provenance where available
- search provenance where available
- bookmark status
- tab status
- notes/boards/relationships
- optional metadata-on-card toggles

### Slice 6 — Mind Map + Graph

- shared relationships
- mind-map view
- graph view
- relationship labels
- graph performance strategy
- AI-suggested vs confirmed relationship states

### Slice 7 — Unified Search and Productivity

- cross-object search
- filters
- command palette if appropriate
- board search
- keyboard navigation
- usability refinement

### Slice 8 — AI Connector Architecture

- provider-neutral connector interface
- Gemini adapter
- NotebookLM export/integration evaluation
- explicit/manual actions
- saved AI analysis cards
- no silent sync

### Slice 9 — GBrain Evaluation

Do not implement blindly.

Evaluate whether GBrain should be:

- optional connector
- deeper memory/knowledge subsystem
- hybrid integration

Prepare recommendation before coding.

### Slice 10 — Advanced Intelligence

Potential later work:

- semantic retrieval
- board analysis
- cross-board synthesis
- relationship discovery
- smarter grouping
- knowledge queries
- optional local embeddings
- richer GBrain workflows if approved

---

## 20. Acceptance Principles

The build is not complete merely because each view renders.

A feature should be considered complete only if:

- data persists
- data remains consistent across views
- browser permissions are justified
- error/empty states exist
- large datasets are considered
- keyboard/mouse interaction is usable
- local-first operation still works
- tests cover important behavior
- the implementation does not duplicate an existing subsystem unnecessarily

---

## 21. Decisions Explicitly Deferred

These are intentionally not finalized:

- exact GBrain architecture
- exact NotebookLM integration mechanism
- final graph renderer
- final rich-text editor
- whether a dedicated graph engine is needed beyond the canvas renderer
- optional semantic/local embedding implementation
- cloud hosting/deployment requirements

Codex must not silently make these irreversible architectural choices without documenting the tradeoff and the selected approach.

---

## 22. Non-Goals for Initial Core

Do not prioritize these before the shared core works:

- multi-user collaboration
- mandatory cloud accounts
- automatic full-history AI ingestion
- continuous cloud synchronization
- accumulated total-open-time tracking
- microservice-heavy architecture
- custom rendering engines when maintained libraries satisfy requirements

The project is primarily a personal-use browser workspace unless requirements later change.
