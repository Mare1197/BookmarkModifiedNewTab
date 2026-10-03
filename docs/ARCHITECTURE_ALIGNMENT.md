# Browser OS New Tab — Architecture Alignment

## Finding

The repository does not currently have one shared workspace object model. It has a useful bookmark-centric application whose implicit data model is split among Chrome bookmarks, DOM datasets, `localStorage`, IndexedDB blobs, and optional Chrome sync.

The alignment strategy is a strangler migration: put typed browser and persistence adapters around the current behavior, introduce stable workspace identities alongside native bookmark IDs, move one feature family at a time, and keep the legacy desktop operational until migrated views pass parity tests.

## Current authority map

| Concern | Current authority | Notes |
|---|---|---|
| Bookmark/folder identity and hierarchy | Chrome bookmarks | Native IDs are stable source references but cannot identify every workspace type. |
| Rich document identity/content | Chrome bookmark ID + special `data:` URL | Conflates note data with a browser bookmark URL. |
| Desktop layout | `localStorage.data.icons` and `locations` | Bookmark-ID keyed; one desktop only. |
| Backgrounds/settings | `localStorage.data` plus many independent keys | No schema or atomic migration. |
| Custom icon/background blobs | `idb-keyval` store | Keys reuse bookmark IDs or `b<backgroundId>`. |
| Open internal windows | `localStorage.openedWindows` | Optional; folder/document only. |
| Widgets | `localStorage.widgets` | Separate window-state format. |
| Bookmark click recency | `localStorage.bookmarkHistory` | Extension interaction history, not Chrome browsing history. |
| Optional sync | Chunked `chrome.storage.sync` payload | Legacy subset; should remain opt-in. |
| Selection/focus | DOM classes and active-window classes | Transient and view-local. |

## Current consistency issues

- There is no canonical page entity, so the same URL can exist as multiple bookmarks with no shared page metadata.
- There is no domain entity or domain index.
- Documents are browser bookmarks rather than workspace notes.
- Desktop positions and bookmark identity are coupled.
- `window.app` modules call Chrome APIs directly, preventing deterministic model tests.
- Relationships do not exist; future renderer edges would become shadow data unless the model is created first.
- Window, widget, background, selection, and search state use unrelated persistence paths.
- Backup/sync formats are not explicitly schema-versioned.

## Target logical layers

### 1. Global entities

One record per logical workspace object:

```ts
type EntityKind =
  | 'page'
  | 'bookmark'
  | 'browser-tab'
  | 'browser-window'
  | 'folder'
  | 'note'
  | 'image'
  | 'screenshot'
  | 'file'
  | 'board'
  | 'group'
  | 'analysis'
  | 'browser-resource'

interface Entity {
  id: string
  kind: EntityKind
  title: string
  createdAt: number
  updatedAt: number
  archivedAt?: number
  sourceRefs: SourceRef[]
}
```

`page` owns canonical URL/title/domain references. A bookmark or current tab points to the page rather than copying page intelligence into each view.

### 2. Source references

```ts
interface SourceRef {
  source: 'chrome-bookmark' | 'chrome-tab' | 'chrome-history' | 'local-user' | 'import'
  externalId: string
  observedAt: number
}
```

Native bookmark IDs remain authoritative for bookmark CRUD. Browser tab IDs are session-scoped and must never be treated as permanent page IDs.

### 3. Domain records

```ts
interface DomainRecord {
  host: string
  firstOpenedAt?: number
  lastOpenedAt?: number
  updatedAt: number
  source: 'history' | 'history+tabs' | 'unknown'
}
```

The domain key is a normalized hostname. Values must be derived from accessible history/current-tab observations and may be absent.

### 4. Board-specific layout

```ts
interface BoardPlacement {
  id: string
  boardId: string
  entityId: string
  x: number
  y: number
  width?: number
  height?: number
  zIndex: number
  groupId?: string
  collapsed?: boolean
  appearance?: Record<string, unknown>
}
```

One entity may have several placements on one or more boards. Moving a placement changes only that board record.

### 5. Persistent hierarchy

```ts
interface FolderMembership {
  id: string
  folderId: string
  entityId: string
  order: number
}
```

For Chrome bookmark folders, the native tree remains the source and is projected into the workspace. For workspace-only mixed folders, membership lives locally. Do not silently move a Chrome bookmark when moving only a board placement.

### 6. Shared relationships

```ts
type RelationshipType =
  | 'parent'
  | 'child'
  | 'related'
  | 'reference'
  | 'opened-from'
  | 'search-result'
  | 'same-project'
  | 'manual'

interface Relationship {
  id: string
  sourceEntityId: string
  targetEntityId: string
  type: RelationshipType
  label?: string
  origin: 'user' | 'browser-observed' | 'ai-suggested'
  confirmed: boolean
  evidence?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}
```

Canvas, Mind Map, and Graph render these records. Renderer-specific edge arrays are derived state only.

### 7. Browser-derived metadata

