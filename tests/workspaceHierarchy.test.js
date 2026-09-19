require('fake-indexeddb/auto');

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const DexieModule = require('dexie');

const Dexie = DexieModule.Dexie || DexieModule.default || DexieModule;
const source = readFileSync(path.join(__dirname, '../src/react/workspace/hierarchyRepository.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;

async function fixture(t) {
    const db = new Dexie('hierarchy-test-' + globalThis.crypto.randomUUID());
    db.version(1).stores({entities: '&id', folders: '&id,parentId',
        folderMemberships: '&id,entityId,folderId', settings: '&key'});
    await db.open();
    t.after(() => db.delete());
    await db.entities.add({id: 'note', title: 'Note'});
    await db.folders.bulkAdd([
        {id: 'a', title: 'First', sourceKind: 'workspace', createdAt: 1, updatedAt: 1},
        {id: 'b', title: 'Second', sourceKind: 'workspace', createdAt: 1, updatedAt: 1},
        {id: 'native', title: 'Bookmarks', sourceKind: 'bookmark', createdAt: 1, updatedAt: 1}
    ]);
    const exports = {};
    new Function('require', 'exports', compiled)(name => {
        assert.equal(name, './workspaceClient');
        return {workspaceClient: db};
    }, exports);
    return {db, ...exports};
}

const membership = (id, folderId, sourceKind = 'user') => ({
    id, folderId, entityId: 'note', sourceKind, position: 0, createdAt: 1, updatedAt: 1
});

test('folder creation trims titles, validates parents and persists across reopen', async t => {
    const {db, createWorkspaceFolder} = await fixture(t);
    await createWorkspaceFolder('  Research  ', 'a');
    const created = await db.folders.where('parentId').equals('a').first();
    assert.equal(created.title, 'Research');
    assert.equal(created.sourceKind, 'workspace');
    assert.ok(created.id.startsWith('folder:'));
    db.close();
    await db.open();
    assert.deepEqual(await db.folders.get(created.id), created);
    await assert.rejects(createWorkspaceFolder('  '), /folder name/);
    await assert.rejects(createWorkspaceFolder('Invalid', 'missing'), /workspace folder/);
    await assert.rejects(createWorkspaceFolder('Invalid', 'native'), /read-only/);
    assert.equal(await db.folders.count(), 4);
});

test('moving one membership preserves native and other memberships and undo survives reopen', async t => {
    const {db, moveHierarchyItem, undoHierarchyMove} = await fixture(t);
    const before = [membership('source', 'a'), membership('bookmark', 'native', 'bookmark')];
    await db.folderMemberships.bulkAdd(before);
    await moveHierarchyItem({kind: 'entity', id: 'note', sourceFolderId: 'a'}, 'b');
    assert.equal(await db.folderMemberships.get('source'), undefined);
    assert.deepEqual(await db.folderMemberships.get('bookmark'), before[1]);
    assert.equal((await db.folderMemberships.where('folderId').equals('b').first()).entityId, 'note');
    db.close();
    await db.open();
    await undoHierarchyMove();
    assert.deepEqual(await db.folderMemberships.toArray(), [...before].sort((a, b) => a.id.localeCompare(b.id)));
    await assert.rejects(undoHierarchyMove(), /No folder move/);
});

test('moving into an existing membership merges without duplicates and undo restores both', async t => {
    const {db, moveHierarchyItem, undoHierarchyMove} = await fixture(t);
    await db.folderMemberships.bulkAdd([membership('first', 'a'), membership('second', 'b')]);
    await moveHierarchyItem({kind: 'entity', id: 'note', sourceFolderId: 'a'}, 'b');
    assert.deepEqual(await db.folderMemberships.toArray(), [membership('second', 'b')]);
    await undoHierarchyMove();
    assert.deepEqual(await db.folderMemberships.toArray(), [membership('first', 'a'), membership('second', 'b')]);
});

test('root moves remove only the chosen workspace membership', async t => {
    const {db, moveHierarchyItem, undoHierarchyMove} = await fixture(t);
    await db.folderMemberships.bulkAdd([membership('first', 'a'), membership('second', 'b')]);
    await moveHierarchyItem({kind: 'entity', id: 'note', sourceFolderId: 'a'});
    assert.deepEqual(await db.folderMemberships.toArray(), [membership('second', 'b')]);
    assert.equal((await db.entities.get('note')).title, 'Note');
    await undoHierarchyMove();
    assert.equal(await db.folderMemberships.count(), 2);
});

test('native folder and membership mutations are rejected without changes', async t => {
    const {db, moveHierarchyItem} = await fixture(t);
    await db.folderMemberships.add(membership('bookmark', 'native', 'bookmark'));
    const before = await db.folderMemberships.toArray();
    await assert.rejects(moveHierarchyItem({kind: 'folder', id: 'native'}, 'a'), /Native/);
    await assert.rejects(moveHierarchyItem({kind: 'folder', id: 'a'}, 'native'), /read-only/);
    await assert.rejects(moveHierarchyItem({kind: 'entity', id: 'note', sourceFolderId: 'native'}, 'a'), /read-only/);
    assert.deepEqual(await db.folderMemberships.toArray(), before);
    assert.equal(await db.settings.count(), 0);
});

test('folder reparenting rejects descendant cycles and can be undone exactly', async t => {
    const {db, moveHierarchyItem, undoHierarchyMove} = await fixture(t);
    await db.folders.add({id: 'child', title: 'Child', sourceKind: 'workspace', parentId: 'a', createdAt: 1, updatedAt: 1});
    const original = await db.folders.get('a');
    await assert.rejects(moveHierarchyItem({kind: 'folder', id: 'a'}, 'child'), /descendants/);
    await assert.rejects(moveHierarchyItem({kind: 'folder', id: 'a'}, 'a'), /itself/);
    assert.deepEqual(await db.folders.get('a'), original);
    await moveHierarchyItem({kind: 'folder', id: 'a'}, 'b');
    assert.equal((await db.folders.get('a')).parentId, 'b');
    await undoHierarchyMove();
    assert.deepEqual(await db.folders.get('a'), original);
    assert.equal((await db.folders.get('child')).parentId, 'a');
});

test('undo rejects a concurrent membership edit without losing either change', async t => {
    const {db, moveHierarchyItem, undoHierarchyMove} = await fixture(t);
    await db.folderMemberships.add(membership('first', 'a'));
    await moveHierarchyItem({kind: 'entity', id: 'note', sourceFolderId: 'a'}, 'b');
    await db.folderMemberships.add(membership('external', 'a'));
    const current = await db.folderMemberships.toArray();
    await assert.rejects(undoHierarchyMove(), /Memberships changed/);
    assert.deepEqual(await db.folderMemberships.toArray(), current);
    assert.equal(await db.settings.count(), 1);
});

test('undo rejects intervening folder hierarchy changes without creating a cycle', async t => {
    const {db, moveHierarchyItem, undoHierarchyMove} = await fixture(t);
    await db.folders.update('b', {parentId: 'a'});
    await moveHierarchyItem({kind: 'folder', id: 'b'});
    await db.folders.update('a', {parentId: 'b'});
    const current = await db.folders.toArray();
    await assert.rejects(undoHierarchyMove(), /hierarchy changed/);
    assert.deepEqual(await db.folders.toArray(), current);
});
