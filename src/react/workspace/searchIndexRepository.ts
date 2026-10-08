import {initialSearchState} from '../../workspace/searchInvalidation.js';
import type {WorkspaceClient} from './workspaceDatabase';
import type {SearchControl, SearchLease, SearchState, SearchStatus} from './searchIndexTypes';
import {deriveSearchDocument} from './searchGrams';

const BATCH_SIZE = 50, LEASE_MS = 15000;
const abort = (signal?: AbortSignal) => {if (signal?.aborted) throw new DOMException('Index work cancelled', 'AbortError');};
function stateOrInitial(state?: SearchState): SearchState {return state || initialSearchState();}
function assertLease(state: SearchState, lease: SearchLease, now: number) {
    if (state.owner !== lease.owner || state.fence !== lease.fence || state.epoch !== lease.epoch ||
        state.leaseUntil <= now || state.status !== 'building') throw new Error('Search lease lost.');
}
export async function readSearchStatus(db: WorkspaceClient): Promise<SearchStatus> {
    return db.transaction('r', db.searchState, db.searchChanges, async () => ({
        ...stateOrInitial(await db.searchState.get('main')), pending: await db.searchChanges.count()
    }));
}
export async function claimSearchLease(db: WorkspaceClient, owner: string, now: number): Promise<SearchLease | undefined> {
    if (!owner || !Number.isFinite(now)) throw new Error('Invalid search owner or clock.');
    return db.transaction('rw', db.searchState, db.searchChanges, db.searchDocuments, db.entities, async () => {
        let state = stateOrInitial(await db.searchState.get('main'));
        const locale = initialSearchState().locale;
        if (state.format !== 1 || state.locale !== locale) {
            state = {...initialSearchState(), generation: state.generation, fence: state.fence + 1,
                status: state.status === 'paused' ? 'paused' : 'unbuilt'};
            await db.searchState.put(state); await db.searchDocuments.clear(); await db.searchChanges.clear();
        }
        if (state.status === 'paused' || state.status === 'error') return;
        if (state.owner && state.owner !== owner && state.leaseUntil > now) return;
        const reset = await db.searchChanges.get('reset');
        if (reset || state.status === 'unbuilt') {
            await db.searchDocuments.clear();
            if (reset) await db.searchChanges.delete(reset.id);
            state = {...state, scanComplete: false, lastId: undefined, processed: 0, buildGeneration: state.generation,
                total: await db.entities.count()};
        }
        if (state.status === 'ready' && state.indexedGeneration === state.generation && !(await db.searchChanges.count())) return;
        const fence = state.owner === owner && state.leaseUntil > now ? state.fence : state.fence + 1;
        await db.searchState.put({...state, owner, fence, leaseUntil: now + LEASE_MS, status: 'building', lastError: undefined});
        return {owner, fence, epoch: state.epoch};
    });
}
export async function runSearchIndexBatch(db: WorkspaceClient, lease: SearchLease,
    options: {signal?: AbortSignal; now?: number} = {}): Promise<SearchState> {
    const now = () => options.now ?? Date.now();
    try {
        abort(options.signal);
        const captured = await db.transaction('r', db.searchState, db.searchChanges, db.entities, async () => {
            const state = stateOrInitial(await db.searchState.get('main'));
            assertLease(state, lease, now()); abort(options.signal);
            if (!state.scanComplete) {
                const entities = await (state.lastId === undefined ? db.entities.orderBy('id') :
                    db.entities.where('id').above(state.lastId)).limit(BATCH_SIZE).toArray();
                const changes = await db.searchChanges.bulkGet(entities.map(entity => 'entity:' + entity.id));
                return {state, entities, changes: changes.filter(change => Boolean(change)), fullScan: true};
            }
            const changes = await db.searchChanges.orderBy('id').limit(BATCH_SIZE).toArray();
            if (changes.some(change => change.kind !== 'entity' || !change.entityId)) throw new Error('Search cache changes require rebuild.');
            const entities = (await db.entities.bulkGet(changes.map(change => change.entityId!))).filter(entity => Boolean(entity));
            return {state, entities, changes, fullScan: false};
        });
        abort(options.signal);
        const documents = captured.entities.map(entity => deriveSearchDocument(entity!, captured.state.generation, lease.epoch, captured.state.locale));
        return await db.transaction('rw', db.searchState, db.searchChanges, db.searchDocuments, db.entities, async () => {
            const state = stateOrInitial(await db.searchState.get('main'));
            assertLease(state, lease, now()); abort(options.signal);
            if (documents.length) await db.searchDocuments.bulkPut(documents);
            const presentIds = new Set(documents.map(doc => doc.id));
            for (const change of captured.changes) {
                if (!change) continue;
                const current = await db.searchChanges.get(change.id);
                if (current?.generation !== change.generation) continue;
                if (!captured.fullScan && !presentIds.has(change.entityId!)) await db.searchDocuments.delete(change.entityId!);
                await db.searchChanges.delete(change.id);
            }
            const next: SearchState = {...state, leaseUntil: now() + LEASE_MS};
            if (captured.fullScan) {
                next.processed += documents.length;
                next.lastId = captured.entities.at(-1)?.id ?? next.lastId;
                next.scanComplete = captured.entities.length < BATCH_SIZE;
            }
            if (next.scanComplete && !(await db.searchChanges.count())) {
                if (await db.searchDocuments.count() !== await db.entities.count()) throw new Error('Search coverage incomplete; rebuild required.');
                next.status = 'ready'; next.indexedGeneration = next.generation;
                next.owner = ''; next.leaseUntil = 0;
            }
            await db.searchState.put(next); return next;
        });
    } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError' && !/lease lost/i.test(error.message)) {
            await db.transaction('rw', db.searchState, async () => {
                const state = await db.searchState.get('main');
                if (state?.owner === lease.owner && state.fence === lease.fence && state.epoch === lease.epoch) {
                    await db.searchState.put({...state, status: 'error', lastError: 'Local index update failed. Retry or rebuild the cache.',
                        owner: '', leaseUntil: 0, fence: state.fence + 1});
                }
            }).catch(() => {});
        }
        throw error;
    }
}
export async function controlSearchIndex(db: WorkspaceClient, command: SearchControl): Promise<SearchStatus> {
    if (!['pause', 'resume', 'rebuild', 'retry'].includes(command)) throw new Error('Unsupported index control.');
    await db.transaction('rw', db.searchState, db.searchChanges, db.searchDocuments, async () => {
        const state = stateOrInitial(await db.searchState.get('main'));
        let next: SearchState = {...state, owner: '', leaseUntil: 0, fence: state.fence + 1, lastError: undefined};
        if (command === 'pause') next.status = 'paused';
        else if (command === 'resume') next.status = 'building';
        else {
            // Only these explicitly derived stores can be cleared. No canonical/recovery table participates.
            await db.searchDocuments.clear(); await db.searchChanges.clear();
            next = {...initialSearchState(), generation: state.generation, buildGeneration: state.generation,
                fence: state.fence + 1, status: 'building'};
        }
        await db.searchState.put(next);
    });
    return readSearchStatus(db);
}
