const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('pages reference original objects and nesting rejects cycles', async t => {
    const {db, load} = await workspaceFixture(t);
    const pages = load('pageRepository.ts');
    const brain = load('brainRepository.ts');
    const root = await pages.createWorkspacePage('Research');
    const note = await brain.createBrainObject({type: 'note', title: 'Shared note'});
    await pages.addPageReference(root.board.id, note.id);
    await pages.addPageReference(root.board.id, note.id);
    assert.equal(await db.placements.where('[boardId+entityId]').equals([root.board.id, note.id]).count(), 1);
    const child = await pages.createWorkspacePage('Details', root.owner.id);
    await assert.rejects(pages.setPageParent(root.owner.id, child.owner.id), /cycle/i);
    assert.equal((await pages.loadPageSnapshot(child.board.id)).parent.id, root.owner.id);
});

test('stale native edits cannot overwrite legacy canvas geometry', async t => {
    const {db, load} = await workspaceFixture(t);
    const pages = load('pageRepository.ts');
    const root = await pages.createWorkspacePage('Research');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const before = await pages.addPageReference(root.board.id, note.id);
    const placement = before.placements[0];
    await load('workspaceRepository.ts').updatePlacement(placement.id, {x: 917});
    await assert.rejects(pages.applyPageCommand(root.board.id, before.version, {
        type: 'move-resize', placements: [{id: placement.id, x: 3, y: 4, width: 300, height: 200}]
    }), /conflict/i);
    assert.equal((await db.placements.get(placement.id)).x, 917);
});

test('page commands validate, preserve semantic links and guard undo', async t => {
    const {db, load} = await workspaceFixture(t);
    const p = load('pageRepository.ts');
    let page = await p.createWorkspacePage('Page');
    for (const title of ['A', 'B']) {
        const note = await load('brainRepository.ts').createBrainObject({type: 'note', title, body: 'PRIVATE CONTENT'});
        page = await p.addPageReference(page.board.id, note.id);
    }
    const ids = page.placements.map(item => item.id);
    await assert.rejects(p.applyPageCommand(page.board.id, page.version, {type: 'reorder', placementIds: [ids[0], ids[0]]}), /order/i);
    await assert.rejects(p.applyPageCommand(page.board.id, page.version, {type: 'move-resize', placements: [{id: ids[0], x: Infinity, y: 0, width: 90, height: 90}]}), /geometry/i);
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'connect', fromPlacementId: ids[0], toPlacementId: ids[1], relationType: 'related'});
    const connector = page.presentation.connectors[0];
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'remove-connector', connectorId: connector.id, scope: 'page'});
    assert.ok(await db.relationships.get(connector.relationshipId));
    page = await p.undoPageCommand(page.board.id, page.undoToken);
    assert.equal(page.presentation.connectors.length, 1);
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'style', placementIds: [ids[0]], color: 'blue'});
    await db.placements.update(ids[0], {x: 888});
    await assert.rejects(p.undoPageCommand(page.board.id, page.undoToken), /conflict/i);
    assert.equal(JSON.stringify(await db.settings.toArray()).includes('PRIVATE CONTENT'), false);
});

test('failed activity writes roll back page creation and edits', async t => {
    const {db, load} = await workspaceFixture(t);
    const pages = load('pageRepository.ts');
    db.activities.hook('creating', () => {throw new Error('activity unavailable');});
    await assert.rejects(pages.createWorkspacePage('No partial page'), /activity unavailable/);
    assert.equal(await db.entities.count(), 0);
    assert.equal(await db.boards.count(), 0);
    assert.equal(await db.settings.count(), 0);
});

test('groups reject cycles and ungroup reparents nested groups without moving content', async t => {
    const {load} = await workspaceFixture(t);
    const p = load('pageRepository.ts');
    let page = await p.createWorkspacePage('Groups');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    page = await p.addPageReference(page.board.id, note.id);
    const id = page.placements[0].id;
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'group', group: {id: 'a', label: 'A', collapsed: false}, placementIds: [id]});
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'group', group: {id: 'b', parentId: 'a', label: 'B', collapsed: false}, placementIds: []});
    await assert.rejects(p.applyPageCommand(page.board.id, page.version, {type: 'group', group: {id: 'a', parentId: 'b', label: 'A', collapsed: false}, placementIds: []}), /cycle/i);
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'ungroup', groupId: 'a'});
    assert.equal(page.presentation.groups[0].parentId, undefined);
    assert.equal(page.placements[0].metadata.page.groupId, undefined);
    assert.equal(page.entities[0].id, note.id);
});

test('missing endpoints and owners reject without partial mutations; body edits do not conflict with layout', async t => {
    const {db, load} = await workspaceFixture(t);
    const p = load('pageRepository.ts');
    let page = await p.createWorkspacePage('Page');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    page = await p.addPageReference(page.board.id, note.id);
    await assert.rejects(p.applyPageCommand(page.board.id, page.version, {type: 'connect', fromPlacementId: page.placements[0].id, toPlacementId: 'missing', relationType: 'related'}), /placement/i);
    await db.entities.update(note.id, {metadata: {body: 'Canonical change'}});
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'style', placementIds: [page.placements[0].id], color: 'purple'});
    db.activities.hook('creating', () => {throw new Error('write failed');});
    await assert.rejects(p.applyPageCommand(page.board.id, page.version, {type: 'remove-reference', placementIds: [page.placements[0].id]}), /write failed/);
    assert.equal(await db.placements.count(), 1);
    await db.entities.delete(page.owner.id);
    await assert.rejects(p.loadPageSnapshot(page.board.id), /owner/i);
});

test('project opening is idempotent and member refresh preserves arranged geometry', async t => {
    const {db, load} = await workspaceFixture(t);
    const p = load('pageRepository.ts'), brain = load('brainRepository.ts');
    const project = await brain.createBrainObject({type: 'project', title: 'Project'});
    let page = await p.openProjectWorkspace(project.id);
    assert.equal(page.owner.id, project.id);
    await db.placements.update(page.placements[0].id, {x: 612});
    const note = await brain.createBrainObject({type: 'note', title: 'Member'});
    await brain.linkBrainObjects(note.id, project.id, 'project-member');
    assert.equal((await p.openProjectWorkspace(project.id)).placements.length, 1);
    page = await p.refreshProjectReferences(page.board.id);
    assert.equal(page.placements.length, 2);
    assert.equal(page.placements.find(p => p.entityId === project.id).x, 612);
    assert.equal((await p.refreshProjectReferences(page.board.id)).placements.length, 2);
});
