const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const {draft, content, sized} = require('./helpers/recoveryFixture');

test('journal applies canonical mutations and acknowledgement atomically without replay', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const r = await repo.writeDraft(draft(), null);
    const save = async op => {await db.entities.put({id: 'n', title: op.snapshot.title});
        return {value: 'committed', nextBase: op.snapshot, nextVersion: {kind: 'entity', revision: 1}};};
    assert.equal((await repo.commitDraftOperation(r.id, 1, save)).value, 'committed');
    assert.equal((await repo.readDraft(r.id)).operations.length, 0);
    assert.equal((await repo.commitDraftOperation(r.id, 1, () => {throw new Error('must not replay');})).status, 'already-applied');
    assert.equal((await db.entities.get('n')).title, 'Note');
    const second = await repo.writeDraft(draft('second'), null);
    await assert.rejects(repo.commitDraftOperation(second.id, 1, async () => {
        await db.entities.put({id: 'oops', title: 'partial'}); throw new Error('disk failure');
    }), /disk failure/);
    assert.equal(await db.entities.get('oops'), undefined);
    assert.equal((await repo.readDraft(second.id)).operations.length, 1);
});

test('newer journal generations survive acknowledgements and sessions cannot replace one another', async t => {
    const {load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const one = await repo.writeDraft(draft(), null), two = await repo.writeDraft(draft('other'), null);
    const next = sized({...one, generation: 2, operations: [...one.operations, {id: 'op-next', sequence: 2, kind: 'entity', snapshot: content('Latest')}]});
    await repo.writeDraft(next, 1);
    await repo.commitDraftOperation(one.id, 1, async op => ({value: true, nextBase: op.snapshot, nextVersion: {kind: 'entity', revision: 1}}));
    const retained = await repo.readDraft(one.id);
    assert.equal(retained.operations[0].snapshot.content.blocks[0].runs[0].insert, 'Latest');
    assert.equal(retained.baseVersion.revision, 1);
    await assert.rejects(repo.discardDraft(one.id, 1), /conflict/i);
    await assert.rejects(repo.writeDraft({...retained, sessionId: 'other', generation: 3}, 2), /owner|session/i);
    assert.equal((await repo.readDraft(two.id)).operations.length, 1);
});

test('expired leases do not delete data and recovery copies do not take ownership', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const source = await repo.writeDraft(draft(), null);
    await repo.touchSession('s', 100);
    assert.equal((await repo.readDraft(source.id)).leaseUntil, 60100);
    const copy = await repo.copyDraft(source.id, 1, 'recovery-session');
    assert.notEqual(copy.id, source.id); assert.equal(copy.sessionId, 'recovery-session');
    await repo.commitDraftOperation(copy.id, 1, async op => ({value: true, nextBase: op.snapshot, nextVersion: {kind: 'entity', revision: 1}}));
    assert.equal((await repo.readDraft(source.id)).recoveredGeneration, 1);
    await repo.releaseSession('s'); db.close(); await db.open();
    assert.equal((await repo.readDraft(source.id)).operations.length, 1);
    assert.equal((await repo.readDraft(source.id)).leaseUntil, 0);
    await repo.releaseSession('recovery-session'); assert.equal(await repo.readDraft(copy.id), undefined);
});

test('journal caps reject growth without evicting unresolved work', async t => {
    const {load} = await workspaceFixture(t), {createRecoveryRepository} = load('recoveryRepository.ts');
    const repo = createRecoveryRepository({totalLimit: draft().payloadBytes + 2});
    const saved = await repo.writeDraft(draft(), null);
    await assert.rejects(repo.writeDraft(draft('other'), null), /limit|storage/i);
    assert.equal((await repo.readDraft(saved.id)).operations.length, 1);
    await repo.discardDraft(saved.id, 1); assert.equal((await repo.listDrafts()).length, 0);
});

test('acknowledged operations cannot be resurrected from stale in-memory bases', async t => {
    const {load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const first = await repo.writeDraft(draft(), null);
    await repo.commitDraftOperation(first.id, 1, async op => ({value: true, nextBase: op.snapshot, nextVersion: {kind: 'entity', revision: 1}}));
    const stale = sized({...first, generation: 2, operations: [...first.operations,
        {id: 'next', sequence: 2, kind: 'entity', snapshot: content('Next')}]});
    await assert.rejects(repo.writeDraft(stale, 1), /base changed/);
    const fresh = sized({...stale, base: content('After'), baseVersion: {kind: 'entity', revision: 1}});
    const saved = await repo.writeDraft(fresh, 1);
    assert.equal(saved.appliedThrough, 1); assert.deepEqual(saved.operations.map(op => op.sequence), [2]);
    await assert.rejects(repo.copyDraft(saved.id, 1, 'new'), /conflict/);
    await assert.rejects(repo.commitDraftOperation(saved.id, 3, () => {throw new Error('never');}), /sequence/);
});

test('recovering an older copy does not hide a newer source generation', async t => {
    const {load} = await workspaceFixture(t), repo = load('recoveryRepository.ts');
    const source = await repo.writeDraft(draft(), null), copy = await repo.copyDraft(source.id, 1, 'recover');
    await repo.writeDraft(sized({...source, generation: 2, operations: [...source.operations,
        {id: 'new', sequence: 2, kind: 'entity', snapshot: content('Newer')}]}), 1);
    await repo.commitDraftOperation(copy.id, 1, async op => ({value: true, nextBase: op.snapshot, nextVersion: {kind: 'entity', revision: 1}}));
    assert.equal((await repo.readDraft(source.id)).recoveredGeneration, undefined);
    assert.equal((await repo.readDraft(source.id)).generation, 2);
});
