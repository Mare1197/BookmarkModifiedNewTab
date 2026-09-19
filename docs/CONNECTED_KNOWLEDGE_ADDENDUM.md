# Browser OS — Connected Knowledge, AI Chats, Memory, and AFFiNE

## Scope and evidence

This supplements the product handoff, which omitted this part of the intended direction. It does not prescribe a technology stack or visual design, and does not claim these integrations are implemented.

Recovered from the conversation **Canonical project updates and handoff prompts created**: continuous/incremental integration of multiple browsers, AI conversations/tools, project information, and automation information into one shared workspace. The conversation explicitly distinguishes this from mandatory cloud synchronization.

Recovered from **OS NEW TAB +features not added yet**: notes and mixed-media boards connected to optional Gemini analysis, NotebookLM source handoff, and GBrain long-term memory. GBrain was discussed as potentially more than a simple connector; the choice was left undecided.

On September 18, 2026, the user explicitly supplied and approved these roles: AFFiNE/BlockSuite for document/canvas capabilities, xTiles for tile/dashboard interactions, AppFlowy for structured database views, Anytype for the canonical typed-object model, and Logseq for backlinks/graph/journal navigation. These are capabilities inside New Tab OS, not five applications or content databases. GBrain remains a separately discussed memory candidate, not a mandatory backend.

The September 18 instructions supersede the earlier uncertainty about those five products. Other historical details below remain recovered scope rather than a claim of completed integration. See [current implementation boundaries](UNIFIED_BRAIN_STATUS.md).

## 1. One connected personal knowledge workspace

Bring browser resources, documents, notes, AI conversations, selected remembered knowledge, projects, and automation context into the same workspace.

These must be connected objects, not independent silos that merely link to unrelated apps. A conversation can reference a page, a note can come from a message, a task can come from a conversation decision, and a project can gather all of them.

The same information should be accessible through search, folders/collections, boards, Inspector, Graph, and relevant project views. Preserve source identities and links back to originals.

## 2. AFFiNE as part of the intended knowledge workflow

Include an explicit AFFiNE integration/evaluation requirement. Its intended role is to connect the document/note/board side of the knowledge workflow with the Browser OS's browser context, chats, and memory.

The builder must distinguish these possible meanings before choosing one:

- Exchange or link selected content with an existing AFFiNE workspace.
- Reuse suitable functionality from the project within the existing Browser OS.
- Use it as a product reference for connected documents and boards without directly integrating it.

The September 18 choice is to investigate reusable components first, retain the Brain as content authority, and adapt the UX where direct integration would introduce another source of truth. Installing AFFiNE, embedding its website, or copying its appearance alone does not fulfill the requirement.

Desired behavior, subject to the selected integration's supported capabilities:

- Associate relevant documents/boards with Browser OS projects, browser sources, and conversations.
- Open the original source from its workspace reference.
- Preserve notes, attachments, relationships, and provenance during any supported exchange.
- Make imported copies versus continuously linked content explicit.
- Explain which side owns edits, and resolve conflicting changes without silent overwrites.
- Keep local Browser OS content usable when AFFiNE is disconnected or unavailable.

## 3. AI conversations as first-class content

Represent supported conversations and their individual messages as durable, searchable workspace content, not just a bookmark pointing at a chat service.

Preserve available conversation identity/title, provider, message author/role, message ordering, timestamps, attachments, source links, and branch relationships. Missing metadata remains unknown.

Allow linking a whole chat or a selected message to a board, folder, project, page, note, task, or memory. Support returning from the derived item to the exact source message where available.

Users should be able to save selected answers as notes, extract candidate decisions/tasks, and continue research with explicitly selected context. These actions must not silently turn every assistant statement into a fact.

Separate importing an existing chat from starting a new conversation through a supported provider. Do not imply that every external provider permits reading or continuing all account conversations. Unsupported sources need an honest manual import/export fallback.

## 4. Persistent AI memory linked to its sources

Memory should preserve useful knowledge across chats and work sessions: decisions, project facts, user-approved preferences, summaries, unresolved questions, and relevant relationships.

