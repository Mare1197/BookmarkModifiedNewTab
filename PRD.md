# Product Requirements Document (PRD): New Tab Brain

## 1) Overview

A personal Chrome extension that overrides the new tab page to serve as a “web-app brain” — a unified manager for bookmarks, tab sessions, collections (folders), tags, links between items, and visual exploration via mind-map/graph view. It integrates with Chrome history for richer bookmark context, provides smart organization, manual + auto-suggested linking, search/filtering, import/export with smart merging, and a clean desktop-style bookmark manager UI.

The product combines the familiarity of Chrome’s bookmark manager (folders, favicons, domain grouping) with advanced knowledge-graph features (relationships, mind-map, auto-suggestions) for personal knowledge management, long-term learning, and tab/session organization.

## 2) Goals

- Fast saving of current tab as bookmark or entire window as session
- Smart, multi-faceted organization via collections (folders), tags, metadata
- Manual and auto-suggested linking of related items (bookmarks, sessions) with typed relationships
- Visual exploration via toggleable mind-map with list view fallback
- Rich bookmark context from Chrome history and domain grouping
- Robust data management: search, filters, multi-delete, edit, import/export with merge
- Performance for moderate-to-large datasets (hundreds of items) via graph optimizations
- Polished, desktop-app feel with favicons, tag clouds, intuitive sidebar

## 3) Non-goals

- Enterprise features (orgs, teams, SSO, sharing, audit logs)
- Heavy collaboration or social features
- Full-scale AI recommendation engine (auto-linking is lightweight and local)
- Real-time external embeddings or cloud sync (keep fully local via chrome.storage)
- Nested collections/folders (flat only)
- Bulk editing beyond multi-delete
- Mobile support (Chrome extension only)

## 4) Target User & Use Cases

Primary: Knowledge workers, researchers, students, power users managing many tabs, bookmarks, and long-term learning projects.

Key use cases:

- Quickly save current tab or window session for later resumption
- Organize saved content into collections (like folders) and free-form tags
- Connect related items (e.g., “prerequisite”, “related”, “same topic”) manually or via auto-suggestions
- Explore connections visually in mind-map view (with hierarchical layout for dependencies)
- Search and filter by title, notes, tags, type, collection
- Review bookmark history (last opened, visit count) and see other bookmarks from same domain
- Bulk delete items, edit titles/notes/tags/collections
- Export data for backup, import with smart merge to combine datasets
- Use tag cloud for quick navigation to common topics

## 5) Functional Requirements

### 5.1 Collections (Folders)

- Create, rename (via delete+recreate), delete collections
- Items can belong to multiple collections
- Sidebar lists collections; clicking filters main list to that collection
- Add/remove items from collections in details panel

### 5.2 Tags

- Free-form lowercase tags, multi per item
- Add/remove in details panel
- Tag cloud in sidebar (size by frequency, clickable to filter)
- Tags included in full-text search and exact-tag filter

### 5.3 Bookmark & Session Management

- Save current tab as bookmark (title, URL, favicon)
- Save current window as session (list of URLs + titles)
- Restore session (open all tabs)
- Edit title/notes for any item
- Delete single or multi-select items
- For bookmarks: show favicon, open link button

### 5.4 History Integration (Bookmarks only)

- Show last opened date/time and visit count from Chrome history
- List other saved bookmarks from the same domain (clickable to view details)

### 5.5 Linking & Relationships

- Manual linking with types: “related”, “prerequisite”, “same topic”
- Links are directed edges
- View/remove links in details panel
- Auto-suggestions based on cosine similarity of title + notes + tags (bag-of-words, local)
  - Bonus score for same domain
  - One-click “Add as related”
  - Ignore already-linked items

### 5.6 Views

- List view (default): clean desktop-style list with favicons/folder icons, hover effects
- Mind-map view (toggle):
  - Nodes: items (ellipse for bookmarks, box for sessions)
  - Edges: labeled with link type, directed arrows
  - Interactions: pan/zoom/drag, click node → details, double-click → open/restore, focus on click with animation
  - Two layouts: force-directed (physics, stabilizes then freezes) or hierarchical (great for prerequisites)
  - Navigation buttons enabled

### 5.7 Search & Filtering

- Full-text search on title, notes, tags
- Filters (combineable):
  - Type (All / Bookmarks / Sessions)
  - Collection dropdown
  - Exact tag input
- Multi-select mode with checkboxes and bulk delete

### 5.8 Import / Export

- Export: download pretty-printed JSON of all data
- Import: file upload with smart merge
  - Collections merged by name (reuse existing)
  - Bookmarks with same URL merged (union tags/collections, append notes, update title)
  - Sessions always added new
  - Links added only if both endpoints exist after mapping

### 5.9 UI/UX Requirements

- Desktop bookmark-manager aesthetic: clean cards, shadows, system fonts, favicons
- Sidebar: Collections list, Tag cloud, Details panel
- Header: search, main actions, filters, view toggles
- Details panel: comprehensive edit view for selected item
- Responsive layout for various window sizes

## 6) Data Model

```json
{
  "items": [
    {
      "id": "string",
      "type": "bookmark" | "session",
      "title": "string",
      "url": "string (bookmark only)",
      "urls": [{ "title": "string", "url": "string" }] (session only),
      "createdAt": "number",
      "notes": "string",
      "tags": ["string"],
      "collections": ["string"]
    }
  ],
  "collections": [
    {
      "id": "string",
      "name": "string",
      "createdAt": "number"
    }
  ],
  "links": [
    {
      "fromId": "string",
      "toId": "string",
      "type": "related" | "prerequisite" | "same topic",
      "createdAt": "number"
    }
  ]
}
```

Stored in `chrome.storage.local`.

## 7) Technical Constraints & Risks

- Chrome extension manifest v3
- Permissions: storage, tabs, history
- Local-only, no server
- Performance: vis-network for graph (optimize physics, hierarchical mode)
- Risk: large graphs → use stabilization freeze, hierarchical for structured data
- Risk: merge conflicts on import → current strategy favors union/latest

## 8) Milestones (Completed Implementation Order)

M1: Core save (bookmark/session) + collections + basic list

M2: Tags + details editing + delete

M3: Linking (manual) + search/filters

M4: Mind-map toggle + basic interactions

M5: Auto-suggestions + hierarchical layout + export

M6: History integration + same-domain + desktop UI polish

M7: Tag cloud + multi-delete + merge-on-import + advanced cosine auto-linking
