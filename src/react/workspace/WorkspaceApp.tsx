import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {liveQuery} from 'dexie';
import {workspaceClient} from './workspaceClient';
import type {AssetRecord} from '../../workspace/types';
import {addPageFile, isSafeRaster} from './pageAssets';
import {
    addEdge,
    Background,
    BackgroundVariant,
    Controls,
    ReactFlow,
    ReactFlowProvider,
    applyEdgeChanges,
    applyNodeChanges,
    type Connection,
    type Edge,
    type EdgeChange,
    type Node,
    type NodeChange
} from '@xyflow/react';

import {WorkspaceExplorer} from './WorkspaceExplorer';
import {BrainWorkspace, type BrainMode} from './BrainWorkspace';
import {BrainObjectTools} from './BrainObjectTools';
import {AffineWorkspace} from './AffineWorkspace';
import type {PageEditorSession} from './pageEditorSession';
import {addPageReference, openProjectWorkspace, openWorkspacePage} from './pageRepository';
import {openBrainCanvas} from './brainRepository';
import {graphProjection} from './brainSelectors';
import './brain.css';
import {WorkspaceInspector} from './WorkspaceInspector';
import {WorkspaceNode, type WorkspaceNodeData} from './WorkspaceNode';
import {WorkspaceQuickAdd, type WorkspaceCommand} from './WorkspaceQuickAdd';
import {
    ActivityView,
    InboxView,
    SessionsView,
    SmartSearchView,
    TasksView,
    TemplatesView
} from './WorkspaceWorkflows';
import {AnalysisView, SettingsView} from './WorkspaceUtilities';
import {
    addCurrentTab,
    addNote,
    autoLayoutBoard,
    captureWindowSession,
    createBoard,
    createRelationship,
    deleteBoard,
    deleteRelationship,
    duplicateBoard,
    duplicatePlacements,
    loadWorkspace,
    removePlacements,
    renameBoard,
    setInboxState,
    updateTask,
    updateEntity,
    updatePlacement,
    type WorkspaceSnapshot
} from './workspaceRepository';

type WorkspaceView = 'editor' | 'brain' | 'activity' | 'analysis' | 'assets' | 'canvas' | 'graph' | 'inbox' |
    'mindmap' | 'search' | 'sessions' | 'settings' | 'tasks' | 'templates';
type FlowNode = Node<WorkspaceNodeData, 'workspace'>;

const nodeTypes = {workspace: WorkspaceNode};
const emptySnapshot: WorkspaceSnapshot = {
    activities: [],
    assets: [],
    boardTemplates: [],
    boards: [],
    entities: [],
    folderMemberships: [],
    folders: [],
    placements: [],
    boardMemberships: [],
    relationships: [],
    savedFilters: [],
    tasks: [],
    workspaceSessions: []
};

interface WorkspaceAppProps {
    onClose: () => void;
}

function useAssetUrls(snapshot: WorkspaceSnapshot): Map<string, string> {
    const [urls, setUrls] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        const urls = new Map<string, string>();
        let cancelled = false;
        void Promise.all(snapshot.assets.map(async asset => {
            if (await isSafeRaster(asset) && !cancelled) urls.set(asset.entityId, URL.createObjectURL(asset.blob));
        })).then(() => {
            if (!cancelled) setUrls(new Map(urls));
        });
        return () => {
            cancelled = true;
            urls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [snapshot.assets]);
    return urls;
}

function nodesFromSnapshot(snapshot: WorkspaceSnapshot, assetUrls: Map<string, string>): FlowNode[] {
    const entityMap = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    return snapshot.placements.flatMap(placement => {
        const entity = entityMap.get(placement.entityId);
        if (!entity) {
            return [];
        }
        return [{
            id: placement.id,
            type: 'workspace',
            position: {x: placement.x, y: placement.y},
            data: {entity, assetUrl: assetUrls.get(entity.id)},
            style: {width: placement.width, height: placement.height},
            zIndex: placement.zIndex,
            ariaLabel: entity.title
        } satisfies FlowNode];
    });
}

