# Browser OS New Tab

A local-first Chrome/Chromium Manifest V3 new-tab desktop built on Super Bookmark Desktop.

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
- User-facing browser metadata timestamps in `DD/MM/YYYY HH:mm` format.

The extension does not calculate accumulated total-open time and does not require an AI provider.

## Development

```powershell
npm install
npm test
npm run build
```

Load the generated `dist/` folder from `chrome://extensions` with Developer mode enabled.

## Permissions

- `bookmarks`: render and manage the user's native bookmark hierarchy.
- `favicon`: show browser-provided favicons.
- `storage`: persist settings, optional sync data, and observed tab-session metadata.
- `tabs`: list/focus/close current tabs and read the title, URL, and favicon shown in the Open Tabs window.
- `history`: show user-requested local history and derive domain first/last visit metadata.

No host permissions, `scripting`, `downloads`, or `activeTab` permission are requested in the current slice.

## Project documents

- [`docs/MASTER_PROJECT_SPEC.md`](docs/MASTER_PROJECT_SPEC.md)
- [`docs/CURRENT_STATE_AUDIT.md`](docs/CURRENT_STATE_AUDIT.md)
- [`docs/ARCHITECTURE_ALIGNMENT.md`](docs/ARCHITECTURE_ALIGNMENT.md)
- [`docs/OPEN_SOURCE_EVALUATION.md`](docs/OPEN_SOURCE_EVALUATION.md)
- [`docs/UPDATED_IMPLEMENTATION_PLAN.md`](docs/UPDATED_IMPLEMENTATION_PLAN.md)
