import {useDeferredValue, useMemo, useState} from 'react';

import type {WorkspaceEntity, WorkspaceTaskStatus} from '../../workspace/types';
import {
    addEntityToBoard,
    captureWindowSession,
    createBoardFromTemplate,
    createSavedFilter,
    deleteSavedFilter,
    deleteWorkspaceSession,
    isBuiltInFilter,
    openWorkspaceSession,
    setInboxState,
    updateTask,
    type WorkspaceSnapshot
} from './workspaceRepository';
import {filterWorkspaceEntities} from './workspaceSearch';

interface AsyncViewProps {
    onRefresh: () => Promise<void>;
    onStatus: (message: string) => void;
}

export function SmartSearchView({
    onQueryChange,
    onRefresh,
    onSelect,
    onStatus,
    query,
    snapshot
}: AsyncViewProps & {
    onQueryChange: (query: string) => void;
    onSelect: (entityId: string) => void;
    query: string;
    snapshot: WorkspaceSnapshot;
}) {
    const deferredQuery = useDeferredValue(query);
    const results = useMemo(() => filterWorkspaceEntities(snapshot, deferredQuery), [deferredQuery, snapshot]);
    const save = async () => {
        const name = window.prompt('Filter name', query || 'Saved filter');
        if (name === null) {
            return;
        }
        try {
            await createSavedFilter(name, query);
            await onRefresh();
            onStatus('Saved filter created.');
        } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Filter could not be saved.');
        }
    };
    return (
        <section className="workspaceSearch" aria-label="Unified local search">
            <header>
                <input
                    autoFocus
                    value={query}
                    placeholder="Search or use type:, domain:, board:, after:, has:, status:, is:inbox"
                    onChange={event => onQueryChange(event.target.value)}
                />
                <button type="button" onClick={() => void save()}>Save filter</button>
            </header>
            <div className="workspaceSearch__syntax">
                <span>type:clip</span><span>domain:github.com</span><span>after:7d</span>
                <span>has:backlinks</span><span>status:next</span><span>is:inbox</span>
            </div>
            <div className="workspaceSearch__results">
                {results.map(entity => (
                    <button type="button" key={entity.id} onClick={() => onSelect(entity.id)}>
                        <span className="workspaceSearch__type">{entity.type}</span>
                        <strong>{entity.title}</strong>
                        <small>{entity.canonicalUrl || String(entity.metadata?.body || '')}</small>
                    </button>
                ))}
                {results.length === 0 && <p>No local results.</p>}
            </div>
            <aside className="workspaceSearch__saved" aria-label="Saved filters">
                <h3>Saved filters</h3>
                {snapshot.savedFilters.map(filter => (
                    <div key={filter.id}>
                        <button type="button" onClick={() => onQueryChange(filter.query)}>{filter.name}</button>
                        {!isBuiltInFilter(filter.id) && (
                            <button type="button" aria-label={'Delete ' + filter.name} onClick={() => {
                                void deleteSavedFilter(filter.id).then(onRefresh).catch(error => {
                                    onStatus(error instanceof Error ? error.message : 'Filter could not be deleted.');
                                });
                            }}>×</button>
                        )}
                    </div>
                ))}
            </aside>
        </section>
    );
}

