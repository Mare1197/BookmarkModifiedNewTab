import {useEffect, useState} from 'react';
import type {EntityType, WorkspaceEntity, WorkspaceTaskStatus} from '../../workspace/types';
import {loadPageCompanions, loadObjectActivityPage} from './workspaceReads';
import {useWorkspaceQuery} from './useWorkspaceQuery';
import {BRAIN_STATUSES, BRAIN_TYPES, createBrainObject, linkBrainObjects,
    loadTileLayout, loadBrainViews, saveBrainView, reviewRelationship, saveTileLayout, setBrainStatus, suggestInboxProjects,
    type BrainView, type TileLayout} from './brainRepository';
import {brainStatus, type BrainQuery} from './brainSelectors';
import {useLibraryPage} from './useLibraryPage';
import {LibraryPager} from './LibraryPager';
import {LibraryObjectPicker} from './LibraryObjectPicker';
import {lazyWorkspaceView} from './lazyWorkspaceView';
const ConversationImportPanel = lazyWorkspaceView(async () => ({default: (await import('./ConversationImportPanel')).ConversationImportPanel}), 'Conversation import');
import {ProjectHome} from './ProjectHome';

export type BrainMode = 'Table' | 'Kanban' | 'Tiles' | 'Timeline' | 'AI Inbox';
interface Props {
    initialMode?: BrainMode;
    navigationKey?: number;
    onSelect: (entityId: string) => void;
    onCanvas: (entityId: string) => Promise<void>;
    onWorkspace?: (entityId: string) => Promise<void>;
    onRefresh: () => Promise<void>;
    onStatus: (message: string) => void;
}

function ObjectTimeline({ids, onSelect}: {ids: string[]; onSelect: (id: string) => void}) {
    const [index, setIndex] = useState(0);
    const state = useWorkspaceQuery(JSON.stringify(['object-history', ids, index]), () => loadObjectActivityPage(ids, index));
    return <section aria-label="Object activity timeline">
        <p>Activity for the objects on this collection page.</p>
        <LibraryPager label="Activity pages" itemLabel="activities" page={{...state, index,
            next: () => setIndex(value => value + 1), previous: () => setIndex(value => Math.max(0, value - 1))}} />
        <ol className="brainTimeline">{state.data?.activities.map(activity => <li key={activity.id}>
            <time>{new Date(activity.createdAt).toLocaleString()}</time>
            <button onClick={() => activity.entityId && onSelect(activity.entityId)}>{activity.summary}</button>
        </li>)}</ol>
    </section>;
}

