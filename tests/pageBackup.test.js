const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
// Browser FileReader API backed by the real Blob bytes in this Node fixture.
global.FileReader = class {
    listeners = {};
    addEventListener(name, fn) {this.listeners[name] = fn;}
    readAsDataURL(blob) {blob.arrayBuffer().then(bytes => {this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`; this.listeners.load();}).catch(error => {this.error = error; this.listeners.error();});}
};

test('pages rich text and shared file bytes restore with canonical IDs', async t => {
    const source = await workspaceFixture(t), dest = await workspaceFixture(t);
    const pages = source.load('pageRepository.ts');
    const root = await pages.createWorkspacePage('Root');
    await pages.createWorkspacePage('Child', root.owner.id);
    const note = await source.load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    await source.load('richContentRepository.ts').saveRichContent(note.id, 0, {version: 1, blocks: [{id: '1', kind: 'heading', level: 2, runs: [{insert: 'Formatted', attributes: {bold: true}}]}]});
    await pages.addPageReference(root.board.id, note.id);
    const added = await source.load('pageAssets.ts').addPageFile(root.board.id, new File(['bytes'], 'file.txt', {type: 'text/plain'}));
    const backup = await source.load('workspaceRepository.ts').exportWorkspace();
    const frozen = JSON.stringify(backup);
    await dest.load('workspaceRepository.ts').importWorkspace(backup);
    assert.equal(JSON.stringify(backup), frozen);
    assert.deepEqual((await dest.db.entities.get(note.id)).richContent, (await source.db.entities.get(note.id)).richContent);
    assert.equal((await dest.load('pageRepository.ts').loadPageSnapshot(root.board.id)).children.length, 1);
    assert.equal(await (await dest.db.assets.get(added.assetId)).blob.text(), 'bytes');
});

test('invalid page imports reject atomically and old backups cannot erase formatting', async t => {
    const {db, load} = await workspaceFixture(t), p = load('pageRepository.ts'), repo = load('workspaceRepository.ts');
    const root = await p.createWorkspacePage('Root'), child = await p.createWorkspacePage('Child', root.owner.id);
    const backup = await repo.exportWorkspace();
    const invalid = structuredClone(backup);
    invalid.tables.relationships.push({id: 'cycle', fromEntityId: root.owner.id, toEntityId: child.owner.id, type: 'page-parent', confirmed: true, origin: 'user', createdAt: 1, updatedAt: 1});
    await assert.rejects(repo.importWorkspace(invalid), /cycle/i);
    assert.equal(await db.relationships.count(), 1);
    const missing = structuredClone(backup);
    missing.tables.settings[0].value.ownerEntityId = 'missing';
    await assert.rejects(repo.importWorkspace(missing), /owner/i);
    const old = await repo.exportWorkspace();
    await load('richContentRepository.ts').saveRichContent(root.owner.id, 0, load('richContent.ts').plainToRichContent('Keep formatting'));
    await repo.importWorkspace(old);
    assert.equal((await db.entities.get(root.owner.id)).metadata.body, 'Keep formatting');
    assert.ok((await db.entities.get(root.owner.id)).richContent);
});

test('legacy board duplicate delete and reference removal keep page metadata valid', async t => {
    const {db, load} = await workspaceFixture(t), p = load('pageRepository.ts'), repo = load('workspaceRepository.ts');
    let root = await p.createWorkspacePage('Original');
    for (const title of ['One', 'Two']) {
        const e = await load('brainRepository.ts').createBrainObject({type: 'note', title});
        root = await p.addPageReference(root.board.id, e.id);
    }
    root = await p.applyPageCommand(root.board.id, root.version, {type: 'connect', fromPlacementId: root.placements[0].id, toPlacementId: root.placements[1].id, relationType: 'related'});
    const copy = await repo.duplicateBoard(root.board.id);
    const copied = await p.loadPageSnapshot(copy.id);
    assert.notEqual(copied.owner.id, root.owner.id);
    assert.equal(copied.presentation.connectors.length, 1);
    assert.deepEqual(new Set(copied.placements.map(p => p.entityId)), new Set(root.placements.map(p => p.entityId)));
    await repo.removePlacements([root.placements[0].id]);
    assert.equal((await p.loadPageSnapshot(root.board.id)).presentation.connectors.length, 0);
    await repo.deleteBoard(copy.id);
    assert.equal(await db.settings.get('workspace-page:' + copy.id), undefined);
    assert.equal(await repo.restoreLatestTrash(), copy.id);
    assert.equal((await p.loadPageSnapshot(copy.id)).presentation.connectors.length, 1);
});
