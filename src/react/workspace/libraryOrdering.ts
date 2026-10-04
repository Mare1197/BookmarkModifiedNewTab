import type {LibraryQuery} from './libraryQueryTypes';
export interface LibraryOrderRow {id: string; title: string; updatedAt: number}

export function compareLibraryRows(sort: LibraryQuery['sort'], a: LibraryOrderRow, b: LibraryOrderRow): number {
    return (sort === 'updated' ? b.updatedAt - a.updatedAt : a.title.localeCompare(b.title)) || a.id.localeCompare(b.id);
}

export function libraryQueryKey(query: LibraryQuery): string {
    return JSON.stringify([query.dialect, query.text, query.boardId || '', query.projectId || '',
        query.type || '', query.status || '', Boolean(query.inbox), query.sort, query.tileScope || '', query.referenceTime, query.relatedTo || '', query.tileBaseSort || 'updated']);
}
