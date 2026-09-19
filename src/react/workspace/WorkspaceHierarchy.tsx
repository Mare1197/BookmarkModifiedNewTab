import {useRef, useState} from 'react';
import type {DragEvent, ReactNode} from 'react';
import type {FolderMembership, WorkspaceEntity, WorkspaceFolder} from '../../workspace/types';
import {createWorkspaceFolder, moveHierarchyItem, undoHierarchyMove, type HierarchyItem} from './hierarchyRepository';

interface Props {
    folders: WorkspaceFolder[];
    memberships: FolderMembership[];
    entities: WorkspaceEntity[];
    selectedEntityId?: string;
    onSelectEntity: (id: string) => void;
    onRefresh: () => Promise<void>;
}

export function WorkspaceHierarchy({folders, memberships, entities, selectedEntityId, onSelectEntity, onRefresh}: Props) {
    const [picked, setPicked] = useState<HierarchyItem & {selectionId?: string}>();
    const [lastSelectionId, setLastSelectionId] = useState(selectedEntityId);
    if (lastSelectionId !== selectedEntityId) {
        setLastSelectionId(selectedEntityId);
        if (picked?.selectionId !== selectedEntityId) setPicked(undefined);
    }
    const [targetId, setTargetId] = useState('');
    const [name, setName] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const actionPending = useRef(false);
    // Accept only drags that originated in this workspace component.
    const dragging = useRef<HierarchyItem | undefined>(undefined);
    const activePicked = picked?.selectionId === selectedEntityId ? picked : undefined;
    const selection = activePicked || (selectedEntityId ? {kind: 'entity' as const, id: selectedEntityId} : undefined);
    const entityMap = new Map(entities.map(entity => [entity.id, entity]));
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
    const renderFolder = (folder: WorkspaceFolder, ancestors: Set<string>): ReactNode => {
        if (ancestors.has(folder.id)) return null;
        const next = new Set(ancestors).add(folder.id);
        const writable = folder.sourceKind === 'workspace';
        return <li key={folder.id}>
            <details open>
                <summary onDragOver={event => { if (writable && dragging.current) event.preventDefault(); }}
                    onDrop={event => { if (writable) drop(event, folder.id); }}>
                    {folder.title} <small>{writable ? 'Workspace' : 'Native · read-only'}</small>
                </summary>
                {writable && <button type="button" draggable={!busy}
                    onDragStart={event => start(event, {kind: 'folder', id: folder.id})}
                    onDragEnd={() => { dragging.current = undefined; }}
                    aria-pressed={activePicked?.kind === 'folder' && activePicked.id === folder.id}
                    onClick={() => setPicked({kind: 'folder', id: folder.id, selectionId: selectedEntityId})}>Move folder {folder.title}</button>}
                <ul>
                    {memberships.filter(member => member.folderId === folder.id)
                        .sort((left, right) => left.position - right.position).map(member => {
                            const entity = entityMap.get(member.entityId);
                            if (!entity) return null;
                            const item: HierarchyItem = {kind: 'entity', id: entity.id, sourceFolderId: folder.id};
                            return <li key={member.id}><button type="button"
                                draggable={writable && member.sourceKind === 'user' && !busy}
                                onDragStart={event => start(event, item)}
                                onDragEnd={() => { dragging.current = undefined; }}
                                onClick={() => { setPicked({...item, selectionId: entity.id}); onSelectEntity(entity.id); }}>
                                {entity.title}
                            </button></li>;
                        })}
                    {folders.filter(child => child.parentId === folder.id).map(child => renderFolder(child, next))}
                </ul>
            </details>
        </li>;
    };
    const selectedTitle = selection?.kind === 'folder' ? folders.find(folder => folder.id === selection.id)?.title :
        entityMap.get(selection?.id || '')?.title;
    return <section className="workspaceHierarchy" aria-label="Folder organization">
        <h2>Folders</h2>
        <p>Drag a folder or member onto a workspace folder, or use the controls below. Native bookmarks stay unchanged.</p>
        <ul>{folders.filter(folder => !folder.parentId || !folders.some(parent => parent.id === folder.parentId))
            .map(folder => renderFolder(folder, new Set()))}</ul>
        {!folders.length && <p>No folders yet.</p>}
        <div className="workspaceHierarchy__root" onDragOver={event => { if (dragging.current) event.preventDefault(); }}
            onDrop={event => drop(event)}>Workspace root / remove this folder membership</div>
        <label>Destination folder<select value={targetId} onChange={event => setTargetId(event.target.value)}>
            <option value="">Workspace root</option>
            {folders.filter(folder => folder.sourceKind === 'workspace').map(folder =>
                <option key={folder.id} value={folder.id}>{folder.title}</option>)}
        </select></label>
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
            void action(async () => { await createWorkspaceFolder(name, targetId || undefined); setName(''); }, 'Folder created.');
        }}>
            <label>New folder name<input value={name} onChange={event => setName(event.target.value)} /></label>
            <button type="submit" disabled={busy || !name.trim()}>Create folder</button>
        </form>
        <p role="status">{status}</p>
    </section>;
}
