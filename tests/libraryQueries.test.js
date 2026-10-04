const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

const query = {dialect: 'explorer', text: '', sort: 'id', referenceTime: 1700000000000};
const entity = (id, patch = {}) => ({id, type: 'note', title: 'Research ' + id,
    createdAt: 1, updatedAt: 10, searchTerms: ['research'], ...patch});

test('keyset pages visit 123 equal-timestamp objects once without rescanning earlier bodies', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    await db.entities.bulkPut(Array.from({length: 123}, (_, i) => entity('n' + String(i).padStart(3, '0'))));
    let reads = 0; db.entities.hook('reading', value => {reads++; return value;});
    const a = await queryLibraryPage(query), b = await queryLibraryPage(query, {cursor: a.nextCursor}),
        c = await queryLibraryPage(query, {cursor: b.nextCursor});
    assert.deepEqual([a.items.length, b.items.length, c.items.length], [50, 50, 23]);
    assert.equal(a.items[0].id, 'n000'); assert.equal(b.items[0].id, 'n050'); assert.equal(c.items.at(-1).id, 'n122');
    assert.equal(new Set([...a.items, ...b.items, ...c.items].map(e => e.id)).size, 123);
    assert.equal(c.hasMore, false); assert.equal(c.nextCursor, undefined);
    assert.ok(reads <= 153, 'page continuation must not hydrate earlier pages again: ' + reads);
    await assert.rejects(queryLibraryPage({...query, text: 'other'}, {cursor: a.nextCursor}), /cursor|query/i);
});

test('smart query retains substring, phrase, task, board, domain, time and backlink semantics', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    await db.entities.bulkPut([entity('a', {title: 'Alpha research', canonicalUrl: 'https://example.com/a', inboxAt: 5,
        metadata: {body: 'A quoted phrase here'}, updatedAt: query.referenceTime}),
    entity('b', {title: 'Other', canonicalUrl: 'https://other.com', updatedAt: 0})]);
    await db.boards.put({id: 'board', name: 'My Research', createdAt: 1, updatedAt: 1});
    await db.placements.put({id: 'p', boardId: 'board', entityId: 'a'});
    await db.tasks.put({id: 'task', entityId: 'a', status: 'next'});
    await db.relationships.put({id: 'r', fromEntityId: 'b', toEntityId: 'a', type: 'related'});
    for (const text of ['pha', '"quoted phrase"', 'type:note board:research domain:ample.com after:1d is:inbox status:next has:task']) {
        assert.deepEqual((await queryLibraryPage({...query, dialect: 'smart', text})).items.map(e => e.id), ['a']);
    }
    assert.deepEqual((await queryLibraryPage({...query, dialect: 'smart', text: 'has:backlinks'})).items.map(e => e.id), ['a', 'b']);
    assert.equal((await queryLibraryPage({...query, text: 'unmatched'})).items.length, 0);
});

test('Brain ordering, tags, status and confirmed project membership match existing selectors', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    const objects = [entity('Z', {title: 'Žaba', updatedAt: 20}), entity('a', {title: 'Ábel', updatedAt: 20}),
        entity('b', {title: 'Beta', tags: ['needle'], properties: {status: 'blocked'}}), entity('p', {type: 'project'})];
    await db.entities.bulkPut(objects);
    const links = [{id: 'r1', fromEntityId: 'a', toEntityId: 'p', type: 'project-member', confirmed: true},
        {id: 'r2', fromEntityId: 'b', toEntityId: 'p', type: 'project-member', confirmed: false}];
    await db.relationships.bulkPut(links);
    for (const sort of ['title', 'updated']) {
        const expected = load('brainSelectors.ts').queryBrain(objects, links, [], {sort}).map(e => e.id);
        assert.deepEqual((await queryLibraryPage({...query, dialect: 'brain', sort})).items.map(e => e.id), expected);
    }
    assert.deepEqual((await queryLibraryPage({...query, dialect: 'brain', text: 'needle', status: 'blocked'})).items.map(e => e.id), ['b']);
    assert.deepEqual((await queryLibraryPage({...query, dialect: 'brain', projectId: 'p'})).items.map(e => e.id), ['a']);
});

test('sparse scans yield progress and can be cancelled before publishing', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    await db.entities.bulkPut(Array.from({length: 600}, (_, i) => entity('n' + i)));
    const controller = new AbortController(), progress = [];
    await assert.rejects(queryLibraryPage({...query, text: 'no match'}, {signal: controller.signal,
        onProgress: count => {progress.push(count); controller.abort();}}), /abort/i);
    assert.ok(progress.length > 0); assert.ok(progress[0] <= 250);
});

