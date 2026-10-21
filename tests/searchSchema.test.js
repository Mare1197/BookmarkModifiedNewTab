require('fake-indexeddb/auto');
const assert = require('node:assert/strict');
const test = require('node:test');
const Dexie = require('dexie');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {createWorkspaceDatabase, SCHEMA_V3} = require('../src/workspace/workspaceDb');

for (const writer of ['react', 'legacy']) test(`${writer} upgrades v5 without changing content or recovery`, async t => {
    const {load} = await workspaceFixture(t), {WorkspaceClient} = load('workspaceClient.ts');
    const name = 'search-schema-' + crypto.randomUUID(), old = new Dexie(name);
    old.version(5).stores({...SCHEMA_V3, workspaceDrafts: 'id,sessionId,targetKey,boardId,updatedAt',
        workspaceRevisions: 'id,targetKey,createdAt,[targetKey+createdAt],[targetKey+createdAt+id]'});
    await old.open();
    const entity = {id: 'kept', type: 'note', title: 'Žaba', body: 'original', createdAt: 1, updatedAt: 1};
    const draft = {id: 'private', targetKey: 'kept', payload: 'private recovery'};
    await old.table('entities').put(entity); await old.table('workspaceDrafts').put(draft); old.close();
    const db = writer === 'react' ? new WorkspaceClient(name) : createWorkspaceDatabase(name);
    t.after(() => db.delete()); await db.open();
    assert.equal(db.verno, 7);
    assert.deepEqual(await db.entities.get('kept'), entity);
    assert.deepEqual(await db.workspaceDrafts.get('private'), draft);
    const state = await db.searchState.get('main');
    assert.equal(state.status, 'unbuilt'); assert.equal(state.scanComplete, false);
    assert.equal(await db.searchDocuments.count(), 0);
    const peer = writer === 'react' ? createWorkspaceDatabase(name) : new WorkspaceClient(name);
    await peer.open();
    assert.deepEqual(peer.tables.map(table => [table.name, table.schema.indexes.map(i => i.src)]),
        db.tables.map(table => [table.name, table.schema.indexes.map(i => i.src)]));
    peer.close();
});
