export interface NativeMountOptions {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    onMeasure?: (phase: string, ms: number) => void;
}
const aborted = () => new DOMException('Workspace preparation cancelled', 'AbortError');
const checkSignal = (signal?: AbortSignal) => {if (signal?.aborted) throw aborted();};

export async function runProjectionBatches(operations: readonly (() => void)[], options: NativeMountOptions = {},
    yieldControl: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0)), now: () => number = () => performance.now()) {
    checkSignal(options.signal);
    for (let offset = 0; offset < operations.length;) {
        const started = now(), limit = Math.min(operations.length, offset + 50);
        let end = offset;
        do {checkSignal(options.signal); operations[end++]!();} while (end < limit && now() - started < 8);
        checkSignal(options.signal); options.onProgress?.(end, operations.length);
        if (end < operations.length) {await yieldControl(); checkSignal(options.signal);}
        offset = end;
    }
}

export interface NativeMountScope {own(cleanup: () => void): void; check(): void}
// Cancellation also wins against a pending native renderer promise. Late work
// sees a closed scope and can never attach resources to a replacement page.
export async function prepareNativeMount<T>(prepare: (scope: NativeMountScope) => Promise<T>, options: NativeMountOptions = {}) {
    const cleanups: Array<() => void> = []; let closed = false;
    const dispose = () => {
        if (closed) return;
        closed = true; const failures: unknown[] = [];
        for (const cleanup of cleanups.splice(0).reverse()) {try {cleanup();} catch (error) {failures.push(error);}}
        if (failures.length) throw new AggregateError(failures, 'Workspace cleanup failed');
    };
    const scope: NativeMountScope = {
        own(cleanup) {if (closed) cleanup(); else cleanups.push(cleanup);},
        check() {if (closed) throw aborted(); checkSignal(options.signal);}
    };
    let abortListener: (() => void) | undefined;
    try {
        scope.check();
        const cancelled = new Promise<never>((_resolve, reject) => {
            abortListener = () => reject(aborted());
            options.signal?.addEventListener('abort', abortListener, {once: true});
        });
        const value = await Promise.race([prepare(scope), cancelled]);
        scope.check(); return {value, dispose};
    } catch (error) {
        try {dispose();} catch (cleanupError) {throw new AggregateError([error, cleanupError], 'Workspace preparation and cleanup failed');}
        throw error;
    } finally {if (abortListener) options.signal?.removeEventListener('abort', abortListener);}
}
