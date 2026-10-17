import {workspaceClient} from './workspaceClient';
import type {WorkspaceClient} from './workspaceDatabase';
import {readLibraryPage} from './libraryQueryEngine';
import {libraryQueryKey} from './libraryOrdering';
import {readSearchStatus, controlSearchIndex} from './searchIndexRepository';
import type {LibraryQuery, LibraryReadOptions} from './libraryQueryTypes';
import type {SearchControl} from './searchIndexTypes';
import type {SearchWorkerClient, SearchWorkerRequest, SearchWorkerResponse} from './searchWorkerProtocol';
type RequestBody = SearchWorkerRequest extends infer R ? R extends SearchWorkerRequest ? Omit<R, 'protocol' | 'requestId'> : never : never;
const abortError = () => new DOMException('Local search cancelled', 'AbortError');
export function createSearchWorkerClient(factory?: () => Worker, db: WorkspaceClient = workspaceClient): SearchWorkerClient {
    let worker: Worker | undefined, opening: Promise<Worker | undefined> | undefined, failed = false, disposed = false;
    const queries = new Set<AbortController>();
    const pending = new Map<string, {resolve: (r: SearchWorkerResponse) => void; reject: (e: Error) => void;
        cleanup: () => void; queryKey?: string; progress?: (scanned: number) => void}>();
    function fail() {
        failed = true; worker?.terminate(); worker = undefined;
        for (const request of pending.values()) {request.cleanup(); request.reject(new Error('Local search worker unavailable.'));}
        pending.clear();
    }
    async function open() {
        if (disposed) throw abortError();
        if (failed) return;
        if (!opening) opening = (async () => {
            try {
                if (!factory && typeof Worker === 'undefined') throw new Error('Worker unavailable.');
                const created = factory ? factory() : (await import('./searchWorkerFactory')).createBundledSearchWorker();
                if (disposed) {created.terminate(); return;}
                worker = created;
                created.onmessage = event => {
                    const response = event.data as SearchWorkerResponse;
                    if (response?.protocol !== 1 || typeof response.requestId !== 'string') return;
                    const request = pending.get(response.requestId); if (!request) return;
                    if (response.type === 'progress') {request.progress?.(response.scanned); return;}
                    if (response.type === 'page' && response.queryKey !== request.queryKey) return;
                    if (!['page', 'state', 'error', 'cancelled'].includes(response.type)) return;
                    request.cleanup(); pending.delete(response.requestId);
                    if (response.type === 'error') request.reject(new Error(response.message));
                    else if (response.type === 'cancelled') request.reject(abortError());
                    else request.resolve(response);
                };
                created.onerror = event => {event.preventDefault(); fail();};
                created.onmessageerror = fail;
                return created;
            } catch {fail(); return;}
        })();
        return opening;
    }
    async function request(body: RequestBody, options: LibraryReadOptions = {}): Promise<SearchWorkerResponse> {
        if (disposed || options.signal?.aborted) throw abortError();
        const current = await open();
        if (disposed || options.signal?.aborted) throw abortError();
        if (!current || failed) throw new Error('Local search worker unavailable.');
        const requestId = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const cancel = () => {
                const entry = pending.get(requestId); if (!entry) return;
                entry.cleanup(); pending.delete(requestId); reject(abortError());
                try {current.postMessage({protocol: 1, type: 'cancel', requestId: crypto.randomUUID(), targetId: requestId});} catch {fail();}
            };
            let timeout = setTimeout(fail, 15000), lastScanned = -1;
            const cleanup = () => {clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel);};
            const progress = body.type === 'query' ? (scanned: number) => {
                if (!Number.isSafeInteger(scanned) || scanned <= lastScanned) return;
                lastScanned = scanned;
                clearTimeout(timeout); timeout = setTimeout(fail, 15000);
                options.onProgress?.(scanned);
            } : undefined;
            pending.set(requestId, {resolve, reject, cleanup, queryKey: body.type === 'query' ? body.queryKey : undefined, progress});
            options.signal?.addEventListener('abort', cancel, {once: true});
            try {current.postMessage({...body, protocol: 1, requestId});} catch {fail();}
        });
    }
    async function query(query: LibraryQuery, options: LibraryReadOptions = {}) {
        const controller = new AbortController(), cancel = () => controller.abort();
        queries.add(controller); options.signal?.addEventListener('abort', cancel, {once: true});
        if (options.signal?.aborted || disposed) controller.abort();
        const local = {...options, signal: controller.signal};
        try {
            const response = await request({type: 'query', queryKey: libraryQueryKey(query), query, cursor: options.cursor}, local);
            if (response.type !== 'page') throw new Error('Unexpected local search reply.');
            const current = await db.searchState.get('main');
            if (disposed || controller.signal.aborted) throw abortError();
            if (!current || current.generation !== response.generation || current.epoch !== response.epoch) throw new Error('Stale worker page.');
            return response.page;
        } catch (error) {
            if (disposed || controller.signal.aborted || error instanceof Error && error.name === 'AbortError') throw abortError();
            return await readLibraryPage(db, query, {...local, indexMode: 'scan'});
        } finally {queries.delete(controller); options.signal?.removeEventListener('abort', cancel);}
    }
    async function state(body: RequestBody) {
        try {
            const response = await request(body); if (response.type !== 'state') throw new Error('Unexpected index reply.');
            return response.state;
        } catch (error) {
            if (disposed) throw abortError();
            if (body.type === 'control') return controlSearchIndex(db, body.command);
            const local = await readSearchStatus(db);
            return {...local, lastError: local.lastError || (error instanceof Error ? error.message : 'Worker unavailable.')};
        }
    }
    return {query, ensureIndex: () => state({type: 'ensureIndex'}), status: () => state({type: 'status'}),
        control: (command: SearchControl) => {
            if (failed && (command === 'retry' || command === 'rebuild')) {failed = false; opening = undefined;}
            return state({type: 'control', command});
        },
        dispose() {
            disposed = true;
            for (const query of queries) query.abort(); queries.clear();
            for (const request of pending.values()) {request.cleanup(); request.reject(abortError());} pending.clear();
            worker?.terminate(); worker = undefined;
        }};
}
let service: SearchWorkerClient | undefined;
export function getSearchWorkerClient() {return service ||= createSearchWorkerClient();}
export function releaseSearchWorkerClient(client: SearchWorkerClient) {
    if (service === client) service = undefined;
    client.dispose();
}
