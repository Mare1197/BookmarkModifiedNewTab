require('fake-indexeddb/auto');
const assert = require('node:assert/strict');
const test = require('node:test');
const Dexie = require('dexie');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {createWorkspaceDatabase, SCHEMA_V3} = require('../src/workspace/workspaceDb');

for (const entry of ['react', 'legacy']) test(`version 4 upgrades through ${entry} without changing content or recovery`, async t => {
    const name = 'library-schema-' + crypto.randomUUID(), old = new Dexie(name);
    old.version(4).stores({...SCHEMA_V3,
        workspaceDrafts: 'id,sessionId,targetKey,boardId,updatedAt',
        workspaceRevisions: 'id,targetKey,createdAt,[targetKey+createdAt],[targetKey+createdAt+id]'});
    await old.open();
    const entity = {id: 'kept', title: 'Žaba', type: 'note', searchTerms: [], updatedAt: 2};
    const draft = {id: 'draft', targetKey: 'entity:kept', updatedAt: 3, payload: 'private'};
    await old.table('entities').put(entity); await old.table('workspaceDrafts').put(draft); old.close();
    const {load} = await workspaceFixture(t), {WorkspaceClient: Client} = load('workspaceClient.ts');
    const db = entry === 'react' ? new Client(name) : createWorkspaceDatabase(name);
    const peer = entry === 'react' ? createWorkspaceDatabase(name) : new Client(name);
    t.after(async () => {peer.close(); await db.delete();});
    await db.open(); await peer.open();
    assert.equal(db.verno, 6);
    assert.deepEqual(await db.entities.get('kept'), entity);
    assert.deepEqual(await db.workspaceDrafts.get('draft'), draft);
    for (const [table, index] of [['entities', '[updatedAt+id]'], ['placements', '[boardId+id]'],
        ['relationships', '[fromEntityId+id]'], ['relationships', '[toEntityId+id]'],
        ['folderMemberships', '[folderId+position+id]']]) assert.ok(db.table(table).schema.idxByName[index]);
    await peer.entities.put({...entity, id: 'captured'});
    assert.equal((await db.entities.get('captured')).title, 'Žaba');
});
