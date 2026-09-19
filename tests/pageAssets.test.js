const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('file references share bytes and removing a reference preserves the asset', async t => {
    const {db, load} = await workspaceFixture(t);
    const pages = load('pageRepository.ts'), assets = load('pageAssets.ts');
    const one = await pages.createWorkspacePage('One'), two = await pages.createWorkspacePage('Two');
    const added = await assets.addPageFile(one.board.id, new File(['local data'], 'research.txt', {type: 'text/plain'}));
    await pages.addPageReference(two.board.id, added.entityId);
    const page = await pages.loadPageSnapshot(one.board.id);
    await pages.applyPageCommand(one.board.id, page.version, {type: 'remove-reference', placementIds: [page.placements[0].id]});
    assert.equal(await db.assets.count(), 1);
    assert.equal((await assets.loadPageAsset(added.entityId)).size, 10);
    assert.equal(await db.placements.count(), 1);
});

test('active and oversized files are rejected before reading; mismatched images are inert', async t => {
    const {load} = await workspaceFixture(t), assets = load('pageAssets.ts');
    for (const file of [{name: 'x.svg', type: 'image/svg+xml', size: 3}, {name: 'x.HTML', type: '', size: 3},
        {name: 'x.js', type: 'text/plain', size: 3}, {name: 'x.png', type: 'image/png', size: 26 * 1024 * 1024}]) {
        assert.throws(() => assets.validatePageFile(file), /active|25 MiB/);
    }
    const page = await load('pageRepository.ts').createWorkspacePage('Files');
    const added = await assets.addPageFile(page.board.id, new File(['not PNG'], 'image.png', {type: 'image/png'}));
    assert.equal((await assets.loadPageAsset(added.entityId)).type, 'file');
});

test('file insertion is atomic with activity and missing-page validation', async t => {
    const {db, load} = await workspaceFixture(t), assets = load('pageAssets.ts');
    const file = new File(['data'], 'file.txt', {type: 'text/plain'});
    await assert.rejects(assets.addPageFile('missing', file), /page|Board/);
    const page = await load('pageRepository.ts').createWorkspacePage('Files');
    db.activities.hook('creating', () => {throw new Error('write failed');});
    await assert.rejects(assets.addPageFile(page.board.id, file), /write failed/);
    assert.equal(await db.assets.count(), 0);
    assert.equal(await db.entities.count(), 1);
    assert.equal(await db.placements.count(), 0);
});
