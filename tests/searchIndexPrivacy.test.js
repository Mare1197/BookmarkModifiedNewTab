const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {createWorkspaceRepository} = require('../src/workspace/workspaceDb');

test('search cache is excluded from both export modes and both writers', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    await db.entities.put({id: 'original', title: 'Original', type: 'note', searchTerms: [], createdAt: 1, updatedAt: 1});
    await db.searchDocuments.put({id: 'original', fingerprint: 'derived'});
    for (const includeRecovery of [false, true]) for (const snapshot of [
        await repo.exportWorkspace({includeRecovery}), await createWorkspaceRepository({db}).exportSnapshot({includeRecovery})
    ]) {
        for (const name of ['searchState', 'searchChanges', 'searchDocuments']) assert.equal(Object.hasOwn(snapshot.tables, name), false);
        assert.equal(snapshot.tables.entities.length, 1);
        assert.equal(snapshot.schemaVersion, 4);
    }
});
test('imports reject derived cache tables before canonical writes', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    for (const name of ['searchState', 'searchChanges', 'searchDocuments']) {
        await assert.rejects(repo.importWorkspace({format: 'browser-os-workspace', schemaVersion: 4, tables: {[name]: []}}), /derived.*search|search.*cache/i);
        assert.equal(await db.entities.count(), 0);
    }
});
