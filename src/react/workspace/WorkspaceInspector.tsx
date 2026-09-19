import {useState, type ReactNode} from 'react';
import {browser} from 'wxt/browser';

import type {
    BoardPlacement,
    BoardRecord,
    FolderMembership,
    WorkspaceActivity,
    WorkspaceFolder,
    RelationshipRecord,
    WorkspaceEntity,
    WorkspaceTask,
    WorkspaceTaskStatus
} from '../../workspace/types';

interface WorkspaceInspectorProps {
    children?: ReactNode;
    boards: BoardRecord[];
    boardMemberships: Array<Pick<BoardPlacement, 'boardId' | 'entityId'>>;
    folders: WorkspaceFolder[];
    folderMemberships: FolderMembership[];
    activities: WorkspaceActivity[];
    entity?: WorkspaceEntity;
    entities: WorkspaceEntity[];
    placement?: BoardPlacement;
    relationships: RelationshipRecord[];
    tasks: WorkspaceTask[];
    mobileOpen?: boolean;
    onClosePanel?: () => void;
    onCreateTask: () => void;
    onInboxChange: (inInbox: boolean) => Promise<void>;
    onSave: (patch: Partial<WorkspaceEntity>) => Promise<void>;
    onTaskSave: (taskId: string, patch: Partial<WorkspaceTask>) => Promise<void>;
}

