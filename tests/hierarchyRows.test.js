const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('expanded hierarchy flattens stable rows for one aggregate viewport', async t => {
    const {load} = await workspaceFixture(t), {flattenHierarchyRows} = load('hierarchyRows.ts');
    const folders = Array.from({length: 50}, (_, i) => ({id: 'f' + i, title: 'Folder ' + i, sourceKind: 'workspace'}));
    const pages = Object.fromEntries(folders.map(folder => [folder.id, {
        memberships: Array.from({length: 50}, (_, i) => ({id: folder.id + ':m' + i, entityId: 'e' + i})),
        entities: Array.from({length: 50}, (_, i) => ({id: 'e' + i, title: 'E' + i})), hasMore: false
    }]));
    const expanded = Object.fromEntries(folders.map(folder => [folder.id, true]));
    const rows = flattenHierarchyRows(folders, expanded, pages);
    assert.equal(rows.filter(row => row.kind === 'member').length, 2500);
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    const {getWindowRange} = load('windowRange.ts');
    assert.ok(getWindowRange({count: rows.length, rowHeight: 36, viewportHeight: 360, scrollTop: 1800}).indices.length <= 20);
    assert.equal(flattenHierarchyRows(folders, {}, pages).length, 50);
});

test('hierarchy preserves nesting and native restrictions without looping over corrupt cycles', async t => {
    const {load} = await workspaceFixture(t), {flattenHierarchyRows} = load('hierarchyRows.ts');
    const folders = [{id: 'root', title: 'R', sourceKind: 'native-bookmark'},
        {id: 'child', parentId: 'root', title: 'C', sourceKind: 'workspace'},
        {id: 'a', parentId: 'b'}, {id: 'b', parentId: 'a'}];
    const rows = flattenHierarchyRows(folders, {root: true, child: true, a: true, b: true}, {});
    assert.equal(rows.find(row => row.id === 'folder:child').depth, 1);
    assert.ok(!rows.some(row => row.kind === 'move' && row.folder.id === 'root'));
    assert.ok(rows.length < 10);
    assert.notEqual(rows.at(-1).kind, 'pager', 'End must not land on an empty non-interactive pager');
    assert.equal(flattenHierarchyRows(folders, {root: true, child: true}, {}, {child: true}).at(-1).kind, 'pager');
});
