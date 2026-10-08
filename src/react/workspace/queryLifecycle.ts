import {liveQuery, type Subscription} from 'dexie';
import type {LibraryCursor} from './libraryQueryTypes';

export interface QueryState<T> {data?: T; loading: boolean; refreshing: boolean; error?: Error}

export function queryClock(prior: {key: string; referenceTime: number} | undefined, key: string, now: number) {
    return prior?.key === key ? prior : {key, referenceTime: now};
}

export function queryPosition(prior: {key: string; index: number; cursors: Array<LibraryCursor | undefined>; epoch: number}, key: string) {
    return prior.key === key ? prior : {key, index: 0, cursors: [undefined], epoch: prior.epoch + 1};
}

export function retainQueryState<T>(prior: QueryState<T> & {key: string}, next: QueryState<T>, key: string) {
    if (prior.key !== key || next.data !== undefined || (!next.loading && !next.refreshing && !next.error)) return {...next, key};
    const data = prior.data;
    return {...next, key, data, loading: next.loading && data === undefined,
        refreshing: next.refreshing || (next.loading && data !== undefined)};
}

export function observeWorkspaceQuery<T>(read: (signal: AbortSignal) => Promise<T>, publish: (state: QueryState<T>) => void) {
    let data: T | undefined, stopped = false, generation = 0;
    let subscription: Subscription | undefined, controller: AbortController | undefined;
    const start = () => {
        if (stopped) return;
        subscription?.unsubscribe(); controller?.abort();
        const epoch = ++generation;
        publish({data, loading: data === undefined, refreshing: data !== undefined});
        subscription = liveQuery(async () => {
            controller?.abort(); const request = new AbortController(); controller = request;
            if (!stopped && epoch === generation) publish({data, loading: data === undefined, refreshing: data !== undefined});
            return read(request.signal);
        }).subscribe({
            next: value => {
                if (stopped || epoch !== generation) return;
                data = value; publish({data, loading: false, refreshing: false});
            },
            error: error => {
                if (!stopped && epoch === generation) publish({data, loading: false, refreshing: false,
                    error: error instanceof Error ? error : new Error(String(error))});
            }
        });
    };
    start();
    return {refresh: start, stop: () => {stopped = true; generation++; controller?.abort(); subscription?.unsubscribe();}};
}
