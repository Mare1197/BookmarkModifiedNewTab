import {useEffect, useRef, useState} from 'react';
import {observeWorkspaceQuery, retainQueryState, type QueryState} from './queryLifecycle';

export function useWorkspaceQuery<T>(key: string, read: (signal: AbortSignal) => Promise<T>, revision = 0) {
    const [state, setState] = useState<QueryState<T> & {key: string}>({key, loading: true, refreshing: false});
    const reader = useRef(read); reader.current = read;
    const observer = useRef<ReturnType<typeof observeWorkspaceQuery<T>> | undefined>(undefined);
    useEffect(() => {
        const scopedRead = reader.current;
        const run = observeWorkspaceQuery(scopedRead, next => setState(prior => retainQueryState(prior, next, key)));
        observer.current = run;
        return () => {run.stop(); if (observer.current === run) observer.current = undefined;};
    }, [key, revision]);
    const current = state.key === key ? state : {data: undefined, loading: true, refreshing: false, error: undefined};
    return {...current, retry: () => observer.current?.refresh()};
}
