const assert = require('node:assert/strict');
const {workspaceFixture} = require('./workspaceFixture');
async function readyIndex(db, load, now = Date.now()) {
    const api = load('searchIndexRepository.ts'), lease = await api.claimSearchLease(db, 'test-owner', now);
    if (lease) for (let i = 0; i < 1500; i++) {
        const state = await api.runSearchIndexBatch(db, lease, {now});
        if (state.status === 'ready') break;
    }
    const state = await api.readSearchStatus(db);
    assert.equal(state.status, 'ready'); assert.equal(state.pending, 0);
    return state;
}
async function searchFixture(t, size = 170) {
    const fixture = await workspaceFixture(t), {db, load} = fixture;
    const entities = Array.from({length: size}, (_, i) => ({id: 'e' + String(i).padStart(5, '0'),
        title: 'Title ' + String(i).padStart(5, '0'), type: i % 2 ? 'task' : 'note',
        metadata: {body: i % 11 === 0 ? 'rare needle' : 'common body'}, searchTerms: ['keyword'],
        tags: i % 3 ? [] : ['tagged'], canonicalUrl: 'https://example.test/' + i,
        createdAt: 1, updatedAt: Math.floor(i / 5), ...(i % 7 ? {} : {inboxAt: 1})}));
    await db.entities.bulkPut(entities);
    await db.boards.put({id: 'board', name: 'Research', createdAt: 1, updatedAt: 1});
    await db.placements.bulkPut(entities.filter((_, i) => i % 2).map(e => ({id: 'p' + e.id, boardId: 'board', entityId: e.id})));
    await db.tasks.bulkPut(entities.filter(e => e.type === 'task').map(e => ({id: 't' + e.id, entityId: e.id, status: 'next'})));
    await db.relationships.bulkPut(entities.slice(0, 80).map(e => ({id: 'r' + e.id, fromEntityId: e.id,
        toEntityId: entities[0].id, type: 'project-member', confirmed: true})));
    return {...fixture, entities, ready: () => readyIndex(db, load)};
}
module.exports = {searchFixture, readyIndex};
