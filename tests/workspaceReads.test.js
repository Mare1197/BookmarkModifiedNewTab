const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {makeLargeLibraryFixture} = require('./helpers/largeLibraryFixture');

for (const size of [1000, 10000]) test(`board hydration excludes unrelated records in a ${size}-object library`, async t => {
    const {db, load} = await workspaceFixture(t), reads = load('workspaceReads.ts');
    const fixture = makeLargeLibraryFixture(size, 'small-board');
    for (const [table, records] of Object.entries(fixture)) await db.table(table).bulkPut(records);
    const counts = {entities: 0, placements: 0, relationships: 0};
    for (const table of Object.keys(counts)) db.table(table).hook('reading', value => {counts[table]++; return value;});
    const board = await reads.loadBoard('perf:board');
    assert.equal(board.entities.length, 50); assert.equal(board.placements.length, 50);
    assert.equal(board.relationships.length, 49);
    assert.deepEqual(counts, {entities: 50, placements: 50, relationships: 50});
    const shell = await reads.loadShell();
    assert.equal(shell.counts.entities, size); assert.equal('entities' in shell, false);
    assert.equal(counts.entities, 50);
});

test('selected-object reads include off-board incoming links and do not infer deletion from page membership', async t => {
    const {db, load} = await workspaceFixture(t), reads = load('workspaceReads.ts');
    await db.entities.bulkPut([{id: 'a', title: 'Selected'}, {id: 'b', title: 'Elsewhere'}, {id: 'p', type: 'project', title: 'Project'}]);
    await db.relationships.bulkPut([{id: 'r', fromEntityId: 'b', toEntityId: 'a', confirmed: true},
        {id: 'self', fromEntityId: 'a', toEntityId: 'a', confirmed: true},
        {id: 'project', fromEntityId: 'a', toEntityId: 'p', type: 'project-member', confirmed: true}]);
    const object = await reads.loadObject('a');
    assert.equal(object.entity.id, 'a'); assert.equal(object.relationships.length, 3);
    assert.deepEqual(object.entities.map(e => e.id).sort(), ['a', 'b', 'p']);
    assert.equal(await reads.loadObject('absent'), null);
});

test('folder membership pages retain position order and graph pages keep only represented endpoints', async t => {
    const {db, load} = await workspaceFixture(t), reads = load('workspaceReads.ts');
    const fixture = makeLargeLibraryFixture(1000, 'small-board');
    for (const [table, records] of Object.entries(fixture)) await db.table(table).bulkPut(records);
    const first = await reads.loadFolderMembers('perf:folder');
    const next = await reads.loadFolderMembers('perf:folder', first.nextCursor);
    assert.equal(first.memberships.length, 50); assert.equal(next.memberships[0].position, 50);
    const graph = await reads.loadNeighborhood({kind: 'library'});
    assert.equal(graph.entities.length, 200); assert.equal(graph.hasMore, true);
    const ids = new Set(graph.entities.map(e => e.id));
    assert.ok(graph.relationships.every(r => ids.has(r.fromEntityId) && ids.has(r.toEntityId)));
});
test('project reads include members beyond a page but exclude unrelated bodies', async t => {
    const {db, load} = await workspaceFixture(t);
    await db.entities.bulkPut([{id: 'project', type: 'project', title: 'Project'},
        ...Array.from({length: 120}, (_, i) => ({id: 'n' + i, type: 'note', title: 'Note', updatedAt: i}))]);
    await db.relationships.bulkPut(Array.from({length: 100}, (_, i) => ({id: 'r' + i,
        fromEntityId: 'n' + i, toEntityId: 'project', type: 'project-member', confirmed: i !== 99})));
    const result = await load('workspaceReads.ts').loadProject('project');
    assert.equal(result.entities.length, 100);
    assert.ok(result.entities.some(item => item.id === 'n98'));
    assert.ok(!result.entities.some(item => item.id === 'n99' || item.id === 'n119'));
    assert.equal(result.relationships.length, 99);
});
test('workflow pages hydrate only their records and referenced objects', async t => {
    const {db, load} = await workspaceFixture(t), reads = load('workspaceReads.ts');
    await db.entities.bulkPut(Array.from({length: 123}, (_, i) => ({id: 'e' + i, title: 'E' + i})));
    await db.tasks.bulkPut(Array.from({length: 123}, (_, i) => ({id: 't' + String(i).padStart(3, '0'), entityId: 'e' + i,
        dueAt: i, status: 'next'})));
    const first = await reads.loadWorkflowPage('tasks', 0, 'next');
    const second = await reads.loadWorkflowPage('tasks', 1, 'next');
    assert.equal(first.tasks.length, 50); assert.equal(first.entities.length, 50);
    assert.equal(first.hasMore, true); assert.equal(second.tasks[0].entityId, 'e50');
    assert.equal((await reads.loadWorkflowPage('tasks', 0, 'done')).tasks.length, 0);
    assert.equal((await reads.loadWorkflowPage('tasks', 2)).tasks.length, 23);
});
test('expanded graph retains cross-page edges between represented canonical IDs', async t => {
    const {db, load} = await workspaceFixture(t);
    await db.entities.bulkPut(Array.from({length: 205}, (_, i) => ({id: 'n' + String(i).padStart(3, '0'), title: 'N', type: 'note', updatedAt: 1})));
    await db.relationships.put({id: 'cross', fromEntityId: 'n001', toEntityId: 'n204', confirmed: true});
    const graph = await load('workspaceReads.ts').loadExpandedNeighborhood({kind: 'library'}, 2);
    assert.equal(graph.entities.length, 205); assert.equal(graph.relationships.length, 1);
    assert.equal(graph.hasMore, false);
});
