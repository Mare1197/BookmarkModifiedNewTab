const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {createWorkspaceRepository} = require('../src/workspace/workspaceDb');
const {existsSync} = require('node:fs');
const {renderToStaticMarkup} = require('react-dom/server');
const React = require('react');
const {searchFixture} = require('./helpers/searchFixture');

test('search cache is excluded from both export modes and both writers', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    await db.entities.put({id: 'original', title: 'Original', type: 'note', searchTerms: [], createdAt: 1, updatedAt: 1});
    await db.searchDocuments.put({id: 'original', fingerprint: 'derived'});
    for (const includeRecovery of [false, true]) for (const snapshot of [
        await repo.exportWorkspace({includeRecovery}), await createWorkspaceRepository({db}).exportSnapshot({includeRecovery})
    ]) {
        for (const name of ['searchState', 'searchChanges', 'searchDocuments']) assert.equal(Object.hasOwn(snapshot.tables, name), false);
        assert.equal(snapshot.tables.entities.length, 1);
        assert.equal(snapshot.schemaVersion, 4);
    }
});
test('imports reject derived cache tables before canonical writes', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    for (const name of ['searchState', 'searchChanges', 'searchDocuments']) {
        await assert.rejects(repo.importWorkspace({format: 'browser-os-workspace', schemaVersion: 4, tables: {[name]: []}}), /derived.*search|search.*cache/i);
        assert.equal(await db.entities.count(), 0);
    }
});
test('index progress cannot claim ready from counts and panel exposes all controls', async t => {
    const {db, load} = await workspaceFixture(t);
    const api = existsSync('src/react/workspace/searchIndexStatus.ts') ? load('searchIndexStatus.ts') : {};
    assert.equal(typeof api.describeIndexStatus, 'function', 'guarded index status must exist');
    const state = {...await db.searchState.get('main'), status: 'ready', processed: 50, total: 50, pending: 1};
    assert.equal(api.describeIndexStatus(state).label, 'Building');
    const complete = {...state, scanComplete: true, indexedGeneration: state.generation, pending: 0};
    assert.equal(api.describeIndexStatus(complete).label, 'Ready');
    assert.equal(api.describeIndexStatus({...complete, status: 'building', generation: 10, buildGeneration: 9}).remaining, undefined);
    const panel = existsSync('src/react/workspace/SearchIndexPanel.tsx') ? load('SearchIndexPanel.tsx') : {};
    assert.equal(typeof panel.SearchIndexPanel, 'function');
    const markup = renderToStaticMarkup(React.createElement(panel.SearchIndexPanel, {service: {status: async () => complete}}));
    for (const text of ['Local search index', 'Pause', 'Resume', 'Rebuild', 'Retry', 'Loading index status']) assert.ok(markup.includes(text));
});
test('worker failure preserves draft and AI privacy without reading protected stores', async t => {
    const {db, load, ready, entities} = await searchFixture(t, 80);
    const memory = {...entities[0], id: 'private-memory', type: 'memory', title: 'Private needle',
        metadata: {body: 'SECRET MEMORY CONTENT'}, memory: {status: 'forgotten', scope: 'private', excludedFromAI: true}};
    await db.entities.put(memory); await db.workspaceDrafts.put({id: 'private-draft', payload: 'PRIVATE DRAFT'});
    await db.workspaceRevisions.put({id: 'private-history', payload: 'PRIVATE HISTORY'});
    await db.settings.put({key: 'analysis.credentials', value: 'CREDENTIAL SECRET'});
    const before = JSON.stringify(await db.workspaceDrafts.toArray());
    const forbidden = ['assets', 'workspaceDrafts', 'workspaceRevisions']; let privateReads = 0;
    for (const name of forbidden) db.table(name).hook('reading', value => {privateReads++; return value;});
    db.settings.hook('reading', value => {if (value?.key === 'analysis.credentials') privateReads++; return value;});
    await ready();
    const client = load('searchWorkerClient.ts').createSearchWorkerClient(() => {throw new Error('blocked');}, db);
    t.after(() => client.dispose());
    const result = await client.query({dialect: 'brain', text: 'private needle', sort: 'id', referenceTime: 100});
    assert.deepEqual(result.items.map(e => e.id), [memory.id]); assert.equal(privateReads, 0);
    assert.equal(load('brainContext.ts').buildBrainContext(memory.id, [memory], []).text, '');
    assert.equal(JSON.stringify(await db.workspaceDrafts.toArray()), before);
});
test('range replacement removes obsolete exact remaining estimates', async t => {
    const {db} = await workspaceFixture(t);
    const state = await db.searchState.get('main'); await db.searchState.put({...state, total: 100, processed: 99});
    await db.entities.clear();
    assert.equal((await db.searchState.get('main')).total, undefined);
});
test('owned raw seeder invalidates a ready cache even for same-count replacements', async t => {
    const {db, load, ready, entities} = await searchFixture(t, 2); await ready();
    const before = await db.searchState.get('main'), {seedLargeLibrary} = require('./helpers/largeLibraryFixture');
    const open = indexedDB.open;
    indexedDB.open = function(name, ...rest) {return open.call(this, name === 'browserOsWorkspace' ? db.name : name, ...rest);};
    try {await seedLargeLibrary({evaluate: (run, data) => run(data)}, {entities: [{...entities[0], title: 'Changed with same count'}]});}
    finally {indexedDB.open = open;}
    const after = await db.searchState.get('main');
    assert.ok(after.generation > before.generation); assert.notEqual(after.epoch, before.epoch);
    assert.equal(after.scanComplete, false); assert.equal((await db.searchChanges.get('reset')).kind, 'reset');
    assert.equal(await db.entities.count(), 2);
    assert.equal((await load('libraryQueryEngine.ts').readLibraryPage(db,
        {dialect: 'explorer', sort: 'id', text: 'Changed', referenceTime: 100})).items[0].id, entities[0].id);
});