function edgesFromSnapshot(snapshot: WorkspaceSnapshot): Edge[] {
    const firstPlacementByEntity = new Map<string, string>();
    snapshot.placements.forEach(placement => {
        if (!firstPlacementByEntity.has(placement.entityId)) {
            firstPlacementByEntity.set(placement.entityId, placement.id);
        }
    });
    return snapshot.relationships.filter(relationship => relationship.confirmed).flatMap(relationship => {
        const source = firstPlacementByEntity.get(relationship.fromEntityId);
        const target = firstPlacementByEntity.get(relationship.toEntityId);
        if (!source || !target) {
            return [];
        }
        return [{
            id: relationship.id,
            source,
            target,
            label: relationship.label || relationship.type,
            type: 'smoothstep',
            style: {stroke: relationship.origin === 'ai-suggested' ? '#9a6dd7' : '#327bf2'},
            ariaLabel: (relationship.label || relationship.type) + ' relationship'
        }];
    });
}

function layoutGraph(nodes: FlowNode[], mode: 'graph' | 'mindmap'): FlowNode[] {
    if (mode === 'graph') {
        return nodes.map((node, index) => ({
            ...node,
            draggable: false,
            data: {...node.data, allowResize: false},
            position: {
                x: 90 + (index % 3) * 310,
                y: 80 + Math.floor(index / 3) * 220
            }
        }));
    }
    const centerX = 470;
    const centerY = 260;
    return nodes.map((node, index) => {
        if (index === 0) {
            return {
                ...node,
                draggable: false,
                data: {...node.data, allowResize: false},
                position: {x: centerX, y: centerY}
            };
        }
        const angle = (Math.PI * 2 * (index - 1)) / Math.max(nodes.length - 1, 1);
        return {
            ...node,
            draggable: false,
            data: {...node.data, allowResize: false},
            position: {x: centerX + Math.cos(angle) * 360, y: centerY + Math.sin(angle) * 220}
        };
    });
}

function WorkspaceFlow({
    activeBoardId,
    refresh,
    snapshot,
    view,
    visibleEntityIds,
    onSelect
}: {
    activeBoardId: string;
    refresh: () => Promise<void>;
    snapshot: WorkspaceSnapshot;
    view: 'canvas' | 'graph' | 'mindmap';
    visibleEntityIds?: Set<string>;
    onSelect: (entityId?: string, placementId?: string) => void;
}) {
    const assetUrls = useAssetUrls(snapshot);
    const flowSnapshot = useMemo(() => view === 'graph' ?
        {...snapshot, ...graphProjection(snapshot.entities, snapshot.relationships, {entityIds: visibleEntityIds})} : snapshot, [snapshot, view, visibleEntityIds]);
    const sourceNodes = useMemo(() => nodesFromSnapshot(flowSnapshot, assetUrls)
        .filter(node => !visibleEntityIds || visibleEntityIds.has(node.data.entity.id)),
    [assetUrls, flowSnapshot, visibleEntityIds]);
    const sourceEdges = useMemo(() => {
        const visibleNodeIds = new Set(sourceNodes.map(node => node.id));
        return edgesFromSnapshot(flowSnapshot).filter(edge =>
            visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
    }, [flowSnapshot, sourceNodes]);
    const [nodes, setNodes] = useState<FlowNode[]>(sourceNodes);
    const [edges, setEdges] = useState<Edge[]>(sourceEdges);
    useEffect(() => {
        setNodes(view === 'canvas' ? sourceNodes : layoutGraph(sourceNodes, view));
        setEdges(sourceEdges);
    }, [sourceEdges, sourceNodes, view]);

    const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
        setNodes(current => applyNodeChanges(changes, current));
    }, []);
    const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
        setEdges(current => applyEdgeChanges(changes, current));
        changes.filter(change => change.type === 'remove').forEach(change => {
            void deleteRelationship(change.id).then(refresh);
        });
    }, [refresh]);
    const onConnect = useCallback(async (connection: Connection) => {
        if (view !== 'canvas') {
            return;
        }
        const from = snapshot.placements.find(placement => placement.id === connection.source);
        const to = snapshot.placements.find(placement => placement.id === connection.target);
        if (!from || !to) {
            return;
        }
        const relationship = await createRelationship(from.entityId, to.entityId);
        setEdges(current => addEdge({...connection, id: relationship.id, label: relationship.label}, current));
        await refresh();
    }, [refresh, snapshot.placements, view]);

    if (nodes.length === 0) {
        return (
            <div className="workspaceEmpty">
                <h2>This board is empty</h2>
                <p>Add the current tab, a note, or an image to begin.</p>
            </div>
        );
    }

    return (
        <ReactFlow
            aria-label={view === 'canvas' ? 'Board canvas' : view === 'mindmap' ? 'Mind map' : 'Relationship graph'}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_event, node) => onSelect((node.data as WorkspaceNodeData).entity.id, view === 'canvas' ? node.id : undefined)}
            onPaneClick={() => onSelect()}
            onNodeDragStop={(_event, node) => {
                if (view === 'canvas') {
                    void updatePlacement(node.id, {x: node.position.x, y: node.position.y});
                }
            }}
            onNodesDelete={deleted => {
                if (view === 'canvas') {
                    void removePlacements(deleted.map(node => node.id)).then(refresh);
                }
            }}
            fitView
            minZoom={0.25}
            maxZoom={2}
            nodesDraggable={view === 'canvas'}
            nodesConnectable={view === 'canvas'}
            deleteKeyCode={null}
            multiSelectionKeyCode={['Control', 'Meta']}
        >
            <Background variant={BackgroundVariant.Dots} color="#c8cdd4" gap={18} size={1} />
            <Controls showInteractive={false} />
            <div className="workspaceCanvas__boardLabel">{activeBoardId ? '' : 'Board'}</div>
        </ReactFlow>
    );
}

