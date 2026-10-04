import type {WorkspaceSnapshot} from './workspaceRepository';
import type {BoardRecord, FolderMembership, WorkspaceEntity} from '../../workspace/types';
import type {LibraryCursor} from './libraryQueryTypes';

export interface WorkspaceShell extends Pick<WorkspaceSnapshot, 'boards' | 'folders' | 'savedFilters'> {
    counts: {entities: number; inbox: number; tasks: number; sessions: number};
}
export interface BoardReadModel extends Pick<WorkspaceSnapshot, 'entities' | 'placements' | 'relationships' | 'assets' | 'tasks'> {
    scope: {kind: 'board'; id: string};
    board?: BoardRecord;
}
export interface ObjectReadModel extends Pick<WorkspaceSnapshot, 'entities' | 'relationships' | 'tasks' | 'boardMemberships' | 'folderMemberships' | 'activities'> {
    entity: WorkspaceEntity;
}
export type GraphScope = {kind: 'library'} | {kind: 'board' | 'project' | 'entity'; id: string};
export interface GraphPage {
    scope: GraphScope;
    entities: WorkspaceSnapshot['entities'];
    relationships: WorkspaceSnapshot['relationships'];
    hasMore: boolean;
    total?: number;
    nextCursor?: LibraryCursor;
}
export interface FolderCursor {folderId: string; position: number; id: string}
export interface FolderPage {
    memberships: FolderMembership[];
    entities: WorkspaceEntity[];
    hasMore: boolean;
    nextCursor?: FolderCursor;
}
