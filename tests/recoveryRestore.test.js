const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

async function pending(load) {
    const note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Note', body: 'Before'});
    const session = load('pageEditorSession.ts').createPageEditorSession([note]);
    session.edit(note.id, load('richContent.ts').plainToRichContent('Draft'));
    await session.flushJournal(); await session.dispose();
    return {note, id: session.getDraftIds()[0]};
}
test('stale comparisons reject atomically and fresh approved drafts preserve identity and private metadata', async t => {
    const {db, load} = await workspaceFixture(t), {note, id} = await pending(load), api = load('recoveryPreview.ts');
    const preview = await api.previewDraft(id);
    await load('workspaceRepository.ts').updateEntity(note.id, {title: 'New title', metadata: {secret: 'preserved'}});
    const before = await db.workspaceRevisions.count();
    await assert.rejects(api.resolveDraft(preview, {kind: 'use-draft'}), /conflict/i);
    assert.equal(await db.workspaceRevisions.count(), before); assert.ok(await db.workspaceDrafts.get(id));
    await api.resolveDraft(await api.previewDraft(id), {kind: 'use-draft'});
    assert.equal((await db.entities.get(note.id)).metadata.body, 'Draft');
    assert.equal((await db.entities.get(note.id)).metadata.secret, 'preserved');
    const source = await db.workspaceDrafts.get(id); assert.equal(source.recoveredGeneration, source.generation);
    assert.equal(await db.workspaceDrafts.count(), 1);
});
test('missing targets remain exportable, never silently recreated', async t => {
    const {db, load} = await workspaceFixture(t), {note, id} = await pending(load), api = load('recoveryPreview.ts');
    await db.entities.delete(note.id);
    const preview = await api.previewDraft(id); assert.ok(preview.blockers.length);
    await assert.rejects(api.resolveDraft(preview, {kind: 'use-draft'}), /missing|exists|unavailable/i);
    assert.equal(await db.entities.get(note.id), undefined); assert.ok(preview.record.base);
});
test('keeping current refuses a newer draft generation and discards only the reviewed draft', async t => {
    const {db, load} = await workspaceFixture(t), {note, id} = await pending(load), api = load('recoveryPreview.ts');
    const preview = await api.previewDraft(id), before = await db.entities.get(note.id);
    const other = await pending(load);
    await db.workspaceDrafts.update(id, {generation: preview.record.generation + 1});
    await assert.rejects(api.resolveDraft(preview, {kind: 'keep-current'}), /conflict/i);
    assert.ok(await db.workspaceDrafts.get(id));
    await api.resolveDraft(await api.previewDraft(id), {kind: 'keep-current'});
    assert.equal(await db.workspaceDrafts.get(id), undefined);
    assert.ok(await db.workspaceDrafts.get(other.id));
    assert.deepEqual(await db.entities.get(note.id), before);
});
test('history restore refuses pending drafts and stale versions, then creates a new revision', async t => {
    const {db, load} = await workspaceFixture(t), {note, id} = await pending(load), history = load('revisionRepository.ts');
    const revision = (await history.listHistory({kind: 'entity', id: note.id})).items[0];
    const restore = load('revisionRestore.ts').restoreRevision;
    await assert.rejects(restore(revision.id, {kind: 'entity', revision: 0}), /draft/i);
    await load('recoveryRepository.ts').discardDraft(id, 1);
    await load('workspaceRepository.ts').updateEntity(note.id, {title: 'Later'});
    await assert.rejects(restore(revision.id, {kind: 'entity', revision: 0}), /conflict/);
    await restore(revision.id, {kind: 'entity', revision: 1});
    assert.equal((await db.entities.get(note.id)).title, 'Note');
    assert.equal((await history.listHistory({kind: 'entity', id: note.id})).items[0].reason, 'restore');
});
test('page restore rejects missing connector relationships rather than recreating semantic links', async t => {
    const {db, load} = await workspaceFixture(t), p = load('pageRepository.ts'); let page = await p.createWorkspacePage('Page');
    for (const title of ['A', 'B']) page = await p.addPageReference(page.board.id, (await load('brainRepository.ts').createBrainObject({type: 'note', title})).id);
    page = await p.applyPageCommand(page.board.id, page.version, {type: 'connect', fromPlacementId: page.placements[0].id, toPlacementId: page.placements[1].id, relationType: 'related'});
    const id = (await load('revisionRepository.ts').listHistory({kind: 'page', id: page.board.id})).items[0].id;
    await load('workspaceRepository.ts').deleteRelationship(page.presentation.connectors[0].relationshipId);
    const current = await p.loadPageSnapshot(page.board.id);
    await assert.rejects(load('revisionRestore.ts').restoreRevision(id, {kind: 'page', value: current.version}), /relationship/);
    assert.equal(await db.relationships.count(), 0);
});

test('semantic page drafts apply only on the reviewed unchanged base and cannot be silently rebased', async t => {
    const {db, load} = await workspaceFixture(t), p = load('pageRepository.ts'), api = load('recoveryPreview.ts');
    let page = await p.createWorkspacePage('Page');
    for (const title of ['A', 'B']) page = await p.addPageReference(page.board.id, (await load('brainRepository.ts').createBrainObject({type: 'note', title})).id);
    const journal = load('sessionJournal.ts').createSessionJournal(); t.after(() => journal.dispose());
    journal.enqueue({kind: 'page', id: page.board.id}, load('revisionRepository.ts').layoutSnapshot(page), {kind: 'page', value: page.version},
        {kind: 'page', command: {type: 'connect', fromPlacementId: page.placements[0].id, toPlacementId: page.placements[1].id, relationType: 'related'}});
    await journal.flushJournal(); const id = journal.getDraftIds()[0];
    assert.deepEqual((await api.previewDraft(id)).blockers, []);
    await api.resolveDraft(await api.previewDraft(id), {kind: 'use-draft'});
    assert.equal(await db.relationships.count(), 1);
    const changed = await api.previewDraft(id); assert.ok(changed.blockers.length);
    await assert.rejects(api.resolveDraft(changed, {kind: 'use-draft'}), /relationship/);
    assert.equal(await db.relationships.count(), 1);
});
