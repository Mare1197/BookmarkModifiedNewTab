import type {WorkspaceEntity} from '../../workspace/types';

export interface LibraryQuery {
    dialect: 'smart' | 'brain' | 'explorer';
    text: string;
    boardId?: string;
    projectId?: string;
    relatedTo?: string;
    type?: string;
    status?: string;
    inbox?: boolean;
    sort: 'id' | 'updated' | 'title' | 'tiles' | 'inbox';
    tileScope?: string;
    tileBaseSort?: 'title' | 'updated';
    referenceTime: number;
}

// Ephemeral continuation only. Owners discard it when observed data changes.
export interface LibraryCursor {
    signature: string;
    lastId?: string;
    updatedAt?: number;
    orderedIds?: readonly string[];
    defaultOrders?: Readonly<Record<string, number>>;
    position?: number;
    searchGeneration?: number;
    searchEpoch?: string;
}
export interface LibraryPage {
    items: WorkspaceEntity[];
    nextCursor?: LibraryCursor;
    hasMore: boolean;
    total?: number;
    scanned: number;
    defaultOrders?: Readonly<Record<string, number>>;
    searchGeneration?: number;
    searchEpoch?: string;
}
export interface LibraryReadOptions {
    cursor?: LibraryCursor;
    signal?: AbortSignal;
    onProgress?: (scanned: number) => void;
}
