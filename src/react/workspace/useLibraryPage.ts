import Dexie, {type ObservabilitySet} from 'dexie';
import {useEffect, useRef, useState} from 'react';
import {workspaceClient as db} from './workspaceClient';
import {queryLibraryPosition} from './libraryQueries';
import {libraryQueryKey} from './libraryOrdering';
import {useWorkspaceQuery} from './useWorkspaceQuery';
import {queryClock, queryPosition} from './queryLifecycle';
import type {LibraryCursor, LibraryQuery} from './libraryQueryTypes';

const dependencies = new Set(['entities', 'relationships', 'placements', 'tasks', 'boards', 'settings']);

export function useLibraryPage(input: Omit<LibraryQuery, 'referenceTime'>) {
    const configKey = libraryQueryKey({...input, referenceTime: 0});
    const [clock, setClock] = useState(() => queryClock(undefined, configKey, Date.now()));
    const currentClock = queryClock(clock, configKey, Date.now());
    if (currentClock !== clock) setClock(currentClock);
    const query = {...input, referenceTime: currentClock.referenceTime}, key = libraryQueryKey(query);
    const [position, setPosition] = useState<{key: string; index: number; cursors: Array<LibraryCursor | undefined>; epoch: number}>(
        {key, index: 0, cursors: [undefined], epoch: 0});
    // A render for a new filter cannot publish the previous filter's results.
    const active = queryPosition(position, key);
    if (active !== position) setPosition(active);
    const keyRef = useRef(key); keyRef.current = key;
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const changed = (parts: ObservabilitySet) => {
            if (!Object.keys(parts).some(part => {
                const prefix = 'idb://' + db.name + '/';
                return part.startsWith(prefix) && dependencies.has(part.slice(prefix.length).split('/')[0]!);
            })) return;
            clearTimeout(timer);
            timer = setTimeout(() => setPosition(prior => ({key: keyRef.current,
                index: prior.key === keyRef.current ? prior.index : 0, cursors: [undefined], epoch: prior.epoch + 1})), 0);
        };
        Dexie.on('storagemutated', changed);
        return () => {clearTimeout(timer); Dexie.on.storagemutated.unsubscribe(changed);};
    }, []);
    const page = useWorkspaceQuery(key + ':' + active.index,
        signal => queryLibraryPosition(query, active.index, active.cursors, {signal}), active.epoch);
    const index = page.data?.pageIndex ?? active.index;
    return {...page, index,
        next: () => {
            if (!page.data?.nextCursor || page.loading || page.refreshing) return;
            const cursors = page.data.cursors.slice(0, index + 1); cursors.push(page.data.nextCursor);
            setPosition({...active, index: index + 1, cursors});
        },
        previous: () => {if (index > 0) setPosition({...active, index: index - 1, cursors: page.data?.cursors || active.cursors});}
    };
}
