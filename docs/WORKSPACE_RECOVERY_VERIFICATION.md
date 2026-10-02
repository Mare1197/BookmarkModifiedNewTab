# Workspace recovery verification

This is the original recovery checkpoint report. Its deferred confirmation, recapture, conversation-order and DOMPurify items are addressed in the later [reliability follow-up](RELIABILITY_BATCH_VERIFICATION.md); use that report for the newer verification boundary.

October 2, 2026. Scope: recovery upgrade one, extending the existing Brain and BlockSuite adapter. No new database backend, cloud service, deployment, or personal browser installation.

## Verification record

- Lint, formatting, both TypeScript checks and 123 unit/integration tests pass.
- Production Chrome MV3 build passes; unpacked output is `dist/`, approximately 41.20 MB.
- Final browser regression run: `npx playwright test tests/e2e --workers=1` passed 17/17 in 2.8 minutes. Tests use disposable profiles, real renderer crashes and profile reopen; no personal profile or provider account is involved.
- Production dependency audit: no high-severity findings; one low-severity DOMPurify advisory, GHSA-p98j-92pf-mc4p. No blanket dependency update was applied.
- Desktop/narrow comparison screenshots were inspected; manual editor cancellation and keyboard focus are exercised by browser tests. History and restart flows are included in the final browser gate.
- `git diff --check` passes. The recovery upgrade remains on the local `feature/browser-resources-inspector` branch; no push or merge is included.

## Independent review and fixes

A fresh independent reviewer inspected application changes from `f68f042` through `2fb4b19`, plus restart tests. Its verdict was changes required: three Important findings, no Critical findings. All three were reproduced in failing tests and fixed, followed by the green 123-test suite:

1. Unopened legacy boards now get transactional history preimages before backup replacement.
2. Recovery reconciliation checks journal identity and generations after asynchronous reads and checks content draft identity before clearing. Layout queue reconciliation removes only the reviewed prefix, preserving later commands.
3. Conflict snapshots expose inert link destinations, heading/code attributes and complete allowlisted layout/connector details.

The browser regression runs also exposed toolbar crowding caused by Recovery and an initial-load race allowing board actions before a board was selected. View tabs and actions now occupy separate bounded, scrollable rows; board actions wait until a board is available and no shell mutation is busy. These are covered by existing real-click regression tests, not forced clicks.

The reviewer was not asked to re-review the fixes. Their regression tests and final suite results are the fix evidence; this is not an unconditional independent approval of the final tree. No behavior was declined as outside the recovery specification.

## Decisions and costs

These are the complete implementation rulings retained from the execution ledger:

1. Reuse the approved named feature checkout rather than a new worktree. This preserves installed dependencies and task attachment; moving commits later is the cost if isolation is needed.
2. Completed acknowledgement receipts retain their canonical version but no content base. A stale new append must reload/retry; the cost is an explicit interruption instead of silent rebasing.
3. Layout validation accepts the full existing Brain type union, including projects/chats/tasks. Tightening validation later would require a migration if this choice proves too broad.
4. Legacy history writers share an all-table transaction and establish page ownership when first versioned. The cost is broader write locking until the performance upgrade.
5. Text and layout share journal code but retain independent session IDs/writers. The cost is two small heartbeat updates per mounted editor.
6. Durable viewport operations are not coalesced after journaling. The cost is extra small operations until autosave.
7. Recovery reconciles only the reviewed stored generation, not the whole editor session. A partially resolved layout may require completing remaining recovery before the editor remounts.

Browser automation used the approved isolated Chromium harness because the in-app bridge rejected access. Sandbox browser teardown restrictions were resolved with approved test permissions. Restart tests wait for the specific acknowledged edit, not just any viewport journal entry. They reopen directly into shell Recovery before mounting a new native editor session.

## Deferred items and boundaries

- Minor: recovery discovery currently reads full draft rows before returning/paging summaries. A lightweight indexed summary representation belongs in the large-library performance pass.
- Minor: inactive **Keep current** discards immediately; active-session discard warns, and every backend discard is generation-checked. Add confirmation for inactive drafts as a follow-up.
- Low-severity DOMPurify advisory noted above remains for a scoped dependency update.
- Earlier surrounding-code audit also flagged recapture preserving user-edited titles/search text and transcript ordering by message sequence. Those are separate from recovery; they are not claimed fixed here.
- Connector routing/richer block controls/nested-page navigation and large-library/bundle work remain subsequent upgrades, not completed by this recovery slice.
- Recovery guarantees cover completed local journal transactions. Input not yet acknowledged, erased storage, extension uninstall, disk failure and off-device recovery are outside this guarantee.
- Historical content may contain removed/private text. Ordinary backups and AI context exclude the private recovery tables; explicit recovery backups must be kept secure.
