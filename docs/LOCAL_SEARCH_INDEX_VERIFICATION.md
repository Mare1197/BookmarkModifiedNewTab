# Local search index verification

The isolated `feature/large-library-performance` branch contains a persistent, disposable local substring index over canonical Brain objects. Explorer, Brain and Smart Search retain their matching and ordering rules. Short/common queries, unavailable workers and incomplete indexes use exact scanning. Pause, Resume, Retry and Rebuild affect only disposable search data.

## Baseline evidence

Application and harness: `c5b6de50a1e6531acee71ea281fc6c3685d9e697`. Frozen artifact SHA-256: `6564fc0f8a202a9d3b58e9a2e2053ffa775809bad785bfb182fb5e2c594ccbb6`. Windows Chromium 151.0.7922.34, Playwright 1.62.1, viewport 1584 × 1024. Temporary synthetic profiles only. Source checks, 225 unit/integration tests, production MV3 build and 37 serial browser tests passed on this baseline.

The formal search matrix completed **20/30 successful cases**, without retries. Five samples were attempted per size and board shape. All ten 50,000-object rebuilds exceeded the 600-second readiness deadline at 32,450–34,450 processed records. These are failures, not discarded samples. The earlier [navigation matrix](LARGE_LIBRARY_PERFORMANCE.md) is a different experiment.

Times are milliseconds, median [minimum–maximum]. A small board contains 50 references; a large board contains one reference per fixture object. The native editor is never opened.

| Objects / shape | Paused exact scan | Ready selective query | Cold rebuild | Single-edit catch-up |
| --- | --- | --- | --- | --- |
| 1,000 / small | 1058.7 [1052.5–2213.1] | 244.0 [161.7–318.5] | 7996.8 [7108.4–11942.8] | 967.8 [683.6–1241.5] |
| 1,000 / large | 1043.0 [266.8–1581.7] | 158.5 [141.8–359.3] | 7304.3 [5404.4–8148.5] | 1607.4 [695.9–2465.8] |
| 10,000 / small | 2043.3 [1996.7–2556.5] | 453.6 [319.1–1032.3] | 87276.3 [80410.6–88246.8] | 4725.1 [2644.2–5997.1] |
| 10,000 / large | 1981.5 [970.1–2510.7] | 466.7 [319.5–1115.6] | 89749.2 [84689.9–96272.4] | 7028.1 [6038.4–7536.2] |
| 50,000 / small | 6087.0 [5032.4–7119.7] | Not reached | Five timeouts | Not reached |
| 50,000 / large | 5060.0 [5052.3–5606.7] | Not reached | Five timeouts | Not reached |

Input acknowledgment during rebuild had group medians of 93.1–103.1 ms; this measures setting a textbox value plus two animation frames, not every interaction. Fixture setup medians were 6.0/6.9 seconds at 1k, 25.2/23.9 seconds at 10k and 120.2/126.4 seconds at 50k (small/large). Fresh-document startup medians were 1.7/1.9, 1.6/3.0 and 4.1/8.4 seconds respectively. Setup is excluded from ready-query timings.

Raw `SEARCH_RESULT` records retain broad/short queries, errors and resource/storage/heap diagnostics. Serialized cache bytes exclude posting-index overhead; main-thread heap excludes worker heap. Source request bytes are not transfer bytes. No hardware-independent latency or native-board capacity claim follows from these measurements.

## Review corrections

A fresh read-only whole-stage review identified three Important items: total-duration worker timeout, same-count malformed cache and missing 50k acceptance. No Critical or Minor findings were reported. Author fixes are not independently re-reviewed.

- Valid advancing query progress now renews an inactivity watchdog. A healthy long scan keeps its worker; silent/stalled requests still fall back.
- All derived rows are checked in bounded batches before postings are trusted, including malformed rows absent from postings. Shape, epoch, generation and fingerprint failures use canonical scanning. This adds validation cost that must be included in new measurements.
- Background batches reuse their already-renewed fenced lease and cannot overlap after controls. Ownership and generation checks remain atomic.
- Benchmark polling counts full coverage after Ready; incomplete polls read progress only. Generation, epoch, pending changes and full coverage are still checked together before acceptance. Timeout diagnostics retain counts.
- Generated benchmark scratch is excluded from lint and TypeScript discovery.

Each behavioral correction has a regression observed failing before the fix and passing afterwards. **Acceptance remains pending:** fresh full verification and attributed post-correction measurements, especially 50k readiness and selective-search performance. Native-board optimization is a separate subsequent stage.

## Reproduction

Run `npm test`, `npm run build`, and `npx playwright test tests/e2e --workers=1 --retries=0`. Freeze the verified `dist` directory. Set `WORKSPACE_EXTENSION_PATH` to that copy, `PERF_REVISION` to its source commit, `PERF_SIZES=1000,10000,50000`, `PERF_SHAPES=small-board,large-board` and `PERF_SAMPLES=5`. Run `npx playwright test -c playwright.performance.config.js tests/performance/search-index.spec.js --workers=1 --retries=0`.

Never rebuild the measured artifact during a run. Preserve failed result records. Read source/harness revision, dirty-tree flag and artifact digest from output rather than attributing measurements to a later commit.