export function InboxView({
    activeBoardId,
    onRefresh,
    onSelect,
    onStatus,
    snapshot
}: AsyncViewProps & {
    activeBoardId: string;
    onSelect: (entityId: string) => void;
    snapshot: WorkspaceSnapshot;
}) {
    const inbox = snapshot.entities.filter(entity => entity.inboxAt)
        .sort((left, right) => (right.inboxAt || 0) - (left.inboxAt || 0));
    const run = async (action: () => Promise<void>, message: string) => {
        try {
            await action();
            await onRefresh();
            onStatus(message);
        } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Inbox action failed.');
        }
    };
    return (
        <section className="workspaceWorkflow" aria-label="Quick Inbox">
            <header><div><h2>Quick Inbox</h2><p>Capture now, organize when you are ready.</p></div><strong>{inbox.length}</strong></header>
            <div className="workspaceWorkflow__rows">
                {inbox.map(entity => (
                    <article key={entity.id}>
                        <button type="button" className="workspaceWorkflow__primary" onClick={() => onSelect(entity.id)}>
                            <span>{entity.type}</span><strong>{entity.title}</strong>
                            <small>{entity.canonicalUrl || String(entity.metadata?.body || '')}</small>
                        </button>
                        <div>
                            <button type="button" onClick={() => void run(() => addEntityToBoard(entity.id, activeBoardId), 'Added to the current board.')}>Add to board</button>
                            <button type="button" onClick={() => void run(() => setInboxState(entity.id, false), 'Inbox item triaged.')}>Remove from Inbox</button>
                        </div>
                    </article>
                ))}
                {inbox.length === 0 && <p className="workspaceWorkflow__empty">Inbox zero. New Quick Add captures can appear here.</p>}
            </div>
        </section>
    );
}

export function SessionsView({activeBoardId, onRefresh, onStatus, snapshot}: AsyncViewProps & {
    activeBoardId: string;
    snapshot: WorkspaceSnapshot;
}) {
    const boardMap = new Map(snapshot.boards.map(board => [board.id, board]));
    const run = async (action: () => Promise<void>, message: string) => {
        try {
            await action();
            await onRefresh();
            onStatus(message);
        } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Session action failed.');
        }
    };
    return (
        <section className="workspaceWorkflow" aria-label="Workspace sessions">
            <header>
                <div><h2>Living workspace sessions</h2><p>Capture a window, then restore its web tabs when the work resumes.</p></div>
                <button type="button" className="primaryButton" onClick={() => void run(
                    () => captureWindowSession(activeBoardId).then(() => undefined), 'Window session captured.')}>Capture current window</button>
            </header>
            <div className="workspaceWorkflow__rows">
                {snapshot.workspaceSessions.map(session => (
                    <article key={session.id}>
                        <div className="workspaceWorkflow__primary">
                            <span>Session</span><strong>{session.name}</strong>
                            <small>{session.tabs.length} tabs · {boardMap.get(session.boardId)?.name || 'Unknown board'} · {new Date(session.updatedAt).toLocaleString()}</small>
                        </div>
                        <div>
                            <button type="button" onClick={() => void run(() => openWorkspaceSession(session.id), 'Session opened in a new window.')}>Open</button>
                            <button type="button" onClick={() => void run(() => deleteWorkspaceSession(session.id), 'Session removed.')}>Delete</button>
                        </div>
                    </article>
                ))}
                {snapshot.workspaceSessions.length === 0 && <p className="workspaceWorkflow__empty">No saved sessions yet.</p>}
            </div>
        </section>
    );
}

const taskStatuses: WorkspaceTaskStatus[] = ['backlog', 'next', 'in-progress', 'blocked', 'done'];

