import type {SearchStatus} from './searchIndexTypes';
export function describeIndexStatus(state?: SearchStatus) {
    if (!state) return {label: 'Loading index status', remaining: undefined};
    const ready = state.status === 'ready' && state.scanComplete && state.pending === 0 && state.generation === state.indexedGeneration;
    const labels = {unbuilt: 'Not built', building: 'Building', ready: ready ? 'Ready' : 'Building', paused: 'Paused', error: 'Index error'};
    const exact = state.generation === state.buildGeneration && state.total !== undefined && !state.scanComplete;
    return {label: labels[state.status], remaining: exact ? Math.max(0, state.total! - state.processed) : undefined};
}
