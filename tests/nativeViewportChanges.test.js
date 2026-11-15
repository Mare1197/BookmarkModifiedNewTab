const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('initial or repeated identical viewport notifications never publish user commands', async t => {
    const {load} = await workspaceFixture(t), {createViewportChanges} = load('nativeViewportChanges.ts');
    const commands = [], initial = {x: 400, y: 200, zoom: 1};
    const changed = createViewportChanges(initial, value => commands.push(value));
    changed({x: 400, y: 200, zoom: 1}); changed({...initial});
    assert.deepEqual(commands, []);
    changed({x: 410, y: 200, zoom: 1}); changed({x: 410, y: 200, zoom: 1});
    changed({x: 410, y: 200, zoom: 0.5});
    assert.deepEqual(commands, [{x: 410, y: 200, zoom: 1}, {x: 410, y: 200, zoom: 0.5}]);
    assert.deepEqual(initial, {x: 400, y: 200, zoom: 1});
});

test('a rejected viewport command is not silently acknowledged', async t => {
    const {load} = await workspaceFixture(t), {createViewportChanges} = load('nativeViewportChanges.ts');
    let fail = true; const commands = [];
    const changed = createViewportChanges({x: 0, y: 0, zoom: 1}, value => {
        if (fail) throw new Error('Journal refused'); commands.push(value);
    });
    assert.throws(() => changed({x: 10, y: 0, zoom: 1}), /Journal refused/);
    fail = false; changed({x: 10, y: 0, zoom: 1});
    assert.deepEqual(commands, [{x: 10, y: 0, zoom: 1}]);
});
