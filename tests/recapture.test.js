const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {createWorkspaceRepository} = require('../src/workspace/workspaceDb');

for (const capture of ['recent tab', 'Quick Add', 'window session', 'legacy source']) {
    test(`${capture} recapture preserves edited content and indexes the saved object`, async t => {
        const {db, load, browser} = await workspaceFixture(t), api = load('workspaceRepository.ts');
        const board = await api.createBoard('Research');
        const input = {kind: 'web', url: 'https://example.test/article', title: 'Original', boardIds: [board.id]};
        const first = await api.quickAdd(input);
        await api.updateEntity(first.id, {title: 'Curated title', tags: ['reviewed'], metadata: {body: 'Uniqueannotation', custom: 'keep'}});
        const edited = await db.entities.get(first.id);
        browser.tabs = {query: async () => [{id: 42, index: 0, title: 'Incoming title', url: input.url, lastAccessed: 100}]};
        let returned;
        if (capture === 'recent tab') await api.addCurrentTab(board.id);
        if (capture === 'window session') await api.captureWindowSession(board.id);
        if (capture === 'Quick Add') returned = await api.quickAdd({...input, title: 'Incoming title', body: 'Replacement'});
        if (capture === 'legacy source') returned = await createWorkspaceRepository({db}).upsertSource({
            sourceKind: 'history', sourceId: 'visit', url: input.url, title: 'Incoming title',
            metadata: {body: 'Replacement', visitCount: 7}
        });
        const saved = await db.entities.get(first.id);
        assert.equal(saved.title, 'Curated title');
        assert.equal(saved.metadata.body, 'Uniqueannotation');
        assert.equal(saved.metadata.workspaceEditedAt, edited.metadata.workspaceEditedAt);
        assert.equal(saved.metadata.custom, 'keep');
        assert.equal(saved.createdAt, first.createdAt);
        assert.deepEqual(saved.tags, ['reviewed']);
        assert.ok(saved.searchTerms.includes('uniqueannotation'));
        assert.ok(saved.searchTerms.includes('curated'));
        assert.ok(!saved.searchTerms.includes('replacement'));
        assert.equal(await db.entities.where('canonicalUrl').equals(input.url).count(), 1);
        if (returned) assert.deepEqual(returned, saved);
        if (capture === 'recent tab' || capture === 'window session') assert.equal(saved.metadata.tabId, 42);
        if (capture === 'legacy source') {
            assert.equal(saved.metadata.visitCount, 7);
            assert.equal((await db.sourceRefs.toArray())[0].entityId, saved.id);
        }
    });
}

test('Quick Add refreshes unedited titles without losing retained body search terms', async t => {
    const {db, load} = await workspaceFixture(t), api = load('workspaceRepository.ts');
    const input = {kind: 'web', url: 'https://example.test/article', title: 'Original', body: 'Retainedannotation', boardIds: []};
    const first = await api.quickAdd(input);
    const next = await api.quickAdd({...input, title: 'Refreshed', body: undefined});
    assert.equal(next.title, 'Refreshed');
    assert.equal(next.metadata.body, 'Retainedannotation');
    assert.ok(next.searchTerms.includes('retainedannotation'));
    assert.deepEqual(next, await db.entities.get(first.id));
});
