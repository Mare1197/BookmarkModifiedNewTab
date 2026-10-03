# Codex Instructions — Audit Existing Browser OS New Tab Build and Produce a Missing-Features Implementation Plan

## Objective

Inspect the existing Browser OS New Tab repository, compare what is actually implemented against the full project specification, and create a **new creation/implementation plan based on the real current state of the repository**.

Do not assume the repo is empty.

Do not immediately rebuild the project from scratch.

Do not delete existing working features simply because the master specification describes a different approach.

---

## Source of Truth

Read these files first:

1. `MASTER_PROJECT_SPEC.md`
2. `IMPLEMENTATION_PLAN.md`

Then inspect the entire repository.

If these files are stored outside the repository when you receive this instruction, copy them into the project documentation folder without altering their meaning.

---

## Step 1 — Inspect the Current Repository

Inspect:

- file/folder structure
- package manager
- dependencies
- extension framework
- Manifest V3 configuration
- new-tab override
- React/TypeScript setup
- state management
- persistence/database
- browser API wrappers
- bookmark handling
- tab handling
- history handling
- Desktop/OS UI
- internal window system
- Explorer/tree
- Canvas
- Mind Map
- Graph
- Notes
- images/screenshots/files
- board support
- relationships/connections
- inspector/details UI
- search
- AI/provider integration
- tests
- build scripts
- lint/type-checking
- documentation

Run the existing project verification commands where safe and appropriate.

Do not infer that something works just because files exist.

---

## Step 2 — Build a Feature Matrix

Create:

`CURRENT_STATE_AUDIT.md`

For **every feature in `MASTER_PROJECT_SPEC.md`**, assign one of:

- COMPLETE
- PARTIAL
- MISSING
- CONFLICTING
- NEEDS VERIFICATION
- OBSOLETE / SUPERSEDED

For each feature record:

- feature name
- status
- implementation location
- relevant files/components
- what currently works
- what is missing
- whether existing code should be preserved
- dependencies
- risks/notes

Do not collapse major features into vague categories.

---

## Step 3 — Explicitly Check the Previously Easy-to-Miss Requirements

Verify each of these individually:

- multiple internal OS-style windows
- movable windows
- resizable windows
- folders opening as internal windows
- functional desktop launcher icons
- browser-resource/tool launchers
- real persistent nested folders
- multiple independent boards
- board create/rename/duplicate/delete/switch
- direct open-tab → Canvas placement without bookmarking
- screenshots as their own object type
- AI summary/result cards on Canvas
- cross-view selection/state preservation
- shared relationships across Canvas/Mind Map/Graph
- same logical object reused across views
- hidden shared inspector/details panel
- optional metadata displayed directly on cards
- specific-current-tab `Opened` timestamp
- `Opened From`/branched-from provenance where browser APIs reliably permit
- opened-through-search provenance where reliably inferable
- domain `First Opened`
- domain `Last Opened / Used`
- timestamp formatting exactly `DD/MM/YYYY HH:mm`
- explicit absence of accumulated total-open-time tracking
- local-first behavior
- no mandatory AI provider
- Gemini integration path
- NotebookLM integration/export path
- GBrain intentionally left undecided

If a browser API cannot provide a requested metadata field reliably, document that limitation and propose the safest technically accurate alternative.

Do not fabricate provenance.

---

## Step 4 — Evaluate Existing Libraries Before Adding New Ones

Create:

`OPEN_SOURCE_EVALUATION.md`

First document what libraries are already present.

Then, only for missing or weak subsystems, evaluate maintained open-source alternatives.

Possible candidates include, but are not limited to:

- WXT
- Plasmo
- Dexie
- React Flow / XYFlow
- React Complex Tree
- MUI Tree View
- Cytoscape.js
- Sigma.js
- rich-text editor libraries
- virtualization libraries

Do **not** install all candidates.

For every recommended addition, explain why the existing implementation is insufficient.

Prefer reuse over replacement.

---

## Step 5 — Check Architecture Consistency

Determine whether the project currently has:

- one shared object model
- duplicate object stores
- duplicated bookmark/page data per view
- Canvas-only relationships
- view-specific shadow copies
- global IDs
- board-specific layout data separated from global object identity
- proper domain records
- proper page records
- migration/versioning strategy

If architecture needs correction, identify the smallest safe migration path.

Avoid unnecessary full rewrites.

---

## Step 6 — Create a New Implementation Plan

Create:

`UPDATED_IMPLEMENTATION_PLAN.md`

This must be based on:

1. what already works
2. what is partial
3. what is missing
4. what architecture needs adjustment
5. which libraries should be reused
6. which new libraries, if any, are justified

Organize the plan into implementation slices.

Each slice must include:

- goal
- features
- files/subsystems affected
- dependencies
- migration needs
- tests
- acceptance criteria
- risk level
- whether it modifies existing working behavior

Prioritize completing one coherent shared architecture over bolting on disconnected features.

---

## Step 7 — Special Metadata Requirements

The updated implementation plan must explicitly implement or preserve the following.

### Current Open Tab

For the **specific currently open tab**:

- `Opened`
  - timestamp when the tracked tab was opened or first observed during the tracked tab lifetime/session

When reliably available:

- `Opened From`
- `Opened by Search`

If unavailable:

- use `Unknown` or `Not available`
- never guess

### Domain

Show:

- `First Opened`
- `Last Opened / Used`

based on accessible browser history/indexed records.

### Timestamp Format

All user-facing timestamps for these fields:

`DD/MM/YYYY HH:mm`

24-hour time.

### Explicit Non-Requirement

Do **not** implement accumulated total-open-time tracking.

---

## Step 8 — GBrain

Do not finalize GBrain integration during the general build unless explicitly instructed later.

For now:

- leave architecture extensible
- do not hard-code GBrain assumptions
- do not reduce the entire local model into a GBrain-dependent design
- do not implement automatic sync
- list GBrain as `DECISION DEFERRED`

A later dedicated evaluation should compare:

- connector
- deeper memory layer
- hybrid

---

## Step 9 — Verification Before Coding New Features

Before implementing missing features, provide the audit and updated plan first.

If you are operating in a mode where you may continue implementation automatically, preserve these rules:

1. Make the audit artifacts first.
2. Build in ordered slices.
3. Verify each slice.
4. Run relevant tests/build/typecheck.
5. Do not silently remove existing features.
6. Do not make irreversible architecture choices for deferred items.
7. Keep the project local-first.
8. Keep AI optional.

---

## Required Deliverables

Create or update:

- `CURRENT_STATE_AUDIT.md`
- `OPEN_SOURCE_EVALUATION.md`
- `ARCHITECTURE_ALIGNMENT.md`
- `UPDATED_IMPLEMENTATION_PLAN.md`

Do not claim the project is complete merely because the build passes.

The final audit must clearly state:

- what exists now
- what is missing
- what is partially implemented
- what needs refactoring
- what should be preserved
- what should be built next
- what decisions remain deferred
