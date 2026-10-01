import {useEffect, useState} from 'react';
import {deleteHistory, listHistory, readRevision} from './revisionRepository';
import {readRecoveryTarget, restoreRevision} from './revisionRestore';
import type {HistoryCursor, HistoryPage, RevisionRecord, Target, TargetVersion} from '../../workspace/recoveryTypes';
import {downloadRecovery, SnapshotView} from './recoveryUi';
export function HistoryPanel({target, onRestored}: {target: Target; onRestored: () => void | Promise<void>}) {
    const [page, setPage] = useState<HistoryPage>({items: []}), [preview, setPreview] = useState<RevisionRecord>();
    const [expected, setExpected] = useState<TargetVersion>(), [status, setStatus] = useState(''), [busy, setBusy] = useState(false);
    const refresh = async (cursor?: HistoryCursor) => {setPage(await listHistory(target, cursor));};
    useEffect(() => {void refresh().catch(e => setStatus(String(e)));}, [target.kind, target.id]);
    const run = async (action: () => Promise<void>) => {setBusy(true); try {await action();} catch (e) {setStatus(String(e));} finally {setBusy(false);}};
    return <section aria-label="Version history"><h2>Version history</h2>
        <p>Local history retains up to 50 revisions or 5 MiB per object, and 50 MiB in total. Older revisions are pruned. History may contain removed or private text; ordinary backups exclude it.</p>
        {!page.items.length && <p>No retained revisions.</p>}
        {page.items.map(row => <article className="recoveryRow" key={row.id}><span>{new Date(row.createdAt).toLocaleString()} · {row.reason}</span>
            <button disabled={busy} onClick={() => void run(async () => {
                const record = await readRevision(row.id); if (!record) throw new Error('Revision no longer exists.');
                setPreview(record); setExpected(undefined);
                const current = await readRecoveryTarget(target); setExpected(current.version); setStatus('');
            })}>Preview revision</button></article>)}
        <button disabled={busy} onClick={() => void run(() => refresh())}>Latest revisions</button>
        <button disabled={busy || !page.next} onClick={() => void run(() => refresh(page.next))}>Older revisions</button>
        <button disabled={busy || !page.items.length} onClick={() => {if (window.confirm('Permanently delete retained history for this object? Current content and drafts are unchanged.')) void run(async () => {
            await deleteHistory(target); setPreview(undefined); await refresh(); setStatus('History deleted.');
        });}}>Delete object history</button>
        {preview && <article><h3>Revision preview</h3><SnapshotView snapshot={preview.snapshot} />
            <button onClick={() => downloadRecovery(preview, 'workspace-revision.json')}>Export revision</button>
            <button disabled={busy || !expected} onClick={() => {if (expected && window.confirm('Restore this revision? A new history entry will be created; shared objects and relationships will not be recreated.')) void run(async () => {
                await restoreRevision(preview.id, expected); await onRestored(); setPreview(undefined); await refresh(); setStatus('Restored as a new revision.');
            });}}>Restore revision</button></article>}
        <p role="status">{status}</p>
    </section>;
}
