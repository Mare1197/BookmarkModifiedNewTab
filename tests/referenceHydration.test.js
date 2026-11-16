const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pins = (key, value = true) => ({selected: false, focused: false, dragging: false, dirty: false, ...(key ? {[key]: value} : {})});

test('disposal before a scheduled loader starts performs no content reads', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const hydration = createReferenceHydration({maxConcurrent: 4}); let reads = 0;
    hydration.register('card', async () => {reads++; return () => {};});
    hydration.setVisible('card', true); hydration.dispose(); await tick(); assert.equal(reads, 0);
});

test('hydration never exceeds four inflight loads including cancelled pending work', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const hydration = createReferenceHydration({maxConcurrent: 4}), pending = []; let inflight = 0, peak = 0, released = 0;
    for (let i = 0; i < 12; i++) {
        hydration.register(String(i), signal => new Promise(resolve => {
            inflight++; peak = Math.max(peak, inflight);
            pending.push({signal, finish() {inflight--; resolve(() => released++);}});
        }));
        hydration.setVisible(String(i), true);
    }
    await tick(); assert.equal(pending.length, 4);
    hydration.setVisible('0', false); await tick();
    assert.equal(pending[0].signal.aborted, true); assert.equal(pending.length, 4);
    for (let i = 0; i < 12; i++) {pending[i].finish(); await tick();}
    assert.ok(peak <= 4); assert.equal(released, 1);
    hydration.dispose(); assert.equal(released, 12);
});

test('dirty invisible references remain pinned across disconnect and reconnect', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const hydration = createReferenceHydration({maxConcurrent: 4}); let loads = 0, released = 0;
    const loader = async () => {loads++; return () => released++;};
    const disconnect = hydration.register('note', loader);
    hydration.setVisible('note', true); await tick();
    hydration.setPins('note', pins('dirty')); hydration.setVisible('note', false); disconnect();
    assert.equal(released, 0);
    const disconnectAgain = hydration.register('note', loader); await tick();
    disconnect(); assert.equal(loads, 1); assert.equal(released, 0);
    hydration.setPins('note', pins()); assert.equal(released, 1);
    disconnectAgain(); hydration.dispose(); assert.equal(released, 1);
});

test('each pin class keeps invisible content and shared-entity occurrences have independent ownership', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const hydration = createReferenceHydration({maxConcurrent: 4}), loaded = [], released = [];
    for (const [i, key] of ['selected', 'focused', 'dragging', 'dirty'].entries()) {
        const id = 'same-entity:placement:' + i;
        hydration.register(id, async () => {loaded.push(id); return () => released.push(id);});
        hydration.setPins(id, pins(key));
    }
    // A collapsed, clean occurrence is registered but never requests content.
    hydration.register('collapsed', async () => {throw new Error('Collapsed content loaded');});
    await tick(); assert.equal(loaded.length, 4); assert.equal(released.length, 0);
    hydration.setPins('same-entity:placement:0', pins()); assert.equal(released.length, 1);
    hydration.dispose(); assert.equal(released.length, 4);
});

test('obsolete and disposed loads release late resources without restarting or leaking', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const hydration = createReferenceHydration({maxConcurrent: 1}); let finish, signal, released = 0, loads = 0;
    const disconnect = hydration.register('asset', s => {signal = s; loads++; return new Promise(resolve => {finish = resolve;});});
    hydration.setVisible('asset', true); await tick(); disconnect();
    assert.equal(signal.aborted, true); hydration.dispose(); hydration.dispose();
    finish(() => released++); await tick(); assert.equal(released, 1); assert.equal(loads, 1);
});

test('failed loads report once and release the slot for queued work', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const errors = [], hydration = createReferenceHydration({maxConcurrent: 1, onError: e => errors.push(e.message)});
    let completed = 0;
    hydration.register('bad', async () => {throw new Error('Unavailable asset');}); hydration.setVisible('bad', true);
    hydration.register('next', async () => {completed++; return () => {};}); hydration.setVisible('next', true);
    await tick(); assert.deepEqual(errors, ['Unavailable asset']); assert.equal(completed, 1);
    hydration.dispose();
});

test('visibility churn waits for obsolete generation and stale disconnect cannot release a reconnected resource', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const hydration = createReferenceHydration({maxConcurrent: 1}), requests = [], released = [];
    const loader = signal => new Promise(resolve => requests.push({signal, resolve}));
    const oldDisconnect = hydration.register('card', loader); hydration.setVisible('card', true); await tick();
    hydration.setVisible('card', false); hydration.setVisible('card', true);
    assert.equal(requests.length, 1); assert.equal(requests[0].signal.aborted, true);
    requests[0].resolve(() => released.push('obsolete')); await tick(); assert.equal(requests.length, 2);
    hydration.register('card', loader); oldDisconnect();
    requests[1].resolve(() => released.push('current')); await tick();
    assert.deepEqual(released, ['obsolete']); hydration.dispose(); assert.deepEqual(released, ['obsolete', 'current']);
});
