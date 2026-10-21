require('fake-indexeddb/auto');
const assert = require('node:assert/strict');
const test = require('node:test');
const Dexie = require('dexie');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {readyIndex} = require('./helpers/searchFixture');
const {createWorkspaceDatabase, SCHEMA_V3} = require('../src/workspace/workspaceDb');

test('shared postings store repeated dialect grams once while exact predicates remain distinct', async t => {
    const {db, load} = await workspaceFixture(t);
    const entity = {id: 'one', type: 'note', title: 'alpha', canonicalUrl: '', tags: ['tagonly'],
        searchTerms: ['termonly'], metadata: {body: 'bodyonly'}, createdAt: 1, updatedAt: 1};
    await db.entities.put(entity); await readyIndex(db, load);
    const row = await db.searchDocuments.get('one');
    assert.ok(Array.isArray(row.grams), 'shared postings are persisted');
    assert.equal(row.grams.filter(gram => gram === 'alp').length, 1);
    for (const gram of ['not', 'tag', 'ter', 'bod', 'ha ']) assert.ok(row.grams.includes(gram), gram);
    const engine = load('libraryQueryEngine.ts');
    for (const [dialect, text, ids] of [
        ['explorer', 'note', ['one']], ['brain', 'note', []], ['smart', 'note', []],
        ['explorer', 'tagonly', []], ['brain', 'tagonly', ['one']], ['smart', 'tagonly', []],
        ['explorer', 'termonly', []], ['brain', 'termonly', []], ['smart', 'termonly', ['one']],
        ['explorer', 'bodyonly', []], ['brain', 'bodyonly', ['one']], ['smart', 'bodyonly', ['one']],
        ['explorer', 'alpha  bodyonly', []], ['brain', 'alpha bodyonly', ['one']]
    ]) {
        const page = await engine.readLibraryPage(db, {dialect, text, sort: 'id', referenceTime: 100});
        assert.notEqual(page.searchGeneration, undefined, `${dialect}/${text} uses candidate index`);
        assert.deepEqual(page.items.map(item => item.id), ids, `${dialect}/${text}`);
    }
});

for (const writer of ['react', 'legacy']) for (const status of ['ready', 'paused'])
test(`${writer} upgrades old postings without losing content, drafts or pause (${status})`, async t => {
    const {load} = await workspaceFixture(t), {WorkspaceClient} = load('workspaceClient.ts');
    const name = 'compact-search-' + crypto.randomUUID(), old = new Dexie(name);
    old.version(6).stores({...SCHEMA_V3,
        entities: 'id,type,canonicalUrl,domainId,inboxAt,updatedAt,*searchTerms,[updatedAt+id]',
        placements: 'id,boardId,entityId,kind,updatedAt,[boardId+entityId],[boardId+id]',
        relationships: 'id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt,[fromEntityId+id],[toEntityId+id]',
        folderMemberships: 'id,folderId,entityId,sourceKind,position,[folderId+entityId],[folderId+position+id]',
        activities: 'id,type,boardId,entityId,sessionId,createdAt,[entityId+createdAt+id]',
        workspaceDrafts: 'id,sessionId,targetKey,boardId,updatedAt',
        workspaceRevisions: 'id,targetKey,createdAt,[targetKey+createdAt],[targetKey+createdAt+id]',
        searchState: 'key', searchChanges: 'id,generation',
        searchDocuments: 'id,epoch,*explorerGrams,*brainGrams,*smartGrams,*overflowDialects'});
    await old.open();
    const entity = {id: 'kept', type: 'note', title: 'original needle', createdAt: 1, updatedAt: 1};
    const draft = {id: 'draft', targetKey: 'kept', payload: 'private recovery'};
    await old.table('entities').put(entity); await old.table('workspaceDrafts').put(draft);
    await old.table('searchState').put({key: 'main', format: 1, generation: 9, indexedGeneration: 9,
        epoch: 'old', status, owner: 'old-worker', fence: 4, scanComplete: true});
    await old.table('searchDocuments').put({id: 'kept', epoch: 'old', brainGrams: ['nee']});
    await old.table('searchChanges').put({id: 'entity:kept', entityId: 'kept', kind: 'entity', generation: 9});
    old.close();
    const db = writer === 'react' ? new WorkspaceClient(name) : createWorkspaceDatabase(name);
    t.after(() => db.delete()); await db.open();
    const state = await db.searchState.get('main');
    assert.equal(state.format, 2); assert.notEqual(state.epoch, 'old'); assert.equal(state.owner, '');
    assert.equal(state.generation, 9); assert.equal(state.fence, 5);
    assert.equal(state.status, status === 'paused' ? 'paused' : 'unbuilt');
    assert.equal(state.scanComplete, false);
    assert.equal(await db.searchDocuments.count(), 0); assert.equal(await db.searchChanges.count(), 0);
    assert.deepEqual(await db.entities.get('kept'), entity); assert.deepEqual(await db.workspaceDrafts.get('draft'), draft);
    assert.deepEqual(db.searchDocuments.schema.indexes.filter(index => index.multi).map(index => index.name), ['grams', 'overflowDialects']);
    if (status === 'paused') await load('searchIndexRepository.ts').controlSearchIndex(db, 'resume');
    await readyIndex(db, load);
    const page = await load('libraryQueryEngine.ts').readLibraryPage(db, {dialect: 'brain', text: 'needle', sort: 'id', referenceTime: 100});
    assert.notEqual(page.searchGeneration, undefined);
    assert.deepEqual(page.items.map(item => item.id), ['kept']);
});
