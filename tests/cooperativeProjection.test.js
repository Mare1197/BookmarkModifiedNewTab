const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('projection batches yield after at most fifty operations', async t => {
    const {load} = await workspaceFixture(t), {runProjectionBatches} = load('cooperativeProjection.ts');
    const batchSizes = [], progress = []; let batch = 0, total = 0;
    await runProjectionBatches(Array.from({length: 123}, () => () => {batch++; total++;}),
        {onProgress: (done, count) => progress.push([done, count])}, async () => {batchSizes.push(batch); batch = 0;}, () => 0);
    batchSizes.push(batch);
    assert.deepEqual(batchSizes, [50, 50, 23]); assert.equal(total, 123);
    assert.deepEqual(progress, [[50, 123], [100, 123], [123, 123]]);
});

test('cancelled batches publish no late progress or operations', async t => {
    const {load} = await workspaceFixture(t), {runProjectionBatches} = load('cooperativeProjection.ts');
    const controller = new AbortController(); let calls = 0; const progress = [];
    await assert.rejects(runProjectionBatches(Array.from({length: 100}, () => () => calls++),
        {signal: controller.signal, onProgress: done => progress.push(done)}, async () => controller.abort(), () => 0), {name: 'AbortError'});
    assert.equal(calls, 50); assert.deepEqual(progress, [50]);
    await assert.rejects(runProjectionBatches([() => calls++], {signal: controller.signal}), {name: 'AbortError'});
    assert.equal(calls, 50);
});

test('projection work yields by elapsed budget while retaining order and final progress', async t => {
    const {load} = await workspaceFixture(t), {runProjectionBatches} = load('cooperativeProjection.ts');
    let clock = 0, batch = 0; const slices = [], progress = [], order = [];
    await runProjectionBatches(Array.from({length: 10}, (_, i) => () => {clock += 3; batch++; order.push(i);}),
        {onProgress: done => progress.push(done)}, async () => {slices.push(batch); batch = 0;}, () => clock);
    slices.push(batch);
    assert.deepEqual(slices, [3, 3, 3, 1]); assert.deepEqual(progress, [3, 6, 9, 10]);
    assert.deepEqual(order, Array.from({length: 10}, (_, i) => i));
});
test('budget-boundary cancellation performs no late work or progress', async t => {
    const {load} = await workspaceFixture(t), {runProjectionBatches} = load('cooperativeProjection.ts');
    const controller = new AbortController(); let clock = 0, calls = 0; const progress = [];
    await assert.rejects(runProjectionBatches(Array.from({length: 10}, () => () => {clock += 3; calls++;}),
        {signal: controller.signal, onProgress: done => progress.push(done)}, async () => controller.abort(), () => clock), {name: 'AbortError'});
    assert.equal(calls, 3); assert.deepEqual(progress, [3]);
    const inside = new AbortController(); const late = [];
    await assert.rejects(runProjectionBatches([() => {clock += 20; inside.abort();}],
        {signal: inside.signal, onProgress: done => late.push(done)}, async () => late.push('yield'), () => clock), {name: 'AbortError'});
    assert.deepEqual(late, []);
});
test('empty, indivisible and failing slices retain precise completion semantics', async t => {
    const {load} = await workspaceFixture(t), {runProjectionBatches} = load('cooperativeProjection.ts');
    let clock = 0; const progress = [], yields = [];
    const options = {onProgress: done => progress.push(done)}, yieldControl = async () => yields.push(clock);
    await runProjectionBatches([], options, yieldControl, () => clock);
    assert.deepEqual(progress, []); assert.deepEqual(yields, []);
    await runProjectionBatches([() => {clock += 30;}], options, yieldControl, () => clock);
    assert.deepEqual(progress, [1]); assert.deepEqual(yields, []);
    await assert.rejects(runProjectionBatches([() => {clock += 9;}, () => {throw Error('operation failed');}, () => assert.fail('late operation')],
        options, yieldControl, () => clock), /operation failed/);
    assert.deepEqual(progress, [1, 1]); assert.deepEqual(yields, [39]);
});

test('cancelled mount disposes allocations before returning even if preparation never resolves', async t => {
    const {load} = await workspaceFixture(t), {prepareNativeMount} = load('cooperativeProjection.ts');
    const controller = new AbortController(), disposed = []; let scope, resume;
    const mounting = prepareNativeMount(async owner => {
        scope = owner; owner.own(() => disposed.push('document')); owner.own(() => disposed.push('editor'));
        await new Promise(resolve => {resume = resolve;});
        owner.check(); return 'late mount';
    }, {signal: controller.signal});
    controller.abort();
    await assert.rejects(mounting, {name: 'AbortError'});
    assert.deepEqual(disposed, ['editor', 'document']);
    assert.throws(() => scope.check(), {name: 'AbortError'});
    scope.own(() => disposed.push('late resource'));
    assert.deepEqual(disposed, ['editor', 'document', 'late resource']);
    resume(); await new Promise(resolve => setImmediate(resolve));
});

test('failed mount cleans every resource once and successful dispose is idempotent', async t => {
    const {load} = await workspaceFixture(t), {prepareNativeMount} = load('cooperativeProjection.ts');
    const disposed = [];
    await assert.rejects(prepareNativeMount(async owner => {
        owner.own(() => disposed.push('collection')); owner.own(() => disposed.push('doc'));
        throw new Error('construction failed');
    }), /construction failed/);
    assert.deepEqual(disposed, ['doc', 'collection']);
    const mounted = await prepareNativeMount(async owner => {owner.own(() => disposed.push('active')); return 42;});
    assert.equal(mounted.value, 42); mounted.dispose(); mounted.dispose();
    assert.deepEqual(disposed, ['doc', 'collection', 'active']);
    let entered = false; const controller = new AbortController(); controller.abort();
    await assert.rejects(prepareNativeMount(async () => {entered = true;}, {signal: controller.signal}), {name: 'AbortError'});
    assert.equal(entered, false);
});
