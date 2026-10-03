const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

async function fixture(t) {
    const f = await workspaceFixture(t), pages = f.load('pageRepository.ts');
    let page = await pages.createWorkspacePage('Routing');
    for (const title of ['A', 'B', 'C']) {
        const entity = await f.load('brainRepository.ts').createBrainObject({type: 'note', title});
        page = await pages.addPageReference(page.board.id, entity.id);
    }
    const ids = ['A', 'B', 'C'].map(title => page.placements.find(p => p.entityId === page.entities.find(e => e.title === title).id).id);
    page = await pages.applyPageCommand(page.board.id, page.version, {type: 'connect', fromPlacementId: ids[0], toPlacementId: ids[1], relationType: 'related'});
    return {...f, pages, page, ids};
}
const anchors = {source: {x: 0.5, y: 1}, target: {x: 0.5, y: 0}};

test('manual orthogonal routes retain world-space bends while endpoints follow moved cards', async t => {
    const {load} = await workspaceFixture(t), geometry = load('connectorGeometry.ts');
    const source = {x: 100, y: 200}, target = {x: 600, y: 500}, bends = [{x: 350, y: 320}];
    assert.deepEqual(geometry.orthogonalRoute(source, target, bends), [source, {x: 350, y: 200}, bends[0], {x: 600, y: 320}, target]);
    assert.deepEqual(geometry.orthogonalRoute({x: 350, y: 300}, target, bends), [{x: 350, y: 300}, bends[0], {x: 600, y: 320}, target]);
    assert.deepEqual(bends, [{x: 350, y: 320}]);
});

test('connector route persists attachment anchors and bends without changing shared relationships and undoes safely', async t => {
    const {db, pages, page} = await fixture(t), c = page.presentation.connectors[0];
    const relationships = await db.relationships.toArray();
    const routed = await pages.applyPageCommand(page.board.id, page.version, {type: 'connector-route', connectorId: c.id,
        anchors, points: [{x: 370, y: 150}]});
    assert.deepEqual((await pages.loadPageSnapshot(page.board.id)).presentation.connectors[0], {...c, anchors, points: [{x: 370, y: 150}]});
    assert.deepEqual(await db.relationships.toArray(), relationships);
    const restored = await pages.undoPageCommand(page.board.id, routed.undoToken);
    assert.deepEqual(restored.presentation.connectors[0], c);
    await assert.rejects(pages.applyPageCommand(page.board.id, page.version, {type: 'connector-route', connectorId: c.id, anchors, points: []}), /conflict/i);
});

test('new native connectors accept an application-generated ID so queued routing targets the right connector', async t => {
    const {pages, page, ids} = await fixture(t);
    const connected = await pages.applyPageCommand(page.board.id, page.version, {type: 'connect', connectorId: 'connector:native-gesture',
        fromPlacementId: ids[0], toPlacementId: ids[2], relationType: 'related'});
    assert.equal(connected.presentation.connectors[1].id, 'connector:native-gesture');
    await assert.rejects(pages.applyPageCommand(page.board.id, connected.version, {type: 'connect', connectorId: 'connector:native-gesture',
        fromPlacementId: ids[1], toPlacementId: ids[2], relationType: 'related'}), /connector/i);
});

