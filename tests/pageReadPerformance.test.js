const assert = require('node:assert/strict');
const test = require('node:test');
const {performance} = require('node:perf_hooks');
const {workspaceFixture} = require('./helpers/workspaceFixture');

// A real IndexedDB/Dexie read-count contract, not a wall-clock CI threshold.
// Unrelated library growth must not hydrate every relationship on each save/load.
for (const size of [1000, 10000]) test(`page reads stay scoped with ${size} unrelated library objects`, async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts');
    const parent = await pages.createWorkspacePage('Parent');
    let page = await pages.createWorkspacePage('Current', parent.owner.id);
    const child = await pages.createWorkspacePage('Child', page.owner.id);
    for (const title of ['A', 'B']) {
        const note = await load('brainRepository.ts').createBrainObject({type: 'note', title});
        page = await pages.addPageReference(page.board.id, note.id);
    }
    page = await pages.applyPageCommand(page.board.id, page.version, {type: 'connect',
        fromPlacementId: page.placements[0].id, toPlacementId: page.placements[1].id, relationType: 'related'});
    await db.entities.bulkPut(Array.from({length: size}, (_, i) => ({id: `library:${i}`, type: 'note', title: `Unrelated ${i}`, createdAt: 1, updatedAt: 1, searchTerms: ['unrelated']})));
    await db.relationships.bulkPut(Array.from({length: size}, (_, i) => ({id: `library-link:${i}`, fromEntityId: `library:${i}`,
        toEntityId: `library:${(i + 1) % size}`, type: 'related', confirmed: true, origin: 'user', createdAt: 1, updatedAt: 1})));
    let reads = 0; const count = value => {reads++; return value;}; db.relationships.hook('reading', count);
    const times = [];
    for (let i = 0; i < 3; i++) {
        const start = performance.now(), loaded = await pages.loadPageSnapshot(page.board.id); times.push(performance.now() - start);
        assert.deepEqual(loaded.version, page.version);
        assert.equal(loaded.parent.id, parent.owner.id); assert.deepEqual(loaded.children.map(c => c.id), [child.owner.id]);
        assert.equal(loaded.relationships.length, 1); assert.equal(loaded.entities.length, 2);
    }
    db.relationships.hook('reading').unsubscribe(count);
    t.diagnostic(JSON.stringify({objects: size, relationshipRecordsPerLoad: reads / 3, medianLoadMs: times.sort((a, b) => a - b)[1]}));
    assert.ok(reads <= 12, `Hydrated ${reads / 3} relationship records per load; unrelated records must not be read.`);
});

test('large-page pan validates references in batches without serial entity reads or placement writes', async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts');
    const fixture = require('./helpers/nativeBoardFixture').makeNativeBoardFixture(1000, 'canvas');
    await db.transaction('rw', [db.entities, db.boards, db.placements, db.relationships, db.settings], async () => {
        for (const name of ['entities', 'boards', 'placements', 'relationships', 'settings']) await db.table(name).bulkPut(fixture.data[name]);
    });
    const before = await pages.loadPageSnapshot('native:board'), get = db.entities.get;
    let serialReads = 0, writes = 0;
    db.entities.get = function (...args) {serialReads++; return get.apply(this, args);};
    db.placements.hook('updating', () => {writes++;});
    let after;
    try {after = await pages.applyPageCommand('native:board', before.version, {type: 'view', mode: 'canvas', viewport: {x: 1370, y: 110, zoom: 1}});}
    finally {db.entities.get = get;}
    assert.equal(serialReads, 2, 'Only the two snapshot owner reads may be serial; reference checks must be batched');
    assert.equal(writes, 0); assert.deepEqual(after.placements, before.placements);
    assert.deepEqual(after.presentation.connectors, before.presentation.connectors);
    assert.deepEqual(after.presentation.viewport, {x: 1370, y: 110, zoom: 1});
});

test('batched page validation still rejects a missing reference and rolls back presentation and activity', async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts');
    let page = await pages.createWorkspacePage('Missing reference');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Referenced'});
    page = await pages.addPageReference(page.board.id, note.id);
    await db.entities.delete(note.id);
    const activities = await db.activities.toArray(), settings = await db.settings.toArray();
    await assert.rejects(pages.applyPageCommand(page.board.id, page.version, {type: 'view', mode: 'canvas', viewport: {x: 7, y: 9, zoom: 1}}), /Referenced object no longer exists/);
    assert.deepEqual(await db.settings.toArray(), settings); assert.deepEqual(await db.activities.toArray(), activities);
});
