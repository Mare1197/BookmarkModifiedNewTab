const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

const until = async predicate => {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('query state did not settle');
};

test('scoped observation sees same-count edits from another connection and retains data during retry', async t => {
    const {db, load} = await workspaceFixture(t), {observeWorkspaceQuery} = load('queryLifecycle.ts');
    await db.entities.put({id: 'a', title: 'Before'});
    const states = [], observer = observeWorkspaceQuery(() => db.entities.get('a'), state => states.push(state));
    t.after(() => observer.stop());
    await until(() => states.at(-1)?.data?.title === 'Before');
    const {createWorkspaceDatabase} = require('../src/workspace/workspaceDb');
    const peer = createWorkspaceDatabase(db.name); await peer.open(); t.after(() => peer.close());
    await peer.entities.update('a', {title: 'After'});
    await until(() => states.at(-1)?.data?.title === 'After');
    observer.refresh();
    assert.equal(states.at(-1).data.title, 'After');
    assert.equal(states.at(-1).refreshing, true);
});

test('obsolete queries cannot overwrite newer results and stopped queries publish nothing', async t => {
    const {load} = await workspaceFixture(t), {observeWorkspaceQuery} = load('queryLifecycle.ts');
    const states = [], resolvers = [];
    const observer = observeWorkspaceQuery(() => new Promise(resolve => resolvers.push(resolve)), state => states.push(state));
    t.after(() => observer.stop());
    await until(() => resolvers.length === 1);
    observer.refresh();
    await until(() => resolvers.length === 2);
    resolvers[1]('new'); await until(() => states.at(-1)?.data === 'new');
    resolvers[0]('old'); await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(states.at(-1).data, 'new');
    observer.stop(); const count = states.length; observer.refresh();
    assert.equal(states.length, count);
});

test('query errors are not empty results and can be retried successfully', async t => {
    const {load} = await workspaceFixture(t), {observeWorkspaceQuery} = load('queryLifecycle.ts');
    let fail = true; const states = [];
    const observer = observeWorkspaceQuery(async () => {if (fail) throw new Error('Storage failed'); return ['kept'];},
        state => states.push(state));
    t.after(() => observer.stop());
    await until(() => states.at(-1)?.error);
    assert.equal(states.at(-1).data, undefined);
    assert.equal(states.at(-1).error.message, 'Storage failed');
    fail = false; observer.refresh(); await until(() => states.at(-1)?.data);
    assert.deepEqual(states.at(-1).data, ['kept']);
});
test('refresh generations preserve successful logical-scope data but scope changes do not', async t => {
    const {load} = await workspaceFixture(t), {retainQueryState} = load('queryLifecycle.ts');
    const before = {key: 'page:2', data: ['a'], loading: false, refreshing: false};
    const loading = {data: undefined, loading: true, refreshing: false};
    assert.deepEqual(retainQueryState(before, loading, 'page:2'), {...before, refreshing: true});
    assert.deepEqual(retainQueryState(before, loading, 'different'), {...loading, key: 'different'});
    const deleted = {data: undefined, loading: false, refreshing: false};
    assert.deepEqual(retainQueryState(before, deleted, 'page:2'), {...deleted, key: 'page:2'});
});
test('new logical queries renew relative time and reset A/B/A continuation', async t => {
    const {load} = await workspaceFixture(t), {queryClock, queryPosition} = load('queryLifecycle.ts');
    const clockA = queryClock(undefined, 'A', 1000);
    assert.equal(queryClock(clockA, 'A', 2000), clockA);
    assert.equal(queryClock(clockA, 'B', 3000).referenceTime, 3000);
    const before = {key: 'A', index: 3, cursors: [undefined, {id: 1}], epoch: 2};
    const other = queryPosition(before, 'B');
    assert.equal(other.index, 0); assert.equal(other.key, 'B');
    assert.equal(queryPosition(other, 'A').index, 0);
});
