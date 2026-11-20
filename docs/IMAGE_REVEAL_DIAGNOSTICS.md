# Reference content load diagnostics

Implementation status: prepared locally; tests, type checks, production build and browser verification are pending the Windows restart. The previous 1,000-card image-reveal failures remain unresolved. This instrumentation is intended to locate their slow stage, rather than establish a cause in advance.

## Enable the trace

Open the extension's `newtab.html?nativeLoadTrace=1`, open a board, then open its Workspace view. The switch is off by default and applies to the current page only.

In that page's developer console, inspect:

```js
document.querySelector('.affineNativeHost')?.nativeLoadDiagnostics?.snapshot()
```

The snapshot contains pending stages with elapsed times and completed stages with durations and outcomes. Each record identifies the canonical object and its document/canvas occurrence. Stages cover entity reads, conversation messages, task reads, asset reads, raster validation, rendering, body attachment, abort and disposal.

The collector retains at most 64 pending records and the latest 200 completed records. Drop counters identify truncated data. It records IDs and timing metadata, without titles, message bodies or file bytes. It does not write to the Brain or browser storage. Closing the workspace removes its reader and clears the collector; export a snapshot before closing if needed.

A completed read can follow an abort record: pending database operations still settle before their concurrency slot is released. The trace does not change the four-load concurrency limit or assertion deadlines. Timing adds instrumentation overhead, so traced results must be labeled separately from ordinary benchmarks. The `attach` stage measures DOM attachment, not image decoding or paint.

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

## Verification after restart

1. Run the focused source tests: `node --test tests/referenceLoadDiagnostics.test.js`.
2. Run `npm test` and `npm run build`.
3. Run `npx playwright test tests/e2e/native-windowing.spec.js --workers=1`, including trace opt-in and cleanup coverage.
4. Repeat the supervised 1,000-card canvas and mixed-mode probes with tracing enabled, keeping failures and their pending stages. Use the existing benchmark runner and its normal ownership/timeout cleanup.
5. Investigate the stage shown by the evidence, then add a regression for the confirmed cause. Repeat without tracing to assess normal performance.

See [the existing startup report](NATIVE_STARTUP_FOLLOWUP.md) for the delivered build's measurements and unresolved failures. Those results do not verify this new instrumentation.
