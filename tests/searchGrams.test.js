const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const base = {id: 'one', type: 'note', title: 'alpha', canonicalUrl: '', searchTerms: [], tags: ['tag'],
    metadata: {body: 'beta'}, createdAt: 1, updatedAt: 1};
const query = (dialect, text) => ({dialect, text, sort: 'id', referenceTime: 100});
async function api(t) {
    const {load} = await workspaceFixture(t);
    const module = existsSync('src/react/workspace/searchGrams.ts') ? load('searchGrams.ts') : {};
    assert.equal(typeof module.deriveSearchDocument, 'function', 'bounded gram derivation must exist');
    return module;
}
test('shared grams include every dialect without mutating canonical objects', async t => {
    const {deriveSearchDocument} = await api(t), before = structuredClone(base);
    const doc = deriveSearchDocument(base, 2, 'epoch', 'en-US');
    for (const gram of ['ha ', '  b', 'bet', 'tag', 'not']) assert.ok(doc.grams.includes(gram));
    assert.equal(doc.grams.length, new Set(doc.grams).size);
    assert.deepEqual(base, before); assert.equal(doc.id, 'one'); assert.equal(doc.generation, 2);
    assert.equal(Object.hasOwn(doc, 'body'), false);
});
test('query grams retain parser and UTF-16 literal semantics', async t => {
    const {queryGrams, queryTextTerms, deriveSearchDocument} = await api(t);
    assert.deepEqual(queryGrams(query('brain', 'ALPHA')), ['alp', 'lph', 'pha']);
    assert.deepEqual(queryTextTerms(query('explorer', ' Alpha Beta ')), ['alpha beta']);
    assert.deepEqual(queryTextTerms(query('brain', ' Alpha Beta ')), ['alpha', 'beta']);
    assert.deepEqual(queryTextTerms(query('smart', 'type:note "alpha beta" unknown:Value')), ['alpha beta', 'unknown:value']);
    for (const text of ['', 'a', 'ab', 'alpha a']) assert.equal(queryGrams(query('brain', text)), undefined);
    assert.equal(queryGrams(query('smart', 'type:note')), undefined);
    const doc = deriveSearchDocument({...base, title: '🙂汉字 İ CAFÉ é'}, 1, 'e', 'en-US');
    assert.ok(doc.grams.includes('🙂汉')); assert.ok(doc.grams.includes('汉字 '));
    assert.ok(doc.grams.includes('afé')); assert.ok(doc.grams.includes(' é'));
    assert.ok(doc.grams.includes('i̇ '));
});
test('overflow retains late substring candidates with bounded arrays', async t => {
    const {deriveSearchDocument} = await api(t);
    const doc = deriveSearchDocument({...base, metadata: {body: 'a'.repeat(65536) + 'late needle'}}, 1, 'e', 'en-US');
    assert.deepEqual(doc.overflowDialects.sort(), ['brain', 'smart']);
    assert.equal(doc.grams.includes('lat'), false); assert.ok(doc.grams.includes('alp'));
    const varied = Array.from({length: 7000}, (_, i) => String.fromCharCode(i + 32)).join('');
    const capped = deriveSearchDocument({...base, title: varied}, 1, 'e', 'en-US');
    assert.ok(capped.overflowDialects.includes('explorer'));
    assert.deepEqual(capped.overflowDialects.sort(), ['brain', 'explorer', 'smart']);
    assert.deepEqual(capped.grams, []);
});
test('derivation never reads credentials, recovery or asset payloads', async t => {
    const {deriveSearchDocument} = await api(t);
    const entity = {...base};
    for (const field of ['credentials', 'workspaceDrafts', 'workspaceRevisions', 'blob', 'sourcePayload']) {
        Object.defineProperty(entity, field, {get() {throw new Error('private payload read');}});
    }
    const a = deriveSearchDocument(entity, 1, 'e', 'en-US');
    const b = deriveSearchDocument(entity, 1, 'e', 'de-DE');
    assert.notEqual(a.fingerprint, b.fingerprint);
    assert.equal(JSON.stringify(a).includes('private payload'), false);
});
