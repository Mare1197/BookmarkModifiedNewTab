import type {SearchState} from './searchIndexTypes';
export function createIndexReadinessObserver(read: () => Promise<SearchState | undefined>, onReady: () => void) {
    let disposed = false, request = 0, prior = '';
    return {
        async check(): Promise<void> {
            const current = ++request, state = await read();
            if (disposed || current !== request) return;
            const token = state?.status === 'ready' && state.scanComplete && state.generation === state.indexedGeneration ?
                state.epoch + ':' + state.indexedGeneration : '';
            const changed = token !== prior; prior = token;
            if (token && changed) onReady();
        },
        dispose(): void {disposed = true; request++;}
    };
}
