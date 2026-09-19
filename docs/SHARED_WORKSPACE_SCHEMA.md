# Shared Workspace Schema and Migration Contract

Date: 20 August 2026

This document is the pre-install review required by Slice 3. The shared model is introduced beside the legacy stores. It does not delete, move, or rewrite Chrome bookmarks, `localStorage.data`, legacy document data URLs, custom icon/background blobs, or the tab-session snapshot from Slice 1.

## Identity rules

- A page entity is keyed by a deterministic ID derived from its canonical URL.
- Bookmark, open-tab, history, board, and connector records point to the same page entity through source references.
- Data-URL documents and other non-web objects use their source kind and source ID for stable identity.
- Domain identity uses a normalized lowercase hostname.
- Board placement identity is independent of entity identity, so the same entity can appear more than once and on more than one board.
- Relationships have their own durable IDs and never belong to a renderer.

## Current database version

Database: `browserOsWorkspace`

Schema version 1 establishes the durable tables. Schema version 2 adds search and confirmation indexes plus an upgrade function. Schema version 3 adds Inbox state and durable workflow tables. Historical upgrader declarations remain immutable.

| Table | Primary/index contract | Ownership |
|---|---|---|
| `meta` | `key` | schema, migration, and snapshot metadata |
| `entities` | `id,type,canonicalUrl,domainId,inboxAt,updatedAt` plus multi-entry `searchTerms` | canonical pages, clips, notes, tasks, files, analysis, and other shared objects; Inbox is state, not a copy |
| `sourceRefs` | `id`, unique `sourceKey`, `entityId,sourceKind,sourceId` | native bookmark/tab/history/legacy provenance |
| `domains` | `id`, unique `host`, `updatedAt` | domain-level metadata |
| `folders` | `id,parentId,sourceKind,sourceId,updatedAt` | native projections and persistent workspace folders |
| `folderMemberships` | `id,folderId,entityId,sourceKind,position` and compound folder/entity index | hierarchy membership without entity duplication |
| `boards` | `id,name,createdAt,updatedAt` | board lifecycle |
| `placements` | `id,boardId,entityId,kind,updatedAt` and compound board/entity index | board-local position and size |
| `relationships` | `id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt` | renderer-independent edges |
| `tabSessions` | `id,tabId,entityId,openedAt,closedAt` | observed browser tab sessions |
| `assets` | `id,entityId,type,createdAt` | original blobs and metadata; blob values are not indexed |
| `settings` | `key` | workspace preferences |
| `tasks` | `id`, unique `entityId`, `status,dueAt,reminderAt,updatedAt` | task lifecycle and local reminder state |
| `activities` | `id,type,boardId,entityId,sessionId,createdAt` | bounded local activity history |
| `savedFilters` | `id`, unique `name`, `query,updatedAt` | user and built-in smart searches |
| `workspaceSessions` | `id,boardId,createdAt,updatedAt` | named restorable browser-window tab sets |
| `boardTemplates` | `id`, unique `name`, `layout,updatedAt` | reusable local board structures |

## Canonical URL contract

- Accept only HTTP(S) page URLs for canonical page identity.
- Lowercase protocol and hostname, remove fragments/default ports, collapse duplicate path separators, and remove a trailing slash outside the origin root.
- Remove known tracking parameters such as `utm_*`, `fbclid`, and `gclid` while preserving and sorting functional query parameters.
- Never guess a page URL for browser-internal/data URLs.

## Legacy migration contract

The migration runs as a report first. The fixture is `tests/fixtures/extension-profile.json` and covers:

- nested Chrome bookmarks and native source IDs;
- one data-URL rich document;
- two browser windows and observable tab provenance;
- browser history and per-URL visits;
- the legacy layout snapshot and malformed-record reporting path.

When explicitly applied, migration performs copy/projection only:

1. Traverse the current Chrome bookmark tree.
2. Upsert canonical page/document entities and native bookmark source references.
3. Upsert domain records and native folder projections/memberships.
4. Copy the current legacy layout into `meta.legacyLayoutSnapshot`; do not convert it into a board.
5. Record schema version, timestamp, counts, and per-record errors.
6. Leave every legacy source untouched and keep legacy rendering/writes authoritative until parity is proven.

Interrupted Dexie upgrade transactions roll back atomically. Application-level projection can be rerun because entity and source-reference IDs are deterministic and writes use `put`/upsert semantics.

## Rollback and recovery

- The old UI continues reading its original stores.
- A failed workspace open or migration sets a neutral unavailable state and does not block the desktop.
- The workspace database can be exported independently with its schema version.
- No destructive migration is authorized in this slice.