test('retargeting reuses the new semantic link and leaves the previous relationship and other page untouched', async t => {
    const {db, load, pages, page, ids} = await fixture(t), c = page.presentation.connectors[0];
    const a = page.placements.find(p => p.id === ids[0]).entityId, b = page.placements.find(p => p.id === ids[1]).entityId;
    const third = page.placements.find(p => p.id === ids[2]).entityId;
    await load('brainRepository.ts').linkBrainObjects(a, third, 'related');
    const existing = (await db.relationships.toArray()).find(r => r.fromEntityId === a && r.toEntityId === third);
    let other = await pages.createWorkspacePage('Other');
    other = await pages.addPageReference(other.board.id, a); other = await pages.addPageReference(other.board.id, b);
    other = await pages.applyPageCommand(other.board.id, other.version, {type: 'connect', fromPlacementId: other.placements.find(p => p.entityId === a).id,
        toPlacementId: other.placements.find(p => p.entityId === b).id, relationType: 'related'});
    const originalLink = await db.relationships.get(c.relationshipId);
    const after = await pages.applyPageCommand(page.board.id, page.version, {type: 'reconnect', connectorId: c.id,
        fromPlacementId: ids[0], toPlacementId: ids[2], anchors, points: []});
    assert.equal(after.presentation.connectors[0].relationshipId, existing.id);
    assert.equal(after.presentation.connectors[0].toPlacementId, ids[2]);
    assert.deepEqual(await db.relationships.get(c.relationshipId), originalLink);
    assert.deepEqual((await pages.loadPageSnapshot(other.board.id)).presentation, other.presentation);
    const undone = await pages.undoPageCommand(page.board.id, after.undoToken);
    assert.deepEqual(undone.presentation.connectors[0], c);
    assert.ok(await db.relationships.get(existing.id));
});

test('routing rejects malformed coordinates and dangling endpoints atomically, and recovery cannot silently retarget', async t => {
    const {db, load, pages, page, ids} = await fixture(t), c = page.presentation.connectors[0];
    const before = await db.settings.toArray(), relationships = await db.relationships.toArray();
    for (const command of [
        {type: 'connector-route', connectorId: c.id, anchors: {...anchors, source: {x: 2, y: 0}}, points: []},
        {type: 'connector-route', connectorId: c.id, anchors, points: [{x: NaN, y: 0}]},
        {type: 'reconnect', connectorId: c.id, fromPlacementId: ids[0], toPlacementId: 'missing', anchors, points: []},
        {type: 'reconnect', connectorId: c.id, fromPlacementId: ids[0], toPlacementId: ids[0], anchors, points: []}
    ]) await assert.rejects(pages.applyPageCommand(page.board.id, page.version, command));
    assert.deepEqual(await db.settings.toArray(), before); assert.deepEqual(await db.relationships.toArray(), relationships);
    const layout = load('revisionRepository.ts').layoutSnapshot(page);
    assert.throws(() => load('pagePresentationCommands.ts').projectPresentation(layout, [{type: 'reconnect', connectorId: c.id,
        fromPlacementId: ids[0], toPlacementId: ids[2], anchors, points: []}]), /shared relationship/i);
});

test('new retarget links undo without deleting the original and routed geometry survives backup import', async t => {
    const {db, load, pages, page, ids} = await fixture(t), c = page.presentation.connectors[0];
    const after = await pages.applyPageCommand(page.board.id, page.version, {type: 'reconnect', connectorId: c.id,
        fromPlacementId: ids[0], toPlacementId: ids[2], anchors, points: [{x: -120, y: 800}]});
    const newId = after.presentation.connectors[0].relationshipId;
    assert.notEqual(newId, c.relationshipId); assert.ok(await db.relationships.get(c.relationshipId));
    const backup = await load('workspaceRepository.ts').exportWorkspace(), dest = await workspaceFixture(t);
    await dest.load('workspaceRepository.ts').importWorkspace(backup);
    assert.deepEqual((await dest.load('pageRepository.ts').loadPageSnapshot(page.board.id)).presentation, after.presentation);
    const invalid = structuredClone(backup);
    invalid.tables.settings.find(s => s.key === 'workspace-page:' + page.board.id).value.connectors[0].anchors.target.x = Infinity;
    await assert.rejects(dest.load('workspaceRepository.ts').importWorkspace(invalid), /anchor/i);
    await pages.undoPageCommand(page.board.id, after.undoToken);
    assert.equal(await db.relationships.get(newId), undefined); assert.ok(await db.relationships.get(c.relationshipId));
});
