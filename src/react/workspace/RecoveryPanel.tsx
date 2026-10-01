import {useEffect, useState} from 'react';
import {listDrafts, discardDraft} from './recoveryRepository';
import {previewDraft} from './recoveryPreview';
import type {DraftPreview, DraftSummary} from '../../workspace/recoveryTypes';
export function RecoveryPanel({onOpenConflict, onChanged}: {onOpenConflict: (preview: DraftPreview) => void; onChanged: () => Promise<void>}) {
    const [rows, setRows] = useState<DraftSummary[]>([]), [status, setStatus] = useState('Loading drafts…');
    const [recovered, setRecovered] = useState(false), [page, setPage] = useState(0);
    const refresh = async () => {setRows(await listDrafts()); setStatus('');};
    useEffect(() => {let cancelled = false; void listDrafts().then(next => {if (!cancelled) {setRows(next); setStatus('');}}).catch(e => setStatus(String(e))); return () => {cancelled = true;};}, []);
    const visible = rows.filter(r => (r.recoveredGeneration === r.generation) === recovered);
    return <section aria-label="Workspace recovery"><h2>Workspace recovery</h2>
        <p>Private local drafts. Recovery never sends content to AI or restores missing objects automatically.</p>
        <label><input type="checkbox" checked={recovered} onChange={e => {setRecovered(e.target.checked); setPage(0);}} /> Show already recovered source drafts</label>
        <p>{visible.length} {recovered ? 'recovered sources' : 'unresolved drafts'}</p>
        {!visible.length && <p>{recovered ? 'No recovered source drafts.' : 'No unresolved drafts.'}</p>}
        {visible.slice(page * 20, page * 20 + 20).map(row => <article className="recoveryRow" key={row.id}>
            <strong>{row.target.kind} · {row.target.id}</strong><span>{new Date(row.updatedAt).toLocaleString()} · {row.operationCount} changes{row.leaseUntil > Date.now() ? ' · Active in another session' : ''}</span>
            <button onClick={() => void previewDraft(row.id).then(onOpenConflict).catch(e => setStatus(String(e)))}>Preview draft</button>
            <button onClick={() => {if (window.confirm((row.leaseUntil > Date.now() ? 'This session may still be editing. ' : '') + 'Discard this exact draft generation? Export it first if needed.')) {
                void discardDraft(row.id, row.generation).then(onChanged).then(refresh).catch(e => setStatus(String(e)));
            }}}>Discard draft</button>
        </article>)}
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous drafts</button>
        <button disabled={(page + 1) * 20 >= visible.length} onClick={() => setPage(p => p + 1)}>Next drafts</button>
        <button onClick={() => void refresh().catch(e => setStatus(String(e)))}>Refresh drafts</button><p role="status">{status}</p>
    </section>;
}
