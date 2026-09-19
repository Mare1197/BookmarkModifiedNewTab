import {useState} from 'react';
import {WorkspaceHierarchy} from './WorkspaceHierarchy';

import type {
    BoardRecord,
    FolderMembership,
    WorkspaceFolder,
    SavedFilter,
    WorkspaceEntity,
    WorkspaceSession,
    WorkspaceTask
} from '../../workspace/types';

interface WorkspaceExplorerProps {
    activeBoardId: string;
    boards: BoardRecord[];
    entities: WorkspaceEntity[];
    folders: WorkspaceFolder[];
    memberships: FolderMembership[];
    selectedEntityId?: string;
    onRefresh: () => Promise<void>;
    savedFilters: SavedFilter[];
    sessions: WorkspaceSession[];
    tasks: WorkspaceTask[];
    mobileOpen?: boolean;
    onClosePanel?: () => void;
    onCreateBoard: () => void;
    onDuplicateBoard: () => void;
    onDeleteBoard: () => void;
    onRenameBoard: () => void;
    onOpenInbox: () => void;
    onOpenSavedFilter: (query: string) => void;
    onOpenSessions: () => void;
    onOpenTasks: () => void;
    onOpenTemplates: () => void;
    onSelectBoard: (boardId: string) => void;
    onSelectEntity: (entityId: string) => void;
}

export function WorkspaceExplorer({
    activeBoardId,
    boards,
    entities,
    folders,
    memberships,
    selectedEntityId,
    onRefresh,
    savedFilters,
    sessions,
    tasks,
    mobileOpen,
    onClosePanel,
    onCreateBoard,
    onDuplicateBoard,
    onDeleteBoard,
    onRenameBoard,
    onOpenInbox,
    onOpenSavedFilter,
    onOpenSessions,
    onOpenTasks,
    onOpenTemplates,
    onSelectBoard,
    onSelectEntity
}: WorkspaceExplorerProps) {
    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = entities.filter(entity =>
        !normalizedQuery || [entity.title, entity.type, entity.canonicalUrl || '']
            .some(value => value.toLocaleLowerCase().includes(normalizedQuery)));
    return (
        <aside className={'workspaceExplorer' + (mobileOpen ? ' mobileOpen' : '')} aria-label="Workspace Explorer">
            <button
                type="button"
                className="mobilePanelClose"
                aria-label="Close Explorer"
                onClick={onClosePanel}
            >
                ×
            </button>
            <div className="workspaceExplorer__actions">
                <button type="button" onClick={onCreateBoard}>＋ New board</button>
                <button type="button" title="Rename board" onClick={onRenameBoard}>Rename</button>
            </div>
            <h2>Boards</h2>
            <nav aria-label="Boards">
                {boards.map(board => (
                    <button
                        type="button"
                        key={board.id}
                        className={board.id === activeBoardId ? 'selected' : ''}
                        aria-current={board.id === activeBoardId ? 'page' : undefined}
                        onClick={() => onSelectBoard(board.id)}
                    >
                        <span>▣</span>{board.name}
                    </button>
                ))}
            </nav>
            <div className="workspaceExplorer__boardActions">
                <button type="button" onClick={onDuplicateBoard}>Duplicate</button>
                <button type="button" onClick={onDeleteBoard}>Delete</button>
            </div>
            <button type="button" className="workspaceExplorer__templateButton" onClick={onOpenTemplates}>
                Board templates
            </button>
            <h2>Inbox</h2>
            <button type="button" className="workspaceExplorer__special" onClick={onOpenInbox}>
                <span>▱</span><span>Quick Inbox</span><i>{entities.filter(entity => entity.inboxAt).length}</i>
            </button>
            <h2>Objects</h2>
            <input
                className="workspaceExplorer__search"
                value={query}
                placeholder="Filter objects"
                aria-label="Filter objects"
                onChange={event => setQuery(event.target.value)}
            />
            <div className="workspaceExplorer__tree" role="tree" aria-label="Board objects">
                {filtered.map(entity => (
                    <button
                        type="button"
                        role="treeitem"
                        key={entity.id}
                        onClick={() => onSelectEntity(entity.id)}
                    >
                        <span>{entity.type === 'note' ? '▤' : entity.type === 'task' ? '☑' :
                            entity.type === 'clip' ? '✂' : entity.type === 'image' ? '▧' : '↗'}</span>
                        <span>{entity.title}</span>
                        {Boolean(entity.metadata?.live) && <i>Live</i>}
                    </button>
                ))}
                {filtered.length === 0 && <p>No matching objects.</p>}
            </div>
            <div className="workspaceExplorer__smart">
                <WorkspaceHierarchy folders={folders} memberships={memberships} entities={entities}
                    selectedEntityId={selectedEntityId} onSelectEntity={onSelectEntity} onRefresh={onRefresh} />
                <h2>Saved filters</h2>
                {savedFilters.map(filter => (
                    <button type="button" key={filter.id} onClick={() => onOpenSavedFilter(filter.query)}>
                        <span>◷</span><span>{filter.name}</span>
                    </button>
                ))}
                <h2>Sessions</h2>
                <button type="button" onClick={onOpenSessions}>
                    <span>▣</span><span>Saved sessions</span><i>{sessions.length}</i>
                </button>
                <h2>Tasks</h2>
                <button type="button" onClick={onOpenTasks}>
                    <span>☑</span><span>My tasks</span><i>{tasks.filter(task => task.status !== 'done').length}</i>
                </button>
            </div>
        </aside>
    );
}
