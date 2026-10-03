const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const content = text => ({version: 1, blocks: [{id: 'p1', kind: 'paragraph', runs: [{insert: text, attributes: {bold: true}}]}]});

test('formatted content keeps one canonical body and detects stale edits', async t => {
    const {db, load} = await workspaceFixture(t);
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Decision'});
    const rich = load('richContentRepository.ts');
    const saved = await rich.saveRichContent(note.id, 0, content('One source'));
    assert.equal(saved.metadata.body, 'One source');
    assert.equal(saved.contentRevision, 1);
    await assert.rejects(rich.saveRichContent(note.id, 0, content('Stale')), /conflict/i);
    assert.equal(await db.entities.count(), 1);
    await assert.rejects(load('workspaceRepository.ts').updateEntity(note.id, {metadata: {body: 'Strip formatting'}}), /rich text/i);
    await load('workspaceRepository.ts').updateEntity(note.id, {title: 'Renamed'});
    assert.deepEqual((await db.entities.get(note.id)).richContent, saved.richContent);
    assert.equal((await db.entities.get(note.id)).contentRevision, 2);
});

test('rich text allowlist covers all supported blocks and rejects malformed content', async t => {
    const {load} = await workspaceFixture(t);
    const r = load('richContent.ts');
    const kinds = ['paragraph', 'heading', 'bullet', 'numbered', 'check', 'quote', 'code'];
    const valid = {version: 1, blocks: kinds.map((kind, i) => ({id: String(i), kind,
        ...(kind === 'heading' ? {level: 2} : {}), ...(kind === 'check' ? {checked: true} : {}),
        ...(kind === 'code' ? {language: 'typescript'} : {}),
        runs: [{insert: kind, attributes: {bold: true, italic: true, underline: true, strike: true, code: true, link: 'https://example.com/'}}]}))};
    r.validateRichContent(valid);
    assert.equal(r.richContentToPlainText(valid), kinds.join('\n'));
    for (const invalid of [
        {...valid, version: 2}, {...valid, blocks: [valid.blocks[0], valid.blocks[0]]},
        {version: 1, blocks: Array.from({length: 2001}, (_, i) => ({...valid.blocks[0], id: String(i)}))},
        content('x'.repeat(100001)),
        {version: 1, blocks: [{id: '1', kind: 'paragraph', runs: [{insert: 12}]}]},
        {version: 1, blocks: [{id: '1', kind: 'paragraph', runs: [{insert: 'X', attributes: {link: 'javascript:alert(1)'}}]}]},
        {version: 1, blocks: [{id: '1', kind: 'paragraph', runs: [{insert: 'X', attributes: {html: '<img>'}}]}]}
    ]) assert.throws(() => r.validateRichContent(invalid), /rich|link/i);
    assert.equal(r.richContentToPlainText(r.plainToRichContent('one\ntwo')), 'one\ntwo');
});

test('rich saves atomically update mentions and roll back on persistence errors', async t => {
    const {db, load} = await workspaceFixture(t);
    const brain = load('brainRepository.ts'), rich = load('richContentRepository.ts');
    const target = await brain.createBrainObject({type: 'note', title: 'Target'});
    const note = await brain.createBrainObject({type: 'note', title: 'Note', body: 'Legacy'});
    assert.equal(load('richContent.ts').richContentToPlainText(load('richContent.ts').readRichContent(note)), 'Legacy');
    await rich.saveRichContent(note.id, 0, content('[[' + target.id + ']]'));
    assert.equal((await db.relationships.toArray())[0].toEntityId, target.id);
    db.activities.hook('creating', () => {throw new Error('offline disk');});
    await assert.rejects(rich.saveRichContent(note.id, 1, content('Gone')), /offline disk/);
    assert.equal((await db.entities.get(note.id)).contentRevision, 1);
    assert.equal(await db.relationships.count(), 1);
});

test('Inspector protects formatted notes but keeps legacy text editable', async t => {
    const {load} = await workspaceFixture(t);
    const React = require('react'), {renderToStaticMarkup} = require('react-dom/server');
    const Inspector = load('WorkspaceInspector.tsx').WorkspaceInspector;
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note', body: 'Body'});
    const props = {boards: [], boardMemberships: [], folders: [], folderMemberships: [], activities: [], entities: [note],
        relationships: [], tasks: [], onCreateTask() {}, onInboxChange: async () => {}, onSave: async () => {}, onTaskSave: async () => {}, onOpenRichText() {}};
    const formatted = renderToStaticMarkup(React.createElement(Inspector, {...props, entity: {...note, richContent: content('Body')}}));
    assert.match(formatted, /Edit rich text/);
    assert.match(formatted, /<textarea[^>]*readOnly/);
    const plain = renderToStaticMarkup(React.createElement(Inspector, {...props, entity: note}));
    assert.doesNotMatch(plain, /<textarea[^>]*readOnly/);
});