test('updated cursors preserve locale ID ties across page boundaries and timestamp groups', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    const objects = Array.from({length: 123}, (_, i) => entity((i % 3 ? 'A' : 'á') + String(i).padStart(3, '0'),
        {updatedAt: i < 80 ? 20 : 10}));
    await db.entities.bulkPut(objects);
    const result = []; let cursor;
    do {
        const page = await queryLibraryPage({...query, dialect: 'brain', sort: 'updated'}, {cursor});
        result.push(...page.items.map(e => e.id)); cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(result, load('brainSelectors.ts').queryBrain(objects, [], [], {sort: 'updated'}).map(e => e.id));
    assert.equal(new Set(result).size, 123);
});

test('custom tile ordering and locale title ordering span pages without keeping bodies in cursors', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    const objects = Array.from({length: 123}, (_, i) => entity('n' + String(i).padStart(3, '0'),
        {title: (i % 2 ? 'Žaba ' : 'Ábel ') + i, metadata: {body: 'private-body-marker'}}));
    await db.entities.bulkPut(objects);
    await db.settings.put({key: 'brain-tiles:all', value: {n122: {order: -1, width: 2}}, updatedAt: 1});
    const first = await queryLibraryPage({...query, dialect: 'brain', sort: 'tiles'});
    assert.equal(first.items[0].id, 'n122');
    assert.equal(JSON.stringify(first.nextCursor).includes('private-body-marker'), false);
    const result = []; let cursor;
    do {
        const page = await queryLibraryPage({...query, dialect: 'brain', sort: 'title'}, {cursor});
        result.push(...page.items.map(e => e.id)); cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(result, load('brainSelectors.ts').queryBrain(objects, [], [], {sort: 'title'}).map(e => e.id));
});

test('tile pages retain the selected base order and absolute fallback positions', async t => {
    const {db, load} = await workspaceFixture(t), {queryLibraryPage} = load('libraryQueries.ts');
    const objects = Array.from({length: 65}, (_, i) => entity('n' + String(i).padStart(3, '0'),
        {title: String(100 - i), updatedAt: i}));
    await db.entities.bulkPut(objects);
    await db.settings.put({key: 'brain-tiles:all', value: {n000: {order: -1, width: 1}}, updatedAt: 1});
    const input = {...query, dialect: 'brain', sort: 'tiles', tileBaseSort: 'title'};
    const first = await queryLibraryPage(input);
    const second = await queryLibraryPage(input, {cursor: first.nextCursor});
    const base = load('brainSelectors.ts').queryBrain(objects, [], [], {sort: 'title'});
    assert.deepEqual([...first.items, ...second.items].map(e => e.id),
        ['n000', ...base.filter(e => e.id !== 'n000').map(e => e.id)]);
    for (const item of second.items) assert.equal(second.defaultOrders[item.id], base.findIndex(e => e.id === item.id));
    assert.ok(!JSON.stringify(first.nextCursor).includes('metadata'));
});
test('inbox pages order capture time rather than last edit and omit uncaptured objects', async t => {
    const {db, load} = await workspaceFixture(t);
    await db.entities.bulkPut(Array.from({length: 123}, (_, i) => entity('n' + String(i).padStart(3, '0'),
        {inboxAt: i < 120 ? Math.floor(i / 10) + 1 : undefined, updatedAt: 1000 - i})));
    const input = {...query, inbox: true, sort: 'inbox'}, ids = []; let cursor;
    do {const page = await load('libraryQueries.ts').queryLibraryPage(input, {cursor});
        ids.push(...page.items.map(item => item.id)); cursor = page.nextCursor;} while (cursor);
    assert.equal(ids.length, 120); assert.equal(ids[0], 'n110'); assert.equal(ids[119], 'n009');
});
test('updated paging batches timestamp index reads instead of querying every timestamp', async t => {
    const {db, load} = await workspaceFixture(t);
    await db.entities.bulkPut(Array.from({length: 600}, (_, i) => entity('n' + i, {updatedAt: i})));
    const original = db.entities.where.bind(db.entities); let reads = 0;
    db.entities.where = (...args) => {reads++; return original(...args);};
    const page = await load('libraryQueries.ts').queryLibraryPage({...query, dialect: 'brain', sort: 'updated'});
    assert.equal(page.items.length, 50); assert.equal(page.items[0].updatedAt, 599);
    assert.ok(reads < 20, 'bounded index batches, observed where calls: ' + reads);
});
