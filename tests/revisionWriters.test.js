const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('canonical and Inspector content writes record creation, text and title without changing identity', async t => {
    const {db, load} = await workspaceFixture(t), history = load('revisionRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Original', body: 'Before'});
    assert.equal((await history.listHistory({kind: 'entity', id: note.id})).items.length, 1);
    await load('richContentRepository.ts').saveRichContent(note.id, 0, load('richContent.ts').plainToRichContent('After'));
    await load('workspaceRepository.ts').updateEntity(note.id, {title: 'Renamed'});
    const entries = await history.listHistory({kind: 'entity', id: note.id});
    assert.equal(entries.items.length, 3);
    assert.equal((await history.readRevision(entries.items[0].id)).snapshot.title, 'Renamed');
    assert.equal((await db.entities.get(note.id)).metadata.body, 'After');
});

test('page and legacy layout writers record history, omit pan-only changes and preserve shared relations on restore', async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts'), legacy = load('workspaceRepository.ts'), history = load('revisionRepository.ts');
    let page = await pages.createWorkspacePage('Page');
    for (const type of ['note', 'project']) {
        const entity = await load('brainRepository.ts').createBrainObject({type, title: type});
        page = await pages.addPageReference(page.board.id, entity.id);
    }
    const target = {kind: 'page', id: page.board.id}, beforeCount = (await history.listHistory(target)).items.length;
    page = await pages.applyPageCommand(page.board.id, page.version, {type: 'view', mode: 'document', viewport: {x: 20, y: 30, zoom: 2}});
    assert.equal((await history.listHistory(target)).items.length, beforeCount);
    const before = page;
    await legacy.updatePlacement(page.placements[0].id, {x: 321, metadata: {...page.placements[0].metadata, retained: 'yes'}});
    assert.equal((await history.listHistory(target)).items.length, beforeCount + 1);
    await assert.rejects(pages.applyPageCommand(page.board.id, before.version, {type: 'view', mode: 'canvas', viewport: {x: 0, y: 0, zoom: 1}}), /conflict/);
    page = await pages.loadPageSnapshot(page.board.id);
    page = await pages.applyPageCommand(page.board.id, page.version, {type: 'connect', fromPlacementId: page.placements[0].id, toPlacementId: page.placements[1].id, relationType: 'related'});
    const link = page.presentation.connectors[0].relationshipId;
    page = await pages.restorePageLayout(page.board.id, page.version, history.layoutSnapshot(before));
    assert.ok(await db.relationships.get(link));
    assert.equal((await db.placements.get(before.placements[0].id)).metadata.retained, 'yes');
    assert.equal(page.presentation.connectors.length, 0);
});

test('history capture failure rolls back content and Quick Add never leaves partial destinations or tasks', async t => {
    const {db, load} = await workspaceFixture(t), legacy = load('workspaceRepository.ts');
    const one = await legacy.createBoard('One'), two = await legacy.createBoard('Two');
    const fail = (_key, obj) => {if (obj.boardId === two.id) throw new Error('destination unavailable');};
    db.placements.hook('creating', fail);
    await assert.rejects(legacy.quickAdd({kind: 'task', title: 'Atomic task', boardIds: [one.id, two.id]}), /destination unavailable/);
    assert.equal((await db.entities.toArray()).filter(e => e.type === 'task').length, 0);
    assert.equal(await db.placements.count(), 0); assert.equal(await db.tasks.count(), 0);
    db.placements.hook('creating').unsubscribe(fail);
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Unchanged'});
    db.workspaceRevisions.hook('creating', () => {throw new Error('history unavailable');});
    await assert.rejects(legacy.updateEntity(note.id, {title: 'Must roll back'}), /history unavailable/);
    assert.equal((await db.entities.get(note.id)).title, 'Unchanged');
});

test('legacy creation, duplicate, layout, Trash, rename, file and connector deletion all retain history', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts'), pages = load('pageRepository.ts'), history = load('revisionRepository.ts');
    const board = await repo.createBoard('Legacy');
    const target = {kind: 'page', id: board.id};
    const note = await repo.addNote(board.id);
    assert.ok((await history.listHistory({kind: 'entity', id: note.entityId})).items.length);
    const captured = await repo.quickAdd({kind: 'note', title: 'Quick', body: 'Body', boardIds: [board.id]});
    assert.ok((await history.listHistory({kind: 'entity', id: captured.id})).items.length);
    let count = (await history.listHistory(target)).items.length;
    const changed = async action => {await action(); const next = (await history.listHistory(target)).items.length; assert.ok(next > count); count = next;};
    await changed(() => repo.duplicatePlacements([note.id]));
    await changed(() => repo.autoLayoutBoard(board.id));
    await changed(() => repo.removePlacements([note.id]));
    await changed(() => repo.restoreLatestTrash());
    const page = await pages.loadPageSnapshot(board.id);
    await repo.renameBoard(board.id, 'Renamed');
    assert.equal((await history.readRevision((await history.listHistory({kind: 'entity', id: page.owner.id})).items[0].id)).snapshot.title, 'Renamed');
    await changed(() => load('pageAssets.ts').addPageFile(board.id, new File(['text'], 'readme.txt', {type: 'text/plain'})));
    let connected = await pages.loadPageSnapshot(board.id);
    connected = await pages.applyPageCommand(board.id, connected.version, {type: 'connect', fromPlacementId: note.id,
        toPlacementId: connected.placements.find(p => p.entityId === captured.id).id, relationType: 'related'});
    count = (await history.listHistory(target)).items.length;
    await changed(() => repo.deleteRelationship(connected.presentation.connectors[0].relationshipId));
    const copy = await repo.duplicateBoard(board.id);
    assert.ok((await history.listHistory({kind: 'page', id: copy.id})).items.length);
    await repo.deleteBoard(board.id); await repo.restoreLatestTrash();
    assert.ok(await db.boards.get(board.id));
    assert.equal((await history.listHistory(target)).items[0].reason, 'restore');
});
