# Reference content load diagnostics

Verified locally on 20 November 2026: lint, type checks, 311 source tests, all 62 serial browser tests without retries, and the 41.45 MB production build passed. The intermittent 1,000-card Mixed-mode image-reveal failure remains open. The new trace captured a reproduced failure; no assertion deadline or concurrency limit was relaxed.

## Enable the trace

Open the extension's `newtab.html?nativeLoadTrace=1`, open a board, then open its Workspace view. The switch is off by default and applies to the current page only.

In that page's developer console, inspect:

```js
document.querySelector('.affineNativeHost')?.nativeLoadDiagnostics?.snapshot()
```

The snapshot contains pending stages with elapsed times and completed stages with durations and outcomes. Each record identifies the canonical object and its document/canvas occurrence. Stages cover entity reads, conversation messages, task reads, asset reads, raster validation, rendering, body attachment, abort and disposal.

The collector retains at most 64 pending records and the latest 200 completed records. Drop counters identify truncated data. It records IDs and timing metadata, without titles, message bodies or file bytes. It does not write to the Brain or browser storage. Closing the workspace removes its reader and clears the collector; export a snapshot before closing if needed.

A completed read can follow an abort record: pending database operations still settle before their concurrency slot is released. The trace does not change the four-load concurrency limit or assertion deadlines. Timing adds instrumentation overhead, so traced results must be labeled separately from ordinary benchmarks. The `attach` stage measures DOM attachment, not image decoding or paint.

Durations are elapsed wall time. A long read stage can include event-loop blocking or transaction waits; it does not establish a storage-engine bottleneck by itself.

## Benchmark capture

Set this environment variable before running the existing supervised native benchmark:

```powershell
$env:NATIVE_TRACE_LOADS = '1'
```

The worker then enables the page switch and adds `metrics.contentLoads` after the mixed-content reveal, or in its error handler. A capture failure is reported as `metrics.contentLoadsError` without replacing the original error. A terminated or unresponsive browser may prevent capture; a supervisor timeout alone does not establish the slow stage.

Remove the variable for ordinary comparison runs:

```powershell
Remove-Item Env:NATIVE_TRACE_LOADS
```

## Verification on 20 November 2026

The tested application and harness commit is `f72c289430b77d32eb888a01403f95a9a28f03af`. All capacity probes used that clean source and the same Windows artifact, SHA-256 `d8ca47d739b9c0f878efe75588ae6804927abe7402c05bf4d9c2e9f1f88d7815`. The [evidence archive](evidence/reference-load-2026-11-20.json) retains the raw results, errors, timing histories, capture script, source identifiers and all 341 artifact file hashes. Subsequent changes in this verification update are documentation only.

After updating the README, the final production rebuild passed. Its Windows artifact digest is `73ab5900be55029908b12f23a27f67e8df17aef9f5e841a6a06d98488c518cf6`. A file-by-file SHA-256 comparison found only `legacy/README.md` changed; all other 340 files, including every runtime file, are byte-for-byte identical to the tested artifact. Both manifests are retained in the evidence archive.

| 1,000-card run | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Traced Canvas | 5 | 0 | 0 |
| Traced Mixed | 1 | 1 | 3 |
| Untraced Canvas control | 1 | 0 | 0 |
| Untraced Mixed control | 1 | 0 | 0 |

Traced Canvas median readiness was 10.87 seconds, with 8.78–11.92 seconds observed. The first traced Mixed run passed; the second opened in 14.39 seconds, then failed the unchanged five-second document-image assertion. The harness skipped the remaining Mixed samples after that failure. All nine executed probes closed their owned workers and removed their profiles.

The untraced controls opened in 12.11 seconds (Canvas) and 15.92 seconds (Mixed) and passed all probe assertions. These are single pilots, not repeated capacity certification. Traced timings include instrumentation overhead and are not acceptance comparisons with earlier builds.

In the failed Mixed run, the post-timeout capture contained the document image and no pending loads. Its recorded stages were approximately 1,969 ms for the entity read, 11 ms for the asset read, 113 ms for raster validation, 0.6 ms for rendering and 0.1 ms for attachment. No diagnostic records were dropped. This establishes that the image eventually loaded; it does not establish the cause of the assertion delay. Correlating visibility notifications, main-thread work and read stages during reveal is the next investigation. There is no basis here to mark the intermittent failure fixed.

The initial restricted-shell source run passed 310/311 tests and failed an existing owned-process timeout-cleanup assertion. Its exact orphan test workers were verified and stopped. Without application changes, supervisor tests then passed 11/11 and the full source suite passed 311/311 with the process-control access those tests require. This environment finding is separate from the browser image failure.

## Reproduce the checks

1. Run the focused source tests: `node --test tests/referenceLoadDiagnostics.test.js`.
2. Run `npm test` and `npm run build`.
3. Run `npx playwright test tests/e2e/native-windowing.spec.js --workers=1`, including trace opt-in and cleanup coverage.
4. Repeat the supervised 1,000-card canvas and mixed-mode probes with tracing enabled, keeping failures and their pending stages. Use the existing benchmark runner and its normal ownership/timeout cleanup.
5. Investigate the stage shown by the evidence, then add a regression for the confirmed cause. Repeat without tracing to assess normal performance.

See [the existing startup report](NATIVE_STARTUP_FOLLOWUP.md) for the delivered build's measurements and unresolved failures. Those results do not verify this new instrumentation.

For the traced capacity matrix, use the normal supervisor and a separate output directory:

```powershell
$env:NATIVE_TRACE_LOADS = '1'
$env:NATIVE_SIZES = '1000'
$env:NATIVE_MODES = 'canvas,mixed'
$env:NATIVE_SAMPLES = '5'
node node_modules/@playwright/test/cli.js test tests/performance/native-board.spec.js --config=playwright.performance.config.js --output=test-results/reference-load-repeat
```

Clear `NATIVE_TRACE_LOADS` for untraced controls. Preserve failed results and distinguish skipped samples from completed runs.
