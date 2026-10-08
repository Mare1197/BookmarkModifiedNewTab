(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.workspaceSearchInvalidation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const SEARCH_SCHEMA = {searchState: 'key', searchChanges: 'id,generation',
        searchDocuments: 'id,epoch,*explorerGrams,*brainGrams,*smartGrams,*overflowDialects'};
    const initialSearchState = () => ({key: 'main', format: 1, locale: Intl.DateTimeFormat().resolvedOptions().locale,
        generation: 0, indexedGeneration: -1, buildGeneration: 0, epoch: crypto.randomUUID(),
        status: 'unbuilt', processed: 0, owner: '', leaseUntil: 0, fence: 0, scanComplete: false});
    const initializeSearchState = transaction => transaction.table('searchState').put(initialSearchState()).then(() => {});
    function changedState(state, reset) {
        const next = Object.assign({}, state || initialSearchState());
        next.generation++;
        if (next.status === 'ready') next.status = 'building';
        if (reset) Object.assign(next, {epoch: crypto.randomUUID(), fence: next.fence + 1, owner: '', leaseUntil: 0,
            scanComplete: false, lastId: undefined, processed: 0, buildGeneration: next.generation});
        return next;
    }
    function installSearchInvalidation(db) {
        db.use({stack: 'dbcore', name: 'WorkspaceSearchInvalidation', level: 10, create: down => {
            const tails = new WeakMap();
            const hasSearchStores = down.schema.tables.some(table => table.name === 'searchState') &&
                down.schema.tables.some(table => table.name === 'searchChanges');
            return Object.assign({}, down, {
                transaction: (stores, mode, options) => down.transaction(hasSearchStores && mode === 'readwrite' && stores.includes('entities') ?
                    Array.from(new Set(stores.concat(['searchState', 'searchChanges']))) : stores, mode, options),
                table: name => {
                    const table = down.table(name);
                    if (name !== 'entities' || !hasSearchStores) return table;
                    return Object.assign({}, table, {mutate: request => {
                        const result = table.mutate(request);
                        const previous = tails.get(request.trans) || Promise.resolve();
                        const pending = previous.then(() => result).then(async response => {
                            const stateTable = down.table('searchState'), changesTable = down.table('searchChanges');
                            const reset = request.type === 'deleteRange';
                            const state = changedState(await stateTable.get({trans: request.trans, key: 'main'}), reset);
                            const ids = reset ? [] : Array.from(new Set(request.keys || (request.values || []).map(value => value.id)));
                            const changes = reset ? [{id: 'reset', generation: state.generation, kind: 'reset'}] :
                                ids.map(id => ({id: 'entity:' + id, entityId: id, generation: state.generation, kind: 'entity'}));
                            const stateResult = await stateTable.mutate({trans: request.trans, type: 'put', values: [state]});
                            const changesResult = changes.length ? await changesTable.mutate({trans: request.trans, type: 'put', values: changes}) : undefined;
                            if (stateResult.numFailures || changesResult && changesResult.numFailures) throw new Error('Could not journal search changes.');
                            return response;
                        }).catch(error => {request.trans.abort(); throw error;});
                        tails.set(request.trans, pending);
                        return pending;
                    }});
                }
            });
        }});
    }
    async function invalidateSearch(db) {
        await db.transaction('rw', db.table('searchState'), db.table('searchChanges'), async () => {
            const state = changedState(await db.table('searchState').get('main'), true);
            await db.table('searchState').put(state);
            await db.table('searchChanges').put({id: 'reset', generation: state.generation, kind: 'reset'});
        });
    }
    return {SEARCH_SCHEMA, initialSearchState, initializeSearchState, installSearchInvalidation, invalidateSearch};
}));
