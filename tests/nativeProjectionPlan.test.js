const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

function snapshot() {
    const p = (id, entityId, order, groupId) => ({id, entityId, x: 8000, y: 4000, width: 340, height: 220,
        metadata: {page: {order, collapsed: false, color: 'blue', ...(groupId ? {groupId} : {})}}});
    return {entities: [{id: 'shared'}, {id: 'other'}], placements: [p('b', 'shared', 2, 'child'),
        p('a', 'shared', 1, 'parent'), p('c', 'other', 2)], presentation: {groups: [
            {id: 'child', parentId: 'parent', collapsed: false}, {id: 'parent', collapsed: true}],
        connectors: [{id: 'valid', fromPlacementId: 'b', toPlacementId: 'c'},
            {id: 'unavailable', fromPlacementId: 'missing', toPlacementId: 'a'}]}};
}

test('projection plan preserves complete ordered geometry without mutating snapshot', async t => {
    const {load} = await workspaceFixture(t), {planNativeProjection} = load('nativeProjectionPlan.ts');
    const input = snapshot(), before = structuredClone(input), plan = planNativeProjection(input);
    assert.equal(plan.placements.length, 3);
    assert.deepEqual(plan.placements.map(row => row.p.id), ['a', 'b', 'c']);
    assert.deepEqual(plan.placements.map(row => [row.p.x, row.p.y, row.p.width, row.p.height]),
        [[8000, 4000, 340, 220], [8000, 4000, 340, 220], [8000, 4000, 340, 220]]);
    assert.deepEqual([...plan.collapsedByPlacement], [['a', true], ['b', true], ['c', false]]);
    assert.deepEqual(plan.groupChildren.get('parent'), ['a']);
    assert.deepEqual(plan.groupChildren.get('child'), ['b']);
    assert.equal(plan.entitiesById.get('shared'), input.entities[0]);
    assert.equal(plan.placementsById.get('b').entityId, 'shared');
    assert.deepEqual(plan.connectors.map(c => c.id), ['valid']);
    assert.equal(plan.connectorsById.get('valid').toPlacementId, 'c');
    assert.deepEqual(input, before);
});

test('cyclic group ancestry fails without recursion and missing ancestors are explicit', async t => {
    const {load} = await workspaceFixture(t), {planNativeProjection} = load('nativeProjectionPlan.ts');
    const input = snapshot(); input.presentation.groups[1].parentId = 'child';
    assert.throws(() => planNativeProjection(input), /cycle/i);
    input.presentation.groups[1].parentId = 'missing';
    assert.throws(() => planNativeProjection(input), /missing.*group/i);
});

test('deep ancestry is iterative and resolves every placement', async t => {
    const {load} = await workspaceFixture(t), {planNativeProjection} = load('nativeProjectionPlan.ts');
    const input = snapshot();
    input.presentation.groups = Array.from({length: 10000}, (_, i) => ({id: 'g' + i,
        ...(i < 9999 ? {parentId: 'g' + (i + 1)} : {}), collapsed: i === 9999}));
    for (const p of input.placements) p.metadata.page.groupId = 'g0';
    const plan = planNativeProjection(input);
    assert.deepEqual([...plan.collapsedByPlacement.values()], [true, true, true]);
    assert.equal(plan.groupsById.size, 10000);
});