function AssetsView({
    activeBoardId,
    refresh,
    snapshot,
    onOpenWorkspace
}: {
    activeBoardId: string;
    refresh: () => Promise<void>;
    snapshot: WorkspaceSnapshot;
    onOpenWorkspace: (entityId: string) => void;
}) {
    const [page, setPage] = useState(0);
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [total, setTotal] = useState(0);
    useEffect(() => {
        const subscription = liveQuery(async () => ({assets: await workspaceClient.assets.offset(page * 24).limit(24).toArray(),
            total: await workspaceClient.assets.count()})).subscribe({next: result => {
            setAssets(result.assets); setTotal(result.total);
        }, error: error => setStatus(String(error))});
        return () => subscription.unsubscribe();
    }, [page]);
    const urls = useAssetUrls({...snapshot, assets});
    const uploadRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState('');
    const runAssetAction = async (action: () => Promise<void>, message: string) => {
        try {
            setStatus('');
            await action();
            await refresh();
            setStatus(message);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Asset action failed.');
        }
    };
    return (
        <section className="workspaceAssets" aria-label="Local assets">
            <header>
                <div>
                    <h2>Assets</h2>
                    <p>Original files stay in this browser profile.</p>
                </div>
                <button
                    type="button"
                    className="primaryButton"
                    onClick={() => uploadRef.current?.click()}
                >
                    Upload file
                </button>
                <input
                    ref={uploadRef}
                    type="file"
                    hidden
                    onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) {
                            void runAssetAction(async () => {await addPageFile(activeBoardId, file);}, 'File added.');
                            event.target.value = '';
                        }
                    }}
                />
            </header>
            <p role="status">{status}</p>
            <p className="workspaceAssets__captureHint">
                To capture a visible web tab, open that tab and use the Browser OS toolbar button.
            </p>
            <div className="workspaceAssets__grid">
                {assets.map(asset => (
                    <article key={asset.id}>
                        {urls.has(asset.entityId) && <img src={urls.get(asset.entityId)} alt="" />}
                        <strong>{asset.name}</strong>
                        <span>{Math.ceil(asset.size / 1024) + ' KB'} · {asset.mimeType}</span>
                        <button onClick={() => onOpenWorkspace(asset.entityId)}>Open in workspace</button>
                    </article>
                ))}
                {assets.length === 0 && <p>No files on this page.</p>}
            </div>
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous assets</button>
            <span> {total} assets · Page {page + 1} </span>
            <button disabled={(page + 1) * 24 >= total} onClick={() => setPage(page + 1)}>Next assets</button>
        </section>
    );
}

