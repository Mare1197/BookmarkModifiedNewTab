const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const Dexie = require('dexie');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};

test('acknowledged editor drafts survive disposal and reopen without canonical autosave', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const session = load('pageEditorSession.ts').createPageEditorSession([note]);
    t.after(() => session.dispose());
    session.edit(note.id, load('richContent.ts').plainToRichContent('Recover after restart'));
    await session.flushJournal(); assert.equal(session.getStatus(), 'recoverable');
    assert.equal((await db.entities.get(note.id)).metadata.body, '');
    const id = session.getDraftIds()[0];
    await session.dispose(); db.close(); await db.open();
    assert.match(JSON.stringify((await repo.readDraft(id)).operations), /Recover after restart/);
});

test('edits arriving during local persistence are not falsely acknowledged', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const gate = deferred(), entered = deferred(); let first = true;
    const journal = {...repo, writeDraft: async (...args) => {if (first) {first = false; entered.resolve(); await gate.promise;} return repo.writeDraft(...args);}};
    const session = load('pageEditorSession.ts').createPageEditorSession([note], {
        read: id => db.entities.get(id), save: load('richContentRepository.ts').saveRichContent, journal});
    t.after(() => session.dispose());
    assert.equal(typeof session.flushJournal, 'function');
    session.edit(note.id, load('richContent.ts').plainToRichContent('A')); await entered.promise;
    session.edit(note.id, load('richContent.ts').plainToRichContent('B'));
    assert.equal(session.getStatus(), 'saving-local'); gate.resolve(); await session.flushJournal();
    assert.equal(session.getStatus(), 'recoverable');
    assert.equal((await repo.readDraft(session.getDraftIds()[0])).operations.at(-1).snapshot.content.blocks[0].runs[0].insert, 'B');
});

test('a newer edit survives a failed canonical save and retries without replay', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const gate = deferred(), entered = deferred(); let fail = true;
    const session = load('pageEditorSession.ts').createPageEditorSession([note], {
        read: id => db.entities.get(id), save: async (...args) => {
            if (fail) {entered.resolve(); await Dexie.waitFor(gate.promise); throw new Error('disk full');}
            return load('richContentRepository.ts').saveRichContent(...args);
        }});
    t.after(() => session.dispose());
    const rich = load('richContent.ts').plainToRichContent;
    session.edit(note.id, rich('A')); await session.flushJournal(); const saving = session.flush(); await entered.promise;
    session.edit(note.id, rich('B')); gate.resolve(); await assert.rejects(saving, /disk full/); await session.flushJournal();
    assert.match(JSON.stringify((await repo.readDraft(session.getDraftIds()[0])).operations), /B/);
    fail = false; await session.flush(); assert.equal((await db.entities.get(note.id)).metadata.body, 'B');
    assert.equal(session.getStatus(), 'saved');
});

test('failed local persistence never reports recoverable and explicit discard remains possible', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const states = [];
    const session = load('pageEditorSession.ts').createPageEditorSession([note], {
        read: id => db.entities.get(id), save: load('richContentRepository.ts').saveRichContent,
        journal: {...repo, writeDraft: async () => {throw new Error('local quota full');}}}, state => states.push(state));
    t.after(() => session.dispose());
    session.edit(note.id, load('richContent.ts').plainToRichContent('Export me'));
    await assert.rejects(session.flushJournal(), /quota/);
    assert.equal(states.includes('recoverable'), false); assert.match(session.exportDrafts(), /Export me/);
    assert.equal(session.getStatus(), 'error'); await session.reload(); assert.equal(session.getStatus(), 'saved');
});

test('layout journal saves geometry exactly once with a canonical acknowledgement', async t => {
    const {db, load} = await workspaceFixture(t), pages = load('pageRepository.ts'), history = load('revisionRepository.ts');
    let page = await pages.createWorkspacePage('Page');
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    page = await pages.addPageReference(page.board.id, note.id);
    const journal = load('sessionJournal.ts').createSessionJournal(); t.after(() => journal.dispose());
    const target = {kind: 'page', id: page.board.id}, key = JSON.stringify(['page', page.board.id]);
    const original = page.placements[0];
    journal.enqueue(target, history.layoutSnapshot(page), {kind: 'page', value: page.version},
        {kind: 'page', command: {type: 'move-resize', placements: [{id: original.id, x: 700, y: 90, width: 480, height: 240}]}}, page.board.id);
    await journal.flushJournal(); assert.equal((await db.placements.get(original.id)).x, original.x);
    const result = await journal.applyNext(key, async (op, version) => {
        const saved = await pages.applyPageCommand(page.board.id, version.value, op.command);
        return {value: saved, nextBase: history.layoutSnapshot(saved), nextVersion: {kind: 'page', value: saved.version}};
    }, () => {throw new Error('Not a replay');});
    assert.equal(result.value.placements[0].x, 700);
    assert.equal((await load('recoveryRepository.ts').readDraft(journal.getDraftIds()[0])).operations.length, 0);
    assert.equal(journal.count(), 0);
});
