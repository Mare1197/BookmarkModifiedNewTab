const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {workspaceFixture} = require('./helpers/workspaceFixture');
async function fixture(t) {
    const value = await workspaceFixture(t);
    const api = existsSync('src/react/workspace/indexReadiness.ts') ? value.load('indexReadiness.ts') : {};
    assert.equal(typeof api.createIndexReadinessObserver, 'function', 'readiness observer must fence asynchronous refreshes');
    return {...value, api};
}
test('index progress never refreshes queries but new ready generations do', async t => {
    const {db, api} = await fixture(t); let refreshes = 0;
    const observer = api.createIndexReadinessObserver(() => db.searchState.get('main'), () => {refreshes++;});
    await observer.check(); const initial = await db.searchState.get('main');
    await db.searchState.put({...initial, status: 'building', processed: 50}); await observer.check();
    assert.equal(refreshes, 0);
    await db.searchState.put({...initial, status: 'ready', indexedGeneration: initial.generation, scanComplete: true});
    await observer.check(); await observer.check(); assert.equal(refreshes, 1);
    await db.searchState.put({...initial, status: 'building', generation: initial.generation + 1}); await observer.check();
    await db.searchState.put({...initial, status: 'ready', generation: initial.generation + 1,
        indexedGeneration: initial.generation + 1, scanComplete: true}); await observer.check();
    assert.equal(refreshes, 2); observer.dispose();
});
test('late readiness reads cannot refresh a disposed or newer scope', async t => {
    const {db, api} = await fixture(t); let release, refreshes = 0;
    const initial = await db.searchState.get('main');
    await db.searchState.put({...initial, status: 'ready', indexedGeneration: initial.generation, scanComplete: true});
    const gate = new Promise(resolve => {release = resolve;});
    const observer = api.createIndexReadinessObserver(async () => {await gate; return db.searchState.get('main');}, () => {refreshes++;});
    const pending = observer.check(); observer.dispose(); release(); await pending;
    assert.equal(refreshes, 0);
});
