const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

const entity = (id, title = id) => ({id, type: 'note', title, createdAt: 1, updatedAt: 1});
async function writerFixture(t, writer) {
    const fixture = await workspaceFixture(t);
    if (writer === 'legacy') return fixture.db;
    const {WorkspaceClient} = fixture.load('workspaceClient.ts');
    const db = new WorkspaceClient('search-writer-' + crypto.randomUUID());
    await db.open(); t.after(() => db.delete()); return db;
}
for (const writer of ['legacy', 'react']) {
    test(`${writer} journals same-time implicit and explicit entity writes`, async t => {
        const db = await writerFixture(t, writer);
        assert.ok(db.searchState, 'writer must provide durable search state');
        await db.entities.put(entity('a'));
        const first = await db.searchState.get('main');
        await db.transaction('rw', db.entities, async () => {
            await db.entities.put(entity('a', 'changed')); await db.entities.add(entity('b'));
        });
        const state = await db.searchState.get('main');
        assert.ok(state.generation > first.generation);
        const changes = await db.searchChanges.toArray();
        assert.deepEqual(changes.map(c => c.entityId).sort(), ['a', 'b']);
        assert.equal(changes.find(c => c.entityId === 'a').generation, first.generation + 1);
        await db.entities.delete('a');
        assert.ok((await db.searchChanges.toArray()).some(c => c.entityId === 'a'));
        await db.searchDocuments.put({id: 'derived', epoch: 'e'});
        assert.equal((await db.searchState.get('main')).generation, state.generation + 1);
    });
    test(`${writer} aborted writes roll back search invalidation`, async t => {
        const db = await writerFixture(t, writer);
        assert.ok(db.searchChanges, 'writer must provide atomic search changes');
        await db.entities.put(entity('kept'));
        const before = await db.searchChanges.toArray(), state = await db.searchState.get('main');
        await assert.rejects(db.transaction('rw', db.entities, async () => {
            await db.entities.put(entity('lost')); throw new Error('abort test');
        }), /abort test/);
        assert.equal(await db.entities.get('lost'), undefined);
        assert.deepEqual(await db.searchChanges.toArray(), before);
        assert.deepEqual(await db.searchState.get('main'), state);
    });
    test(`${writer} partial bulk failure tracks successful records`, async t => {
        const db = await writerFixture(t, writer);
        assert.ok(db.searchChanges, 'writer must provide durable search changes');
        await db.entities.put(entity('duplicate'));
        await db.transaction('rw', db.entities, async () => {
            await db.entities.bulkAdd([entity('new'), entity('duplicate')]).catch(error => {
                assert.equal(error.name, 'BulkError');
            });
        });
        assert.ok(await db.entities.get('new'));
        assert.ok((await db.searchChanges.toArray()).some(c => c.entityId === 'new'));
    });
    test(`${writer} deletion ranges invalidate complete index coverage`, async t => {
        const db = await writerFixture(t, writer);
        assert.ok(db.searchChanges, 'writer must provide reset invalidation');
        await db.entities.bulkPut([entity('a'), entity('b')]);
        await db.entities.clear();
        assert.equal(await db.entities.count(), 0);
        assert.ok((await db.searchChanges.toArray()).some(c => c.kind === 'reset'));
        assert.notEqual((await db.searchState.get('main')).status, 'ready');
    });
    test(`${writer} invalidation failure aborts canonical save`, async t => {
        const db = await writerFixture(t, writer);
        assert.ok(db.searchChanges, 'writer must provide failure-safe invalidation');
        db.close();
        db.use({stack: 'dbcore', name: 'test-quota', level: -1, create: down => ({...down,
            table: name => name === 'searchChanges' ? {...down.table(name), mutate: () => Promise.reject(new Error('test quota'))} : down.table(name)})});
        await db.open();
        await assert.rejects(db.entities.put(entity('must-not-save')), /test quota|abort/i);
        assert.equal(await db.entities.get('must-not-save'), undefined);
    });
}
