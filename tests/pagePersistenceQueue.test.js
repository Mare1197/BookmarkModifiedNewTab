const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

test('navigation flush drains note edits arriving during a layout save', async t => {
    const {load} = await workspaceFixture(t), started = deferred(), release = deferred();
    let draft = false, saved = false;
    const queue = load('pagePersistenceQueue.ts').createPagePersistenceQueue({
        flushContent: async () => {if (draft) {draft = false; saved = true;}},
        hasContentDraft: () => draft,
        saveCommand: async () => {started.resolve(); await release.promise;}
    });
    queue.enqueue({type: 'view', mode: 'canvas', viewport: {x: 1, y: 0, zoom: 1}});
    const first = queue.flush(); await started.promise;
    draft = true; const navigation = queue.flush(); release.resolve();
    await Promise.all([first, navigation]);
    assert.equal(saved, true); assert.equal(draft, false);
});

test('viewport coalescing never discards an in-flight replacement', async t => {
    const {load} = await workspaceFixture(t), started = deferred(), release = deferred(), saved = [];
    const queue = load('pagePersistenceQueue.ts').createPagePersistenceQueue({
        flushContent: async () => {}, hasContentDraft: () => false,
        saveCommand: async c => {saved.push(c.viewport.x); if (saved.length === 1) {started.resolve(); await release.promise;}}
    });
    const view = x => ({type: 'view', mode: 'canvas', viewport: {x, y: 0, zoom: 1}});
    queue.enqueue(view(1)); const pending = queue.flush(); await started.promise;
    queue.enqueue(view(2)); queue.enqueue(view(3)); release.resolve(); await pending;
    assert.deepEqual(saved, [1, 3]); assert.equal(queue.pending().length, 0);
});
