# Browser OS New Tab — Open-Source Evaluation

Evaluation date: 19 August 2026

## Decision summary

- Add **no new runtime library** for the first Browser Resources + Shared Inspector slice. The existing window system and direct Chrome APIs are sufficient, and avoiding a framework rewrite keeps the slice reversible.
- Recommend **WXT + React + TypeScript** as the target shell for the later typed migration, introduced beside the legacy modules after browser adapters and migration fixtures exist.
- Recommend **Dexie** for the versioned structured workspace database when shared entities are introduced.
- Recommend **React Flow / XYFlow** for Canvas and Mind Map, and initially for small filtered Graph views.
- Keep the dedicated large-graph renderer decision deferred until measured datasets demonstrate a need.
- Preserve Pell only while legacy documents remain bookmark `data:` URLs; evaluate **Tiptap** for the migrated note entity.
- Add virtualization only after measurements; **TanStack Virtual** is the preferred headless option.

## Existing libraries and tooling

| Library/tool | Current use | Assessment | Action |
|---|---|---|---|
| Custom `build.js` + `clean-css@4.2.3` + `uglify-es@3.1.3` + `ncp@2.0.0` + `rimraf@2.6.2` | Concatenates/minifies the static extension into `dist/`. | Build passes, but several packages are deprecated and `npm audit` reports two high-severity development dependency findings. | Preserve for the first slice; do not expand. Replace as part of typed shell migration. |
| Vendored `idb-keyval` | Stores custom icon and background blobs in one key-value store. | Adequate for legacy blobs; inadequate for typed entities, indexes, transactions, and migrations. | Preserve blob access; migrate structured data to Dexie later. |
| Vendored Pell | Rich document editing. | Small and working, but documents are HTML inside bookmark `data:` URLs and the editor relies on deprecated `document.execCommand`. | Preserve read/edit compatibility until note migration; do not use for new object types. |
| `lz-string@1.4.4` | Compresses optional Chrome sync payloads. | Useful for the legacy optional sync path. | Preserve; keep future sensitive/browser-derived data out of sync by default. |
| Custom color picker | Background customization. | Isolated and sufficient for current feature. | Preserve. |
| Native Chrome extension APIs | Bookmarks, storage, tab/window creation. | Correct dependency for privileged browser data. | Wrap in adapters before adding broad new views. |

## Extension shell: WXT versus Plasmo

### WXT — recommended target

