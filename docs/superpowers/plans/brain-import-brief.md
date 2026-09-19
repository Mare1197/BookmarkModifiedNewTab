# Provider imports task brief

Implement local provider export imports for existing Browser OS. Work in the existing checkout. Do not commit, install dependencies, modify package files or spawn subagents. Do not overwrite unrelated changes.

Own only new `src/react/workspace/chatExportAdapters.ts`, `chatImportService.ts`, `ConversationImportPanel.tsx`, `tests/chat*.test.js`, and narrowly named test helper files. Root integrates component into BrainWorkspace and owns brainRepository/types.

Export `parseChatExport(input: unknown): PreparedConversation[]` and exported PreparedConversation interface. Support ChatGPT export array with conversation `mapping` nodes, Claude export array with `chat_messages`, and current normalized schema. Preserve stable source and message IDs, branch parent IDs, provider timestamps converted to epoch ms, and attachment metadata references (never download). Return clear warnings for unsupported or malformed content; reject unsafe URL schemes, missing IDs, duplicate IDs, malformed roots. Do not silently invent original timestamps.

PreparedConversation shape: `{provider:string,sourceId:string,title:string,url?:string,createdAt?:number,updatedAt?:number,messages:Array<{id:string,role:string,text:string,createdAt?:number,updatedAt?:number,parentId?:string,attachments?:Array<{id:string,name:string,mimeType?:string,url?:string}>}>,warnings?:string[]}`.

Root will expand `importConversation(input, options?:{conflictPolicy:'preserve-local'|'take-source'})` in brainRepository to accept that shape. Canonical IDs remain `['conversation',provider.toLowerCase(),sourceId].map(encodeURIComponent).join(':')` and similarly `message:provider:sourceId:messageId`.

Build preview service using existing workspaceClient to show new/updated/unchanged counts and local-edit conflicts for conversation/message objects. Preview must not mutate. Apply requires explicit UI click and chooses preserve-local by default or explicit take-source. Reimports never duplicate IDs. Do not remove missing messages or independently authored content.

Build `ConversationImportPanel({onImported:()=>Promise<void>,onStatus:(message:string)=>void})` with file input and pasted JSON, preview summary, warnings, conflict policy, and explicit import button. Preserve accessibility labels and no unsafe HTML rendering. Catch/report import errors and prevent double submission. No provider account access or network calls.

Use test-first real behavior tests for source parsing, malformed data, timestamps, branches, attachment references, source deduplication, preview/conflicts. Research primary source evidence where needed (provider formats may be undocumented: label fixture-supported rather than universal). Run focused tests/typecheck, self-review, write full report including RED/GREEN evidence to `docs/superpowers/plans/brain-import-report.md`. Return concise status and concerns. No reviewers/subagents; root handles review.
