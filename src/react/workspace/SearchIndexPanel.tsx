import {useEffect, useState} from 'react';
import type {SearchWorkerClient} from './searchWorkerProtocol';
import type {SearchControl, SearchStatus} from './searchIndexTypes';
import {describeIndexStatus} from './searchIndexStatus';
export function SearchIndexPanel({service}: {service: SearchWorkerClient}) {
    const [state, setState] = useState<SearchStatus>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {const next = await service.status(); if (!stopped) {setState(next); setError('');}}
            catch {if (!stopped) setError('Index status unavailable. Local search remains usable.');}
            if (!stopped) timer = setTimeout(() => {void poll();}, 1000);
        };
        void poll(); return () => {stopped = true; clearTimeout(timer);};
    }, [service, revision]);
    const control = async (command: SearchControl) => {
        setBusy(true); setError('');
        try {await service.control(command); setRevision(prior => prior + 1);}
        catch {setError('Index control failed. Your objects and drafts are unchanged.');}
        finally {setBusy(false);}
    };
    const presentation = describeIndexStatus(state);
    return <aside className="searchIndexPanel" aria-label="Local search indexing">
        <h3>Local search index</h3>
        <p role="status">{presentation.label}{state && ` · ${state.processed} records processed · ${state.pending} pending changes`}
            {presentation.remaining !== undefined && ` · ${presentation.remaining} initial records remaining`}</p>
        <p>Search stays local and uses an exact fallback while the cache is unavailable. Rebuild changes only the disposable index.</p>
        {(error || state?.lastError) && <p role="alert">{error || state?.lastError}</p>}
        <div className="searchIndexPanel__controls">
            <button disabled={busy || !state || state.status === 'paused'} onClick={() => void control('pause')}>Pause</button>
            <button disabled={busy || !state || state.status !== 'paused'} onClick={() => void control('resume')}>Resume</button>
            <button disabled={busy || !state} onClick={() => void control('rebuild')}>Rebuild</button>
            <button disabled={busy || !state} onClick={() => void control('retry')}>Retry</button>
        </div>
    </aside>;
}