function formatDateTime(value: number): string {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' +
        date.getFullYear() + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function localDateTimeInput(value?: number): string {
    if (!value) {
        return '';
    }
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export function WorkspaceInspector({
    children,
    boards,
    boardMemberships,
    folders,
    folderMemberships,
    activities,
    entity,
    entities,
    mobileOpen,
    onClosePanel,
    placement,
    relationships,
    tasks,
    onCreateTask,
    onInboxChange,
    onSave,
    onTaskSave
}: WorkspaceInspectorProps) {
    const [drafts, setDrafts] = useState<Record<string, {title: string; body: string}>>({});
    const [feedback, setFeedback] = useState<{entityId?: string; message: string}>({message: ''});
    const [savingEntityId, setSavingEntityId] = useState<string>();
    const draft = entity ? drafts[entity.id] : undefined;
    const title = draft?.title ?? entity?.title ?? '';
    const body = draft?.body ?? String(entity?.metadata?.body || '');
    const status = feedback.entityId === entity?.id ? feedback.message : '';
    const setStatus = (message: string) => setFeedback({entityId: entity?.id, message});
    const edit = (patch: Partial<{title: string; body: string}>) => {
        if (entity) {
            setDrafts(current => ({...current, [entity.id]: {title, body, ...patch}}));
            setStatus('Unsaved changes');
        }
    };

    if (!entity) {
        return (
            <aside className={'workspaceInspector' + (mobileOpen ? ' mobileOpen' : '')} aria-label="Inspector">
                <button type="button" className="mobilePanelClose" aria-label="Close Inspector" onClick={onClosePanel}>×</button>
                <header>Inspector</header>
                <div className="workspaceInspector__empty">Select a card to inspect or edit it.</div>
            </aside>
        );
    }

    const relatedCount = relationships.filter(relationship => relationship.confirmed &&
        (relationship.fromEntityId === entity.id || relationship.toEntityId === entity.id)).length;
    const task = tasks.find(candidate => candidate.entityId === entity.id);
    const entityMap = new Map(entities.map(candidate => [candidate.id, candidate]));
    const backlinks = relationships.filter(relationship => relationship.confirmed && relationship.toEntityId === entity.id)
        .map(relationship => entityMap.get(
            relationship.fromEntityId === entity.id ? relationship.toEntityId : relationship.fromEntityId))
        .filter(Boolean) as WorkspaceEntity[];

    const save = async () => {
        if (savingEntityId === entity.id) return;
        setSavingEntityId(entity.id);
        try {
            await onSave({title, metadata: {...entity.metadata, body}});
            setDrafts(current => {
                // A save finishing after another edit must not discard the newer draft.
                if (current[entity.id]?.title !== title || current[entity.id]?.body !== body) {
                    return current;
                }
                const next = {...current};
                delete next[entity.id];
                return next;
            });
            setStatus('Saved');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Save failed.');
        } finally {
            setSavingEntityId(undefined);
        }
    };
    const open = async () => {
        try {
            if (entity.canonicalUrl) {
                await browser.tabs.create({url: entity.canonicalUrl});
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Tab could not be opened.');
        }
    };
    const saveTask = async (patch: Partial<WorkspaceTask>) => {
        if (!task) {
            return;
        }
        try {
            await onTaskSave(task.id, patch);
            setStatus('Task updated');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Task update failed.');
        }
    };

    return (
        <aside className={'workspaceInspector' + (mobileOpen ? ' mobileOpen' : '')} aria-label="Inspector">
            <button type="button" className="mobilePanelClose" aria-label="Close Inspector" onClick={onClosePanel}>×</button>
            <header>Inspector</header>
            <section>
                <span className="workspaceInspector__eyebrow">{entity.type}</span>
                <label>
                    Title
                    <input disabled={savingEntityId === entity.id} value={title} onChange={event => {
                        edit({title: event.target.value});
                    }} />
                </label>
                {entity.canonicalUrl && (
                    <label>
                        URL
                        <input value={entity.canonicalUrl} readOnly />
                    </label>
                )}
                {(entity.type !== 'image' && entity.type !== 'screenshot') && (
                    <label>
                        Notes
                        <textarea disabled={savingEntityId === entity.id} value={body} onChange={event => {
                            edit({body: event.target.value});
                        }} rows={6} />
                    </label>
                )}
            </section>
            {children}
            <section className="workspaceInspector__facts">
                <h3>Boards</h3>
                <ul>{boards.filter(board => boardMemberships.some(member =>
                    member.entityId === entity.id && member.boardId === board.id))
                    .map(board => <li key={board.id}>{board.name}</li>)}</ul>
                {!boardMemberships.some(member => member.entityId === entity.id) && <p>Not on a board.</p>}
                <dl>
                    <div><dt>Position</dt><dd>{placement ? Math.round(placement.x) + ', ' + Math.round(placement.y) : 'Not placed'}</dd></div>
                    <div><dt>Connections</dt><dd>{relatedCount}</dd></div>
                    <div><dt>Updated</dt><dd>{formatDateTime(entity.updatedAt)}</dd></div>
                </dl>
            </section>
            {task && (
                <section className="workspaceInspector__task">
                    <h3>Task</h3>
                    <label>
                        Status
                        <select value={task.status} onChange={event => {
                            void saveTask({status: event.target.value as WorkspaceTaskStatus});
                        }}>
                            {(['backlog', 'next', 'in-progress', 'blocked', 'done'] as WorkspaceTaskStatus[])
                                .map(value => <option key={value}>{value}</option>)}
                        </select>
                    </label>
                    <label>
                        Due date
                        <input
                            type="date"
                            value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ''}
                            onChange={event => void saveTask({
                                dueAt: event.target.value ? new Date(event.target.value).getTime() : undefined
                            })}
                        />
                    </label>
                    <label>
                        Reminder
                        <input
                            type="datetime-local"
                            value={localDateTimeInput(task.reminderAt)}
                            onChange={event => void saveTask({
                                reminderAt: event.target.value ? new Date(event.target.value).getTime() : undefined
                            })}
                        />
                    </label>
                </section>
            )}
            <section className="workspaceInspector__facts">
                <h3>Folders</h3>
                <ul>{folders.filter(folder => folderMemberships.some(member =>
                    member.entityId === entity.id && member.folderId === folder.id))
                    .map(folder => <li key={folder.id}>{folder.title} <small>{folder.sourceKind}</small></li>)}</ul>
                {!folderMemberships.some(member => member.entityId === entity.id) && <p>No folder memberships.</p>}
            </section>
            <section className="workspaceInspector__facts">
                <h3>History</h3>
                <p>Created {formatDateTime(entity.createdAt)}</p>
                <ul>{activities.filter(activity => activity.entityId === entity.id).slice(0, 10)
                    .map(activity => <li key={activity.id}>{activity.summary} · {formatDateTime(activity.createdAt)}</li>)}</ul>
                <p>Recent recorded workspace activity only; browser history is not inferred.</p>
            </section>
            <section className="workspaceInspector__facts">
                <h3>Backlinks</h3>
                {Array.from(new Map(backlinks.map(backlink => [backlink.id, backlink])).values())
                    .map(backlink => <p key={backlink.id}>{backlink.title} <small>{backlink.type}</small></p>)}
                {backlinks.length === 0 && <p>No backlinks yet.</p>}
            </section>
            <section className="workspaceInspector__facts">
                <h3>Source</h3>
                <p>{String(entity.metadata?.sourceKind || 'Unknown')}</p>
                <p>Provenance not observed is shown as unknown.</p>
            </section>
            <footer>
                <button type="button" className="primaryButton" disabled={Boolean(savingEntityId)} onClick={() => void save()}>Save</button>
                {entity.canonicalUrl && <button type="button" onClick={() => void open()}>Open in tab</button>}
                {!task && <button type="button" onClick={onCreateTask}>Create linked task</button>}
                <button type="button" onClick={() => void onInboxChange(!entity.inboxAt).catch(error => {
                    setStatus(error instanceof Error ? error.message : 'Inbox update failed.');
                })}>
                    {entity.inboxAt ? 'Remove from Inbox' : 'Send to Inbox'}
                </button>
                <span role="status">{status}</span>
            </footer>
        </aside>
    );
}
