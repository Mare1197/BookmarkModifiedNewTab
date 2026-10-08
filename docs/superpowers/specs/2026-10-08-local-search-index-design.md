# Local search index and background processing

Date: 8 October 2026. Status: direction and written spec approved by the user's subsequent instruction to implement; implementation-plan review remains pending. Not implemented.
Reference application: `c552110`; published reporting checkpoint: `cb36b51` on `feature/large-library-performance`.

## Intent and scope

Implement the approved next upgrade: faster local search through a rebuildable index, incremental updates, background work, progress/cancellation/restart recovery, safe fallback and preserved privacy. The user also approved large BlockSuite board optimization, specified separately in [the following stage](2026-10-08-native-board-performance-design.md).

The purpose is to find existing browser captures, chats, notes, tasks and memory promptly in a large personal library without changing what a query means. The New Tab OS and its Brain remain authoritative. No account, provider request, remote index, UI rebuild or new content database is introduced.

Current evidence: the 50k substring benchmark takes 5.5–6.1 seconds. Existing collection pages hydrate 50 matches, but broad matching still scans canonical bodies. Explorer, Brain and Smart Search intentionally have different predicates. Both the React `workspaceClient.ts` and legacy `workspaceDb.js` write the same database; both already have schema version 5 and a `searchTerms` index. Those terms are not an arbitrary-substring index and have inconsistent coverage across creation/import/edit paths. Do not repurpose them: AI-context relevance also uses them.

## Chosen approach and reuse decision

Use a persistent, bounded character-trigram candidate index behind a replaceable adapter, followed by the existing exact predicates. Run derivation and candidate search in a locally bundled dedicated worker. Reuse Dexie/IndexedDB storage and the existing query, ordering, observation and cancellation contracts.

Alternatives considered:

- Worker-only scanning improves responsiveness but retains the measured scan work. Keep it as fallback, not the primary optimization.
- A full in-memory index adds cold-start rebuild and heap costs. Do not make it the authoritative fast path.
- FlexSearch offers persistent IndexedDB indexes and workers, but its normal tokenization/encoding and relevance ranking do not directly preserve our three substring dialects. Full partial tokenization has quadratic term-length expansion. MiniSearch's ordinary exact/prefix/fuzzy token matches are not equivalent either. A bounded trigram candidate adapter avoids silently changing results or adopting a full application backend.

The new adapter must remain swappable. Future library adoption must prove identical candidate completeness, bounded storage and MV3 worker compatibility, not just faster vendor benchmarks. No new package is required by this design.

