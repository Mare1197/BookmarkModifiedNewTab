const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('recovery reconciliation settles only reviewed targets and preserves other local drafts', async t => {
    const {db, load} = await workspaceFixture(t);
    const create = load('brainRepository.ts').createBrainObject;
    const a = await create({type: 'note', title: 'A'}), b = await create({type: 'note', title: 'B'});
    const session = load('pageEditorSession.ts').createPageEditorSession([a, b]);
    const rich = load('richContent.ts').plainToRichContent;
    session.edit(a.id, rich('Reviewed')); session.edit(b.id, rich('Still pending'));
    await session.flushJournal();
    const recovery = load('recoveryPreview.ts');
    const record = (await db.workspaceDrafts.toArray()).find(r => r.target.id === a.id);
    await recovery.resolveDraft(await recovery.previewDraft(record.id), {kind: 'use-draft'});
    await session.reconcileRecovery();
    assert.equal(session.dirtyCount(), 1);
    assert.match(session.exportDrafts(), /Still pending/);
    assert.doesNotMatch(session.exportDrafts(), /Reviewed/);
    await session.flush();
    assert.equal((await db.entities.get(a.id)).metadata.body, 'Reviewed');
    assert.equal((await db.entities.get(b.id)).metadata.body, 'Still pending');
    await session.dispose();
});

test('session flush serializes edits and retains conflicting drafts until explicit recovery', async t => {
    const {db, load} = await workspaceFixture(t);
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note'});
    const content = load('richContent.ts').plainToRichContent;
    const session = load('pageEditorSession.ts').createPageEditorSession([note]);
    session.edit(note.id, content('First'));
    const pending = session.flush();
    session.edit(note.id, content('Latest'));
    await pending;
    await session.flush();
    assert.equal((await db.entities.get(note.id)).metadata.body, 'Latest');
    session.edit(note.id, content('My draft'));
    await load('workspaceRepository.ts').updateEntity(note.id, {title: 'External title'});
    await assert.rejects(session.flush(), /conflict/i);
    assert.equal(session.getStatus(), 'conflict');
    assert.match(session.exportDrafts(), /My draft/);
    assert.ok(session.getDraftIds().length);
    await session.reload();
    assert.equal((await db.entities.get(note.id)).metadata.body, 'Latest');
    session.dispose();
    assert.throws(() => session.edit(note.id, content('Late')), /closed/i);
});

test('session keeps failed drafts, ignores external echoes while dirty, and scopes undo by revision', async t => {
    const {db, load} = await workspaceFixture(t);
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note', body: 'Before'});
    const rich = load('richContent.ts');
    const session = load('pageEditorSession.ts').createPageEditorSession([note]);
    session.edit(note.id, rich.plainToRichContent('After'));
    session.acceptExternal({...note, metadata: {body: 'External echo'}});
    assert.match(session.exportDrafts(), /After/);
    await session.flush();
    await session.undo(note.id);
    assert.equal((await db.entities.get(note.id)).metadata.body, 'Before');
    session.edit(note.id, rich.plainToRichContent('My next'));
    await session.flush();
    await load('workspaceRepository.ts').updateEntity(note.id, {title: 'Other writer'});
    await assert.rejects(session.undo(note.id), /conflict/i);
    session.dispose();
    const failed = load('pageEditorSession.ts').createPageEditorSession([await db.entities.get(note.id)], {
        save: async () => {throw new Error('disk full');}, read: id => db.entities.get(id)
    });
    failed.edit(note.id, rich.plainToRichContent('Recover me'));
    await assert.rejects(failed.flush(), /disk full/);
    assert.equal(failed.getStatus(), 'error');
    assert.match(failed.exportDrafts(), /Recover me/);
    await failed.reload();
    assert.equal(failed.getStatus(), 'saved');
    failed.dispose();
});