```ts
interface TabSession {
  tabId: number
  windowId: number
  pageEntityId?: string
  openedAt: number
  openedAtSource: 'created-event' | 'first-observed'
  openerTabId?: number
  openedFromPageId?: string
  openedBySearch?: boolean
  searchEngine?: string
  searchQuery?: string
  provenanceState: 'known' | 'unknown' | 'not-available'
}
```

Rules:

- `Opened` is the tab creation event time when observed; otherwise it is first-observed time and must be labeled accordingly.
- `Opened From` is stored only from an observable opener/referring visit.
- `Opened by Search` remains `Unknown` unless a known search URL/referrer is directly observed.
- Never convert missing evidence into a guessed relationship.
- Never calculate accumulated total open time.

### 8. AI-derived metadata

AI output is an entity or annotation with provider/model/action/evidence metadata. It never overwrites source content silently, is created only by an explicit action, and is excluded entirely when no connector is configured.

### 9. View/UI state

```ts
interface WorkspaceUiState {
  activeView: 'desktop' | 'explorer' | 'canvas' | 'mind-map' | 'graph'
  selectedEntityIds: string[]
  focusedEntityId?: string
  activeBoardId?: string
  inspectorOpen: boolean
  inspectorSection?: string
  filters: Record<string, unknown>
}
```

Persist stable preferences; keep transient drag/hover state in memory. Window geometry should use a versioned session record independent of entity data.

## Persistence boundaries

Recommended future Dexie tables:

| Table | Key/index intent |
|---|---|
| `entities` | `id`, `kind`, `updatedAt` |
| `sourceRefs` | `id`, `[source+externalId]`, `entityId` |
| `pages` | `entityId`, unique canonical URL, `domainHost` |
| `domains` | unique `host`, `firstOpenedAt`, `lastOpenedAt` |
| `folderMemberships` | `id`, `folderId`, `entityId`, `[folderId+order]` |
| `boards` | `id`, `name`, `updatedAt` |
| `placements` | `id`, `boardId`, `entityId`, `[boardId+zIndex]` |
| `relationships` | `id`, `sourceEntityId`, `targetEntityId`, `type`, `origin` |
| `tabSessions` | `tabId`, `windowId`, `pageEntityId`, `openedAt` |
| `assets` | `id`, `entityId`, blob metadata |
| `settings` | `key`, scope |
| `migrations` | version and completion evidence |

Legacy `idb-keyval` blobs may remain readable during migration. Do not write structured workspace records into the same unversioned key space.

## Browser API adapter boundary

Create adapters before the typed UI migration:

- `BookmarksAdapter`
- `TabsAdapter`
- `WindowsAdapter`
- `HistoryAdapter`
- `StorageAdapter`
- later `CaptureAdapter`

Each adapter must:

- return normalized plain records;
- expose explicit unavailable/permission-denied outcomes;
- keep Chrome callback/promise differences out of views;
- be mockable for tests;
- avoid side effects during reads;
- document its permission requirement.

The first implementation slice provides the runtime behavior in legacy-compatible JavaScript. The later WXT/TypeScript slice should preserve the interface rather than redesigning behavior again.

## Smallest safe migration path

1. **Compatibility baseline** — capture legacy bookmark tree, `localStorage`, and blob fixtures; add smoke tests for folder/document/window behavior.
2. **Browser adapters and tab lifecycle** — add service-worker tracking and resource windows without moving existing data.
3. **Versioned workspace database** — add Dexie beside legacy stores; introduce stable IDs and source refs.
4. **Read-through projections** — views read entities from the workspace model while bookmark writes still go through Chrome.
5. **Legacy document import** — parse Pell bookmark documents into note entities, retain source bookmark until verified.
6. **Board model** — add boards, placements, assets, and relationships with independent identity/layout.
7. **Typed shell** — move entrypoints to WXT/React/TypeScript one subsystem at a time.
8. **Retirement** — remove legacy paths only after migration reports, backup/restore tests, and browser parity evidence.

## Invariants

- Existing Chrome bookmarks remain user-owned and are never deleted during migration without an explicit user action.
- Core features work offline and without AI credentials.
- Browser sync remains optional; no automatic cloud sync is introduced.
- Board movement never changes a global entity or native bookmark hierarchy.
- Relationship records are renderer-independent.
- Unknown provenance stays unknown.
- Timestamps shown for required metadata use `DD/MM/YYYY HH:mm` in local time.
- No accumulated total-open-time tracking.
- GBrain remains `DECISION DEFERRED`.

## First-slice alignment

The Browser Resources + Shared Inspector slice intentionally does not introduce Dexie or React. It establishes the observable behavior and adapter-shaped records with minimal risk:

- background service worker records tab creation/first-observed metadata in `chrome.storage.local`;
- new resource launchers open current tabs, history, bookmarks, search, and settings inside the existing window manager;
- the resource views render normalized records rather than raw Chrome objects;
- a shared collapsible inspector displays details, tab/session, domain, and actions;
- provenance fields use `Unknown` or `Not available` when evidence is absent;
- history/domain queries are bounded and user-initiated.

These interfaces become migration seams for the future typed model.
