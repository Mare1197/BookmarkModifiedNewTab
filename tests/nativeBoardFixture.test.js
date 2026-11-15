const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {spawnSync} = require('node:child_process');
const os = require('node:os');

for (const mode of ['document', 'canvas', 'mixed']) test(`native fixture preserves all identities and endpoints in ${mode}`, () => {
    const {makeNativeBoardFixture} = require('./helpers/nativeBoardFixture');
    const {data, boardId} = makeNativeBoardFixture(50, mode);
    assert.equal(data.placements.length, 50);
    assert.equal(new Set(data.placements.map(p => p.id)).size, 50);
    const entities = new Map(data.entities.map(e => [e.id, e]));
    assert.equal(entities.size, data.entities.length);
    const presentation = data.settings.find(s => s.key === 'workspace-page:' + boardId).value;
    assert.equal(presentation.mode, mode);
    assert.equal(entities.get(presentation.ownerEntityId).metadata.workspacePage, true);
    assert.ok(data.placements.every(p => p.boardId === boardId && entities.has(p.entityId)));
    assert.ok(data.relationships.every(r => entities.has(r.fromEntityId) && entities.has(r.toEntityId)));
    assert.equal(presentation.connectors.length, 5);
    for (const c of presentation.connectors) {
        const link = data.relationships.find(r => r.id === c.relationshipId);
        assert.equal(link.fromEntityId, data.placements.find(p => p.id === c.fromPlacementId).entityId);
        assert.equal(link.toEntityId, data.placements.find(p => p.id === c.toPlacementId).entityId);
    }
    assert.equal(data.assets.length, 10);
    assert.equal(data.entities.filter(e => e.type === 'message').length, 30);
    assert.ok(data.assets.every(a => a.bytes[0] === 137 && a.mimeType === 'image/png' && entities.has(a.entityId)));
    assert.ok(presentation.groups.some(g => g.parentId));
    assert.ok(data.placements.some(p => p.x > 1500));
    const independent = makeNativeBoardFixture(50, mode);
    data.entities[0].title = 'Only this fixture';
    assert.notEqual(independent.data.entities[0].title, data.entities[0].title);
});

test('native fixture validates cardinality and mode', () => {
    const {makeNativeBoardFixture} = require('./helpers/nativeBoardFixture');
    for (const size of [0, -1, 1.2, Infinity, 5001]) assert.throws(() => makeNativeBoardFixture(size, 'canvas'));
    assert.throws(() => makeNativeBoardFixture(50, 'unknown'));
    assert.equal(makeNativeBoardFixture(1000, 'mixed').data.placements.length, 1000);
});

test('probe timeout stops only its owned child and profile', async t => {
    const {runOwnedNativeProbe} = require('./helpers/nativeProbeRunner');
    const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {windowsHide: true, stdio: 'ignore'});
    t.after(() => other.kill());
    let owned;
    const result = await runOwnedNativeProbe({extensionPath: path.resolve('dist'), referenceCount: 50, mode: 'canvas',
        timeoutMs: 1500, sample: 0, label: 'unit'}, {workerPath: path.join(__dirname, 'helpers/nativeProbeTestChild.js'),
        workerEnv: {NATIVE_PROBE_TEST_MODE: 'hang'}, onStart: value => {owned = value;}});
    assert.equal(result.ok, false); assert.equal(result.timedOut, true);
    assert.notEqual(owned.pid, other.pid);
    assert.doesNotThrow(() => process.kill(other.pid, 0));
    assert.equal(fs.existsSync(owned.profilePath), false);
    assert.ok(result.elapsedMs < 12000);
});

test('successful probe retains metrics and removes its owned profile', async () => {
    const {runOwnedNativeProbe} = require('./helpers/nativeProbeRunner');
    let owned;
    const result = await runOwnedNativeProbe({extensionPath: path.resolve('dist'), referenceCount: 50, mode: 'document',
        timeoutMs: 10000, sample: 0, label: 'unit'}, {workerPath: path.join(__dirname, 'helpers/nativeProbeTestChild.js'),
        workerEnv: {NATIVE_PROBE_TEST_MODE: 'success'}, onStart: value => {owned = value;}});
    assert.equal(result.ok, true); assert.equal(result.timedOut, false);
    assert.deepEqual(result.metrics, {references: 50, mode: 'document'});
    assert.equal(fs.existsSync(owned.profilePath), false);
});

test('hung teardown after a result remains a failed bounded probe', async () => {
    const {runOwnedNativeProbe} = require('./helpers/nativeProbeRunner');
    const result = await runOwnedNativeProbe({extensionPath: path.resolve('dist'), referenceCount: 50, mode: 'mixed',
        timeoutMs: 2000, sample: 0, label: 'unit'}, {workerPath: path.join(__dirname, 'helpers/nativeProbeTestChild.js'),
        workerEnv: {NATIVE_PROBE_TEST_MODE: 'hang-after-result'}});
    assert.equal(result.ok, false); assert.equal(result.timedOut, true);
    assert.equal(result.metrics.references, 50);
});

test('failed probe marker survives a new test worker process', t => {
    const {recordProbeFailure} = require('./helpers/nativeProbeFailures');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'native-marker-test-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    recordProbeFailure(directory, 'mixed/500');
    const modulePath = require.resolve('./helpers/nativeProbeFailures');
    const child = spawnSync(process.execPath, ['-e',
        'const api=require(process.argv[1]);process.exit(api.hasProbeFailure(process.argv[2], "mixed/500") && !api.hasProbeFailure(process.argv[2], "canvas/500") ? 0 : 42)',
        modulePath, directory], {windowsHide: true, encoding: 'utf8'});
    assert.equal(child.status, 0, child.stderr);
});