export function TasksView({
    onFocus,
    onNewTask,
    onRefresh,
    onSelect,
    onStatus,
    snapshot
}: AsyncViewProps & {
    onFocus: (entity: WorkspaceEntity, relatedEntityIds: string[]) => void;
    onNewTask: () => void;
    onSelect: (entityId: string) => void;
    snapshot: WorkspaceSnapshot;
}) {
    const [filter, setFilter] = useState<WorkspaceTaskStatus | 'all'>('all');
    const entityMap = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    const rows = snapshot.tasks.filter(task => filter === 'all' || task.status === filter)
        .sort((left, right) => (left.dueAt || Number.MAX_SAFE_INTEGER) - (right.dueAt || Number.MAX_SAFE_INTEGER));
    const runUpdate = async (taskId: string, patch: Parameters<typeof updateTask>[1]) => {
        try {
            await updateTask(taskId, patch);
            await onRefresh();
            onStatus('Task updated.');
        } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Task could not be updated.');
        }
    };
    return (
        <section className="workspaceWorkflow" aria-label="Workspace tasks">
            <header>
                <div><h2>Tasks & focus</h2><p>Tasks stay searchable and connected to their source material.</p></div>
                <button type="button" className="primaryButton" onClick={onNewTask}>New task</button>
            </header>
            <nav className="workspaceWorkflow__filters" aria-label="Task status filters">
                {(['all', ...taskStatuses] as const).map(status => (
                    <button type="button" key={status} className={filter === status ? 'selected' : ''} onClick={() => setFilter(status)}>{status}</button>
                ))}
            </nav>
            <div className="workspaceWorkflow__rows">
                {rows.map(task => {
                    const entity = entityMap.get(task.entityId);
                    if (!entity) {
                        return null;
                    }
                    const related = snapshot.relationships.filter(relationship =>
                        relationship.fromEntityId === entity.id || relationship.toEntityId === entity.id)
                        .map(relationship => relationship.fromEntityId === entity.id ? relationship.toEntityId : relationship.fromEntityId);
                    return (
                        <article key={task.id}>
                            <button type="button" className="workspaceWorkflow__primary" onClick={() => onSelect(entity.id)}>
                                <span>Task</span><strong>{entity.title}</strong>
                                <small>{task.dueAt ? 'Due ' + new Date(task.dueAt).toLocaleDateString() : 'No due date'} · {related.length} linked objects</small>
                            </button>
                            <div>
                                <select aria-label={'Status for ' + entity.title} value={task.status} onChange={event => void runUpdate(task.id, {status: event.target.value as WorkspaceTaskStatus})}>
                                    {taskStatuses.map(status => <option key={status}>{status}</option>)}
                                </select>
                                <button type="button" onClick={() => onFocus(entity, related)}>Focus</button>
                            </div>
                        </article>
                    );
                })}
                {rows.length === 0 && <p className="workspaceWorkflow__empty">No tasks in this view.</p>}
            </div>
        </section>
    );
}

export function ActivityView({snapshot}: {snapshot: WorkspaceSnapshot}) {
    const entityMap = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    const boardMap = new Map(snapshot.boards.map(board => [board.id, board]));
    return (
        <section className="workspaceWorkflow workspaceActivity" aria-label="Activity timeline">
            <header><div><h2>Activity & history work tree</h2><p>Observed workspace actions and provenance, newest first.</p></div></header>
            <ol>
                {snapshot.activities.map(activity => (
                    <li key={activity.id}>
                        <time>{new Date(activity.createdAt).toLocaleString()}</time>
                        <div><strong>{activity.summary}</strong>
                            <span>{entityMap.get(activity.entityId || '')?.title || boardMap.get(activity.boardId || '')?.name || 'Workspace'}</span>
                        </div>
                    </li>
                ))}
                {snapshot.activities.length === 0 && <p className="workspaceWorkflow__empty">Activity begins when you capture, edit, connect, organize, or restore workspace objects.</p>}
            </ol>
        </section>
    );
}

export function TemplatesView({onCreated, onRefresh, onStatus, snapshot}: AsyncViewProps & {
    onCreated: (boardId: string) => void;
    snapshot: WorkspaceSnapshot;
}) {
    const create = async (templateId: string) => {
        try {
            const board = await createBoardFromTemplate(templateId);
            await onRefresh();
            onCreated(board.id);
            onStatus('Board created from template.');
        } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Template could not be created.');
        }
    };
    return (
        <section className="workspaceWorkflow" aria-label="Board templates">
            <header><div><h2>Board templates</h2><p>Start with a useful structure, then auto-layout whenever the board changes.</p></div></header>
            <div className="workspaceTemplates">
                {snapshot.boardTemplates.map(template => (
                    <article key={template.id}>
                        <strong>{template.name}</strong><p>{template.description}</p>
                        <button type="button" className="primaryButton" onClick={() => void create(template.id)}>Create board</button>
                    </article>
                ))}
            </div>
        </section>
    );
}
