const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {draft} = require('./helpers/recoveryFixture');

test('import versions unopened legacy board layouts before replacing placements', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Legacy'});
    await db.boards.put({id: 'legacy-board', name: 'Legacy board', createdAt: 1, updatedAt: 1});
    await db.placements.put({id: 'legacy-placement', boardId: 'legacy-board', entityId: note.id,
        kind: 'note', x: 1, y: 1, width: 300, height: 200, zIndex: 0, createdAt: 1, updatedAt: 1});
    const backup = await repo.exportWorkspace(); backup.tables.placements[0].x = 999;
    await repo.importWorkspace(backup);
    const history = (await db.workspaceRevisions.toArray()).filter(r => r.target.id === 'legacy-board');
    assert.ok(history.some(r => r.snapshot.placements[0].x === 1));
    assert.ok(history.some(r => r.snapshot.placements[0].x === 999));
});

test('private backups are opt-in, remap identities and import inactive without applying drafts', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    await load('recoveryRepository.ts').writeDraft(draft(), null);
    assert.equal('workspaceDrafts' in (await repo.exportWorkspace()).tables, false);
    const backup = await repo.exportWorkspace({includeRecovery: true});
    assert.equal(backup.tables.workspaceDrafts.length, 1);
    await repo.importWorkspace(backup);
    const rows = await db.workspaceDrafts.toArray(); assert.equal(rows.length, 2);
    const imported = rows.find(r => r.id !== 'draft-s');
    assert.notEqual(imported.sessionId, 's'); assert.equal(imported.leaseUntil, 0);
    assert.equal(imported.recoverySource, undefined);
    assert.equal(await db.entities.count(), 0);
    for (const schemaVersion of [2, 3, 4]) await repo.importWorkspace({format: 'browser-os-workspace', schemaVersion, tables: {}, exportedAt: 1});
    assert.equal(await db.workspaceDrafts.count(), 2);
});

test('malformed optional recovery rolls back canonical records and preserves import preimages', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Before', body: 'Saved'});
    const backup = await repo.exportWorkspace({includeRecovery: true});
    backup.tables.entities[0].title = 'Imported';
    backup.tables.workspaceDrafts.push({version: 99});
    await assert.rejects(repo.importWorkspace(backup), /recovery|draft/i);
    assert.equal((await db.entities.get(note.id)).title, 'Before');
    delete backup.tables.workspaceDrafts; delete backup.tables.workspaceRevisions;
    await db.workspaceRevisions.clear();
    await repo.importWorkspace(backup);
    const history = await db.workspaceRevisions.toArray();
    assert.ok(history.some(r => r.snapshot.title === 'Before'));
    assert.ok(history.some(r => r.snapshot.title === 'Imported'));
});

test('optional history over target limits rejects the whole import rather than pruning', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const backup = await repo.exportWorkspace({includeRecovery: true});
    const revision = backup.tables.workspaceRevisions[0];
    backup.tables.workspaceRevisions = Array.from({length: 51}, (_, i) => ({...revision, id: 'import-' + i}));
    const before = await db.workspaceRevisions.toArray();
    await assert.rejects(repo.importWorkspace(backup), /limit/i);
    assert.deepEqual(await db.workspaceRevisions.toArray(), before);
});

test('export reads all canonical tables in one transaction under a concurrent writer', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    const original = db.entities.toArray.bind(db.entities); let writer;
    db.entities.toArray = async () => {
        const rows = await original();
        writer = require('dexie').Dexie.ignoreTransaction(() => db.transaction('rw', db.entities, db.boards, db.placements, async () => {
            await db.entities.put({id: 'late', type: 'note', title: 'Late'});
            await db.boards.put({id: 'board', name: 'Board'});
            await db.placements.put({id: 'placement', boardId: 'board', entityId: 'late'});
        }));
        // Yield a task so a non-transactional export demonstrably sees the later placement.
        if (require('dexie').Dexie.currentTransaction) await require('dexie').Dexie.waitFor(new Promise(resolve => setTimeout(resolve, 20)));
        else await writer;
        return rows;
    };
    const backup = await repo.exportWorkspace(); await writer;
    assert.equal(backup.tables.entities.length, backup.tables.placements.length);
});
