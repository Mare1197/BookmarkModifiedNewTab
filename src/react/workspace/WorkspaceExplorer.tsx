import {useState} from 'react';
import {WorkspaceHierarchy} from './WorkspaceHierarchy';
import {useLibraryPage} from './useLibraryPage';
import {LibraryPager} from './LibraryPager';
import {WindowedObjectList} from './WindowedObjectList';

import type {
    BoardRecord,
    WorkspaceFolder,
    SavedFilter
} from '../../workspace/types';

interface WorkspaceExplorerProps {
    activeBoardId: string;
    boards: BoardRecord[];
    counts: {entities: number; inbox: number; tasks: number; sessions: number};
    folders: WorkspaceFolder[];
    selectedEntityId?: string;
    onRefresh: () => Promise<void>;
    savedFilters: SavedFilter[];
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
    counts,
    folders,
    selectedEntityId,
    onRefresh,
    savedFilters,
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
    const page = useLibraryPage({dialect: 'explorer', text: query, sort: 'id'});
    const filtered = page.data?.items || [];
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
                <span>▱</span><span>Quick Inbox</span><i>{counts.inbox}</i>
            </button>
            <h2>Objects</h2>
            <input
                className="workspaceExplorer__search"
                value={query}
                placeholder="Filter objects"
                aria-label="Filter objects"
                onChange={event => setQuery(event.target.value)}
            />
            <WindowedObjectList items={filtered} selectedId={selectedEntityId} listKey={query + ':' + page.index}
                label="Board objects" render={(entity, index) => (
                    <button
                        type="button"
                        role="treeitem"
                        aria-posinset={index + 1} aria-setsize={filtered.length} aria-selected={entity.id === selectedEntityId}
                        key={entity.id}
                        onClick={() => onSelectEntity(entity.id)}
                        draggable onDragStart={event => {event.dataTransfer.setData('text/brain-object', entity.id); event.dataTransfer.effectAllowed = 'copy';}}
                    >
                        <span>{entity.type === 'note' ? '▤' : entity.type === 'task' ? '☑' :
                            entity.type === 'clip' ? '✂' : entity.type === 'image' ? '▧' : '↗'}</span>
                        <span>{entity.title}</span>
                        {Boolean(entity.metadata?.live) && <i>Live</i>}
                    </button>
                )} />
            {!page.loading && !page.error && filtered.length === 0 && <p>No matching objects.</p>}
            <LibraryPager page={page} label="Explorer pages" />
            <div className="workspaceExplorer__smart">
                <WorkspaceHierarchy folders={folders}
                    selectedEntityId={selectedEntityId} onSelectEntity={onSelectEntity} onRefresh={onRefresh} />
                <h2>Saved filters</h2>
                {savedFilters.map(filter => (
                    <button type="button" key={filter.id} onClick={() => onOpenSavedFilter(filter.query)}>
                        <span>◷</span><span>{filter.name}</span>
                    </button>
                ))}
                <h2>Sessions</h2>
                <button type="button" onClick={onOpenSessions}>
                    <span>▣</span><span>Saved sessions</span><i>{counts.sessions}</i>
                </button>
                <h2>Tasks</h2>
                <button type="button" onClick={onOpenTasks}>
                    <span>☑</span><span>My tasks</span><i>{counts.tasks}</i>
                </button>
            </div>
        </aside>
    );
}
