const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('page labels resolve every endpoint with linear identity reads', async t => {
    const {load} = await workspaceFixture(t); let reads = 0;
    const entities = Array.from({length: 1000}, (_, i) => ({get id() {reads++; return 'entity:' + i;}, title: 'Title ' + i}));
    const placements = Array.from({length: 1000}, (_, i) => ({get id() {reads++; return 'placement:' + i;}, entityId: 'entity:' + i}));
    const lookups = load('pageLookups.ts').createPageLookups({entities, placements});
    for (let i = 0; i < 1000; i++) assert.equal(lookups.titleForPlacement('placement:' + i), 'Title ' + i);
    assert.ok(reads <= 2000, 'Repeated label queries must not rescan identity arrays: ' + reads);
});

test('page lookups preserve shared identities, missing labels and fresh snapshot titles', async t => {
    const {load} = await workspaceFixture(t), {createPageLookups} = load('pageLookups.ts');
    const shared = {id: 'shared', title: 'Original'}, placements = [{id: 'a', entityId: 'shared'}, {id: 'b', entityId: 'shared'}, {id: 'missing', entityId: 'gone'}];
    const before = createPageLookups({entities: [shared], placements});
    assert.equal(before.entitiesById.get('shared'), shared); assert.equal(before.placementsById.get('a'), placements[0]);
    assert.equal(before.titleForPlacement('a'), 'Original'); assert.equal(before.titleForPlacement('b'), 'Original');
    assert.equal(before.titleForPlacement('missing'), 'Missing object'); assert.equal(before.titleForPlacement('unknown', ''), '');
    const after = createPageLookups({entities: [{...shared, title: 'Acknowledged title'}], placements});
    assert.equal(after.titleForPlacement('a'), 'Acknowledged title'); assert.equal(shared.title, 'Original');
});
