const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const Dexie = require('dexie');
const entity = (id, body = 'original') => ({id, type: 'note', title: id, metadata: {body}, searchTerms: [], createdAt: 1, updatedAt: 1});
async function setup(t, count = 1) {
    const fixture = await workspaceFixture(t);
    const api = existsSync('src/react/workspace/searchIndexRepository.ts') ? fixture.load('searchIndexRepository.ts') : {};
    assert.equal(typeof api.runSearchIndexBatch, 'function', 'restartable index batches must exist');
    await fixture.db.entities.bulkPut(Array.from({length: count}, (_, i) => entity('a' + String(i).padStart(3, '0'))));
    return {...fixture, api};
}
async function finish(db, api, owner = 'worker', now = 1000) {
    const lease = await api.claimSearchLease(db, owner, now);
    if (lease) for (let i = 0; i < 100; i++) {
        const state = await api.runSearchIndexBatch(db, lease, {now});
        if (state.status === 'ready') break;
    }
    const state = await api.readSearchStatus(db);
    assert.equal(state.status, 'ready'); assert.equal(state.pending, 0);
    assert.equal(state.generation, state.indexedGeneration);
    return state;
}
test('ready requires complete scan and drained invalidations with at most fifty body reads per batch', async t => {
    const {db, api} = await setup(t, 123), before = await db.entities.toArray();
    const lease = await api.claimSearchLease(db, 'worker', 1000);
    let reads = 0; db.entities.hook('reading', row => {reads++; return row;});
    for (let i = 0; i < 10; i++) {
        reads = 0; const state = await api.runSearchIndexBatch(db, lease, {now: 1000});
        assert.ok(reads <= 50, 'bounded canonical hydration');
        if (state.status === 'ready') break;
    }
    const state = await api.readSearchStatus(db);
    assert.equal(state.status, 'ready'); assert.equal(state.indexedGeneration, state.generation);
    assert.equal(state.processed, 123); assert.equal(await db.searchChanges.count(), 0);
    assert.equal(await db.searchDocuments.count(), 123);
    assert.deepEqual(await db.entities.toArray(), before);
});
test('edits before the rebuild cursor are replayed without count or timestamp shortcuts', async t => {
    const {db, api} = await setup(t, 123), lease = await api.claimSearchLease(db, 'worker', 1000);
    await api.runSearchIndexBatch(db, lease, {now: 1000});
    await db.entities.put(entity('a000', 'needle after cursor'));
    await db.entities.put(entity('a120', 'ahead needle'));
    await finish(db, api);
    assert.ok((await db.searchDocuments.get('a000')).brainGrams.includes('nee'));
    assert.ok((await db.searchDocuments.get('a120')).brainGrams.includes('nee'));
});
test('stale fences cannot publish or drain newer edits', async t => {
    const {db, api} = await setup(t, 60), old = await api.claimSearchLease(db, 'old', 1000);
    assert.equal(await api.claimSearchLease(db, 'new', 1001), undefined);
    const next = await api.claimSearchLease(db, 'new', 16001);
    assert.ok(next.fence > old.fence);
    await db.entities.put(entity('a000', 'newer needle'));
    const changes = await db.searchChanges.toArray();
    await assert.rejects(api.runSearchIndexBatch(db, old, {now: 16002}), /lease/i);
    assert.deepEqual(await db.searchChanges.toArray(), changes);
    await finish(db, api, 'new', 16003);
    assert.ok((await db.searchDocuments.get('a000')).brainGrams.includes('nee'));
});
test('paused builds persist progress and resume after ownership changes', async t => {
    const {db, api} = await setup(t, 70), lease = await api.claimSearchLease(db, 'worker', 1000);
    await api.runSearchIndexBatch(db, lease, {now: 1000});
    const status = await api.controlSearchIndex(db, 'pause');
    assert.equal(status.status, 'paused'); assert.equal(status.processed, 50);
    assert.equal(await api.claimSearchLease(db, 'other', 17000), undefined);
    await assert.rejects(api.runSearchIndexBatch(db, lease, {now: 1001}), /lease/i);
    await api.controlSearchIndex(db, 'resume'); await finish(db, api, 'other', Date.now());
    assert.equal(await db.entities.count(), 70);
});
test('delete and reset remove only derived records and invalidate stale owners', async t => {
    const {db, api} = await setup(t, 3); await finish(db, api);
    await db.entities.delete('a000'); await finish(db, api);
    assert.equal(await db.searchDocuments.get('a000'), undefined);
    const lease = await api.claimSearchLease(db, 'worker', 1000);
    await db.entities.clear(); await db.entities.put(entity('replacement'));
    if (lease) await assert.rejects(api.runSearchIndexBatch(db, lease, {now: 1000}), /lease/i);
    await finish(db, api);
    assert.deepEqual((await db.searchDocuments.toArray()).map(doc => doc.id), ['replacement']);
});
test('rebuild preserves canonical data and private recovery', async t => {
    const {db, api} = await setup(t, 2); await finish(db, api);
    await db.workspaceDrafts.put({id: 'private', payload: 'draft'});
    const before = await db.entities.toArray(), epoch = (await api.readSearchStatus(db)).epoch;
    await api.controlSearchIndex(db, 'rebuild');
    assert.notEqual((await api.readSearchStatus(db)).epoch, epoch);
    assert.deepEqual(await db.entities.toArray(), before);
    assert.equal((await db.workspaceDrafts.get('private')).payload, 'draft');
    await finish(db, api);
});
test('cancellation cannot publish a ready generation', async t => {
    const {db, api} = await setup(t), lease = await api.claimSearchLease(db, 'worker', 1000);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(api.runSearchIndexBatch(db, lease, {signal: controller.signal, now: 1000}), {name: 'AbortError'});
    assert.notEqual((await api.readSearchStatus(db)).status, 'ready');
    await finish(db, api);
});
test('quota failure disables cache without modifying canonical content and retry rebuilds', async t => {
    const {db, api} = await setup(t), before = await db.entities.toArray();
    const lease = await api.claimSearchLease(db, 'worker', 1000);
    db.close();
    db.use({stack: 'dbcore', name: 'test-index-quota', level: -1, create: down => ({...down,
        table: name => name === 'searchDocuments' ? {...down.table(name), mutate: () => Promise.reject(new Error('test index quota'))} : down.table(name)})});
    await db.open();
    await assert.rejects(api.runSearchIndexBatch(db, lease, {now: 1000}), /quota/i);
    assert.equal((await api.readSearchStatus(db)).status, 'error');
    assert.deepEqual(await db.entities.toArray(), before);
    db.close(); db.unuse({stack: 'dbcore', name: 'test-index-quota'}); await db.open();
    await api.controlSearchIndex(db, 'retry'); await finish(db, api);
});
test('an edit between snapshot and derived commit keeps its newer invalidation', async t => {
    const {db, api} = await setup(t), lease = await api.claimSearchLease(db, 'worker', 1000);
    let edit;
    const reading = row => {
        if (!edit) edit = Dexie.ignoreTransaction(() => db.entities.put(entity(row.id, 'concurrent needle')));
        return row;
    };
    db.entities.hook('reading', reading);
    await api.runSearchIndexBatch(db, lease, {now: 1000});
    await edit; db.entities.hook('reading').unsubscribe(reading);
    await finish(db, api);
    assert.ok((await db.searchDocuments.get('a000')).brainGrams.includes('nee'));
});
