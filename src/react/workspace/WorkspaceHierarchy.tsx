import {useRef, useState} from 'react';
import type {DragEvent} from 'react';
import type {WorkspaceFolder} from '../../workspace/types';
import {loadFolderMembers} from './workspaceReads';
import {useWorkspaceQuery} from './useWorkspaceQuery';
import type {FolderCursor} from './workspaceReadModels';
import {workspaceClient as db} from './workspaceClient';
import {createWorkspaceFolder, moveHierarchyItem, undoHierarchyMove, type HierarchyItem} from './hierarchyRepository';
import {flattenHierarchyRows} from './hierarchyRows';
import {WindowedObjectList} from './WindowedObjectList';

interface Props {
    folders: WorkspaceFolder[];
    selectedEntityId?: string;
    onSelectEntity: (id: string) => void;
    onRefresh: () => Promise<void>;
}

export function WorkspaceHierarchy({folders, selectedEntityId, onSelectEntity, onRefresh}: Props) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [cursors, setCursors] = useState<Record<string, Array<FolderCursor | undefined>>>({});
    const [revealId, setRevealId] = useState<string>();
    const openIds = flattenHierarchyRows(folders, expanded, {}).filter(row => row.kind === 'folder' && expanded[row.folder.id]).map(row => row.folder.id);
    const requests = openIds.map(id => ({id, cursor: cursors[id]?.at(-1)}));
    const pages = useWorkspaceQuery('hierarchy:' + JSON.stringify(requests), async () => Object.fromEntries(
        await Promise.all(requests.map(async ({id, cursor}) => [id, await loadFolderMembers(id, cursor)] as const))));
    const rows = flattenHierarchyRows(folders, expanded, pages.data || {},
        Object.fromEntries(Object.entries(cursors).map(([id, stack]) => [id, stack.length > 1])));
    const selected = useWorkspaceQuery('hierarchy-selection:' + selectedEntityId,
        async () => selectedEntityId ? db.entities.get(selectedEntityId) : undefined);
    const [picked, setPicked] = useState<HierarchyItem & {selectionId?: string}>();
    const [lastSelectionId, setLastSelectionId] = useState(selectedEntityId);
    if (lastSelectionId !== selectedEntityId) {
        setLastSelectionId(selectedEntityId);
        if (picked?.selectionId !== selectedEntityId) setPicked(undefined);
    }
    const [targetId, setTargetId] = useState('');
    const [targetSearch, setTargetSearch] = useState(''), [targetPage, setTargetPage] = useState(0);
    const targets = folders.filter(folder => folder.sourceKind === 'workspace' && folder.title.toLocaleLowerCase().includes(targetSearch.toLocaleLowerCase()));
    const targetIndex = Math.min(targetPage, Math.max(0, Math.ceil(targets.length / 50) - 1));
    const visibleTargets = targets.slice(targetIndex * 50, (targetIndex + 1) * 50);
    const currentTarget = folders.find(folder => folder.id === targetId);
    const [name, setName] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const actionPending = useRef(false);
    // Accept only drags that originated in this workspace component.
    const dragging = useRef<HierarchyItem | undefined>(undefined);
    const activePicked = picked?.selectionId === selectedEntityId ? picked : undefined;
    const selection = activePicked || (selectedEntityId ? {kind: 'entity' as const, id: selectedEntityId} : undefined);
    const action = async (callback: () => Promise<void>, message: string) => {
        if (actionPending.current) return;
        actionPending.current = true;
        setBusy(true);
        try {
            await callback();
            setPicked(undefined);
            await onRefresh();
            setStatus(message);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Folder action failed.');
        } finally {
            actionPending.current = false;
            setBusy(false);
        }
    };
    const start = (event: DragEvent, item: HierarchyItem) => {
        event.stopPropagation();
        dragging.current = item;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'Workspace object');
    };
    const drop = (event: DragEvent, folderId?: string) => {
        event.preventDefault();
        event.stopPropagation();
        const item = dragging.current;
        dragging.current = undefined;
        if (item) void action(() => moveHierarchyItem(item, folderId), 'Moved. Undo move is available.');
    };
    const selectedTitle = selection?.kind === 'folder' ? folders.find(folder => folder.id === selection.id)?.title :
        selected.data?.title;
    return <section className="workspaceHierarchy" aria-label="Folder organization">
        <h2>Folders</h2>
        <p>Drag a folder or member onto a workspace folder, or use the controls below. Native bookmarks stay unchanged.</p>
        <WindowedObjectList items={rows} listKey="hierarchy" label="Folder tree" selectedId={revealId} render={row => {
            const folder = row.folder, writable = folder.sourceKind === 'workspace';
            const stack = cursors[folder.id] || [undefined], page = pages.data?.[folder.id];
            return <div className="workspaceHierarchy__row" style={{paddingLeft: Math.min(row.depth, 10) * 12}}>
                {row.kind === 'folder' && <button type="button" role="treeitem" aria-level={row.depth + 1}
                    aria-expanded={Boolean(expanded[folder.id])} aria-label={folder.title + (writable ? ' Workspace' : ' Native read-only')}
                    onClick={() => setExpanded(prior => ({...prior, [folder.id]: !prior[folder.id]}))}
                    onDragOver={event => {if (writable && dragging.current) event.preventDefault();}}
                    onDrop={event => {if (writable) drop(event, folder.id);}}>
                    {expanded[folder.id] ? '▾ ' : '▸ '}{folder.title}{!writable && ' · read-only'}</button>}
                {row.kind === 'move' && <button type="button" draggable={!busy}
                    onDragStart={event => start(event, {kind: 'folder', id: folder.id})}
                    onDragEnd={() => {dragging.current = undefined;}}
                    aria-pressed={activePicked?.kind === 'folder' && activePicked.id === folder.id}
                    onClick={() => setPicked({kind: 'folder', id: folder.id, selectionId: selectedEntityId})}>Move folder {folder.title}</button>}
                {row.kind === 'member' && <button type="button" role="treeitem" aria-level={row.depth + 1}
                    aria-selected={row.entity.id === selectedEntityId} draggable={writable && row.member.sourceKind === 'user' && !busy}
                    onDragStart={event => start(event, {kind: 'entity', id: row.entity.id, sourceFolderId: folder.id})}
                    onDragEnd={() => {dragging.current = undefined;}}
                    onClick={() => {setPicked({kind: 'entity', id: row.entity.id, sourceFolderId: folder.id, selectionId: row.entity.id}); onSelectEntity(row.entity.id);}}>
                    {row.entity.title}</button>}
                {row.kind === 'pager' && <>
                    {stack.length > 1 && <button onClick={() => setCursors(prior => ({...prior, [folder.id]: stack.slice(0, -1)}))}>Previous members</button>}
                    {page?.nextCursor && <button onClick={() => setCursors(prior => ({...prior, [folder.id]: [...stack, page.nextCursor]}))}>Next members</button>}
                    {!page && <span>{pages.loading ? 'Loading members…' : 'No members loaded'}</span>}
                </>}
            </div>;
        }} />
        {pages.loading && <p aria-live="polite">Loading folder members…</p>}
        {pages.error && <p role="alert">{pages.error.message} <button onClick={pages.retry}>Retry members</button></p>}
        {!folders.length && <p>No folders yet.</p>}
        <div className="workspaceHierarchy__root" onDragOver={event => { if (dragging.current) event.preventDefault(); }}
            onDrop={event => drop(event)}>Workspace root / remove this folder membership</div>
        <label>Search destination folders<input value={targetSearch} onChange={event => {setTargetSearch(event.target.value); setTargetPage(0);}} /></label>
        <label>Destination folder<select value={targetId} onChange={event => setTargetId(event.target.value)}>
            <option value="">Workspace root</option>
            {currentTarget && !visibleTargets.some(folder => folder.id === targetId) && <option value={targetId}>{currentTarget.title}</option>}
            {visibleTargets.map(folder =>
                <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select></label>
        {targets.length > 50 && <nav aria-label="Destination folder pages">
            <button disabled={targetIndex === 0} onClick={() => setTargetPage(targetIndex - 1)}>Previous folders</button>
            <span>Page {targetIndex + 1} · {targets.length} matches</span>
            <button disabled={(targetIndex + 1) * 50 >= targets.length} onClick={() => setTargetPage(targetIndex + 1)}>Next folders</button>
        </nav>}
        <p>Selected: {selectedTitle || 'Select an object or folder'}</p>
        {selection && <button type="button" draggable={!busy}
            onDragStart={event => start(event, selection)}
            onDragEnd={() => { dragging.current = undefined; }}>Drag selected item</button>}
        <button type="button" disabled={busy || !selection} onClick={() => {
            if (selection) void action(() => moveHierarchyItem(selection, targetId || undefined), 'Moved. Undo move is available.');
        }}>Move selected</button>
        {activePicked && <button type="button" onClick={() => setPicked(undefined)}>Use selected object</button>}
        <button type="button" disabled={busy} onClick={() => void action(undoHierarchyMove, 'Move undone.')}>Undo move</button>
        <form onSubmit={event => {
            event.preventDefault();
            void action(async () => {
                const folderId = await createWorkspaceFolder(name, targetId || undefined);
                setExpanded(prior => ({...prior, [folderId]: true, ...(targetId ? {[targetId]: true} : {})}));
                setRevealId('folder:' + folderId);
                setName('');
            }, 'Folder created.');
        }}>
            <label>New folder name<input value={name} onChange={event => setName(event.target.value)} /></label>
            <button type="submit" disabled={busy || !name.trim()}>Create folder</button>
        </form>
        <p role="status">{status}</p>
    </section>;
}
