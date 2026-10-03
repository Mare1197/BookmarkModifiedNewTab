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
