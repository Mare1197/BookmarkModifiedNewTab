const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const Dexie = require('dexie');
const {SCHEMA_V3, createWorkspaceDatabase, createWorkspaceRepository} = require('../src/workspace/workspaceDb');

test('both clients upgrade v3 without losing existing objects and exclude private exports', async t => {
    const {load} = await workspaceFixture(t), name = 'recovery-migration-' + crypto.randomUUID();
    const old = new Dexie(name); old.version(3).stores(SCHEMA_V3);
    await old.open(); await old.entities.put({id: 'original', title: 'Preserve me', type: 'note'}); old.close();
    const legacy = createWorkspaceDatabase(name); await legacy.open();
    assert.ok(legacy.tables.some(table => table.name === 'workspaceDrafts'));
    await legacy.workspaceDrafts.put({id: 'private', secret: 'not an ordinary backup'}); legacy.close();
    const {WorkspaceClient} = load('workspaceClient.ts');
    const react = new WorkspaceClient(name); await react.open(); t.after(() => react.delete());
    assert.equal((await react.entities.get('original')).title, 'Preserve me');
    assert.equal((await react.workspaceDrafts.get('private')).secret, 'not an ordinary backup');
    const a = react.tables.map(table => [table.name, table.schema.indexes.map(i => i.src)]);
    const check = createWorkspaceDatabase(name); await check.open();
    assert.deepEqual(check.tables.map(table => [table.name, table.schema.indexes.map(i => i.src)]), a);
    const exported = await createWorkspaceRepository({db: check}).exportSnapshot(); check.close();
    assert.equal('workspaceDrafts' in exported.tables, false);
    assert.equal('workspaceRevisions' in exported.tables, false);
});

test('React exports stay private and old ordinary backup versions remain readable', async t => {
    const {db, load} = await workspaceFixture(t), repo = load('workspaceRepository.ts');
    assert.ok(db.tables.some(table => table.name === 'workspaceDrafts'));
    await db.workspaceDrafts.put({id: 'private'});
    const exported = await repo.exportWorkspace();
    assert.equal(exported.schemaVersion, 4);
    assert.equal('workspaceDrafts' in exported.tables, false);
    assert.equal('workspaceRevisions' in exported.tables, false);
    for (const schemaVersion of [2, 3, 4]) await repo.importWorkspace({format: 'browser-os-workspace', schemaVersion, tables: {}});
    assert.ok(await db.workspaceDrafts.get('private'));
});

test('an open React connection closes on upgrade and requires a reload', async t => {
    const {load} = await workspaceFixture(t), {WorkspaceClient} = load('workspaceClient.ts');
    const name = 'recovery-versionchange-' + crypto.randomUUID(), old = new WorkspaceClient(name);
    await old.open();
    const next = new Dexie(name); next.version(old.verno + 1).stores({future: 'id'});
    await next.open(); t.after(() => next.delete());
    assert.equal(old.isOpen(), false); assert.equal(old.reloadRequired, true);
});

test('recovery validators reject malformed kinds, operations, unsafe rich text and forged byte counts', async t => {
    const {load} = await workspaceFixture(t), validation = load('recoveryValidation.ts');
    const snapshot = {kind: 'entity', entityId: 'n', title: 'Note', content: {version: 1, blocks: [
        {id: 'b', kind: 'paragraph', runs: [{insert: '🙂'}]}]}};
    const record = {id: 'd', version: 1, sessionId: 's', target: {kind: 'entity', id: 'n'}, targetKey: '["entity","n"]',
        generation: 1, appliedThrough: 0, base: snapshot, baseVersion: {kind: 'entity', revision: 0},
        operations: [{id: 'o', sequence: 1, kind: 'entity', snapshot}], updatedAt: 1, leaseUntil: 0};
    const sized = r => ({...r, payloadBytes: validation.payloadBytes({base: r.base, operations: r.operations})});
    assert.doesNotThrow(() => validation.validateDraft(sized(record)));
    assert.throws(() => validation.validateDraft({...sized(record), payloadBytes: 1}), /bytes|size/i);
    assert.throws(() => validation.validateDraft(sized({...record, target: {kind: 'memory', id: 'n'}})), /invalid/i);
    assert.throws(() => validation.validateDraft(sized({...record, operations: [record.operations[0], record.operations[0]]})), /invalid/i);
    const unsafe = structuredClone(record); unsafe.base.content.blocks[0].runs[0].attributes = {link: 'javascript:alert(1)'};
    assert.throws(() => validation.validateDraft(sized(unsafe)), /link|rich/i);
    assert.equal(validation.payloadBytes('🙂'), 6);
    assert.throws(() => validation.validateDraft(sized({...record, base: {...snapshot, title: 'x'.repeat(6 * 1024 * 1024)}})), /size|large|invalid/i);
});
