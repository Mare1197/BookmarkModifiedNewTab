const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('window ranges bound regular rows and retain unique valid interaction pins', async t => {
    const {load} = await workspaceFixture(t), {getWindowRange} = load('windowRange.ts');
    const base = {count: 1000, rowHeight: 36, viewportHeight: 360, scrollTop: 3600, overscan: 5};
    const window = getWindowRange({...base, pinnedIndices: [1, 1, 999, -1, 1000]});
    assert.equal(window.indices.length, 22); assert.equal(window.height, 36000);
    assert.ok(window.indices.includes(1) && window.indices.includes(999));
    assert.deepEqual(getWindowRange({...base, count: 0}).indices, []);
    assert.deepEqual(getWindowRange({...base, count: 3, scrollTop: 0}).indices, [0, 1, 2]);
    assert.ok(getWindowRange({...base, scrollTop: 3600.5}).indices.length <= 21);
    assert.ok(getWindowRange({...base, scrollTop: 999999}).indices.includes(999));
    assert.ok(getWindowRange({...base, count: 3, pinnedIndices: [999]}).indices.every(index => index < 3));
});
