# Large-library performance

Work is isolated on `feature/large-library-performance`; the preserved product baseline is `1edd695` on `feature/browser-resources-inspector`. Implementation and final verification are in progress; this document is not a completion claim.

## Reproduction

Run `npm test`, then `npm run build`. Tests rebuild legacy compatibility files, so always build the MV3 artifact **after** unit/type checks. Use `WORKSPACE_EXTENSION_PATH` to point browser runs at an immutable copy when running other build commands concurrently.

`npx playwright test -c playwright.performance.config.js --workers=1` uses isolated temporary profiles and synthetic data only. Defaults: 1,000 / 10,000 / 50,000 objects, small-board (50 references) and large-board (every object referenced), five samples each. Override with `PERF_SIZES`, `PERF_SHAPES`, `PERF_SAMPLES`, `PERF_LABEL`. Setup is outside timed measurements. Browser/disk caches can be warm; startup is a fresh renderer, not a guaranteed cold OS cache.

`node scripts/bundle-report.js dist` reports unpacked bytes, not startup transfer. Browser request filenames are recorded separately with their on-disk source sizes; extension resource timing may expose no transfer sizes. Memory figures, when available, are diagnostic Chromium heap estimates.

Large-board native-editor stress opening is opt-in with `PERF_LARGE_EDITOR=1`: the initial 1,000-card baseline probe stalled, including teardown. Default large-board tests still exercise navigation/search; they do not certify native editor capacity.

## Initial baseline evidence

Chromium 151.0.7922.34, Windows, viewport 1584 × 1024. Production source `1edd695`; harness HEAD `cf518d9` contained only documentation changes. Baseline unpacked artifact: 41,237,969 bytes. Native BlockSuite adapter chunk: 5,871,709 bytes. No dependency versions changed.

Median milliseconds (five successful samples for the individual operation; whole-case failures are disclosed below):

| Library / board | Startup | Brain open | Next page | Search |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 50 references | 1,751 | 566 | 334 | 331 |
| 1,000 / 1,000 references | 3,228 | 1,416 | 328 | 353 |
| 10,000 / 50 references | 5,867 | 17,988 | 2,384 | 2,373 |
| 10,000 / 10,000 references | 22,407 | 65,777 | 2,183 | 2,425 |

Startup ranges: 1,570–1,868; 3,093–4,232; 5,208–6,521; 22,209–23,170 ms, respectively. Small-board 1,000-object editor-open median: 5,543 ms (4,363–5,724). At 1,000 objects, Explorer rendered 1,001 rows including the seeded starter note. Initial DOM totals were 5,960 for the small board and 21,167 for the large board.

The first immutable 30-case run had **15 passes and 15 failures**. Five 10,000-object small-board cases failed during editor opening. Ten 50,000-object cases failed during setup because a single fixture message exceeded Chromium's protocol buffer; these are **not application performance measurements**. Fixture insertion is now batched and workspace rendering is unmounted during setup. Follow-up 50,000-object validation remains pending. Earlier runs invalidated by mutable `dist` or the about:blank localStorage harness error are excluded.

## Implemented foundations (verification continues)

- Mirrored Dexie version-5 indexes; unchanged canonical records and ordinary backup format.
- Query-bound 50-object pages, bounded body scanning, exact existing search dialects, locale ordering and cancellation.
- Explicit shell, board, selected-object, project and graph reads. Selected objects and backlinks do not depend on current page membership.
- Independently observed Explorer, Brain and workflow pages, searchable object/project pickers, explicit loading/error/retry states.

Broad substring/title/tile queries can still scan the matching scope. Locale/title/custom ordering keeps compact ID/order projections, not note bodies. Task due-date ordering projects task metadata to include undated tasks. Project home/resume reads its complete confirmed project scope. Explicit AI preview and provider request validation read complete canonical context on demand to preserve privacy filtering; neither includes private drafts/revision history. Full backup/import operations remain complete.

Candidate timings, final bundle comparison, remaining limitations and full acceptance mapping will be added after final verification.