export function BrainWorkspace({onSelect, onCanvas, onWorkspace, onRefresh, onStatus, initialMode = 'Table', navigationKey}: Props) {
    const [mode, setMode] = useState<BrainMode>(initialMode);
    useEffect(() => setMode(initialMode), [initialMode, navigationKey]);
    const [query, setQuery] = useState<BrainQuery>({sort: 'updated'});
    const [newType, setNewType] = useState<EntityType>('project');
    const [title, setTitle] = useState('');
    const [captureOpen, setCaptureOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [savedViews, setSavedViews] = useState<BrainView[]>([]);
    const [viewName, setViewName] = useState('');
    useEffect(() => {
        let cancelled = false;
        loadBrainViews().then(views => { if (!cancelled) setSavedViews(views); })
            .catch(error => { if (!cancelled) onStatus(String(error)); });
        return () => { cancelled = true; };
    }, []);
    const [layouts, setLayouts] = useState<Record<string, TileLayout>>({});
    const scope = query.projectId || 'all';
    useEffect(() => {
        let cancelled = false;
        setLayouts({});
        loadTileLayout(scope).then(value => { if (!cancelled) setLayouts(value); })
            .catch(error => { if (!cancelled) onStatus(String(error)); });
        return () => { cancelled = true; };
    }, [scope]);
    const page = useLibraryPage({dialect: 'brain', text: query.query || '', type: query.type,
        status: query.status, projectId: query.projectId, inbox: mode === 'AI Inbox',
        sort: mode === 'Tiles' ? 'tiles' : query.sort || 'title', tileScope: scope, tileBaseSort: query.sort});
    const pageItems = page.data?.items || [];
    const companions = useWorkspaceQuery('brain-page:' + JSON.stringify(pageItems.map(item => item.id)),
        () => loadPageCompanions(pageItems.map(item => item.id)));
    const snapshot = companions.data || {entities: [], tasks: [], relationships: [], activities: []};
    const entityMap = new Map([...pageItems, ...snapshot.entities].map(entity => [entity.id, entity]));
    const collection = pageItems;
    const pageIds = new Set(pageItems.map(entity => entity.id));
    const suggestions = snapshot.relationships.filter(link => !link.confirmed && link.reviewStatus !== 'rejected' &&
        pageIds.has(link.fromEntityId));
    const act = async (action: () => Promise<void>, success: string) => {
        if (busy) return;
        setBusy(true);
        try { await action(); await onRefresh(); onStatus(success); }
        catch (error) { onStatus(error instanceof Error ? error.message : 'Brain action failed.'); }
        finally { setBusy(false); }
    };
    const changeQuery = (patch: Partial<BrainQuery>) => setQuery(current => ({...current, ...patch}));
    const statusControl = (entity: WorkspaceEntity) => <select aria-label={'Status for ' + entity.title}
        value={brainStatus(entity, snapshot.tasks)} disabled={busy}
        onChange={event => void act(() => setBrainStatus(entity.id, event.target.value as WorkspaceTaskStatus), 'Status updated')}>
        {BRAIN_STATUSES.map(status => <option key={status}>{status}</option>)}
    </select>;
    const objectLink = (entity: WorkspaceEntity) => <button type="button" className="brainObjectLink"
        onClick={() => onSelect(entity.id)}>{entity.title}</button>;
    const moveTile = async (entityId: string, order: number, width: number) => {
        await saveTileLayout(scope, entityId, {order, width});
        setLayouts(await loadTileLayout(scope));
    };
    const defaultOrder = (entity: WorkspaceEntity) => page.data?.defaultOrders?.[entity.id] ?? page.index * 50 + pageItems.indexOf(entity);
    const tiles = pageItems;

    return <section className="brainWorkspace" aria-label="Unified Brain">
        <header><h2>Unified Brain</h2><p>One object, every view. Browser captures, chats, notes and memory stay connected.</p></header>
        <nav className="brainControls" aria-label="Brain views">
            {(['Table', 'Kanban', 'Tiles', 'Timeline', 'AI Inbox'] as BrainMode[]).map(item =>
                <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item}</button>)}
        </nav>
        <div className="brainControls">
            <LibraryObjectPicker label="Project" value={query.projectId || ''} onChange={projectId => changeQuery({projectId})} type="project" emptyLabel="All objects" />
            <label>Find objects<input value={query.query || ''} onChange={event => changeQuery({query: event.target.value})} /></label>
            <label>Object type<select value={query.type || ''} onChange={event => changeQuery({type: event.target.value})}>
                <option value="">All types</option>{BRAIN_TYPES.map(type => <option key={type}>{type}</option>)}
            </select></label>
            <label>Status filter<select value={query.status || ''} onChange={event => changeQuery({status: event.target.value})}>
                <option value="">All statuses</option>{BRAIN_STATUSES.map(status => <option key={status}>{status}</option>)}
            </select></label>
            <label>Sort<select value={query.sort} onChange={event => changeQuery({sort: event.target.value as 'title' | 'updated'})}>
                <option value="updated">Last activity</option><option value="title">Name</option>
            </select></label>
        </div>
        <form className="brainControls" onSubmit={event => {
            event.preventDefault();
            void act(async () => {
                await saveBrainView(viewName, query, mode); setSavedViews(await loadBrainViews()); setViewName('');
            }, 'View saved; no objects copied');
        }}>
            <label>Saved views<select defaultValue="" onChange={event => {
                const view = savedViews.find(item => item.name === event.target.value);
                if (view) { setQuery(view.query); setMode(view.mode); }
            }}><option value="">Choose a saved view</option>{savedViews.map(view => <option key={view.name}>{view.name}</option>)}</select></label>
            <label>View name<input value={viewName} onChange={event => setViewName(event.target.value)} /></label>
            <button disabled={busy || !viewName.trim()}>Save current view</button>
        </form>
        <details className="brainCapture" onToggle={event => setCaptureOpen(event.currentTarget.open)}><summary>Create an object or import a conversation</summary>
            <form className="brainControls" onSubmit={event => {
                event.preventDefault();
                void act(async () => {
                    const entity = await createBrainObject({type: newType, title});
                    if (query.projectId) await linkBrainObjects(entity.id, query.projectId, 'project-member');
                    setTitle(''); onSelect(entity.id);
                }, 'Object created');
            }}>
                <label>Create type<select value={newType} onChange={event => setNewType(event.target.value as EntityType)}>
                    {(['project', 'note', 'idea', 'task', 'prompt', 'repository', 'automation', 'feature'] as EntityType[])
                        .map(type => <option key={type}>{type}</option>)}
                </select></label>
                <label>Object title<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
                <button disabled={busy || !title.trim()}>Create object</button>
            </form>
            {captureOpen && <ConversationImportPanel onImported={onRefresh} onStatus={onStatus} />}
        </details>
        {query.projectId && <ProjectHome key={query.projectId} projectId={query.projectId}
            onSelect={onSelect} onCanvas={onCanvas} onWorkspace={onWorkspace} onStatus={onStatus} />}
        <p role="status">{pageItems.length} objects on this page{page.data?.total === undefined ? '' : ' · ' + page.data.total + ' matching'} · shared IDs across all views</p>
        <LibraryPager page={page} />
        {companions.error && <p role="alert">Related details unavailable. <button onClick={companions.retry}>Retry details</button></p>}
        {mode === 'Table' && <div className="brainTableScroll"><table className="brainTable"><thead><tr>
            <th>Name</th><th>Type</th><th>Status</th><th>Last activity</th><th>Workspace</th>
        </tr></thead><tbody>{pageItems.map(entity => <tr key={entity.id} data-entity-id={entity.id}>
            <td>{objectLink(entity)}</td><td>{entity.type}</td><td>{statusControl(entity)}</td>
            <td>{new Date(entity.updatedAt).toLocaleString()}</td>
            <td><button disabled={busy} onClick={() => void act(() => onCanvas(entity.id), 'Opened in Canvas')}>Open in Canvas</button>
                {onWorkspace && <button disabled={busy} onClick={() => void act(() => onWorkspace(entity.id), 'Opened workspace')}>Open in workspace</button>}</td>
        </tr>)}</tbody></table></div>}
        {mode === 'Kanban' && <div className="brainKanban">{BRAIN_STATUSES.map(status => <section key={status}
            aria-label={status} onDragOver={event => event.preventDefault()} onDrop={event => {
                event.preventDefault(); const entityId = event.dataTransfer.getData('text/brain-object');
                if (collection.some(entity => entity.id === entityId)) void act(() => setBrainStatus(entityId, status), 'Status updated');
            }}><h3>{status}</h3>{pageItems.filter(entity => brainStatus(entity, snapshot.tasks) === status).map(entity =>
                <article className="brainCard" key={entity.id} data-entity-id={entity.id} draggable={!busy}
                    onDragStart={event => event.dataTransfer.setData('text/brain-object', entity.id)}>
                    {objectLink(entity)}<small>{entity.type}</small>{statusControl(entity)}
                </article>)}</section>)}</div>}
        {mode === 'Tiles' && <div className="brainTiles">{tiles.map((entity, index) => <article key={entity.id}
            className="brainCard" data-entity-id={entity.id} style={{gridColumn: 'span ' + (layouts[entity.id]?.width || 1)}}
            draggable={!busy} onDragStart={event => event.dataTransfer.setData('text/brain-object', entity.id)}
            onDragOver={event => event.preventDefault()} onDrop={event => {
                event.preventDefault(); const sourceId = event.dataTransfer.getData('text/brain-object');
                if (sourceId !== entity.id && collection.some(item => item.id === sourceId)) {
                    void act(() => moveTile(sourceId, (layouts[entity.id]?.order ?? defaultOrder(entity)) - 0.5,
                        layouts[sourceId]?.width || 1), 'Tile reordered');
                }
            }}>
            {objectLink(entity)}<small>{entity.type}</small><p>{String(entity.metadata?.body || '').slice(0, 240)}</p>
            {statusControl(entity)}
            <div className="brainControls"><label>Tile width<select aria-label={'Tile width for ' + entity.title}
                value={layouts[entity.id]?.width || 1} disabled={busy} onChange={event => void act(() => moveTile(entity.id,
                    layouts[entity.id]?.order ?? defaultOrder(entity), Number(event.target.value)), 'Tile resized')}>
                {[1, 2, 3].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
                <button disabled={busy || index === 0} onClick={() => {
                    const previous = tiles[index - 1];
                    if (previous) void act(() => moveTile(entity.id,
                        (layouts[previous.id]?.order ?? defaultOrder(previous)) - 0.5,
                        layouts[entity.id]?.width || 1), 'Tile moved');
                }}>Move earlier</button>
            </div>
        </article>)}</div>}
        {mode === 'Timeline' && <ObjectTimeline key={JSON.stringify(pageItems.map(item => item.id))}
            ids={pageItems.map(item => item.id)} onSelect={onSelect} />}
        {mode === 'AI Inbox' && <section aria-label="Brain inbox">
            <p>Local keyword suggestions — not AI-generated. Nothing is moved until you approve it.</p>
            <button disabled={busy} onClick={() => void act(suggestInboxProjects, 'Local suggestions refreshed')}>Suggest projects locally</button>
            {suggestions.map(link => <article className="brainCard" key={link.id}>
                <p>{entityMap.get(link.fromEntityId)?.title} → {entityMap.get(link.toEntityId)?.title}</p>
                <small>{link.origin} · {link.confidence === undefined ? 'Confidence unavailable' :
                    Math.round(link.confidence * 100) + '% match score'} · {link.generator || 'Generator unavailable'}</small>
                <p>{link.evidence?.join(' · ') || 'No evidence supplied'}</p>
                <button disabled={busy} onClick={() => void act(() => reviewRelationship(link.id, 'accepted'), 'Suggestion accepted')}>Accept</button>
                <button disabled={busy} onClick={() => void act(() => reviewRelationship(link.id, 'rejected'), 'Suggestion rejected')}>Reject</button>
            </article>)}
            <h3>Unsorted objects</h3>{pageItems.map(entity => <article className="brainCard" key={entity.id}>{objectLink(entity)}
                <small>{entity.type} · Select to add to a project or create a sourced memory.</small>
            </article>)}
        </section>}
        {!page.loading && !page.error && !pageItems.length && <p>No objects match this view. Change the filters or capture something new.</p>}
    </section>;
}
