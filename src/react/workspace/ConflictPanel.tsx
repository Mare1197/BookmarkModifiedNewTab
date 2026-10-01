import {useEffect, useMemo, useRef, useState} from 'react';
import {chooseBlocks, diffContent} from './recoveryDiff';
import {resolveDraft} from './recoveryPreview';
import type {ContentSnapshot, DraftPreview, Resolution} from '../../workspace/recoveryTypes';
import {downloadRecovery, SnapshotView} from './recoveryUi';
function ManualEditor({initial, onChange, onError}: {initial: ContentSnapshot; onChange: (snapshot: ContentSnapshot) => void; onError: (error: string) => void}) {
    const host = useRef<HTMLDivElement>(null), callbacks = useRef({onChange, onError}); callbacks.current = {onChange, onError};
    useEffect(() => {let stopped = false, dispose: (() => void) | undefined;
        void import('./blocksuiteRichText').then(({mountManualRichText}) => {if (!stopped && host.current) dispose = mountManualRichText(host.current, initial.content,
            content => callbacks.current.onChange({...initial, content}), error => callbacks.current.onError(String(error)));}).catch(e => callbacks.current.onError(String(e)));
        return () => {stopped = true; dispose?.();};
    }, [initial]);
    return <div ref={host} aria-label="Manual rich text result" />;
}
export function ConflictPanel({preview, onClose, onResolved}: {preview: DraftPreview; onClose: () => void; onResolved: () => void | Promise<void>}) {
    const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [manual, setManual] = useState<ContentSnapshot>();
    const [stale, setStale] = useState(false);
    const [initial, setInitial] = useState<ContentSnapshot>(), [title, setTitle] = useState(preview.proposed?.kind === 'entity' ? preview.proposed.title : '');
    const [choices, setChoices] = useState<Record<string, 'current' | 'draft' | 'omit'>>({});
    const current = preview.current?.kind === 'entity' ? preview.current : undefined, draft = preview.proposed?.kind === 'entity' ? preview.proposed : undefined;
    const differences = useMemo(() => current && draft ? diffContent(current, draft) : [], [current, draft]);
    const resolve = async (decision: Resolution) => {
        if (preview.activeElsewhere && !window.confirm('This draft belongs to a session that may still be editing. Apply or discard only the reviewed generation?')) return;
        setBusy(true); try {await resolveDraft(preview, decision); await onResolved();} catch (e) {setStatus(String(e) + ' Return to recovery and preview again before applying.'); setStale(true);} finally {setBusy(false);}
    };
    return <section aria-label="Conflict comparison"><h2>Review draft</h2><p>Compare before deciding. Nothing is changed until you choose an action.</p>
        {preview.activeElsewhere && <p>Active in another session. Newer changes will not be overwritten.</p>}
        <div className="recoveryColumns">{[['Base', preview.record.base], ['Current saved', preview.current], ['Your draft', preview.proposed]].map(([label, snapshot]) =>
            <article key={String(label)}><h3>{String(label)}</h3><SnapshotView snapshot={snapshot as DraftPreview['current']} /></article>)}</div>
        {preview.record.target.kind === 'page' && <details><summary>Pending page commands</summary><pre>{JSON.stringify(preview.record.operations, null, 2)}</pre></details>}
        {preview.blockers.map((blocker, i) => <p key={i} role="status">{blocker}</p>)}
        {current && draft && <details><summary>Combine manually</summary><label>Result title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
            <button onClick={() => setTitle(current.title)}>Use current title</button><button onClick={() => setTitle(draft.title)}>Use draft title</button>
            {differences.map(block => <article className="recoveryBlock" key={block.id}><small>{block.id}{block.formattingChanged ? ' · Formatting changed' : ''}</small>
                <p>{block.text.map((part, i) => <span className={'diff-' + part.kind} key={i}>{part.text}</span>)}</p>
                <label>Block choice<select value={choices[block.id] ?? (block.after ? 'draft' : 'current')} onChange={e => setChoices({...choices, [block.id]: e.target.value as 'current' | 'draft' | 'omit'})}>
                    {block.before && <option value="current">Current saved</option>}{block.after && <option value="draft">Your draft</option>}<option value="omit">Omit block</option>
                </select></label></article>)}
            <button onClick={() => {try {const result = chooseBlocks(current, draft, differences.flatMap(block => {
                const from = choices[block.id] ?? (block.after ? 'draft' : 'current'); return from === 'omit' ? [] : [{id: block.id, from}];
            }), title); setInitial(result); setManual(result);} catch (e) {setStatus(String(e));}}}>Edit combined result</button>
            {initial && <ManualEditor initial={initial} onChange={setManual} onError={setStatus} />}
            <button disabled={stale || busy || !manual || Boolean(preview.blockers.length)} onClick={() => manual && void resolve({kind: 'manual', snapshot: {...manual, title}})}>Save combined result</button>
        </details>}
        <div className="recoveryActions"><button disabled={stale || busy} onClick={() => void resolve({kind: 'keep-current'})}>Keep current</button>
            <button disabled={stale || busy || Boolean(preview.blockers.length)} onClick={() => void resolve({kind: 'use-draft'})}>Use draft</button>
            <button onClick={() => downloadRecovery(preview.record, 'workspace-draft.json')}>Export draft</button><button disabled={busy} onClick={onClose}>Back to recovery</button></div>
        <p role="status">{busy ? 'Applying reviewed changes…' : status}</p>
    </section>;
}
