const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {workspaceFixture} = require('./helpers/workspaceFixture');
test('native pointer events use the current host rectangle instead of the one-second cache', async t => {
    const {load} = await workspaceFixture(t);
    const api = existsSync('src/react/workspace/nativePointerCoordinates.ts') ? load('nativePointerCoordinates.ts') : {};
    assert.equal(typeof api.attachNativePointerCoordinates, 'function');
    let rect = {left: 311, top: 544}, removed = 0;
    const callbacks = new Map();
    const dispatcher = {add(name, fn) {callbacks.set(name, fn); return () => {removed++; callbacks.delete(name);};}};
    const dispose = api.attachNativePointerCoordinates({getBoundingClientRect: () => rect}, dispatcher);
    const state = (x, y, start = {x: -Infinity, y: -Infinity}) => ({raw: {clientX: x, clientY: y, pointerId: 1},
        point: {x: x - 311, y: y - 583}, containerOffset: {x: 311, y: 583}, start, delta: {x: 7.5, y: 2.5}});
    const send = (name, value) => callbacks.get(name)({get: () => value});
    const down = state(762, 689); send('pointerDown', down);
    assert.deepEqual(down.point, {x: 451, y: 145});
    assert.deepEqual(down.containerOffset, {x: 311, y: 544});
    const originalDragStart = state(762, 689); send('dragStart', originalDragStart);
    assert.deepEqual(originalDragStart.point, down.point);
    const move = state(777, 694, {x: 451, y: 106}); send('dragMove', move);
    assert.deepEqual(move.point, {x: 466, y: 150});
    assert.deepEqual(move.start, {x: 451, y: 145});
    rect = {left: 311, top: 550}; const hover = state(777, 700); send('pointerMove', hover);
    assert.deepEqual(hover.point, {x: 466, y: 150});
    dispose(); assert.equal(callbacks.size, 0); assert.ok(removed >= 9);
});
