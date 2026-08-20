# Browser OS New Tab — Creation and Implementation Plan

## Purpose

This file defines the recommended execution order for implementing the Browser OS New Tab project after Codex has audited the current repository against the Master Project Specification.

The repository may already contain working features. Preserve and extend good existing work rather than rebuilding everything automatically.

---

## Phase 0 — Repository Audit

Before changing code:

1. Inspect the complete repository structure.
2. Identify framework, build tooling, extension framework, state management, storage, and testing setup.
3. Run the existing build/tests/lint where possible.
4. Identify implemented features.
5. Compare them to `MASTER_PROJECT_SPEC.md`.
6. Produce a feature matrix:
   - Complete
   - Partial
   - Missing
   - Conflicting
   - Needs refactor
   - Needs verification
7. Identify reusable components.
8. Identify technical debt or duplicated systems.
9. Identify whether any requested feature already exists under another name.
10. Do not delete working features simply because the specification describes a different implementation path.

Deliverable:
- `CURRENT_STATE_AUDIT.md`

---

## Phase 1 — Open-Source Evaluation

For each missing major subsystem, research before custom-building.

Evaluate:

- extension shell/framework
- local database
- node/canvas renderer
- tree renderer
- graph renderer
- rich-text editor
- drag/drop where needed
- virtualization
- testing libraries

For every candidate record:

- package/repository
- license
- maintenance status
- bundle impact
- TypeScript support
- React compatibility
- browser-extension compatibility
- accessibility
- performance
- fit for requirements
- limitations
- recommendation

Prefer one shared node/edge renderer for Canvas + Mind Map + modest Graph workloads if technically sound.

Deliverable:
- `OPEN_SOURCE_EVALUATION.md`

---

## Phase 2 — Architecture Alignment

Define or verify the shared data model.

Separate:

### Global entities
- pages
- domains
- bookmarks
- folders
- notes
- images
- screenshots
- files
- tabs
- browser windows
- boards
- relationships

### Board-specific state
- x/y
- width/height
- z-order
- group/frame membership
- collapsed state
- board-specific visual properties

### View/UI state
- current view
- selection
- focused object
- filters
- inspector visibility
- window positions
- transient session state

### Browser-derived metadata
- first/last visits
- tab opened timestamp
- tab source/provenance
- current-open status
- bookmark status

### AI-derived metadata
- analysis
- summaries
- suggested relationships
- provenance
- provider/model metadata where appropriate

Deliverable:
- `ARCHITECTURE_ALIGNMENT.md`

---

## Phase 3 — Desktop / OS Foundation

Implement or complete:

- new-tab override
- desktop shell
- desktop launcher icons
- internal window manager
- movable windows
- resizable windows
- multiple simultaneous windows
- folder windows
- board windows
- browser-resource windows
- basic keyboard interactions
- persistence/session state where appropriate

Verification:

- open several windows
- move/resize them
- close/reopen them
- launch folders/tools/boards
- ensure core app remains responsive

---

## Phase 4 — Browser Data Layer

Implement or verify:

- bookmarks
- nested folders
- open tabs
- browser windows
- history
- page records
- domain records
- bookmarked status
- current-open status

### Required timestamps

User-visible format:

`DD/MM/YYYY HH:mm`

24-hour time.

Required data:

- specific open tab: `Opened`
- domain: `First Opened`
- domain: `Last Opened / Used`

Optional/provenance data when reliably available:

- `Opened From`
- `Opened by Search`
- search engine/query when safely and reliably known

Do not add accumulated total-open-time tracking.

Use `Unknown` / `Not available` rather than guessing.

Verification:

- tab state updates
- page/domain records merge correctly
- bookmark/history information does not create unnecessary duplicate logical page objects

---

## Phase 5 — Notes + Mixed Canvas

Implement or complete:

- plain notes
- rich notes
- images
- screenshots
- page cards
- bookmark cards
- open-tab cards
- files where allowed
- groups
- frames
- connections
- multi-select
- drag
- resize
- pan
- zoom
- duplicate
- delete
- persistence

### Multiple boards

Implement:

- create
- rename
- duplicate
- delete
- switch
- search/organize

Allow currently open tabs to be placed directly on a board without bookmarking.

Verification:

- mixed object board survives reload
- same page can appear on multiple boards without becoming duplicated as separate global records
- board layouts remain independent

---

## Phase 6 — Explorer / Tree

Implement or complete:

- expandable hierarchy
- real persistent nested folders
- mixed supported item types
- drag/drop
- open/closed state
- search/filter
- open-tab indicator
- shared data with Desktop and Canvas

Verification:

- edit/rename in one view and confirm changes elsewhere
- move items between folders
- confirm no separate shadow copy is created

---

## Phase 7 — Shared Inspector

