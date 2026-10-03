import {useEffect, useRef, useState} from 'react';
import {workspaceClient as db} from './workspaceClient';
import {createBrainObject} from './brainRepository';
import {addPageFile} from './pageAssets';
import {addPageReference, applyPageCommand, createWorkspacePage, loadPageSnapshot, openWorkspacePage,
    placementPresentation, refreshProjectReferences, setPageParent, undoPageCommand, type PageSnapshot} from './pageRepository';
import type {PageCommand, PageMode} from '../../workspace/pageTypes';
import type {WorkspaceEntity} from '../../workspace/types';
import {hasUnsavedWork, type PageEditorSession} from './pageEditorSession';
import {WorkspaceConnectorControls} from './WorkspaceConnectorControls';
import {WorkspacePages} from './WorkspacePages';
import './affineWorkspace.css';

interface Props {
    boardId: string; entities: WorkspaceEntity[];
    onSelect: (id: string, placementId?: string) => void;
    onOpenPage: (boardId: string) => void;
    onAction: (id: string, action: 'source' | 'inspector' | 'graph' | 'ai') => void;
    onSession: (session?: PageEditorSession) => void;
    onHistory: () => void; onRecovery: () => void;
}
export function AffineWorkspace(props: Props) {
    const host = useRef<HTMLDivElement>(null), editor = useRef<PageEditorSession | undefined>(undefined);
    const callbacks = useRef(props); callbacks.current = props;
    const [page, setPage] = useState<PageSnapshot>(), [mode, setMode] = useState<PageMode>('document');
    const [status, setStatus] = useState('Loading workspace…'), [mountKey, setMountKey] = useState(0);
    const [noteTitle, setNoteTitle] = useState(''), [objectId, setObjectId] = useState(''), [selected, setSelected] = useState<string[]>([]);
    const [groupName, setGroupName] = useState('Group'), [targetId, setTargetId] = useState(''), [parentId, setParentId] = useState('');
    const [busy, setBusy] = useState(false), [undoToken, setUndoToken] = useState<string>();
    const upload = useRef<HTMLInputElement>(null);
    useEffect(() => {
        let cancelled = false;
        void openWorkspacePage(props.boardId).then(next => {
            if (!cancelled) {setPage(next); setMode(next.presentation.mode); setSelected([]);}
        }).catch(e => {if (!cancelled) setStatus(String(e));});
        return () => {cancelled = true;};
    }, [props.boardId]);
    useEffect(() => {
        if (!host.current || !page || page.board.id !== props.boardId) return;
        let cancelled = false; const node = host.current; let mounted: PageEditorSession | undefined;
        setStatus('Loading local editor…');
        void import('./blocksuiteWorkspaceAdapter').then(async ({mountWorkspaceEditor}) => {
            if (cancelled) return;
            mounted = await mountWorkspaceEditor(node, {snapshot: page, mode,
                onUndo: token => {if (!cancelled) setUndoToken(token);},
                onSelect: (id, placementId) => {if (placementId) setSelected([placementId]); callbacks.current.onSelect(id, placementId);},
                onOpenPage: id => callbacks.current.onOpenPage(id), onAction: (id, action) => callbacks.current.onAction(id, action),
                onStatus: message => {if (!cancelled) setStatus(message);}});
            if (cancelled) {mounted.dispose(); return;}
            editor.current = mounted; callbacks.current.onSession(mounted); setStatus('saved');
        }).catch(e => {if (!cancelled) setStatus(String(e));});
        return () => {cancelled = true; mounted?.dispose(); editor.current = undefined; callbacks.current.onSession(undefined);};
        // Snapshot changes are applied only after flush via the explicit mount generation.
    }, [page?.board.id, mode, mountKey, props.boardId]);
    useEffect(() => {
        const guard = (e: BeforeUnloadEvent) => {
            if (editor.current && hasUnsavedWork(editor.current.getStatus())) {e.preventDefault(); e.returnValue = '';}
        };
        window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
    }, []);
    const run = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try {await editor.current?.flush(); await action();} catch (e) {setStatus(String(e));} finally {setBusy(false);}
    };
    const reload = async () => {const next = await loadPageSnapshot(props.boardId); setPage(next); setMountKey(k => k + 1);};
    const command = (c: PageCommand) => run(async () => {
        const current = await loadPageSnapshot(props.boardId);
        const next = await applyPageCommand(props.boardId, current.version, c); setUndoToken(next.undoToken); setPage(next); setMountKey(k => k + 1);
    });
    const openParent = async (entityId: string) => {
        const setting = (await db.settings.where('key').startsWith('workspace-page:').toArray())
            .find(s => (s.value as {ownerEntityId?: string}).ownerEntityId === entityId);
        if (setting) callbacks.current.onOpenPage(setting.key.slice('workspace-page:'.length));
        else throw new Error('Parent page is not open yet. Open its project workspace first.');
    };
    const downloadDraft = () => {
        const url = URL.createObjectURL(new Blob([editor.current?.exportDrafts() || '{}'], {type: 'application/json'}));
        const a = document.createElement('a'); a.href = url; a.download = 'workspace-unsaved-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const chosen = page?.placements.find(p => p.id === selected[0]);
    return <section className="affineWorkspace" aria-label="AFFiNE workspace" onDragOver={e => {
        if (e.dataTransfer.types.includes('text/brain-object')) e.preventDefault();
    }} onDrop={e => {
        const id = e.dataTransfer.getData('text/brain-object');
        if (!id) return; e.preventDefault(); e.stopPropagation();
        void run(async () => {await addPageReference(props.boardId, id); await reload();});
    }}>
        <header><h2>{page?.owner.title || 'Workspace'}</h2>
            <WorkspacePages boardId={props.boardId} busy={busy} onOpen={id => void run(async () => {callbacks.current.onOpenPage(id);})} />
            {page?.parent && <button onClick={() => void run(() => openParent(page.parent!.id))}>↑ {page.parent.title}</button>}
            <div className="affineControls">{(['document', 'canvas', 'mixed'] as PageMode[]).map(value => <button key={value} disabled={busy}
                aria-pressed={mode === value} onClick={() => void run(async () => {
                    const current = await loadPageSnapshot(props.boardId);
                    const next = await applyPageCommand(props.boardId, current.version, {type: 'view', mode: value, viewport: current.presentation.viewport});
                    setPage(next); setMode(value);
                })}>{value[0]!.toUpperCase() + value.slice(1)}</button>)}
                <button onClick={() => void run(async () => {})}>Save now</button>
                <button onClick={props.onHistory}>Page history</button>
                <button onClick={() => void run(async () => {
                    const current = await loadPageSnapshot(props.boardId); if (!current.placements.length) return;
                    const minX = Math.min(...current.placements.map(p => p.x)), minY = Math.min(...current.placements.map(p => p.y));
                    const maxX = Math.max(...current.placements.map(p => p.x + p.width)), maxY = Math.max(...current.placements.map(p => p.y + p.height));
                    const zoom = Math.max(0.1, Math.min(1, 500 / (maxY - minY + 100), (host.current?.clientWidth || 600) / (maxX - minX + 100)));
                    const next = await applyPageCommand(props.boardId, current.version, {type: 'view', mode, viewport: {x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom}});
                    setPage(next); setMountKey(k => k + 1);
                })}>Fit cards</button>
                <button disabled={!undoToken || busy} onClick={() => void run(async () => {await undoPageCommand(props.boardId, undoToken!); setUndoToken(undefined); await reload();})}>Undo layout</button>
            </div>
            <p role="status">{status === 'recoverable' ? 'Recoverable draft · waiting to save' : status === 'saving-local' ? 'Saving draft locally…' : status}</p>
            {/error|conflict|failed|unavailable/i.test(status) && <div className="affineControls">
                <button onClick={props.onRecovery}>Review conflicting draft</button>
                <button onClick={() => void run(async () => {})}>Retry save</button><button onClick={downloadDraft}>Export draft</button>
                <button onClick={() => {if (window.confirm('Discard unsaved drafts and reload canonical data?')) void editor.current?.reload().then(reload).catch(e => setStatus(String(e)));}}>Discard draft and reload</button>
            </div>}
            <div className="affineControls"><label>New note title<input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /></label>
                <button disabled={busy || !noteTitle.trim()} onClick={() => void run(async () => {
                    await db.transaction('rw', [db.entities, db.tasks, db.activities, db.boards, db.settings, db.relationships, db.placements, db.workspaceRevisions], async () => {
                        const note = await createBrainObject({type: 'note', title: noteTitle}); await addPageReference(props.boardId, note.id);
                    }); setNoteTitle(current => current === noteTitle ? '' : current); await reload();
                })}>New note</button>
                <label>Existing object<select value={objectId} onChange={e => setObjectId(e.target.value)}><option value="">Choose an object</option>
                    {props.entities.map(e => <option key={e.id} value={e.id}>{e.title} · {e.type}</option>)}</select></label>
                <button disabled={!objectId || busy} onClick={() => void run(async () => {await addPageReference(props.boardId, objectId); await reload();})}>Add existing object</button>
                <button onClick={() => upload.current?.click()}>Upload file</button><input hidden type="file" ref={upload} onChange={e => {
                    const file = e.target.files?.[0]; if (file) void run(async () => {await addPageFile(props.boardId, file); await reload();}); e.target.value = '';
                }} />
            </div>
            <details><summary>Pages and layout controls</summary>
                <div className="affineControls"><button onClick={() => void run(async () => {
                    const title = window.prompt('Child page title'); if (!title || !page) return;
                    const child = await createWorkspacePage(title, page.owner.id); callbacks.current.onOpenPage(child.board.id);
                })}>New child page</button>
                    {page?.children.map(child => <button key={child.id} onClick={() => void run(() => openParent(child.id))}>{child.title}</button>)}
                    <label>Parent page<select value={parentId} onChange={e => setParentId(e.target.value)}><option value="">No parent</option>
                        {props.entities.filter(e => e.id !== page?.owner.id && (e.type === 'project' || e.metadata?.workspacePage)).map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
                    <button onClick={() => void run(async () => {if (page) await setPageParent(page.owner.id, parentId || undefined); await reload();})}>Move page</button>
                    {page?.owner.type === 'project' && <button onClick={() => void run(async () => {await refreshProjectReferences(props.boardId); await reload();})}>Add missing project members</button>}
                </div>
                <div className="affineControls"><label>Selected cards<select aria-label="Selected cards" multiple value={selected} onChange={e => setSelected([...e.target.selectedOptions].map(o => o.value))}>
                    {page?.placements.map(p => <option key={p.id} value={p.id}>{page.entities.find(e => e.id === p.entityId)?.title || 'Missing object'}</option>)}</select></label>
                    <label>Group label<input value={groupName} onChange={e => setGroupName(e.target.value)} /></label>
                    <button disabled={!selected.length} onClick={() => void command({type: 'group', group: {id: crypto.randomUUID(), label: groupName, collapsed: false}, placementIds: selected})}>Group cards</button>
                    {page?.presentation.groups.map(g => <span key={g.id}>{g.label}<button onClick={() => void command({type: 'ungroup', groupId: g.id})}>Ungroup {g.label}</button>
                        <button onClick={() => void command({type: 'collapse', groupId: g.id, collapsed: !g.collapsed})}>{g.collapsed ? 'Expand' : 'Collapse'} {g.label}</button></span>)}
                    <label>Card color<select disabled={!selected.length} defaultValue="default" onChange={e => void command({type: 'style', placementIds: selected, color: e.target.value as 'default'})}>
                        {['default', 'blue', 'green', 'yellow', 'purple'].map(c => <option key={c}>{c}</option>)}</select></label>
                    <button disabled={!chosen} onClick={() => chosen && void command({type: 'collapse', placementId: chosen.id, collapsed: !placementPresentation(chosen).collapsed})}>Toggle collapsed</button>
                    <button disabled={!selected.length} onClick={() => void command({type: 'remove-reference', placementIds: selected})}>Remove references</button>
                </div>
                {chosen && <form className="affineControls" key={chosen.id + mountKey} onSubmit={e => {
                    e.preventDefault(); const form = new FormData(e.currentTarget);
                    void command({type: 'move-resize', placements: [{id: chosen.id, x: Number(form.get('x')), y: Number(form.get('y')), width: Number(form.get('width')), height: Number(form.get('height'))}]});
                }}>{(['x', 'y', 'width', 'height'] as const).map(name => <label key={name}>{name}<input type="number" name={name} defaultValue={chosen[name]} /></label>)}<button>Apply geometry</button>
                    <button type="button" onClick={() => void command({type: 'reorder', placementIds: [chosen.id, ...page!.placements.filter(p => p.id !== chosen.id).sort((a, b) => placementPresentation(a).order - placementPresentation(b).order).map(p => p.id)]})}>Move section first</button>
                </form>}
                <div className="affineControls"><label>Connect to<select value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Choose a card</option>
                    {page?.placements.filter(p => p.id !== chosen?.id).map(p => <option key={p.id} value={p.id}>{page.entities.find(e => e.id === p.entityId)?.title}</option>)}</select></label>
                    <button disabled={!chosen || !targetId} onClick={() => chosen && void command({type: 'connect', fromPlacementId: chosen.id, toPlacementId: targetId, relationType: 'related'})}>Connect cards</button>
                </div>
                {page?.presentation.connectors.map(c => <WorkspaceConnectorControls key={c.id} connector={c} busy={busy} onCommand={command}
                    label={(page.entities.find(e => e.id === page.placements.find(p => p.id === c.fromPlacementId)?.entityId)?.title || 'Missing object') + ' → ' +
                        (page.entities.find(e => e.id === page.placements.find(p => p.id === c.toPlacementId)?.entityId)?.title || 'Missing object')} />)}
            </details>
        </header>
        <div ref={host} className={'affineNativeHost ' + mode} />
    </section>;
}
