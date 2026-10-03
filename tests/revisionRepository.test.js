const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {content} = require('./helpers/recoveryFixture');
const target = {kind: 'entity', id: 'n'};
const version = revision => ({kind: 'entity', revision});

test('history retains 50 revisions and pages tied timestamps without duplicates or payloads', async t => {
    const {db, load} = await workspaceFixture(t);
    const history = load('revisionRepository.ts').createRevisionRepository({now: () => 100});
    for (let i = 0; i < 51; i++) await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition(undefined, content(String(i)), version(i), 'edit'));
    const first = await history.listHistory(target), second = await history.listHistory(target, first.next);
    assert.equal(first.items.length, 20); assert.equal(second.items.length, 20);
    assert.equal(new Set([...first.items, ...second.items].map(r => r.id)).size, 40);
    assert.equal('snapshot' in first.items[0], false);
    assert.equal((await history.readRevision(first.items[0].id)).snapshot.content.blocks[0].runs[0].insert, '50');
    assert.equal(await db.workspaceRevisions.count(), 50);
    assert.equal((await db.workspaceRevisions.toArray()).every(r => r.createdAt === 100), true);
});

test('history captures preimages, skips identical states and forces explicit restores', async t => {
    const {db, load} = await workspaceFixture(t), history = load('revisionRepository.ts');
    await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition({snapshot: content('A'), version: version(0)}, content('B'), version(1), 'edit'));
    await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition({snapshot: content('B'), version: version(1)}, content('B'), version(2), 'edit'));
    assert.equal(await db.workspaceRevisions.count(), 2);
    await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition({snapshot: content('B'), version: version(2)}, content('B'), version(3), 'restore'));
    assert.equal(await db.workspaceRevisions.count(), 3);
    assert.equal((await history.listHistory(target)).items[0].canonicalVersion.revision, 3);
    await history.deleteHistory(target); assert.equal(await db.workspaceRevisions.count(), 0);
});

test('global retention prunes oldest first, counts UTF-8 and rejects oversized protected writes atomically', async t => {
    const {db, load} = await workspaceFixture(t);
    const bytes = Buffer.byteLength(JSON.stringify(content('😀')), 'utf8');
    const history = load('revisionRepository.ts').createRevisionRepository({now: () => 100,
        limits: {perTargetCount: 50, perTargetBytes: 1000, globalBytes: bytes * 2}});
    for (const id of ['a', 'b', 'c']) await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition(undefined,
        {...content('😀'), entityId: id}, version(0), 'created'));
    assert.equal((await history.listHistory({kind: 'entity', id: 'a'})).items.length, 0);
    assert.equal(await db.workspaceRevisions.count(), 2);
    assert.equal((await db.workspaceRevisions.toArray())[0].payloadBytes, bytes);
    await assert.rejects(db.transaction('rw', db.entities, db.workspaceRevisions, async () => {
        await db.entities.put({id: 'must-rollback'});
        await history.captureTransition(undefined, content('x'.repeat(100001)), version(0), 'edit');
    }), /characters|limit/);
    assert.equal(await db.entities.get('must-rollback'), undefined);
    assert.deepEqual((await history.listHistory({kind: 'entity', id: 'missing'})).items, []);
    const oversized = content('');
    oversized.content.blocks[0].runs = Array.from({length: 1500}, () => ({insert: 'a', attributes: {link: 'https://example.test/' + 'x'.repeat(3900)}}));
    await assert.rejects(db.transaction('rw', db.workspaceRevisions, () => history.captureTransition(undefined, oversized, version(1), 'edit')), /size limit/);
});

test('layout history ignores viewport and revisions but retains mode and layout changes', async t => {
    const {db, load} = await workspaceFixture(t), history = load('revisionRepository.ts');
    const layout = {kind: 'page', boardId: 'board', placements: [], presentation: {version: 1, ownerEntityId: 'owner', revision: 0,
        mode: 'canvas', viewport: {x: 0, y: 0, zoom: 1}, groups: [], connectors: []}};
    const v = {kind: 'page', value: {revision: 0, fingerprint: 'a'}};
    const moved = {...layout, presentation: {...layout.presentation, revision: 1, viewport: {x: 40, y: 20, zoom: 2}}};
    await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition(undefined, layout, v, 'create'));
    await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition({snapshot: layout, version: v}, moved, v, 'view'));
    assert.equal(await db.workspaceRevisions.count(), 1);
    await db.transaction('rw', db.workspaceRevisions, () => history.captureTransition({snapshot: moved, version: v},
        {...moved, presentation: {...moved.presentation, mode: 'document'}}, v, 'view'));
    assert.equal(await db.workspaceRevisions.count(), 2);
});