Implement a reusable inspector with:

- Details
- History
- Tab / Session
- Domain
- Connections
- Notes
- Boards
- AI / Analysis
- Actions

Support optional card metadata toggles.

Verification:

- inspector works from Desktop
- inspector works from Explorer
- inspector works from Canvas
- inspector works from Mind Map/Graph after those views exist

---

## Phase 8 — Cross-View Relationship System

Relationships must be model-level, not renderer-level.

Support:

- manual connections
- labels/types
- opened-from
- related
- parent/child
- references
- AI-suggested
- user-confirmed

Verification:

- create relationship on Canvas
- view same relationship in Graph
- view relevant relationship in Mind Map
- delete/change relationship and confirm all views update

---

## Phase 9 — Mind Map

Implement on top of shared objects and relationships.

Requirements:

- topic-centered layout
- parent/child
- manual links
- expandable branches
- shared selection
- shared inspector

Do not duplicate the Canvas database.

---

## Phase 10 — Graph

Implement relationship exploration.

Requirements:

- graph filtering
- selective loading
- sane defaults
- avoid rendering the full browser history automatically
- distinguish user-created and AI-suggested relationships

Evaluate whether the existing canvas renderer is sufficient before adding Cytoscape.js, Sigma.js, or another graph library.

---

## Phase 11 — Unified Search

Search across:

- bookmarks
- folders
- pages
- domains
- tabs
- notes
- boards
- files
- AI cards
- relationships

Add filters and a command palette only if they improve the existing UX.

Core search must remain local-first.

---

## Phase 12 — AI Connector Layer

Create a provider-neutral action interface.

Initial targets:

### Gemini
- analyze page
- analyze image/screenshot
- analyze selected objects
- analyze board
- summarize
- suggest relationships

### NotebookLM
Evaluate the best supported integration/export workflow.

Possible scope:

- export selected URLs
- selected notes
- selected pages
- board source bundle

No silent synchronization.

Save results into the local project only when explicitly requested.

---

## Phase 13 — GBrain Evaluation

Do **not** assume GBrain is merely a connector.

Investigate:

### Option A
Connector-only.

### Option B
Deeper memory/knowledge layer.

### Option C
Hybrid.

Compare:

- data ownership
- duplication
- synchronization model
- offline behavior
- API/runtime requirements
- security/privacy
- usefulness
- complexity
- maintenance risk
- overlap with local index/search
- overlap with NotebookLM/Gemini

Deliverable:
- `GBRAIN_INTEGRATION_DECISION.md`

Do not implement a permanent GBrain architecture until this decision is reviewed.

---

## Phase 14 — Performance + Reliability

Test with large synthetic or imported datasets.

Focus:

- many bookmarks
- deep folder nesting
- many history entries
- many open tabs
- large boards
- graph size
- database query speed
- initial load
- memory
- rendering
- persistence

Add:

- virtualization
- lazy loading
- incremental indexing
- graph filtering
- debounced writes
- database indexes

only where evidence shows they are needed.

---

## Phase 15 — Testing and Verification

At minimum verify:

- extension builds
- new-tab override works
- bookmarks load
- nested folders persist
- current tabs update
- history metadata loads
- timestamps use `DD/MM/YYYY HH:mm`
- tab `Opened` value works where tracked
- domain `First Opened` works where history permits
- domain `Last Opened / Used` works
- missing provenance does not get fabricated
- notes persist
- multiple boards persist
- mixed canvas persists
- screenshots/images persist
- relationships sync across views
- folder changes sync across views
- inspector shows correct object
- local-only mode works without AI configuration
- connector-disabled states are usable
- existing features were not accidentally removed

---

## Phase 16 — Documentation

Maintain:

- `MASTER_PROJECT_SPEC.md`
- `CURRENT_STATE_AUDIT.md`
- `OPEN_SOURCE_EVALUATION.md`
- `ARCHITECTURE_ALIGNMENT.md`
- `IMPLEMENTATION_PLAN.md`
- `GBRAIN_INTEGRATION_DECISION.md` when evaluated
- changelog or implementation notes
- setup/run instructions

Document browser permissions and why each is required.

---

## Implementation Rules

1. Audit first.
2. Reuse good existing code.
3. Research open source before custom-building.
4. Do not add libraries just because they were suggested.
5. Keep one shared data model.
6. Keep Canvas layouts separate from global object identity.
7. Keep relationships shared across views.
8. Keep AI optional.
9. Keep GBrain undecided until specifically evaluated.
10. Do not fabricate browser metadata unavailable through APIs.
11. Use `DD/MM/YYYY HH:mm` for required visible timestamps.
12. Do not add accumulated total-open-time tracking.
13. Verify each slice before beginning unnecessary refactors.
