# Connector routing and indexed page reads — October 3, 2026

## Implemented

- Native endpoint retargeting and attachment-position persistence.
- Orthogonal page-local bends: pointer drag, keyboard movement/removal, reset, reload and backup persistence.
- Canonical undo for saved routing operations; cancelled native endpoint listeners are terminated, manual paths are restored after the native auto-router settles, and native endpoint handles redraw with the restored path.
- Outer workspace scrolling refreshes native pointer offsets.
- Finishing creation of one note does not clear a newer title already entered for the next note.
- Retargeting creates/reuses a confirmed relationship of the original supported type; it does not mutate/delete the previous shared relationship.
- Existing pages without saved anchors retain their former default attachments.
- Page snapshots fetch connector relationships by ID and hierarchy links through existing endpoint indexes. No schema migration or second store.

## Performance evidence

Run `node --test tests/pageReadPerformance.test.js`. This uses real Dexie queries with
fake-indexeddb, three samples per size. Wall-clock values are diagnostic, not CI
thresholds or browser-rendering guarantees. The regression gate bounds hydrated
relationship records and checks identical page version, hierarchy and object results.

| Unrelated objects/links | Records loaded before → after | Median load before → after |
| --- | --- | --- |
| 1,000 | 1,003 → 3 | 7.52 ms → 2.40 ms |
| 10,000 | 10,003 → 3 | 71.31 ms → 2.11 ms |

This removes whole-library relationship scans from page snapshots used during saves.
High-degree objects still require reading their own incoming/outgoing links. This is
not a claim that every workspace query or large canvas is optimized.

## Review and verification

An independent routing review found three Important issues: unreachable bend undo,
native cancellation listeners surviving cancellation, and restored manual routes
being overwritten by native auto-routing. Each received a failing browser regression
before its fix. The reviewer did not re-review the fixes. No Minor findings were reported.

Focused pointer flow passed: endpoint retarget, bend drag, scoped undo, reload,
pointer cancellation followed by movement, and immediate manual-path restoration.
Repository tests cover coordinate validation, atomic rejection, conflict guards,
semantic recovery boundaries, preserved shared relationships and backup round-trip.
Final local verification on the completed source tree: `npm test` passed lint,
formatting, both TypeScript checks and **141/141** unit/integration tests;
`npm run build` produced the **41.24 MB** MV3 artifact; `npx playwright test tests/e2e --workers=1`
passed **24/24** browser cases. `git diff --check` passed. The native routing screenshot
was inspected and the endpoint-handle/path alignment has a browser assertion.

Earlier runs exposed the fixed note-entry race and one Inspector startup timeout
(waiting for the newly added note). That Inspector timeout did not recur in the final
full run; no timeout was increased and no assertion was removed. This does not certify
that all pre-existing startup timing issues are eliminated.

## Decisions and remaining scope

- Reuse native endpoint handles/auto-routing; custom orthogonal waypoint handles adapt the pinned public path generator. Cost: adapter interaction coverage is maintained here.
- Preserve old shared links on retarget. Cost: users explicitly unlink obsolete relationships.
- Keep the requested existing feature checkout and PR. No merge/deployment or personal-browser installation.
- Hardware touch, exhaustive mobile/accessibility behavior, manual Bezier controls, broad indexed/paged search, visible-only rendering and bundle reduction are not certified by this batch.
