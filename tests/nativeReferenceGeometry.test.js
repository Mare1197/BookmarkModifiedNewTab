const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('native collapse decoration preserves expanded geometry including a not-yet-saved resize', async t => {
    const {load} = await workspaceFixture(t);
    const state = load('nativeReferenceGeometry.ts').createNativeReferenceGeometry([{id: 'p', height: 220}], new Map([['p', false]]));
    const resized = {x: 15, y: 25, width: 350, height: 310};
    assert.equal(state.observe('p', resized, false).geometry.height, 310);
    const collapsed = state.observe('p', {...resized, height: 100}, true);
    assert.deepEqual(collapsed.geometry, resized); assert.equal(collapsed.restoreHeight, undefined);
    const moved = {...resized, x: 77, y: 88, width: 410};
    assert.deepEqual(state.observe('p', {...moved, height: 100}, true).geometry, moved);
    const expanded = state.observe('p', {...moved, height: 100}, false);
    assert.deepEqual(expanded.geometry, moved); assert.equal(expanded.restoreHeight, 310);
    assert.equal(state.observe('p', moved, false).restoreHeight, undefined);
});

test('an initially collapsed native note expands to its canonical height', async t => {
    const {load} = await workspaceFixture(t);
    const state = load('nativeReferenceGeometry.ts').createNativeReferenceGeometry([{id: 'p', height: 220}], new Map([['p', true]]));
    const result = state.observe('p', {x: 0, y: 0, width: 340, height: 100}, false);
    assert.equal(result.restoreHeight, 220); assert.equal(result.geometry.height, 220);
});
