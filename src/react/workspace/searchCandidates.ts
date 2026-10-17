import type {WorkspaceClient} from './workspaceDatabase';
import type {LibraryQuery} from './libraryQueryTypes';
import {queryGrams} from './searchGrams';
import {initialSearchState} from '../../workspace/searchInvalidation.js';
import {hasSearchIntegrity} from './searchIntegrity';

export type SearchCandidates = {kind: 'scan'; reason: string} |
    {kind: 'indexed'; ids: readonly string[]; generation: number; epoch: string};
const abort = (signal?: AbortSignal) => {if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');};
export async function readSearchCandidates(db: WorkspaceClient, query: LibraryQuery, signal?: AbortSignal): Promise<SearchCandidates> {
    abort(signal);
    const grams = queryGrams(query);
    if (!grams) return {kind: 'scan', reason: 'Query uses exact scanner'};
    try {
        return await db.transaction('r', db.searchState, db.searchChanges, db.searchDocuments, db.entities, async (): Promise<SearchCandidates> => {
            abort(signal);
            const state = await db.searchState.get('main');
            if (!state || state.status !== 'ready' || state.format !== 1 || !state.scanComplete ||
                !Number.isSafeInteger(state.generation) || state.generation !== state.indexedGeneration ||
                state.locale !== initialSearchState().locale || await db.searchChanges.count()) {
                return {kind: 'scan', reason: 'Index incomplete or stale'};
            }
            if (await db.searchDocuments.count() !== await db.entities.count()) return {kind: 'scan', reason: 'Index coverage unavailable'};
            if (!await hasSearchIntegrity(db, state, signal)) return {kind: 'scan', reason: 'Index integrity unavailable'};
            const field = query.dialect + 'Grams';
            // A subset only narrows conservatively. Bound planning requests for very long terms.
            const sample = [...new Set(Array.from({length: Math.min(12, grams.length)}, (_, i) =>
                grams[Math.floor(i * (grams.length - 1) / Math.max(1, Math.min(12, grams.length) - 1))]!))];
            const counts = await Promise.all(sample.map(async gram => ({gram, count: await db.searchDocuments.where(field).equals(gram).count()})));
            counts.sort((a, b) => a.count - b.count);
            const smallest = counts[0]!;
            if (smallest.count > 5000) return {kind: 'scan', reason: 'Common substring uses scanner'};
            const [posting, overflow] = await Promise.all([
                db.searchDocuments.where(field).equals(smallest.gram).limit(5001).primaryKeys(),
                db.searchDocuments.where('overflowDialects').equals(query.dialect).limit(5001).primaryKeys()
            ]);
            abort(signal);
            const ids = [...new Set([...posting, ...overflow])];
            if (ids.length > 5000) return {kind: 'scan', reason: 'Candidate scope uses scanner'};
            return {kind: 'indexed', ids, generation: state.generation, epoch: state.epoch};
        });
    } catch (error) {
        abort(signal);
        if (error instanceof Error && error.name === 'AbortError') throw error;
        return {kind: 'scan', reason: 'Local index unavailable'};
    }
}
