const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('page navigation follows confirmed page parents without treating project membership as ancestry', async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts');
    const root = await pages.createWorkspacePage('Research'), child = await pages.createWorkspacePage('Child', root.owner.id);
    const leaf = await pages.createWorkspacePage('Deep', child.owner.id), other = await pages.createWorkspacePage('Other');
    await db.relationships.bulkPut([
        {id: 'suggestion', fromEntityId: other.owner.id, toEntityId: leaf.owner.id, type: 'page-parent', confirmed: false},
        {id: 'membership', fromEntityId: root.owner.id, toEntityId: other.owner.id, type: 'project-member', confirmed: true}
    ]);
    const navigation = await load('pageNavigation.ts').loadPageNavigation();
    assert.deepEqual(navigation.map(item => [item.title, item.depth]), [['Other', 0], ['Research', 0], ['Child', 1], ['Deep', 2]]);
    assert.equal(navigation.find(item => item.id === leaf.owner.id).boardId, leaf.board.id);
    assert.equal(navigation.find(item => item.id === leaf.owner.id).parentId, child.owner.id);
    assert.equal(navigation.find(item => item.id === other.owner.id).parentId, undefined);
});

test('page navigation skips missing owners and boards and terminates on damaged cyclic links without mutation', async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts');
    const a = await pages.createWorkspacePage('A'), b = await pages.createWorkspacePage('B');
    await db.relationships.bulkPut([
        {id: 'a-b', fromEntityId: a.owner.id, toEntityId: b.owner.id, type: 'page-parent', confirmed: true},
        {id: 'b-a', fromEntityId: b.owner.id, toEntityId: a.owner.id, type: 'page-parent', confirmed: true}
    ]);
    const orphan = await pages.createWorkspacePage('Orphan'); await db.boards.delete(orphan.board.id);
    const missing = await pages.createWorkspacePage('Missing'); await db.entities.delete(missing.owner.id);
    const before = await db.relationships.toArray();
    assert.deepEqual((await load('pageNavigation.ts').loadPageNavigation()).map(item => item.title), ['A', 'B']);
    assert.deepEqual(await db.relationships.toArray(), before);
});
