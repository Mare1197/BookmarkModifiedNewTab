const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {searchFixture} = require('./helpers/searchFixture');
function engine(load) {
    const api = existsSync('src/react/workspace/libraryQueryEngine.ts') ? load('libraryQueryEngine.ts') : {};
    assert.equal(typeof api.readLibraryPage, 'function', 'indexed exact paging must exist'); return api;
}
async function all(db, api, query, indexMode) {
    const ids = []; let cursor;
    do {
        const page = await api.readLibraryPage(db, query, {cursor, indexMode});
        assert.ok(page.items.length <= 50); ids.push(...page.items.map(e => e.id)); cursor = page.nextCursor;
    } while (cursor);
    return ids;
}
test('indexed pages equal complete scanner traversal for every dialect and sort', async t => {
    const {db, load, ready, entities} = await searchFixture(t), api = engine(load);
    await db.entities.bulkPut([
        {...entities[0], id: 'boundary', title: 'alpha', canonicalUrl: '', searchTerms: [], metadata: {body: 'beta'}},
        {...entities[0], id: 'é', title: 'É title 🙂汉字', updatedAt: 10},
        {...entities[0], id: 'é', title: 'É title 🙂汉字', updatedAt: 10},
        {...entities[0], id: 'overflow', metadata: {body: 'x'.repeat(65536) + 'needle'}}
    ]); await ready();
    for (const dialect of ['brain', 'smart', 'explorer']) for (const sort of ['id', 'updated', 'title', 'tiles', 'inbox']) {
        for (const text of ['needle', 'title', '🙂汉字', '', 'ab', 'alpha beta', '"alpha  beta"', 'type:task status:next', 'keyword']) {
            const query = {dialect, sort, text, tileScope: 'all', referenceTime: 100};
            assert.deepEqual(await all(db, api, query, 'auto'), await all(db, api, query, 'scan'), `${dialect}/${sort}/${text}`);
        }
    }
    const ids = await all(db, api, {dialect: 'explorer', sort: 'id', text: 'alpha  beta', referenceTime: 100}, 'auto');
    assert.deepEqual(ids, []);
    assert.deepEqual(await all(db, api, {dialect: 'smart', sort: 'id', text: '"alpha  beta"', referenceTime: 100}, 'auto'), ['boundary']);
    for (const scope of [{boardId: 'board'}, {projectId: 'e00000'}, {relatedTo: 'e00000'}, {type: 'note'}, {status: 'next'}, {inbox: true}]) {
        const query = {dialect: 'brain', sort: 'updated', text: 'needle', referenceTime: 100, ...scope};
        assert.deepEqual(await all(db, api, query, 'auto'), await all(db, api, query, 'scan'));
    }
});
test('mutation discards stale candidates before publishing exact results', async t => {
    const {db, load, ready, entities} = await searchFixture(t, 4), api = engine(load); await ready();
    let edit;
    const page = await api.readLibraryPage(db, {dialect: 'brain', sort: 'id', text: 'needle', referenceTime: 100}, {
        onProgress() {if (!edit) edit = db.entities.bulkPut([{...entities[0], metadata: {body: 'gone'}}, {...entities[1], metadata: {body: 'needle'}}]);}
    });
    await edit; assert.deepEqual(page.items.map(e => e.id), ['e00001']);
});
test('foreign query cursors are rejected and invalidated indexed continuation rebuilds', async t => {
    const {db, load, ready} = await searchFixture(t), api = engine(load); await ready();
    const query = {dialect: 'brain', sort: 'title', text: 'title', referenceTime: 100};
    const first = await api.readLibraryPage(db, query, {});
    await assert.rejects(api.readLibraryPage(db, {...query, text: 'needle'}, {cursor: first.nextCursor}), /different query/i);
    await db.entities.delete(first.items[0].id);
    const next = await api.readLibraryPosition(db, query, 1, [undefined, first.nextCursor], {});
    assert.equal(next.items[0].id, 'e00051'); assert.equal(next.pageIndex, 1);
});
