# Unified Brain implementation plan

## Goal and approved design

Implement the user's September 18 specification incrementally in the existing New Tab OS. The supplied architecture is the approved design: one entity/relation store, interchangeable views, explicit approval of inferred relationships, no replacement application.

## Architecture and global constraints

Extend `WorkspaceEntity` and `RelationshipRecord` in the existing Dexie database. Keep current URL identities, bookmark source references, native bookmark hierarchy, task records and board placements intact. Project membership is a relationship, not a copied collection. Imported conversations and messages are canonical objects. Memory records link to evidence. Presentation data belongs to placements/settings only. No background scraping or provider transmission is enabled by this work.

Tech stack: existing React, Dexie, TypeScript, React Flow and Node/Playwright tests; no new application framework. Existing feature branch contains substantial uncommitted work needed by this feature, so preserve that checkout instead of creating a worktree that omits it. Do not stage/publish unrelated work.

## Reuse investigation (2026-09-18)

- [BlockSuite](https://github.com/toeverything/blocksuite) offers page/edgeless editors and custom blocks (MPL-2.0). Its [store](https://blocksuite.io/guide/store) owns Yjs documents and block trees. Directly copying Brain text into standard blocks would establish another content authority. Retain mature React Flow for the current object canvas. Future BlockSuite integration must use reference blocks resolving canonical IDs and store only document structure/presentation separately. Full rich-text/mixed-document editing is not delivered by retaining the canvas.
- [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) uses Flutter/Rust and [AGPL-3.0](https://github.com/AppFlowy-IO/AppFlowy/blob/main/LICENSE), not drop-in React database components. Adapt the same-dataset table/Kanban concepts using the existing entity store.
- [Anytype](https://github.com/anyproto/anytype-ts) exposes an Electron client, gRPC middleware and the Any Source Available License. Use typed-object concepts; do not import its storage or client.
- [Logseq](https://github.com/logseq/logseq) uses its own knowledge model and AGPL-3.0 code. Derive backlinks and graph edges from our relationships, preserving provenance and confirmation.
- [xTiles](https://xtiles.app/en/) is an interaction reference, not an open-source backend dependency. Implement local mixed-object tiles with presentation-only settings.

## Execution checklist

- [x] Add behavior tests for typed objects, atomic/idempotent chat import, membership, sourced memory, suggestion review, view queries and reference-only layout.
- [x] Extend `src/workspace/types.ts`; implement `src/react/workspace/brainRepository.ts` over the existing database. No new content store.
- [x] Implement shared relationship selectors and confirmed-only global graph behavior.
- [x] Add `BrainWorkspace.tsx`: Table/Kanban/Tiles/Timeline with common filters, status edits, project selection, capture and local conversation import.
- [x] Connect shared Inspector actions: canvas, graph, backlinks, project membership, manual links, evidence-based memory. Add reviewable inbox suggestions with their actual generator clearly labeled.
- [x] Preserve export/import round trips and existing data migrations; validate new records.
- [x] Run baseline/regression/unit checks and production build (43 tests pass).
- [ ] Rendered interaction validation: in-app browser unavailable; isolated Chromium fallback permission requested.
- [x] Update handoff documents with delivered versus remaining scope.

## Acceptance tests and remaining product scope

Import the same chat twice without duplicate conversations/messages; add it to a project and canvas without new content objects; edit the title once and see it in every view; reopen persisted state; reject an inferred membership and verify no project membership is created; accept it and verify it is shared; create a memory with resolvable evidence; graph shows objects even without canvas placement.

This incremental slice does not claim full AFFiNE embedding, native provider chat synchronization, a model-powered classification service, merge conflict UI, rich text, collaboration, or all source-specific connectors. Those remain explicit follow-up work, not fake integrations or silently enabled data access.