function WorkspaceAppInner({onClose}: WorkspaceAppProps) {
    const [snapshot, setSnapshot] = useState(emptySnapshot);
    const [activeBoardId, setActiveBoardId] = useState('');
    const [view, setViewState] = useState<WorkspaceView>('canvas');
    const editorSession = useRef<PageEditorSession | undefined>(undefined);
    const leaveEditor = async (next: () => void | Promise<void>) => {
        try {await editorSession.current?.flush(); await next();} catch (e) {setNotice(String(e));}
    };
    const setView = (next: WorkspaceView) => {void leaveEditor(() => setViewState(next));};
    const [selectedEntityId, setSelectedEntityId] = useState<string>();
    const [selectedPlacementId, setSelectedPlacementId] = useState<string>();
    const [busy, setBusy] = useState(true);
    const [notice, setNotice] = useState('');
    useEffect(() => {
        const reloadNotice = () => setNotice('Workspace storage was upgraded in another tab. Export any unsaved draft, then reload this tab.');
        window.addEventListener('workspace-reload-required', reloadNotice);
        if (workspaceClient.reloadRequired) reloadNotice();
        return () => window.removeEventListener('workspace-reload-required', reloadNotice);
    }, []);
    const [mobilePanel, setMobilePanel] = useState<'explorer' | 'inspector'>();
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddKind, setQuickAddKind] = useState<'clip' | 'note' | 'task' | 'web'>('web');
    const [searchQuery, setSearchQuery] = useState('');
    const [brainMode, setBrainMode] = useState<BrainMode>('Table');
    const [brainNavigationKey, setBrainNavigationKey] = useState(0);
    const [focusEntityIds, setFocusEntityIds] = useState<string[]>();
    const refreshRequest = useRef(0);
    const activeBoardRef = useRef(activeBoardId);
    const requestedBoardRef = useRef(activeBoardId);

    const refresh = useCallback(async (boardId?: string) => {
        if (boardId && boardId !== activeBoardRef.current) await editorSession.current?.flush();
        if (boardId) requestedBoardRef.current = boardId;
        const request = ++refreshRequest.current;
        setBusy(true);
        try {
            const requestedBoardId = requestedBoardRef.current || activeBoardRef.current || undefined;
            const next = await loadWorkspace(requestedBoardId);
            if (request !== refreshRequest.current) {
                return;
            }
            const resolvedBoardId = requestedBoardId &&
                next.boards.some(board => board.id === requestedBoardId) ?
                requestedBoardId :
                next.boards[0]?.id || '';
            if (resolvedBoardId !== activeBoardRef.current) {
                setSelectedEntityId(undefined);
                setSelectedPlacementId(undefined);
                setFocusEntityIds(undefined);
            }
            setSnapshot(next);
            activeBoardRef.current = resolvedBoardId;
            requestedBoardRef.current = resolvedBoardId;
            setActiveBoardId(resolvedBoardId);
            setNotice('');
        } catch (error) {
            if (request === refreshRequest.current) {
                requestedBoardRef.current = activeBoardRef.current;
                setNotice(error instanceof Error ? error.message : 'Workspace failed to load.');
            }
        } finally {
            if (request === refreshRequest.current) {
                setBusy(false);
            }
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, []);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const subscription = liveQuery(() => Promise.all(workspaceClient.tables.map(table => table.count())))
            .subscribe({next: () => {
                clearTimeout(timer);
                timer = setTimeout(() => { void refresh(); }, 120);
            }, error: error => setNotice('Live refresh unavailable: ' + String(error))});
        return () => { clearTimeout(timer); subscription.unsubscribe(); };
    }, [refresh]);

    useEffect(() => {
        const openQuickAdd = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
                event.preventDefault();
                setQuickAddKind('web');
                setQuickAddOpen(true);
            }
        };
        window.addEventListener('keydown', openQuickAdd);
        return () => window.removeEventListener('keydown', openQuickAdd);
    }, []);

    const selectedEntity = snapshot.entities.find(entity => entity.id === selectedEntityId);
    const selectedPlacement = snapshot.placements.find(placement => placement.id === selectedPlacementId);
    const activeBoard = snapshot.boards.find(board => board.id === activeBoardId);
    const visibleEntityIds = useMemo(() => focusEntityIds ? new Set(focusEntityIds) : undefined, [focusEntityIds]);
    const graphScopeCount = visibleEntityIds ? snapshot.entities.filter(entity => visibleEntityIds.has(entity.id)).length : snapshot.entities.length;

    const selectEntity = (entityId?: string, placementId?: string) => {
        setSelectedEntityId(entityId);
        setSelectedPlacementId(placementId || snapshot.placements.find(item => item.entityId === entityId)?.id);
        if (entityId) {
            setMobilePanel('inspector');
        }
    };
    const run = async (action: () => Promise<string | void>, success: string) => {
        try {
            await editorSession.current?.flush();
            setNotice('');
            const nextBoardId = await action();
            await refresh(nextBoardId || undefined);
            setNotice(success);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'Action failed.');
        }
    };
    const openObjectCanvas = async (entityId: string) => {
        await editorSession.current?.flush();
        const boardId = await openBrainCanvas(entityId, activeBoardId);
        await refresh(boardId);
        setSelectedEntityId(entityId);
        setSelectedPlacementId(undefined);
        setFocusEntityIds(undefined);
        setView('canvas');
    };
    const openObjectWorkspace = async (entityId: string) => {
        await editorSession.current?.flush();
        const entity = await workspaceClient.entities.get(entityId);
        if (!entity) throw new Error('Object no longer exists.');
        const page = entity.type === 'project' ? await openProjectWorkspace(entityId) : await openWorkspacePage(activeBoardId);
        if (entity.type !== 'project') await addPageReference(page.board.id, entityId);
        await refresh(page.board.id); setSelectedEntityId(entityId); setViewState('editor');
    };
    const createNewBoard = () => void run(async () => {
        const board = await createBoard();
        return board.id;
    }, 'Board created');
    const renameCurrentBoard = () => {
        const name = window.prompt('Board name', activeBoard?.name || '');
        if (name !== null && activeBoardId) {
            void run(() => renameBoard(activeBoardId, name), 'Board renamed');
        }
    };
    const commands = useMemo<WorkspaceCommand[]>(() => [
        {
            id: 'capture-window',
            label: 'Capture current window',
            detail: 'Save the current web tabs as a living workspace session.',
            run: () => run(() => captureWindowSession(activeBoardId).then(() => undefined), 'Window session captured')
        },
        {
            id: 'auto-layout',
            label: 'Auto-layout current board',
            detail: 'Arrange cards into a clean grid without changing their content.',
            run: () => run(() => autoLayoutBoard(activeBoardId), 'Board auto-layout applied')
        },
        {id: 'open-inbox', label: 'Open Quick Inbox', detail: 'Triage captured objects.', run: () => setView('inbox')},
        {id: 'open-tasks', label: 'Open tasks', detail: 'Review tasks and enter Focus mode.', run: () => setView('tasks')},
        {id: 'open-activity', label: 'Open activity', detail: 'Inspect the local activity timeline.', run: () => setView('activity')},
        {id: 'open-templates', label: 'Open board templates', detail: 'Create a structured board.', run: () => setView('templates')}
    ], [activeBoardId]);

    return (
        <section className="workspaceWindow" aria-label="Browser OS boards">
            <header className="workspaceTitlebar">
                <strong>{activeBoard?.name || 'Workspace'}</strong>
                <button type="button" aria-label="Return to desktop" onClick={() => void leaveEditor(onClose)}>×</button>
            </header>
            <div className="workspaceBody">
                <WorkspaceExplorer
                    activeBoardId={activeBoardId}
                    boards={snapshot.boards}
                    entities={snapshot.entities}
                    folders={snapshot.folders}
                    memberships={snapshot.folderMemberships}
                    selectedEntityId={selectedEntityId}
                    onRefresh={() => refresh()}
                    savedFilters={snapshot.savedFilters}
                    sessions={snapshot.workspaceSessions}
                    tasks={snapshot.tasks}
                    mobileOpen={mobilePanel === 'explorer'}
                    onClosePanel={() => setMobilePanel(undefined)}
                    onCreateBoard={createNewBoard}
                    onRenameBoard={renameCurrentBoard}
                    onOpenInbox={() => setView('inbox')}
                    onOpenSavedFilter={query => {
                        setSearchQuery(query);
                        setView('search');
                    }}
                    onOpenSessions={() => setView('sessions')}
                    onOpenTasks={() => setView('tasks')}
                    onOpenTemplates={() => setView('templates')}
                    onDuplicateBoard={() => void run(async () => {
                        const board = await duplicateBoard(activeBoardId);
                        return board.id;
                    }, 'Board duplicated')}
                    onDeleteBoard={() => {
                        if (!window.confirm('Move this board and its layout to Trash?')) {
                            return;
                        }
                        void run(async () => {
                            const next = await deleteBoard(activeBoardId);
                            return next.id;
                        }, 'Board moved to Trash');
                    }}
                    onSelectBoard={boardId => void leaveEditor(() => refresh(boardId))}
                    onSelectEntity={entityId => selectEntity(entityId)}
                />
                <main className="workspaceMain">
                    <nav className="workspaceToolbar" aria-label="Workspace views">
                        <div className="workspaceViewTabs">
                            {(['brain', 'editor', 'canvas', 'mindmap', 'graph', 'search', 'tasks', 'activity', 'assets'] as WorkspaceView[]).map(item => (
                                <button
                                    type="button"
                                    key={item}
                                    className={view === item ? 'selected' : ''}
                                    aria-current={view === item ? 'page' : undefined}
                                    onClick={() => setView(item)}
                                >
                                    {item === 'editor' ? 'Workspace' : item === 'mindmap' ? 'Mind Map' :
                                        item.charAt(0).toUpperCase() + item.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="workspaceActions">
                            <button
                                type="button"
                                className="mobilePanelButton"
                                onClick={() => setMobilePanel(current => current === 'explorer' ? undefined : 'explorer')}
                            >
                                Browse
                            </button>
                            <button
                                type="button"
                                className="mobilePanelButton"
                                onClick={() => setMobilePanel(current => current === 'inspector' ? undefined : 'inspector')}
                            >
                                Inspect
                            </button>
                            <button type="button" onClick={() => setView('analysis')}>AI</button>
                            <button type="button" aria-label="Workspace settings" onClick={() => setView('settings')}>⚙</button>
                            <button type="button" className="primaryButton" onClick={() => {
                                setQuickAddKind('web');
                                setQuickAddOpen(true);
                            }}>＋ Quick Add</button>
                            <button type="button" onClick={() => void run(
                                () => captureWindowSession(activeBoardId).then(() => undefined),
                                'Window session captured')}>Capture window</button>
                            <button type="button" onClick={() => void run(
                                () => autoLayoutBoard(activeBoardId),
                                'Board auto-layout applied')}>Auto-layout</button>
                            <button type="button" onClick={() => void run(() => addNote(activeBoardId).then(() => undefined), 'Note added')}>＋ Note</button>
                            <button type="button" onClick={() => void run(() => addCurrentTab(activeBoardId).then(() => undefined), 'Recent web tab added')}>＋ Recent web tab</button>
                            <button
                                type="button"
                                disabled={!selectedPlacementId}
                                onClick={() => selectedPlacementId &&
                                    void run(() => duplicatePlacements([selectedPlacementId]), 'Card duplicated')}
                            >
                                Duplicate
                            </button>
                            <button
                                type="button"
                                disabled={!selectedPlacementId}
                                onClick={() => {
                                    if (selectedPlacementId &&
                                        window.confirm('Move this card placement to Trash?')) {
                                        void run(() => removePlacements([selectedPlacementId]), 'Card moved to Trash');
                                    }
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </nav>
                    <div className="workspaceNotice" role="status">{busy ? 'Loading workspace…' : notice}</div>
                    {visibleEntityIds && (
                        <div className="workspaceFocus" role="status">
                            Focus mode · showing {visibleEntityIds.size} selected and connected objects
                            <button type="button" onClick={() => setFocusEntityIds(undefined)}>Exit focus</button>
                        </div>
                    )}
                    <div className="workspaceCanvas">
                        {view === 'graph' && <p role="status">Graph shows {Math.min(200, graphScopeCount)} of {graphScopeCount} objects in the current scope ({Math.max(0, graphScopeCount - 200)} omitted). Select an object and use Show in Graph to focus its relationships.</p>}
                        {view === 'brain' && <BrainWorkspace initialMode={brainMode} navigationKey={brainNavigationKey} snapshot={snapshot} onSelect={selectEntity}
                            onCanvas={openObjectCanvas} onWorkspace={openObjectWorkspace} onRefresh={() => refresh()} onStatus={setNotice} />}
                        {view === 'editor' && activeBoardId && <AffineWorkspace boardId={activeBoardId} entities={snapshot.entities}
                            onSession={session => {editorSession.current = session;}} onSelect={selectEntity}
                            onOpenPage={boardId => {void leaveEditor(() => refresh(boardId));}}
                            onAction={(id, action) => {void leaveEditor(async () => {
                                selectEntity(id);
                                if (action === 'source') {
                                    const entity = await workspaceClient.entities.get(id), url = entity?.source?.url || entity?.canonicalUrl;
                                    if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
                                } else if (action === 'graph') {setFocusEntityIds([id, ...snapshot.relationships.filter(r => r.confirmed && (r.fromEntityId === id || r.toEntityId === id)).flatMap(r => [r.fromEntityId, r.toEntityId])]); setViewState('graph');}
                                else if (action === 'ai') setViewState('analysis');
                                else setMobilePanel('inspector');
                            });}} />}
                        {(view === 'canvas' || view === 'mindmap' || view === 'graph') && (
                            <WorkspaceFlow
                                activeBoardId={activeBoardId}
                                refresh={() => refresh()}
                                snapshot={snapshot}
                                view={view}
                                visibleEntityIds={visibleEntityIds}
                                onSelect={selectEntity}
                            />
                        )}
                        {view === 'search' && <SmartSearchView
                            query={searchQuery}
                            onQueryChange={setSearchQuery}
                            onRefresh={() => refresh()}
                            onStatus={setNotice}
                            snapshot={snapshot}
                            onSelect={entityId => {
                            selectEntity(entityId);
                            setView('canvas');
                        }} />}
                        {view === 'inbox' && <InboxView
                            activeBoardId={activeBoardId}
                            onRefresh={() => refresh()}
                            onSelect={selectEntity}
                            onStatus={setNotice}
                            snapshot={snapshot}
                        />}
                        {view === 'sessions' && <SessionsView
                            activeBoardId={activeBoardId}
                            onRefresh={() => refresh()}
                            onStatus={setNotice}
                            snapshot={snapshot}
                        />}
                        {view === 'tasks' && <TasksView
                            onFocus={(entity, relatedEntityIds) => {
                                setFocusEntityIds([entity.id, ...relatedEntityIds]);
                                selectEntity(entity.id);
                                setView('canvas');
                                setNotice('Focus mode enabled.');
                            }}
                            onNewTask={() => {
                                setQuickAddKind('task');
                                setQuickAddOpen(true);
                            }}
                            onRefresh={() => refresh()}
                            onSelect={selectEntity}
                            onStatus={setNotice}
                            snapshot={snapshot}
                        />}
                        {view === 'activity' && <ActivityView snapshot={snapshot} />}
                        {view === 'templates' && <TemplatesView
                            onCreated={boardId => {
                                void refresh(boardId);
                                setView('canvas');
                            }}
                            onRefresh={() => refresh()}
                            onStatus={setNotice}
                            snapshot={snapshot}
                        />}
                        {view === 'assets' && (
                            <AssetsView activeBoardId={activeBoardId} refresh={() => refresh()} snapshot={snapshot}
                                onOpenWorkspace={id => {void openObjectWorkspace(id).catch(e => setNotice(String(e)));}} />
                        )}
                        {view === 'analysis' && (
                            <AnalysisView
                                snapshot={snapshot}
                                activeBoardId={activeBoardId}
                                entity={selectedEntity}
                                onSaved={() => refresh()}
                            />
                        )}
                        {view === 'settings' && <SettingsView onImported={() => refresh()} />}
                    </div>
                </main>
                <WorkspaceInspector
                    boards={snapshot.boards}
                    boardMemberships={snapshot.boardMemberships}
                    folders={snapshot.folders}
                    folderMemberships={snapshot.folderMemberships}
                    activities={snapshot.activities}
                    entity={selectedEntity}
                    entities={snapshot.entities}
                    placement={selectedPlacement}
                    relationships={snapshot.relationships}
                    tasks={snapshot.tasks}
                    mobileOpen={mobilePanel === 'inspector'}
                    onClosePanel={() => setMobilePanel(undefined)}
                    onCreateTask={() => {
                        setQuickAddKind('task');
                        setQuickAddOpen(true);
                    }}
                    onInboxChange={async inInbox => {
                        if (selectedEntity) {
                            await setInboxState(selectedEntity.id, inInbox);
                            await refresh();
                        }
                    }}
                    onSave={async patch => {
                        if (selectedEntity) {
                            await updateEntity(selectedEntity.id, patch);
                            await refresh();
                        }
                    }}
                    onOpenRichText={id => {void openObjectWorkspace(id).catch(e => setNotice(String(e)));}}
                    onTaskSave={async (taskId, patch) => {
                        await updateTask(taskId, patch);
                        await refresh();
                    }}
                >
                    {selectedEntity && <BrainObjectTools key={selectedEntity.id} entity={selectedEntity}
                        entities={snapshot.entities} relationships={snapshot.relationships} onSelect={selectEntity}
                        onCanvas={openObjectCanvas} onRefresh={() => refresh()} onStatus={setNotice}
                        onEditor={() => {void openObjectWorkspace(selectedEntity.id).catch(e => setNotice(String(e)));}}
                        onBrain={mode => { setBrainMode(mode || 'Table'); setBrainNavigationKey(value => value + 1); setView('brain'); }} onAI={() => setView('analysis')}
                        onGraph={entityId => {
                            const related = snapshot.relationships.filter(link => link.confirmed &&
                                (link.fromEntityId === entityId || link.toEntityId === entityId));
                            setFocusEntityIds([entityId, ...related.flatMap(link => [link.fromEntityId, link.toEntityId])]);
                            setView('graph');
                        }} />}
                </WorkspaceInspector>
            </div>
            <nav className="workspaceMobileNav" aria-label="Mobile workspace navigation">
                <button type="button" onClick={() => setMobilePanel('explorer')}>Browse</button>
                <button type="button" onClick={() => setView('canvas')}>Canvas</button>
                <button type="button" onClick={() => setView('tasks')}>Tasks</button>
                <button type="button" onClick={() => setView('activity')}>Activity</button>
                <button type="button" onClick={() => setMobilePanel('inspector')}>Inspect</button>
            </nav>
            <WorkspaceQuickAdd
                activeBoardId={activeBoardId}
                boards={snapshot.boards}
                commands={commands}
                folders={snapshot.folders}
                initialKind={quickAddKind}
                onClose={() => setQuickAddOpen(false)}
                onSaved={async entity => {
                    await refresh();
                    selectEntity(entity.id);
                    setNotice(entity.title + ' added.');
                }}
                open={quickAddOpen}
                selectedEntity={selectedEntity}
            />
        </section>
    );
}

export function WorkspaceApp(props: WorkspaceAppProps) {
    return (
        <ReactFlowProvider>
            <WorkspaceAppInner {...props} />
        </ReactFlowProvider>
    );
}
