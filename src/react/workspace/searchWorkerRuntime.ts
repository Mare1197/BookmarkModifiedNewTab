import type {WorkspaceClient} from './workspaceDatabase';
import {readLibraryPage} from './libraryQueryEngine';
import {claimSearchLease, runSearchIndexBatch, readSearchStatus, controlSearchIndex} from './searchIndexRepository';
import {validSearchRequest, type SearchWorkerResponse} from './searchWorkerProtocol';
import type {SearchLease} from './searchIndexTypes';

export function createSearchWorkerRuntime(db: WorkspaceClient, post: (response: SearchWorkerResponse) => void) {
    const owner = crypto.randomUUID(), requests = new Map<string, AbortController>();
    let stopped = false, scheduled = false, background = false, building = false;
    let lease: SearchLease | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined, batch: AbortController | undefined;
    const send = (response: SearchWorkerResponse) => {if (!stopped) post(response);};
    function schedule(delay = 0) {
        if (stopped || scheduled || !background) return;
        scheduled = true;
        timer = setTimeout(() => {scheduled = false; void build();}, delay);
    }
    async function build() {
        if (stopped || !background) return;
        if (building || requests.size) {schedule(25); return;}
        building = true;
        try {
            lease ||= await claimSearchLease(db, owner, Date.now());
            if (requests.size) {schedule(25); return;}
            if (!stopped && lease) {
                batch = new AbortController();
                const state = await runSearchIndexBatch(db, lease, {signal: batch.signal});
                if (state.status !== 'building') lease = undefined;
                schedule(state.status === 'ready' ? 1000 : 0); return;
            }
        } catch {lease = undefined; /* Persisted state determines retryability; queries still use the exact scanner. */ }
        finally {batch = undefined; building = false;}
        schedule(1000);
    }
    function dispose() {
        stopped = true; background = false; clearTimeout(timer); batch?.abort();
        for (const request of requests.values()) request.abort(); requests.clear();
    }
    async function handle(request: unknown) {
        if (stopped) return;
        if (!validSearchRequest(request)) {
            const raw = request && typeof request === 'object' ? request as Record<string, unknown> : {};
            const id = typeof raw.requestId === 'string' ? raw.requestId : 'invalid';
            send({protocol: 1, requestId: id, type: 'error', message: 'Unsupported local search request.'}); return;
        }
        const envelope = {protocol: 1 as const, requestId: request.requestId};
        if (request.type === 'dispose') {dispose(); return;}
        if (request.type === 'cancel') {
            requests.get(request.targetId)?.abort(); send({...envelope, type: 'cancelled'}); return;
        }
        if (requests.has(request.requestId)) return;
        const controller = new AbortController(); requests.set(request.requestId, controller);
        try {
            if (request.type === 'query') {
                const before = await readSearchStatus(db);
                const page = await readLibraryPage(db, request.query, {cursor: request.cursor, signal: controller.signal,
                    onProgress: scanned => send({...envelope, type: 'progress', scanned})});
                const after = await readSearchStatus(db);
                if (before.generation !== after.generation || before.epoch !== after.epoch) {
                    throw new Error('Workspace changed during search.');
                }
                if (!controller.signal.aborted) send({...envelope, type: 'page', queryKey: request.queryKey,
                    page, generation: after.generation, epoch: after.epoch});
            } else {
                if (request.type === 'control') {batch?.abort(); lease = undefined;}
                const state = request.type === 'control' ? await controlSearchIndex(db, request.command) : await readSearchStatus(db);
                if (request.type !== 'status') {background = true; schedule();}
                if (!controller.signal.aborted) send({...envelope, type: 'state', state});
            }
        } catch (error) {
            send({...envelope, ...(controller.signal.aborted ? {type: 'cancelled' as const} :
                {type: 'error' as const, message: error instanceof Error && error.name === 'SearchCursorError' ?
                    'Search cursor became stale.' : 'Local search worker unavailable; using safe fallback.'})});
        } finally {requests.delete(request.requestId);}
    }
    return {handle, dispose};
}
