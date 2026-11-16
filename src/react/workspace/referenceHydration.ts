export interface HydrationPins {selected: boolean; focused: boolean; dragging: boolean; dirty: boolean}
type Loader = (signal: AbortSignal) => Promise<() => void>;
interface Entry {
    load: Loader; registration?: symbol; visible: boolean; pins: HydrationPins;
    attempt?: AbortController; cleanup?: () => void; failed: boolean;
}
const unpinned = (): HydrationPins => ({selected: false, focused: false, dragging: false, dirty: false});
const wanted = (entry: Entry) => Boolean(entry.registration && entry.visible) || Object.values(entry.pins).some(Boolean);

// One owner per mounted page, with stable occurrence IDs. An aborted request
// occupies its slot until it settles: cancellation must not exceed the IO bound.
export function createReferenceHydration(options: {maxConcurrent: number; onError?: (error: unknown) => void}) {
    if (!Number.isSafeInteger(options.maxConcurrent) || options.maxConcurrent < 1) throw new Error('Invalid hydration concurrency');
    const entries = new Map<string, Entry>(); let active = 0, closed = false;
    const report = (error: unknown) => {options.onError?.(error);};
    const release = (entry: Entry) => {
        const cleanup = entry.cleanup; entry.cleanup = undefined;
        try {cleanup?.();} catch (error) {report(error);}
    };
    function reconcile(id: string, entry: Entry) {
        if (!wanted(entry)) {
            entry.attempt?.abort(); release(entry); entry.failed = false;
            if (!entry.registration && !entry.attempt) entries.delete(id);
        }
    }
    function pump() {
        if (closed) return;
        for (const [id, entry] of entries) {
            if (active >= options.maxConcurrent) break;
            if (!wanted(entry) || entry.attempt || entry.cleanup || entry.failed) continue;
            const controller = new AbortController(); entry.attempt = controller; active++;
            void Promise.resolve().then(() => {
                if (closed || controller.signal.aborted) throw new DOMException('Content load cancelled', 'AbortError');
                return entry.load(controller.signal);
            }).then(cleanup => {
                if (closed || controller.signal.aborted || !wanted(entry)) {
                    try {cleanup();} catch (error) {report(error);}
                } else entry.cleanup = cleanup;
            }).catch(error => {
                if (!closed && !controller.signal.aborted) {entry.failed = true; report(error);}
            }).finally(() => {
                active--; entry.attempt = undefined;
                if (!closed) {reconcile(id, entry); pump();}
            });
        }
    }
    return {
        register(id: string, load: Loader) {
            if (closed) return () => {};
            const registration = Symbol(id);
            const entry = entries.get(id) || {load, visible: false, pins: unpinned(), failed: false};
            entry.registration = registration; entry.load = load; entry.failed = false; entries.set(id, entry); pump();
            return () => {
                if (closed || entry.registration !== registration) return;
                entry.registration = undefined; entry.visible = false; reconcile(id, entry); pump();
            };
        },
        setVisible(id: string, visible: boolean) {
            const entry = entries.get(id); if (closed || !entry) return;
            entry.visible = visible; reconcile(id, entry); pump();
        },
        setPins(id: string, pins: HydrationPins) {
            const entry = entries.get(id); if (closed || !entry) return;
            entry.pins = {...pins}; reconcile(id, entry); pump();
        },
        dispose() {
            if (closed) return; closed = true;
            for (const entry of entries.values()) {entry.attempt?.abort(); release(entry);}
            entries.clear();
        }
    };
}
