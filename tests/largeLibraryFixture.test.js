const assert = require('node:assert/strict');
const test = require('node:test');
const {makeLargeLibraryFixture} = require('./helpers/largeLibraryFixture');

for (const shape of ['small-board', 'large-board']) test(`performance fixture ${shape} is deterministic and referentially valid`, () => {
    const data = makeLargeLibraryFixture(1000, shape);
    assert.deepEqual(data, makeLargeLibraryFixture(1000, shape));
    assert.equal(data.entities.length, 1000);
    const ids = new Set(data.entities.map(entity => entity.id));
    assert.equal(ids.size, 1000);
    assert.equal(data.placements.filter(item => item.boardId === 'perf:board').length, shape === 'small-board' ? 50 : 1000);
    assert.equal(data.relationships.length, 1000);
    assert.ok(data.relationships.every(link => ids.has(link.fromEntityId) && ids.has(link.toEntityId)));
    assert.ok(data.placements.every(item => ids.has(item.entityId)));
    assert.ok(data.folderMemberships.every(item => ids.has(item.entityId)));
    assert.ok(data.tasks.every(item => ids.has(item.entityId)));
    assert.ok(data.entities.some(entity => /[^\x00-\x7f]/.test(entity.title)));
    assert.ok(data.entities.some(entity => entity.metadata?.body?.length === 1024));
    assert.ok(new Set(data.entities.map(entity => entity.updatedAt)).size < 1000);
    assert.ok(new Set(data.entities.map(entity => entity.type)).size > 2);
});

test('fixture rejects unsafe sizes and unknown shapes', () => {
    for (const size of [-1, 0, 1.5, Infinity, 50001]) assert.throws(() => makeLargeLibraryFixture(size, 'small-board'));
    assert.throws(() => makeLargeLibraryFixture(1000, 'unknown'));
});
test('seeding splits large fixtures into bounded protocol messages', async () => {
    const {seedLargeLibrary} = require('./helpers/largeLibraryFixture');
    const calls = [];
    await seedLargeLibrary({evaluate: async (_run, records) => {calls.push(records);}}, makeLargeLibraryFixture(1000, 'small-board'));
    assert.ok(calls.length > 1);
    assert.ok(calls.every(records => Object.values(records).reduce((n, rows) => n + rows.length, 0) <= 500));
    assert.equal(calls.reduce((n, records) => n + (records.entities?.length || 0), 0), 1000);
});
test('benchmark readiness requires generation parity not counts', async t => {
    const helper = require('./helpers/largeLibraryFixture');
    assert.equal(typeof helper.isSearchIndexReady, 'function');
    const state = {status: 'ready', format: 1, scanComplete: true, generation: 7, indexedGeneration: 6,
        epoch: 'new', pending: 0, documentCount: 1000, entityCount: 1000};
    assert.equal(helper.isSearchIndexReady(state), false);
    assert.equal(helper.isSearchIndexReady({...state, indexedGeneration: 7, pending: 1}), false);
    assert.equal(helper.isSearchIndexReady({...state, indexedGeneration: 7, scanComplete: false}), false);
    assert.equal(helper.isSearchIndexReady({...state, indexedGeneration: 7}, {afterEpoch: 'new'}), false);
    assert.equal(helper.isSearchIndexReady({...state, indexedGeneration: 7}, {minGeneration: 8}), false);
    assert.equal(helper.isSearchIndexReady({...state, indexedGeneration: 7}), true);
    const {workspaceFixture} = require('./helpers/workspaceFixture');
    const {db, load} = await workspaceFixture(t);
    const fixture = helper.makeSearchIndexFixture(1000, 'small-board');
    const original = indexedDB.open;
    indexedDB.open = function (_name, ...args) {return original.call(this, db.name, ...args);};
    t.after(() => {indexedDB.open = original;});
    const page = {evaluate: async (run, input) => run(input)};
    await helper.seedLargeLibrary(page, fixture.data);
    assert.equal(helper.isSearchIndexReady(await helper.readSearchIndexState(page)), false);
    const api = load('searchIndexRepository.ts'), lease = await api.claimSearchLease(db, 'benchmark-test', Date.now());
    for (let i = 0; i < 30; i++) if ((await api.runSearchIndexBatch(db, lease)).status === 'ready') break;
    assert.equal(helper.isSearchIndexReady(await helper.readSearchIndexState(page)), true);
    const result = await load('libraryQueryEngine.ts').readLibraryPage(db, {dialect: 'brain', text: fixture.selectiveText, sort: 'title', referenceTime: 1});
    const resultIds = result.items.map(item => item.id);
    assert.deepEqual(resultIds, [fixture.selectiveEntityId]);
});
