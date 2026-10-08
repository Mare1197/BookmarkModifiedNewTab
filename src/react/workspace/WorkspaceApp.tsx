import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {Target} from '../../workspace/recoveryTypes';
const RecoveryDialog = lazy(() => import('./RecoveryDialog').then(module => ({default: module.RecoveryDialog})));
import {liveQuery} from 'dexie';
import {workspaceClient} from './workspaceClient';
import {loadShell, loadBoard, loadObject, loadExpandedNeighborhood} from './workspaceReads';
import {useWorkspaceQuery} from './useWorkspaceQuery';
import type {AssetRecord} from '../../workspace/types';
import {addPageFile} from './pageAssets';
import {useAssetUrls} from './useAssetUrls';
import {lazyWorkspaceView} from './lazyWorkspaceView';
const WorkspaceFlow = lazyWorkspaceView(() => import('./WorkspaceGraphView'), 'Canvas');

import {WorkspaceExplorer} from './WorkspaceExplorer';
import type {BrainMode} from './BrainWorkspace';
const BrainWorkspace = lazyWorkspaceView(async () => ({default: (await import('./BrainWorkspace')).BrainWorkspace}), 'Brain');
import {BrainObjectTools} from './BrainObjectTools';
const AffineWorkspace = lazyWorkspaceView(async () => ({default: (await import('./AffineWorkspace')).AffineWorkspace}), 'Workspace editor');
import type {PageEditorSession} from './pageEditorSession';
import {addPageReference, openProjectWorkspace, openWorkspacePage} from './pageRepository';
import {openBrainCanvas} from './brainRepository';
import './brain.css';
import {WorkspaceInspector} from './WorkspaceInspector';
import {WorkspaceQuickAdd, type WorkspaceCommand} from './WorkspaceQuickAdd';
const ActivityView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceWorkflows')).ActivityView}), 'Activity');
const InboxView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceWorkflows')).InboxView}), 'Inbox');
const SessionsView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceWorkflows')).SessionsView}), 'Sessions');
const SmartSearchView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceWorkflows')).SmartSearchView}), 'Search');
const TasksView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceWorkflows')).TasksView}), 'Tasks');
const TemplatesView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceWorkflows')).TemplatesView}), 'Templates');
const AnalysisView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceUtilities')).AnalysisView}), 'Analysis');
const SettingsView = lazyWorkspaceView(async () => ({default: (await import('./WorkspaceUtilities')).SettingsView}), 'Settings');
import {
    addCurrentTab,
    addNote,
    autoLayoutBoard,
    captureWindowSession,
    createBoard,
    deleteBoard,
    duplicateBoard,
    duplicatePlacements,
    ensureWorkspace,
    removePlacements,
    renameBoard,
    setInboxState,
    updateTask,
    updateEntity,
    type WorkspaceSnapshot
} from './workspaceRepository';