[WXT](https://wxt.dev/) currently documents MV2/MV3 builds, Chrome/Firefox/Edge/Safari targets, TypeScript by default, file-based entrypoints, HMR, and automated packaging. Its generated manifest model can keep browser permissions and entrypoint ownership explicit.

Fit:

- Strong TypeScript-first extension structure.
- MV3 service worker and new-tab entrypoints are natural boundaries.
- React is optional through a module, allowing gradual adoption.
- Multi-browser output can be added later without changing the workspace model.

Risks:

- Migrating the legacy global-script load order requires an adapter/compatibility entrypoint.
- Generated manifests change the current hand-authored build and packaging path.
- A framework migration and data-model migration must not happen in the same slice.

Recommendation: introduce WXT only after the browser API adapter, tab-session tracking, and migration tests are stable. Keep the working `dist` build available during transition.

### Plasmo — viable, not selected

[Plasmo](https://docs.plasmo.com/) supports TypeScript, React/Preact/Svelte/Vue, extension storage/messaging, and multi-browser/manifest targets. It is capable, but the current project does not need Plasmo-specific batteries enough to justify preferring it over WXT. The public Plasmo repository result inspected during this audit showed an older latest release than the actively documented WXT release line.

Recommendation: do not install both. Reconsider only if Plasmo-specific messaging/storage or publishing features become decisive before migration starts.

## Structured local database

### Dexie — recommended when the shared model starts

[Dexie](https://dexie.org/docs) is a maintained IndexedDB wrapper with TypeScript support, explicit schemas, indexes, transactions, and version upgrades. Those capabilities directly address the current scattered `localStorage`/blob/bookmark representation.

Proposed responsibility:

- `entities`
- `sourceRefs`
- `domains`
- `boards`
- `placements`
- `relationships`
- `folderMemberships`
- `tabSessions`
- `assets`
- `settings`
- `migrations`

Do not move existing icon/background blobs on day one. First add an import-only compatibility reader and fixture-backed migration. Dexie should remain local-only; do not add Dexie Cloud.

## Canvas, Mind Map, and modest Graph

### React Flow / XYFlow — recommended

[React Flow](https://reactflow.dev/) is MIT-licensed, TypeScript-based, and supplies dragging, zooming, panning, multi-selection, and edge creation out of the box. These map directly to Canvas and Mind Map requirements. Custom nodes can preserve one logical entity while board placement remains separate.

Recommendation:

- Use one node/edge infrastructure for Canvas and Mind Map.
- Use it for small, user-filtered Graph subsets initially.
- Persist only entity IDs, relationship IDs, and board-specific geometry—not renderer objects.
- Do not render all browser history automatically.

## Explorer/tree

### React Complex Tree — preferred candidate, revalidate before install

[React Complex Tree](https://github.com/lukasbach/react-complex-tree) offers multi-selection, drag/drop, keyboard navigation, and an unopinionated accessible tree. It aligns with the mixed-object explorer and can be styled to match the desktop.

Risk: its maintenance/release cadence should be rechecked immediately before installation. If it is inactive at implementation time, build the tree on accessible primitives or reassess alternatives.

### MUI X Rich Tree View — not preferred for this project

[MUI Rich Tree View](https://mui.com/x/api/tree-view/rich-tree-view/) supplies selection, editing, expansion, and virtualization. However, the official drag/drop ordering documentation uses `RichTreeViewPro`, creating a commercial-feature boundary for a core requirement.

Recommendation: do not make the core folder-reordering experience dependent on a Pro package.

## Dedicated Graph renderer — decision deferred

### Cytoscape.js

[Cytoscape.js](https://js.cytoscape.org/) is MIT-licensed and combines interactive visualization, graph gestures, layouts, and graph-analysis functions. It is the stronger later candidate if graph editing/analysis and compound layouts become central.

### Sigma.js

[Sigma.js](https://www.sigmajs.org/docs/) is an open-source WebGL renderer aimed at thousands of nodes/edges and uses Graphology. It is the stronger later candidate if measured workloads demand high-scale exploratory rendering.

Recommendation: install neither now. Begin with filtered XYFlow graphs and add a dedicated renderer only after profiling representative data. Persist relationships independently so renderer changes are reversible.

## Rich text

### Tiptap — recommended candidate

[Tiptap](https://tiptap.dev/docs/editor/getting-started/overview) is a headless, modular, MIT-licensed editor built on ProseMirror and supports vanilla JavaScript and React. Its HTML handling offers a practical import bridge for current Pell documents.

### Lexical — strong alternative

[Lexical](https://github.com/facebook/lexical) is MIT-licensed, TypeScript-based, accessible, performant, and has official React bindings. It is a good fit for a React-first editor but offers less advantage than Tiptap for a gradual vanilla-to-React bridge.

Recommendation: preserve Pell until a note migration slice. Prototype HTML import/export and sanitization with Tiptap before selecting permanently. Never overwrite source bookmark documents until round-trip tests pass.

## Virtualization

[TanStack Virtual](https://tanstack.com/virtual/v3/docs/introduction) is a headless JS/TS virtualizer for lists and grids that retains full control of markup and styles.

Recommendation: add only when measured bookmark/history/tree sizes cause DOM or interaction problems. First implement query limits, incremental indexing, and selective graph loading; virtualization is not a substitute for bounded data access.

## Browser APIs and permission fit

The first slice should use platform APIs rather than third-party abstractions:

- [`chrome.tabs`](https://developer.chrome.com/docs/extensions/reference/api/tabs) for current tabs and visible-tab capture later. `captureVisibleTab` is deliberately deferred because it requires `activeTab` or host access and has a documented rate limit.
- [`chrome.windows`](https://developer.chrome.com/docs/extensions/reference/api/windows) with `populate: true` for browser windows and their tabs; the `tabs` permission is needed for URL/title/favicon fields.
- [`chrome.history`](https://developer.chrome.com/docs/extensions/reference/api/history) for explicit history queries and visits. It exposes visit timestamps, transition types, and `referringVisitId`, but missing provenance must still remain `Unknown`.
- Existing [`chrome.bookmarks`](https://developer.chrome.com/docs/extensions/reference/api/bookmarks) integration remains the authoritative bookmark source.

Permission recommendation for the first slice:

- Add `tabs` because the feature displays current tab URLs/titles/favicons and focuses tabs.
- Add `history` because the feature displays user-requested local history and derives first/last known domain visits.
- Retain `bookmarks`, `favicon`, and `storage`.
- Do not add `activeTab`, `scripting`, `<all_urls>`, or `downloads` until a concrete implemented feature needs them.

## Installation decisions by slice

| Slice | Add now? | Decision |
|---|---:|---|
| Browser resources + inspector | No | Native Chrome APIs + existing window system. |
| Shared entity model | Yes | Dexie after migration tests. |
| Typed extension shell | Yes | WXT + React + TypeScript, separate from data migration. |
| Explorer | Later | React Complex Tree candidate; revalidate. |
| Canvas/Mind Map | Later | React Flow / XYFlow. |
| Graph | Deferred | Start with XYFlow; choose Cytoscape or Sigma only from evidence. |
| Rich notes | Later | Tiptap prototype with legacy import tests. |
| Large lists | Conditional | TanStack Virtual only after profiling. |
