import type {LibraryQuery, LibraryCursor, LibraryPage, LibraryReadOptions} from './libraryQueryTypes';
import type {SearchControl, SearchStatus} from './searchIndexTypes';
type Envelope = {protocol: 1; requestId: string};
export type SearchWorkerRequest = Envelope & (
    {type: 'query'; queryKey: string; query: LibraryQuery; cursor?: LibraryCursor} |
    {type: 'control'; command: SearchControl} | {type: 'ensureIndex' | 'status' | 'dispose'} |
    {type: 'cancel'; targetId: string});
export type SearchWorkerResponse = Envelope & (
    {type: 'page'; queryKey: string; page: LibraryPage; generation: number; epoch: string} |
    {type: 'state'; state: SearchStatus} | {type: 'progress'; scanned: number} |
    {type: 'cancelled'} | {type: 'error'; message: string});
export interface SearchWorkerClient {
    query(query: LibraryQuery, options?: LibraryReadOptions): Promise<LibraryPage>;
    ensureIndex(): Promise<SearchStatus>;
    control(command: SearchControl): Promise<SearchStatus>;
    status(): Promise<SearchStatus>;
    dispose(): void;
}
export function validSearchRequest(value: unknown): value is SearchWorkerRequest {
    if (!value || typeof value !== 'object') return false;
    const r = value as Record<string, unknown>;
    if (r.protocol !== 1 || typeof r.requestId !== 'string' || !r.requestId || r.requestId.length > 200) return false;
    if (['status', 'ensureIndex', 'dispose'].includes(String(r.type))) return true;
    if (r.type === 'cancel') return typeof r.targetId === 'string';
    if (r.type === 'control') return ['pause', 'resume', 'rebuild', 'retry'].includes(String(r.command));
    if (r.type !== 'query' || typeof r.queryKey !== 'string' || !r.query || typeof r.query !== 'object') return false;
    const q = r.query as Record<string, unknown>;
    return ['brain', 'smart', 'explorer'].includes(String(q.dialect)) && typeof q.text === 'string' &&
        ['id', 'updated', 'title', 'tiles', 'inbox'].includes(String(q.sort)) && Number.isFinite(q.referenceTime) &&
        ['boardId', 'projectId', 'relatedTo', 'type', 'status', 'tileScope'].every(key => q[key] === undefined || typeof q[key] === 'string') &&
        (q.inbox === undefined || typeof q.inbox === 'boolean') &&
        (q.tileBaseSort === undefined || ['title', 'updated'].includes(String(q.tileBaseSort))) &&
        (r.cursor === undefined || (typeof r.cursor === 'object' && r.cursor !== null && typeof (r.cursor as LibraryCursor).signature === 'string'));
}
