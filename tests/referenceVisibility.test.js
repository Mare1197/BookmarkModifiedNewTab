const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('viewport bounds use point center and normalized overscan', async t => {
    const {load} = await workspaceFixture(t), {referenceWorldBounds, referenceIntersects} = load('referenceVisibility.ts');
    const viewport = {center: {x: 100, y: -50}, width: 800, height: 600, zoom: 2};
    assert.deepEqual(referenceWorldBounds(viewport), {x: -200, y: -300, width: 600, height: 500});
    assert.equal(referenceIntersects({x: 399, y: 199, width: 1, height: 1}, referenceWorldBounds(viewport)), true);
    assert.equal(referenceIntersects({x: 401, y: 0, width: 20, height: 20}, referenceWorldBounds(viewport)), false);
    viewport.zoom = 0.5;
    assert.deepEqual(referenceWorldBounds(viewport), {x: -1100, y: -1050, width: 2400, height: 2000});
});

test('canvas visibility observes camera and size without changing model geometry', async t => {
    const {load} = await workspaceFixture(t), {observeCanvasReferences} = load('referenceVisibility.ts');
    const listeners = new Set(), slot = {on: fn => {listeners.add(fn); return {dispose: () => listeners.delete(fn)};}};
    const viewport = {center: {x: 0, y: 0}, width: 100, height: 100, zoom: 1, viewportUpdated: slot, sizeUpdated: slot};
    const placements = [{id: 'a', x: 0, y: 0, width: 20, height: 20}, {id: 'b', x: 2000, y: 0, width: 20, height: 20}];
    const original = structuredClone(placements), states = new Map();
    const dispose = observeCanvasReferences(viewport, () => placements, (id, visible) => states.set(id, visible));
    assert.deepEqual([...states], [['a', true], ['b', false]]);
    viewport.center.x = 2000; listeners.forEach(fn => fn());
    assert.deepEqual([...states], [['a', false], ['b', true]]);
    assert.deepEqual(placements, original);
    placements[0].x = 2000; dispose.refresh(); assert.equal(states.get('a'), true);
    dispose(); assert.equal(listeners.size, 0);
});

test('document observer uses pane overscan and releases observation', async t => {
    const {load} = await workspaceFixture(t), {observeDocumentReference} = load('referenceVisibility.ts');
    let callback, options, observed, disconnected = false; const previous = global.IntersectionObserver;
    global.IntersectionObserver = class {
        constructor(fn, opts) {callback = fn; options = opts;}
        observe(node) {observed = node;} unobserve() {} disconnect() {disconnected = true;}
    };
    t.after(() => {global.IntersectionObserver = previous;});
    const root = {}, node = {}, visibility = [];
    const dispose = observeDocumentReference(node, root, visible => visibility.push(visible));
    assert.equal(observed, node); assert.equal(options.root, root); assert.equal(options.rootMargin, '200px');
    callback([{target: node, isIntersecting: true}]); callback([{target: node, isIntersecting: false}]);
    assert.deepEqual(visibility, [true, false]); dispose(); assert.equal(disconnected, true);
    callback([{target: node, isIntersecting: true}]); assert.deepEqual(visibility, [true, false]);
});

test('document references share one pane observer and independently unregister', async t => {
    const {load} = await workspaceFixture(t), {observeDocumentReference} = load('referenceVisibility.ts');
    const previous = global.IntersectionObserver; let instances = 0, callback, disconnected = 0; const removed = [];
    global.IntersectionObserver = class {
        constructor(fn) {instances++; callback = fn;} observe() {}
        unobserve(node) {removed.push(node);} disconnect() {disconnected++;}
    };
    t.after(() => {global.IntersectionObserver = previous;});
    const pane = {}, a = {}, b = {}, visible = [];
    const stopA = observeDocumentReference(a, pane, value => visible.push(['a', value]));
    const stopB = observeDocumentReference(b, pane, value => visible.push(['b', value]));
    assert.equal(instances, 1); stopA(); assert.equal(disconnected, 0); assert.deepEqual(removed, [a]);
    callback([{target: a, isIntersecting: true}, {target: b, isIntersecting: true}]);
    assert.deepEqual(visible, [['b', true]]); stopB(); stopB(); assert.equal(disconnected, 1);
});
