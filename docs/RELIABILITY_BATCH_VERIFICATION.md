# Reliability follow-up

October 2, 2026. This bounded follow-up extends the existing canonical Brain and BlockSuite adapter; it does not complete every planned workspace feature.

## Changes

- **Draft disposal:** Keep current always asks before deleting the reviewed draft. Active-session disposal includes the editing warning in the same prompt. Cancel returns before changing UI busy state or stored data. Existing atomic generation, applied-through and canonical-version guards remain unchanged.
- **Browser recapture:** recent-tab capture, duplicate web Quick Add and legacy source upsert preserve workspace-edited title and body. Search terms are rebuilt from the saved content, including retained notes when capture supplies no new body. Source metadata still refreshes; canonical IDs, creation times, tags and unrelated metadata survive. Legacy upsert now returns the merged stored entity. Recent-tab entity read/merge/write is transactional.
- **Conversation order:** BlockSuite cards read confirmed message-of relationships and canonical message objects. Valid nonnegative integer provider sequence takes priority, including zero. Sequenced messages precede older unsequenced records. Ties and legacy records use source creation time, then local creation time, then stable ID. Missing/non-message targets and unconfirmed links are excluded; duplicate links do not repeat content. Reimport and reload retain the same canonical IDs.
- **Dependency patch:** only DOMPurify changes in the lockfile, from 3.4.15 to 3.4.16, within BlockSuite's existing compatible dependency range. No new backend or schema migration is introduced.

## Verification

- Regression-first evidence: three recapture paths overwrote the edited title; Quick Add omitted retained body search terms; inactive Keep current displayed no confirmation; a reimported middle message appeared after the last message. Tests reproduced those behaviors before fixes.
- `npm test`: lint, formatting, both TypeScript checks and **131/131** unit/integration tests pass.
- `npm run build`: production Chrome MV3 build passes; generated unpacked output is `dist/` (approximately 41.22 MB).
- `npm audit --omit=dev --audit-level=low`: **0 vulnerabilities** after the scoped patch.
- `npx playwright test tests/e2e --workers=1`: **20/20 passed** in 3.0 minutes, including cancelled disposal, active/inactive confirmed disposal, unchanged canonical data, reimport/reload ordering and existing crash/restart recovery workflows. The narrow recovery screenshot was inspected; its comparison remains bounded and scrollable.
- Disposable clean snapshot: **npm 10.9.9 `ci`, full `npm test` (131/131) and production build all pass**, without relying on the working checkout's installed dependencies or generated files. Local runtime: Node 24.13.0. This is local evidence, not a new GitHub CI run.
- `git diff --check` passes.

## Independent review

A fresh read-only reviewer inspected the implementation and tests against base `d5caef3`, independently ran 13 focused tests, and found no Critical, Important or actionable Minor issues. Its approval is conditional on the final verification gates, which are author-run rather than independently repeated by the reviewer.

The reviewer declined to judge unchanged window-session transaction/search behavior and the existing policy for messages omitted from later exports. These remain separate follow-ups; this batch does not claim to solve them. It also deferred full clean-install/build/browser execution to the author and explicitly excluded editor completion, performance work and unrelated dependency updates.

## Boundaries

- Full dependency audit still reports one high-severity **development-only brace-expansion** finding (multiple advisories). The production audit is clear; the overall dependency tree is not claimed vulnerability-free.
- The pinned older BlockSuite icons package still warns about the local Node 24 engine range; existing legacy-tool deprecation and large editor chunk warnings remain.
- Browser checks use disposable isolated Chromium profiles. The in-app browser bridge is unavailable. No personal profile, provider account, live AI request or deployment is involved.
- Connector routing, richer block controls, nested-page outline improvements, indexed draft-summary pagination and large-library/bundle performance remain later upgrades.
- This batch is a local commit only. No push, PR merge or personal-browser installation is included.
