const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('native tail ordering keeps its seed and crosses integer boundaries in stable order', async t => {
    const {load} = await workspaceFixture(t), {nativeProjectionIndexes} = load('nativeProjectionIndexes.ts');
    assert.deepEqual(nativeProjectionIndexes('a0', 5), ['a0', 'a1', 'a2', 'a3', 'a4']);
    assert.deepEqual(nativeProjectionIndexes('az', 5), ['az', 'b00', 'b01', 'b02', 'b03']);
    assert.deepEqual(nativeProjectionIndexes('a0V', 3), ['a0V', 'a1', 'a2']);
    const keys = nativeProjectionIndexes('az', 10000);
    assert.equal(keys.length, 10000); assert.equal(new Set(keys).size, 10000);
    assert.deepEqual([...keys].sort(), keys);
    assert.deepEqual(nativeProjectionIndexes('a0', 0), []);
    assert.throws(() => nativeProjectionIndexes('a0', -1), /count/i);
});