Sources: [FlexSearch tokenization](https://github.com/nextapps-de/flexsearch#tokenizer-partial-match), [persistent indexes](https://github.com/nextapps-de/flexsearch/blob/master/doc/persistent.md), [workers](https://github.com/nextapps-de/flexsearch/blob/master/doc/worker.md), [MiniSearch use case](https://github.com/lucaong/minisearch#use-case).

## Invariants

1. Canonical objects, content, timestamps, source IDs, placements, links and memory policy are unchanged by indexing.
2. Indexed candidates may include false positives, never false negatives. Verify with the existing predicate before returning a result.
3. Stale, incomplete, interrupted, corrupt, incompatible or unavailable indexes never masquerade as complete results.
4. Preserve current order, Unicode ID tie-breakers, page size, cursor rebuilding, filter syntax, relative-date anchoring and scope restrictions. Do not introduce relevance ranking by default.
5. Edits/imports/deletes/restores/legacy captures invalidate the index atomically with canonical writes. Updated timestamps alone are not a reliable change feed.
6. All derived state is disposable and rebuildable. Deleting/rebuilding it cannot delete canonical objects or recovery records.
7. Recovery drafts/history, provider credentials and asset bytes are never read by the search index or sent to its worker.

## Storage and writer coverage

Add mirrored schema version 6 in both database constructors. Add explicitly derived stores:

- `searchState`: singleton index-format/locale fingerprint, canonical mutation generation, active build epoch, rebuild state, progress and owner lease/fence.
- `searchChanges`: deduplicated entity ID invalidations with mutation generation, plus reset invalidations for range deletion/replacement.
- `searchDocuments`: entity ID, indexed generation/fingerprint, bounded per-dialect gram arrays and overflow flags. No complete body, credentials or source payload.
- Candidate indexes over each dialect's gram arrays, plus overflow IDs. Store canonical ID references only.

Use one shared, legacy-compatible Dexie DBCore invalidation module installed by both writers. It intercepts entity mutations and extends their underlying read/write transaction scope to include `searchState` and `searchChanges`. Mark invalidation within the same transaction, including bulk mutations, deletes and range deletion. Partial bulk failures must not leave successful changes untracked; invalidating extra requested IDs is safe. An aborted canonical transaction also aborts invalidation. Never use a post-commit message as the only durable change signal.

Migration initializes an incomplete build state without deriving every body in the schema-upgrade transaction. Upgrades must preserve canonical/recovery data. Old open connections close on version change via the existing reload-required path. Database upgrade hooks and raw IndexedDB are outside DBCore interception: migrations explicitly invalidate; the owned raw performance seeder must explicitly reset derived state after seeding. Raw uninstrumented third-party writes are unsupported, not a promised sync source.

Dexie supports transaction and table-mutation middleware; upgrade/open handling bypasses it. See [DBCore](https://dexie.org/docs/DBCore/DBCore), [middleware registration](https://dexie.org/docs/Dexie/Dexie.use()). Implementation must test the installed version's transaction forwarding and partial-failure behavior before UI integration.

Index records do not enter ordinary or private-recovery exports, imports, AI context or migration counts. Update legacy export's `db.tables` enumeration to an explicit supported-data allowlist where required, preserving its existing recovery exclusion policy. Imports ignore/reject supplied derived search records rather than treating them as canonical data. Index reset after replacement/merge is covered by invalidation, not guessed counts.

## Candidate derivation and exact semantics

Mirror the actual searchable haystacks, using the same locale-lowercasing semantics without accent removal, stemming, fuzzy expansion or Unicode normalization changes:

- Explorer: title, type and canonical URL are separate substring fields; field boundaries cannot create new matches.
- Brain: title, URL, body and tags joined exactly as the existing selector; whitespace-separated query terms retain their AND semantics.
- Smart Search: title, URL, existing `searchTerms` and body joined as the current predicate; quoted phrases and unknown `key:value` tokens remain literal according to its parser. Structural filters stay canonical reads.

Use UTF-16 code-unit trigrams, consistent with JavaScript substring matching. Store the locale/index-format fingerprint and rebuild when it changes. For each entity/dialect, inspect at most 65,536 normalized code units and retain at most 4,096 distinct grams. If either limit is exceeded, mark the entire entity/dialect as overflow: always include it for exact canonical verification. Never interpret truncation as absence of a match.

For a positive text term of at least three code units, use its grams to narrow candidates; choose selective intersections without materializing an unbounded list of bodies. Multiple terms intersect candidate scopes. One/two-unit terms, unsupported query forms and very broad postings fall back to bounded scanning when candidate work is not cheaper. Empty/filter-only queries keep their existing indexed paths.

Apply board/project/type/related/Inbox/status restrictions and exact predicates from canonical data, not stale duplicated filter state. Keep 50-result pages and bounded scan batches. Title/custom order may still require compact scope-sized order metadata; do not claim O(1) memory or uniformly sub-second queries.

## Freshness and concurrency

The index has states `unbuilt`, `building`, `ready`, `paused`, `error`. Ready means a complete build plus drained invalidations at a proven canonical generation, not merely matching object counts.

The query adapter uses one of two correctness paths:

- A ready index with no pending reset/changes: read candidate keys, canonical verification data and generation under consistent database reads. If freshness changes during the request, discard the indexed response and retry/fall back; do not publish an old generation into the current scope.
- Any incomplete/stale state: use the existing exact scanner in the worker, retaining pagination/cancellation. Do not scan only indexed candidates while excluding recently edited objects.

The worker reads current canonical objects when consuming invalidations. Its commit compares the captured change generation; a newer edit keeps its invalidation pending. Deleted IDs remove derived records. A rebuild uses keyset batches; mutations before/after its current key are replayed through the durable queue. Completion and generation publication are atomic after coverage and reset checks. No timestamp-equality shortcut.

Only one build owner runs per database. Claim an expiring IndexedDB lease with a monotonically increasing fence; stale owners cannot publish. Queries from other tabs may read ready records or scan safely. A terminated worker leaves persisted incomplete state; a new owner resumes/restarts safely. Do not rely on an immortal MV3 service-worker global.

## Worker, scheduling and UI

Bundle a same-extension-origin module worker without remote scripts, blob worker URLs or broader CSP permissions. Extract worker-safe schema/query/predicate leaves where necessary; do not import React UI or initialize the legacy desktop in the worker.

Protocol: typed request ID, scope/query key, generation/epoch and commands `query`, `cancel`, `ensureIndex`, `pause`, `resume`, `rebuild`, `status`, `dispose`. Responses distinguish progress, result, cancellation and error. Queries return canonical result pages, not the whole library. No arbitrary database/table access command is exposed.

Read at most 50 objects per derivation batch, bound retained gram work per object, yield between batches and check cancellation before the next batch/commit. Query requests take priority over rebuild work; cap concurrent derivation to one owner. Cancellation stops future work, not an already committed batch. Rebuild touches only the explicitly named derived stores and validates that target set before any clear operation.

Keep indexing off the shell startup critical path. Start cooperative catch-up after the workspace is usable; visible queries always have fallback. A Search indexing panel shows status, processed/remaining information when exact, pending changes and last error, with Pause/Resume/Rebuild/Retry. Show preparation time separately from ready-index query latency. Never display 100% solely because a previously counted total was reached.

If worker creation fails, use a yielding, cancellable main-thread scanner and expose the failure. Do not disable search, silently return empty results or drop unsaved drafts. Existing same-scope row retention, loading/error separation and lazy-view recovery remain intact.

Development logging records timings, batch counts and generation decisions, not bodies, queries, credentials or private data. Detailed diagnostics are development-only.

## Privacy and failures

Local search remains local. Canonical private/forgotten memory may still be manually searchable as today; indexing does not make it eligible for AI recall. The existing exact-context policies are rechecked independently before provider requests. Never search or index `workspaceDrafts`, `workspaceRevisions`, analysis credentials or raw files.

Quota/corruption/worker failure marks the cache unusable and falls back. Invalidation-storage failure must abort its canonical transaction rather than create falsely fresh state; report the save failure and retain the existing draft/recovery behavior. Cache rebuild does not overwrite content, timestamps, IDs or local edits. No automatic external transmission or new permissions.

## Acceptance and evidence

- Differential tests compare complete stable result IDs/order across indexed/scanned paths for all three dialects: empty/short/multi-term/quoted queries, punctuation, whitespace, CJK/emoji, locale-sensitive casing, composed/decomposed IDs, body/tag/URL matches and structural filters.
- Cover bounded overflow and matches beyond the derivation limit; no false negatives or current-query semantic changes.
- Exercise both writers, bulk partial failure, same-count/same-timestamp edits, import/merge/replace, Trash/history restore, deletes/range deletion, transaction abort and cross-tab updates.
- Terminate workers mid-batch/rebuild, expire leases, reject stale fenced commits, edit during rebuild, and retry quota/malformed-cache/worker errors. Assert search remains correct.
- Demonstrate private recovery/credential exclusion and unchanged AI memory gating; full exports remain complete and cache-free.
- Run existing lint/format/types/unit, production MV3 build and complete browser regressions in synthetic profiles. Add real production-worker tests for progress/pause/resume/cancel/restart, off-page selection, saved filters and provider-context privacy.
- Benchmark 1k/10k/50k, both board shapes, five samples: unbuilt scanner, ready index, rebuild time, single-edit catch-up, index storage, requested resources, heap diagnostics and input responsiveness. Freeze artifacts and distinguish fresh document from cold process/cache. Include rare and broad/short queries; report failures and ranges.

Success: exact parity plus a material measured improvement for selective ready-index searches at 50k, without UI blocking or regressions. A median below one second for the existing selective 50k benchmark is an engineering target, not a guarantee or a gate that permits weakened predicates. Broad/short/overflow queries retain honest scan costs. If storage expansion or latency makes this index worse, leave scanner available and report the result before widening deployment.

## Delivery boundary

Implement this stage first on the existing isolated performance branch after written-spec and implementation-plan review. Keep `feature/browser-resources-inspector` unchanged. Update README, current-build builder instructions, status and measured report after actual verification; do not label this spec as delivered behavior. Commit implementation separately from the following native-board stage. No merge, deployment, personal-profile installation or provider connector work is included.