Keep distinct:

- Original source content.
- A derived summary or candidate memory.
- A user-confirmed decision/fact.
- An AI inference that may be wrong.

Each memory needs its supporting source references, scope, creation/update time, and confirmation/supersession state. Conflicting memories must not silently overwrite one another.

Allow reviewing, editing, accepting, rejecting, forgetting, and exporting memory. Distinguish forgetting derived memory from deleting the original conversation or document. Explain any remaining copies outside the workspace.

Memory can be scoped to one conversation, project, or the user's broader workspace. Cross-project retrieval must be explicit and controllable rather than exposing unrelated private context by default.

For a new question, show or make inspectable the selected memories and source material used. Answers should point back to supporting sources and acknowledge missing or conflicting evidence.

GBrain remains a candidate for this role, not a required dependency or settled ownership model. Its unresolved integration choice must not erase the product requirement for connected, user-controlled memory.

## 5. Continuous source integration, not only one-time import

Support ongoing or incremental reconciliation of explicitly enabled sources:

- Multiple browser profiles/browsers, bookmarks, history, tabs, windows, and sessions.
- Supported AI conversations and tools.
- Project information and implementation context.
- Relevant automation definitions, state, and run history.

Show enabled scope, last successful update, pending changes, failures, and whether a source is live, periodically refreshed, or import-only. Allow pausing/disconnecting a source and choosing what retained local content to keep.

Repeated updates must not duplicate objects. Preserve source identity, local annotations, and edits. Source deletions require defined behavior; they must not automatically delete independently authored notes or confirmed memories.

Continuous integration supersedes a blanket claim that synchronization is outside scope. It does not authorize mandatory cloud storage, unrestricted scraping, ingestion of private chats, or automatic external AI analysis.

## 6. Projects, tasks, and automation context

Connect project knowledge to its browser sessions, documents, chats, decisions, tasks, and relevant automation history. Provide project/task-status and Kanban-style workflow capabilities as functional organization, without prescribing appearance.

Allow reviewing suggested tasks and organization changes derived from conversations. Execution remains a separate authorized action: knowing an automation's status does not give the workspace permission to run it, change it, or operate external accounts.

## 7. Open-source projects and candidate-list boundaries

The confirmed current list is **AFFiNE/BlockSuite, xTiles, AppFlowy, Anytype, and Logseq**, plus the earlier **GBrain** memory discussion. Do not describe all of these as permissively licensed open-source packages: evaluate each actual component and license independently. xTiles is an interaction reference, not the backend.

Earlier discussions also named reusable components including React Flow, React Complex Tree, MUI Tree View, Cytoscape.js, Sigma, Dexie, WXT, and Plasmo. These are historical implementation candidates, not the missing list of connected-chat/memory applications and not mandatory stack instructions.

Gemini and NotebookLM were discussed as integrations; do not label them open-source projects.

Recover the original list before claiming completeness. For every recovered project, record its proposed role and whether it was a reference, reuse candidate, optional connector, or approved integration. Verify current capability and licensing before adoption. Do not install every candidate or replace the existing app merely because a larger product exists.

## 8. End-to-end acceptance examples

1. Capture a page, discuss it in a supported chat, save an answer as a note, approve a decision as memory, and attach a task. All retain navigable source relationships.
2. Revisit the project in a later session and retrieve relevant approved memory with its supporting messages/documents; unrelated project content is excluded by default.
3. Update an enabled conversation/document source twice. Existing identities remain stable, only actual changes are reconciled, and local notes are preserved.
4. Correct or forget a memory. Future retrieval respects the change without pretending that the original provider conversation was also deleted.
5. Disconnect AFFiNE or a chat provider. Retained local content still works; unavailable live functionality is reported accurately.
6. Fail an integration update or encounter conflicting versions. The workspace stays usable and reports unresolved items without inventing success.
7. Request analysis of selected content. Only the disclosed selection is sent; enabling source integration alone does not enable external analysis.

This is a product-scope addendum, not completion evidence. The implementation status document distinguishes the local shared-Brain slice from full editor integration, provider synchronization and other remaining work.
