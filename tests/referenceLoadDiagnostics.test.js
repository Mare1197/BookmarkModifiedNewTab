const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('load diagnostics distinguish pending reads and completed attachment per occurrence', async t => {
    const {load} = await workspaceFixture(t);
    let time = 10;
    const diagnostics = load('referenceLoadDiagnostics.ts').createReferenceLoadDiagnostics({now: () => time});
    const finish = diagnostics.begin('image', 'canvas:placement', 'asset');
    time = 45;
    const pending = diagnostics.snapshot();
    assert.equal(pending.active[0].phase, 'asset');
    assert.equal(pending.active[0].elapsedMs, 35);
    finish('complete'); finish('error');
    time = 50;
    diagnostics.begin('image', 'canvas:placement', 'attach')('complete');
    const snapshot = diagnostics.snapshot();
    assert.equal(snapshot.active.length, 0);
    assert.equal(snapshot.completed.length, 2);
    assert.equal(snapshot.completed[0].durationMs, 35);
    assert.equal(snapshot.completed[0].status, 'complete');
    assert.equal(snapshot.completed[1].occurrenceId, 'canvas:placement');
    assert.equal(snapshot.completed[1].phase, 'attach');
    diagnostics.begin('image', 'document:placement', 'attach')('complete');
    assert.deepEqual(diagnostics.snapshot().completed.filter(record => record.phase === 'attach').map(record => record.occurrenceId),
        ['canvas:placement', 'document:placement']);
});

test('diagnostic history and pending reads stay bounded and snapshots cannot mutate the collector', async t => {
    const {load} = await workspaceFixture(t);
    const diagnostics = load('referenceLoadDiagnostics.ts').createReferenceLoadDiagnostics({historyLimit: 2, activeLimit: 1, now: () => 1});
    const finish = diagnostics.begin('first', 'document:first', 'entity');
    diagnostics.begin('second', 'canvas:second', 'entity')('error');
    assert.equal(diagnostics.snapshot().droppedActive, 1);
    assert.equal(diagnostics.snapshot().active.length, 1);
    const snapshot = diagnostics.snapshot();
    snapshot.active[0].entityId = 'changed';
    snapshot.completed.length = 0;
    assert.equal(diagnostics.snapshot().active[0].entityId, 'first');
    assert.equal(diagnostics.snapshot().completed.length, 1);
    finish('complete');
    diagnostics.begin('third', 'canvas:third', 'render')('complete');
    assert.equal(diagnostics.snapshot().completed.length, 2);
    assert.equal(diagnostics.snapshot().droppedHistory, 1);
    const lateFinish = diagnostics.begin('pending', 'canvas:pending', 'asset');
    diagnostics.dispose();
    lateFinish('complete');
    diagnostics.begin('late', 'late', 'entity')('complete');
    assert.equal(diagnostics.snapshot().active.length, 0);
    assert.equal(diagnostics.snapshot().completed.length, 0);
});

test('diagnostic limits reject invalid allocation sizes', async t => {
    const {load} = await workspaceFixture(t);
    const {createReferenceLoadDiagnostics} = load('referenceLoadDiagnostics.ts');
    for (const value of [0, -1, Infinity, 1.5, 10001]) {
        assert.throws(() => createReferenceLoadDiagnostics({historyLimit: value}), /limit/i);
        assert.throws(() => createReferenceLoadDiagnostics({activeLimit: value}), /limit/i);
    }
});

test('reveal events retain only the requested placement in both panes', async t => {
    const {load} = await workspaceFixture(t);
    const {createReferenceLoadDiagnostics} = load('referenceLoadDiagnostics.ts');
    const trace = createReferenceLoadDiagnostics({placementId: 'target', historyLimit: 2, now: () => 20});
    trace.record('document:other', {phase: 'visibility', visible: true, intersectionAt: 10});
    trace.record('document:target', {phase: 'visibility', visible: true, intersectionAt: 12});
    trace.record('document:target', {phase: 'eligible', eligible: true, activeLoads: 4});
    trace.record('canvas:target', {phase: 'slot', activeLoads: 3});
    const snapshot = trace.snapshot();
    assert.deepEqual(snapshot.revealEvents, [
        {occurrenceId: 'document:target', at: 20, phase: 'eligible', eligible: true, activeLoads: 4},
        {occurrenceId: 'canvas:target', at: 20, phase: 'slot', activeLoads: 3}
    ]);
    assert.equal(snapshot.droppedRevealEvents, 1);
    snapshot.revealEvents[0].at = -1;
    assert.equal(trace.snapshot().revealEvents[0].at, 20);
    trace.dispose();
    trace.record('canvas:target', {phase: 'slot', activeLoads: 1});
    assert.deepEqual(trace.snapshot().revealEvents, []);
});
