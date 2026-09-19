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
- Typed WXT/React new-tab shell with the verified legacy desktop available by default.
- Durable Dexie workspace identity shared by boards, Canvas, Explorer, Inspector, Mind Map, Graph, Search, and Assets.
- Multiple persistent boards with notes, recent web tabs, images, workspace screenshots, relationships, Trash recovery, and versioned export/import.
- Universal Quick Add and command palette with explicit multi-destination capture to boards, folders, Inbox, and relationships.
- Quick Inbox triage, smart query syntax with saved filters, restorable window sessions, task focus mode, local reminders, and an activity timeline.
- Local page-text clips with review-before-save, built-in board templates, and non-destructive board auto-layout.
- Optional Gemini analysis that is disabled until configured and explicitly invoked.
- User-facing browser metadata timestamps in `DD/MM/YYYY HH:mm` format.

The extension does not calculate accumulated total-open time and does not require an AI provider.

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

## Known limitations

- Workspace moves have one persistent undo slot; sibling manual ordering and native
  bookmark drag/drop within this new section are not implemented.
- Inspector history is the recent recorded workspace activity window, not a complete
  browser-history reconstruction. Unobserved provenance is shown as Unknown.
- Full Tab / Session, Domain and AI inspector parity, rich/file/frame Canvas breadth,
  large-graph profiling and credentialed provider acceptance remain separate work.

## Development

```powershell
npm install
npm test
npm run build
npm run test:smoke
```

Load the generated `dist/` folder from `chrome://extensions` with Developer mode enabled.

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

- [Shared workspace schema](docs/SHARED_WORKSPACE_SCHEMA.md)
- [GBrain integration decision](docs/GBRAIN_INTEGRATION_DECISION.md)
- [`docs/MASTER_PROJECT_SPEC.md`](docs/MASTER_PROJECT_SPEC.md)
- [`docs/CURRENT_STATE_AUDIT.md`](docs/CURRENT_STATE_AUDIT.md)
- [`docs/ARCHITECTURE_ALIGNMENT.md`](docs/ARCHITECTURE_ALIGNMENT.md)
- [`docs/OPEN_SOURCE_EVALUATION.md`](docs/OPEN_SOURCE_EVALUATION.md)
- [`docs/UPDATED_IMPLEMENTATION_PLAN.md`](docs/UPDATED_IMPLEMENTATION_PLAN.md)