type WorkspaceView = 'editor' | 'brain' | 'activity' | 'analysis' | 'assets' | 'canvas' | 'graph' | 'inbox' |
    'mindmap' | 'search' | 'sessions' | 'settings' | 'tasks' | 'templates';
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
    const [activeBoardId, setActiveBoardId] = useState('');
    const [view, setViewState] = useState<WorkspaceView>('canvas');
    const editorSession = useRef<PageEditorSession | undefined>(undefined);
    const [recoveryOpen, setRecoveryOpen] = useState(false), [historyTarget, setHistoryTarget] = useState<Target>();
    const [editorEpoch, setEditorEpoch] = useState(0);
    const openRecovery = async (target?: Target) => {
        try {await editorSession.current?.flushJournal();} catch (e) {setNotice('Some edits are not stored locally; export your unsaved draft. ' + String(e));}
        setHistoryTarget(target); setRecoveryOpen(true);
    };
    const recoveryChanged = async () => {
        await editorSession.current?.reconcileRecovery();
        if (!editorSession.current || editorSession.current.getStatus() === 'saved') setEditorEpoch(n => n + 1);
        await refresh();
    };
    const leaveEditor = async (next: () => void | Promise<void>) => {
        try {await editorSession.current?.flush(); await next();} catch (e) {setNotice(String(e));}
    };
    const setView = (next: WorkspaceView) => {void leaveEditor(() => setViewState(next));};
    const [selectedEntityId, setSelectedEntityId] = useState<string>();
    const [selectedPlacementId, setSelectedPlacementId] = useState<string>();
    const [initialized, setInitialized] = useState(false);
    const [initializationError, setInitializationError] = useState<string>();
    const initialization = useRef<Promise<unknown> | undefined>(undefined);
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
    const [graphExpansion, setGraphExpansion] = useState({scope: '', pages: 1});
    const graphScopeKey = focusEntityIds?.[0] || '';
    const graphPages = graphExpansion.scope === graphScopeKey ? graphExpansion.pages : 1;
    const refreshRequest = useRef(0);
    const activeBoardRef = useRef(activeBoardId);
    const requestedBoardRef = useRef(activeBoardId);
    const shell = useWorkspaceQuery('shell:' + initialized, async () => initialized ? loadShell() : undefined);
    const board = useWorkspaceQuery('board:' + activeBoardId, async () => activeBoardId ? loadBoard(activeBoardId) : undefined);
    const object = useWorkspaceQuery('object:' + selectedEntityId, async () => selectedEntityId ? loadObject(selectedEntityId) : null);
    const graph = useWorkspaceQuery('graph:' + (view === 'graph') + ':' + graphScopeKey + ':' + graphPages, async () => view === 'graph' ?
        loadExpandedNeighborhood(graphScopeKey ? {kind: 'entity', id: graphScopeKey} : {kind: 'library'}, graphPages) : undefined);
    // Compatibility composition for board-only renderers, not a library snapshot.
    const snapshot = useMemo(() => ({...emptySnapshot, ...shell.data, ...board.data}), [shell.data, board.data]);
    const inspected = object.data || emptySnapshot;
    const busy = !initialized || shell.loading || board.loading;

    const refresh = useCallback(async (boardId?: string) => {
        if (boardId && boardId !== activeBoardRef.current) await editorSession.current?.flush();
        if (boardId) requestedBoardRef.current = boardId;
        const request = ++refreshRequest.current;
        setInitializationError(undefined);
        try {
            initialization.current ||= ensureWorkspace();
            try {await initialization.current;} catch (error) {initialization.current = undefined; throw error;}
            setInitialized(true);
            const requestedBoardId = requestedBoardRef.current || activeBoardRef.current || undefined;
            const next = await loadShell();
            if (request !== refreshRequest.current) {
                return;
            }
            const resolvedBoardId = requestedBoardId &&
                next.boards.some(board => board.id === requestedBoardId) ?
                requestedBoardId :
                next.boards[0]?.id || '';
            if (activeBoardRef.current && resolvedBoardId !== activeBoardRef.current) {
                setSelectedEntityId(undefined);
                setSelectedPlacementId(undefined);
                setFocusEntityIds(undefined);
            }
            activeBoardRef.current = resolvedBoardId;
            requestedBoardRef.current = resolvedBoardId;
            setActiveBoardId(resolvedBoardId);
            shell.retry(); board.retry(); object.retry(); graph.retry();
            setNotice('');
        } catch (error) {
            if (request === refreshRequest.current) {
                requestedBoardRef.current = activeBoardRef.current;
                const message = error instanceof Error ? error.message : 'Workspace failed to load.';
                setNotice(message); setInitializationError(message);
            }
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, []);

    useEffect(() => {
        if (shell.data && activeBoardId && !shell.data.boards.some(item => item.id === activeBoardId)) void refresh();
    }, [shell.data, activeBoardId, refresh]);

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

    const selectedEntity = object.data?.entity;
    const selectedPlacement = snapshot.placements.find(placement => placement.id === selectedPlacementId);
    const activeBoard = snapshot.boards.find(board => board.id === activeBoardId);
    const visibleEntityIds = useMemo(() => focusEntityIds ? new Set(focusEntityIds) : undefined, [focusEntityIds]);
    const graphScopeCount = graph.data?.total;

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
                    counts={shell.data?.counts || {entities: 0, inbox: 0, tasks: 0, sessions: 0}}
                    folders={snapshot.folders}
                    selectedEntityId={selectedEntityId}
                    onRefresh={() => refresh()}
                    savedFilters={snapshot.savedFilters}
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
                            <button type="button" onClick={() => void openRecovery()}>Recovery</button>
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
                            <button type="button" disabled={busy || !activeBoardId} onClick={() => void run(
                                () => captureWindowSession(activeBoardId).then(() => undefined),
                                'Window session captured')}>Capture window</button>
                            <button type="button" disabled={busy || !activeBoardId} onClick={() => void run(
                                () => autoLayoutBoard(activeBoardId),
                                'Board auto-layout applied')}>Auto-layout</button>
                            <button type="button" disabled={busy || !activeBoardId} onClick={() => void run(() => addNote(activeBoardId).then(() => undefined), 'Note added')}>＋ Note</button>
                            <button type="button" disabled={busy || !activeBoardId} onClick={() => void run(() => addCurrentTab(activeBoardId).then(() => undefined), 'Recent web tab added')}>＋ Recent web tab</button>
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
                    <div className="workspaceNotice" role="status">{busy && !initializationError ? 'Loading workspace…' : notice}</div>
                    {initializationError && <p role="alert">{initializationError} <button onClick={() => void refresh()}>Retry workspace</button></p>}
                    {[shell, board, object, graph].filter(query => query.error).map((query, index) =>
                        <p role="alert" key={index}>{query.error?.message} <button onClick={query.retry}>Retry load</button></p>)}
                    {selectedEntityId && !object.loading && !object.error && object.data === null &&
                        <p role="status">The selected object is no longer available. Choose another object or open Recovery.</p>}
                    {visibleEntityIds && (
                        <div className="workspaceFocus" role="status">
                            Focus mode · showing {visibleEntityIds.size} selected and connected objects
                            <button type="button" onClick={() => setFocusEntityIds(undefined)}>Exit focus</button>
                        </div>
                    )}
                    <div className="workspaceCanvas">
                        {view === 'graph' && <p role="status">Graph shows {graph.data?.entities.length || 0}{graphScopeCount === undefined ? '' : ' of ' + graphScopeCount} objects in the current scope{graph.data?.hasMore ? ' (more available)' : ''}. Select an object and use Show in Graph to focus its relationships.</p>}
                        {view === 'graph' && graph.data?.hasMore && <button disabled={graph.loading || graph.refreshing}
                            onClick={() => setGraphExpansion({scope: graphScopeKey, pages: graphPages + 1})}>Load 200 more graph objects</button>}
                        {view === 'brain' && <BrainWorkspace initialMode={brainMode} navigationKey={brainNavigationKey} onSelect={selectEntity}
                            onCanvas={openObjectCanvas} onWorkspace={openObjectWorkspace} onRefresh={() => refresh()} onStatus={setNotice} />}
                        {view === 'editor' && activeBoardId && <AffineWorkspace key={activeBoardId + ':' + editorEpoch} boardId={activeBoardId} entities={snapshot.entities}
                            onHistory={() => void openRecovery({kind: 'page', id: activeBoardId})} onRecovery={() => void openRecovery()}
                            onSession={session => {editorSession.current = session;}} onSelect={selectEntity}
                            onOpenPage={boardId => {void leaveEditor(() => refresh(boardId));}}
                            onAction={(id, action) => {void leaveEditor(async () => {
                                selectEntity(id);
                                if (action === 'source') {
                                    const entity = await workspaceClient.entities.get(id), url = entity?.source?.url || entity?.canonicalUrl;
                                    if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
                                } else if (action === 'graph') {setFocusEntityIds([id]); setViewState('graph');}
                                else if (action === 'ai') setViewState('analysis');
                                else setMobilePanel('inspector');
                            });}} />}
                        {(view === 'canvas' || view === 'mindmap' || view === 'graph') && (
                            <WorkspaceFlow
                                key={activeBoardId + ':' + view}
                                activeBoardId={activeBoardId}
                                refresh={() => refresh()}
                                snapshot={view === 'graph' ? {...emptySnapshot, ...graph.data} : snapshot}
                                view={view}
                                visibleEntityIds={view === 'graph' ? undefined : visibleEntityIds}
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
                        />}
                        {view === 'sessions' && <SessionsView
                            snapshot={snapshot}
                            activeBoardId={activeBoardId}
                            onRefresh={() => refresh()}
                            onStatus={setNotice}
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
                        />}
                        {view === 'activity' && <ActivityView snapshot={snapshot} />}
                        {view === 'templates' && <TemplatesView
                            onCreated={boardId => {
                                void refresh(boardId);
                                setView('canvas');
                            }}
                            onRefresh={() => refresh()}
                            onStatus={setNotice}
                        />}
                        {view === 'assets' && (
                            <AssetsView activeBoardId={activeBoardId} refresh={() => refresh()} snapshot={snapshot}
                                onOpenWorkspace={id => {void openObjectWorkspace(id).catch(e => setNotice(String(e)));}} />
                        )}
                        {view === 'analysis' && (
                            <AnalysisView
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
                    boardMemberships={inspected.boardMemberships}
                    folders={snapshot.folders}
                    folderMemberships={inspected.folderMemberships}
                    activities={inspected.activities}
                    entity={selectedEntity}
                    entities={inspected.entities}
                    placement={selectedPlacement}
                    relationships={inspected.relationships}
                    tasks={inspected.tasks}
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
                    onHistory={id => void openRecovery({kind: 'entity', id})}
                    onTaskSave={async (taskId, patch) => {
                        await updateTask(taskId, patch);
                        await refresh();
                    }}
                >
                    {selectedEntity && <BrainObjectTools key={selectedEntity.id} entity={selectedEntity}
                        entities={inspected.entities} relationships={inspected.relationships} onSelect={selectEntity}
                        onCanvas={openObjectCanvas} onRefresh={() => refresh()} onStatus={setNotice}
                        onEditor={() => {void openObjectWorkspace(selectedEntity.id).catch(e => setNotice(String(e)));}}
                        onBrain={mode => { setBrainMode(mode || 'Table'); setBrainNavigationKey(value => value + 1); setView('brain'); }} onAI={() => setView('analysis')}
                        onGraph={entityId => {
                            const related = inspected.relationships.filter(link => link.confirmed &&
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
            {recoveryOpen && <Suspense fallback={<p role="status">Loading recovery…</p>}><RecoveryDialog target={historyTarget}
                onClose={() => setRecoveryOpen(false)} onChanged={recoveryChanged} /></Suspense>}
        </section>
    );
}

export function WorkspaceApp(props: WorkspaceAppProps) {
    return <WorkspaceAppInner {...props} />;
}
