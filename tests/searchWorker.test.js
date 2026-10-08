const assert = require('node:assert/strict');
const test = require('node:test');
const {existsSync} = require('node:fs');
const {searchFixture} = require('./helpers/searchFixture');
const query = text => ({dialect: 'brain', text, sort: 'id', referenceTime: 100});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function api(load, name, method) {
    const value = existsSync('src/react/workspace/' + name + '.ts') ? load(name + '.ts') : {};
    assert.equal(typeof value[method], 'function', method + ' must exist'); return value[method];
}
function fakeWorker() {
    return {messages: [], postMessage(request) {this.messages.push(request);}, terminate() {this.terminated = true;},
        reply(response) {this.onmessage?.({data: {protocol: 1, ...response}});}};
}
test('cancelled and late replies cannot cross query scopes', async t => {
    const {db, load} = await searchFixture(t, 4), worker = fakeWorker();
    const client = api(load, 'searchWorkerClient', 'createSearchWorkerClient')(() => worker, db); t.after(() => client.dispose());
    const controller = new AbortController(), a = client.query(query('needle'), {signal: controller.signal});
    const rejected = assert.rejects(a, {name: 'AbortError'}); await tick(); controller.abort(); await rejected;
    const b = client.query(query('common')); await tick();
    const requests = worker.messages.filter(m => m.type === 'query'); assert.equal(requests.length, 2);
    worker.reply({type: 'page', requestId: requests[0].requestId, queryKey: requests[0].queryKey,
        generation: 1, epoch: 'wrong', page: {items: [{id: 'wrong'}], hasMore: false, scanned: 1}});
    worker.reply({type: 'progress', requestId: requests[0].requestId, scanned: 99});
    const state = await db.searchState.get('main');
    worker.reply({type: 'page', requestId: requests[1].requestId, queryKey: 'wrong-key', generation: state.generation,
        epoch: state.epoch, page: {items: [{id: 'wrong'}], hasMore: false, scanned: 1}});
    worker.reply({type: 'page', requestId: requests[1].requestId, queryKey: requests[1].queryKey,
        generation: state.generation, epoch: state.epoch, page: {items: [], hasMore: false, scanned: 4}});
    assert.deepEqual((await b).items, []);
    const a2 = client.query(query('needle')); await tick(); const request = worker.messages.filter(m => m.type === 'query').at(-1);
    worker.reply({type: 'page', requestId: requests[0].requestId, queryKey: requests[0].queryKey, generation: state.generation,
        epoch: state.epoch, page: {items: [{id: 'wrong'}], hasMore: false, scanned: 1}});
    worker.reply({type: 'page', requestId: request.requestId, queryKey: request.queryKey, generation: state.generation,
        epoch: state.epoch, page: {items: [], hasMore: false, scanned: 4}});
    assert.deepEqual((await a2).items, []);
});
test('worker failure falls back to exact scan without losing rows', async t => {
    const {db, load} = await searchFixture(t, 180), factory = api(load, 'searchWorkerClient', 'createSearchWorkerClient');
    const expected = await load('libraryQueryEngine.ts').readLibraryPage(db, query('needle'), {indexMode: 'scan'});
    const client = factory(() => {throw new Error('worker blocked');}, db); t.after(() => client.dispose());
    assert.deepEqual((await client.query(query('needle'))).items, expected.items);
    const worker = fakeWorker(), running = factory(() => worker, db); t.after(() => running.dispose());
    const result = running.query(query('needle')); await tick(); worker.onerror({preventDefault() {}});
    assert.deepEqual((await result).items, expected.items);
});
test('runtime rejects unsupported commands and never silently resumes a paused index', async t => {
    const {db, load} = await searchFixture(t, 60), responses = [];
    const runtime = api(load, 'searchWorkerRuntime', 'createSearchWorkerRuntime')(db, response => responses.push(response));
    t.after(() => runtime.dispose());
    await runtime.handle({protocol: 2, type: 'clear', requestId: 'bad', table: 'entities'});
    assert.equal(responses.at(-1).type, 'error'); assert.equal(await db.entities.count(), 60);
    await runtime.handle({protocol: 1, type: 'control', requestId: 'pause', command: 'pause'});
    await runtime.handle({protocol: 1, type: 'ensureIndex', requestId: 'ensure'}); await tick();
    assert.equal((await db.searchState.get('main')).status, 'paused');
    await runtime.handle({protocol: 1, type: 'query', requestId: 'query', queryKey: 'key', query: query('needle')});
    assert.equal(responses.at(-1).type, 'page');
    assert.deepEqual(responses.at(-1).page.items.map(e => e.id), ['e00000', 'e00011', 'e00022', 'e00033', 'e00044', 'e00055']);
});
test('queries run while background rebuilding yields and owner loss cannot publish ready', async t => {
    const {db, load} = await searchFixture(t, 123), responses = [];
    const runtime = api(load, 'searchWorkerRuntime', 'createSearchWorkerRuntime')(db, response => responses.push(response));
    t.after(() => runtime.dispose());
    await runtime.handle({protocol: 1, type: 'ensureIndex', requestId: 'start'});
    await runtime.handle({protocol: 1, type: 'query', requestId: 'q', queryKey: 'key', query: query('needle')});
    assert.equal(responses.find(r => r.requestId === 'q' && r.type !== 'progress').type, 'page');
    assert.notEqual((await db.searchState.get('main')).status, 'ready');
    await runtime.handle({protocol: 1, type: 'control', requestId: 'pause', command: 'pause'});
    await tick(); assert.equal((await db.searchState.get('main')).status, 'paused');
});
test('dispose cancels requests and terminates ownership without resolving late rows', async t => {
    const {db, load} = await searchFixture(t, 3), worker = fakeWorker();
    const client = api(load, 'searchWorkerClient', 'createSearchWorkerClient')(() => worker, db);
    const result = client.query(query('needle')), rejected = assert.rejects(result, {name: 'AbortError'});
    await tick(); client.dispose(); await rejected; assert.equal(worker.terminated, true);
    await assert.rejects(client.query(query('needle')), {name: 'AbortError'});
});
test('main thread discards a worker page from an older canonical generation', async t => {
    const {db, load, entities} = await searchFixture(t, 2), worker = fakeWorker();
    const client = api(load, 'searchWorkerClient', 'createSearchWorkerClient')(() => worker, db); t.after(() => client.dispose());
    const state = await db.searchState.get('main'), result = client.query(query('needle')); await tick();
    await db.entities.bulkPut([{...entities[0], metadata: {body: 'gone'}}, {...entities[1], metadata: {body: 'needle'}}]);
    const request = worker.messages.find(m => m.type === 'query');
    worker.reply({type: 'page', requestId: request.requestId, queryKey: request.queryKey, generation: state.generation,
        epoch: state.epoch, page: {items: [entities[0]], hasMore: false, scanned: 2}});
    assert.deepEqual((await result).items.map(e => e.id), ['e00001']);
});
test('dispose aborts an in-flight fallback scanner too', async t => {
    const {db, load} = await searchFixture(t, 600);
    const client = api(load, 'searchWorkerClient', 'createSearchWorkerClient')(() => {throw new Error('unavailable');}, db);
    const result = client.query(query('not present'), {onProgress() {client.dispose();}});
    await assert.rejects(result, {name: 'AbortError'});
});
test('explicit retry recreates a failed worker instead of leaving indexing permanently disabled', async t => {
    const {db, load} = await searchFixture(t, 2), worker = fakeWorker(); let attempts = 0;
    const client = api(load, 'searchWorkerClient', 'createSearchWorkerClient')(() => {
        if (++attempts === 1) throw new Error('temporary worker failure'); return worker;
    }, db); t.after(() => client.dispose());
    await client.query(query('needle'));
    const retry = client.control('retry'); await tick();
    assert.equal(attempts, 2);
    const request = worker.messages.find(m => m.type === 'control');
    worker.reply({type: 'state', requestId: request.requestId, state: {...await db.searchState.get('main'), pending: 2}});
    await retry;
});
