const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {searchFixture} = require('./helpers/searchFixture');
const query = (text, dialect = 'brain') => ({text, dialect, sort: 'id', referenceTime: 100});
function candidates(load) {
    const api = existsSync('src/react/workspace/searchCandidates.ts') ? load('searchCandidates.ts') : {};
    assert.equal(typeof api.readSearchCandidates, 'function', 'fresh candidate narrowing must exist'); return api.readSearchCandidates;
}
test('only complete fresh compatible indexes narrow candidates', async t => {
    const {db, load, ready} = await searchFixture(t), read = candidates(load);
    assert.equal((await read(db, query('needle'))).kind, 'scan');
    await ready();
    const result = await read(db, query('needle'));
    assert.equal(result.kind, 'indexed'); assert.ok(result.ids.includes('e00000'));
    assert.equal(result.ids.includes('e00001'), false);
    await db.entities.update('e00001', {metadata: {body: 'new needle'}});
    assert.equal((await read(db, query('needle'))).kind, 'scan');
    await ready(); assert.ok((await read(db, query('needle'))).ids.includes('e00001'));
    await db.searchDocuments.clear();
    assert.equal((await read(db, query('needle'))).kind, 'scan');
});
test('overflow documents stay candidates and short queries use scanner', async t => {
    const {db, load, entities, ready} = await searchFixture(t), read = candidates(load);
    await db.entities.put({...entities[1], metadata: {body: 'a'.repeat(65536) + 'needle'}}); await ready();
    assert.ok((await read(db, query('needle'))).ids.includes('e00001'));
    for (const text of ['', 'a', 'ab']) assert.equal((await read(db, query(text))).kind, 'scan');
    const state = await db.searchState.get('main'); await db.searchState.put({...state, locale: 'incompatible-locale'});
    assert.equal((await read(db, query('needle'))).kind, 'scan');
});
test('five thousand and one candidates fall back rather than truncate results', async t => {
    const {db, load, ready} = await searchFixture(t, 5001), read = candidates(load); await ready();
    assert.equal((await read(db, query('title'))).kind, 'scan');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(read(db, query('needle'), controller.signal), {name: 'AbortError'});
});
