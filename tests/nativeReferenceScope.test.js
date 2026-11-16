const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(predicate());
}

test('offscreen shells load no conversation or asset records and retain only canonical shell fields', async t => {
    const {db, load} = await workspaceFixture(t), create = load('brainRepository.ts').createBrainObject;
    const conversation = await create({type: 'conversation', title: 'Research', body: 'Private long conversation'});
    const image = await create({type: 'image', title: 'Image'}), unrelated = await create({type: 'note', title: 'Unrelated'});
    const message = await create({type: 'message', title: 'Message'});
    await db.relationships.add({id: 'message-link', fromEntityId: message.id, toEntityId: conversation.id, type: 'message-of', confirmed: true,
        origin: 'user', createdAt: 1, updatedAt: 1});
    await db.assets.add({id: 'asset', entityId: image.id, type: 'image', name: 'image.png', blob: new Blob(['image']),
        mimeType: 'image/png', size: 5, createdAt: 1, updatedAt: 1});
    let conversationReads = 0, assetReads = 0; const readIds = [];
    db.entities.hook('reading', row => {if (row) {readIds.push(row.id); if (row.type === 'message') conversationReads++;} return row;});
    db.relationships.hook('reading', row => {conversationReads++; return row;});
    db.assets.hook('reading', row => {assetReads++; return row;});
    const source = load('referenceDataSource.ts').createReferenceDataSource(db, {
        entities: [conversation, image], placements: [{entityId: conversation.id}, {entityId: image.id}]
    });
    const stop = source.subscribe(() => {}); await until(() => readIds.length >= 2);
    assert.equal(conversationReads + assetReads, 0); assert.equal(readIds.includes(unrelated.id), false);
    const shell = source.readShell(conversation.id);
    assert.deepEqual(Object.keys(shell).sort(), ['id', 'missing', 'title', 'type', 'updatedAt']);
    assert.equal(shell.id, conversation.id); assert.equal(shell.title, 'Research'); stop(); source.dispose();
});

test('shell updates preserve canonical identity across same-count external edits and missing objects', async t => {
    const {db, load} = await workspaceFixture(t), note = await load('brainRepository.ts').createBrainObject({type: 'note', title: 'Before'});
    const source = load('referenceDataSource.ts').createReferenceDataSource(db, {entities: [note], placements: [{entityId: note.id}, {entityId: 'missing'}]});
    const notifications = []; source.subscribe(ids => notifications.push(...ids));
    await db.entities.update(note.id, {title: 'External title', updatedAt: note.updatedAt + 1});
    await until(() => source.readShell(note.id).title === 'External title');
    assert.equal(source.readShell(note.id).id, note.id); assert.ok(notifications.includes(note.id));
    await db.entities.delete(note.id); await until(() => source.readShell(note.id).missing);
    assert.equal(source.readShell(note.id).id, note.id); assert.equal(source.readShell('missing').id, 'missing');
    assert.match(source.readShell('missing').title, /unavailable/i); source.dispose();
});

test('dirty references survive native disconnect with their actual resource and shared entity dirtiness', async t => {
    const {load} = await workspaceFixture(t), {createReferenceHydration} = load('referenceHydration.ts');
    const {createReferenceResources} = load('referenceResources.ts');
    const listeners = new Set(), dirty = new Set(), disposed = [], mounted = [];
    const session = {isDirty: id => dirty.has(id), subscribe: fn => {listeners.add(fn); return () => listeners.delete(fn);}};
    let next = 0;
    const owner = createReferenceResources({session, hydration: createReferenceHydration({maxConcurrent: 4}),
        load: async entityId => ({entityId, instance: next++, dispose() {disposed.push(this.instance);}})});
    const a = owner.connect('canvas:p1', 'entity', resource => {if (resource) mounted.push(resource);});
    const b = owner.connect('document:p2', 'entity', () => {});
    a.setVisible(true); b.setVisible(true); await tick();
    const original = mounted[0]; dirty.add('entity'); listeners.forEach(fn => fn('entity'));
    a.disconnect(); b.setVisible(false); assert.deepEqual(disposed, []);
    const replacement = owner.connect('canvas:p1', 'entity', resource => {if (resource) mounted.push(resource);});
    assert.equal(mounted.at(-1), original); assert.equal(next, 2);
    dirty.delete('entity'); listeners.forEach(fn => fn('entity')); assert.equal(disposed.length, 2);
    replacement.disconnect(); b.disconnect(); owner.dispose(); assert.equal(listeners.size, 0);
});

test('failed reference attachment disposes the allocated content instead of leaking it', async t => {
    const {load} = await workspaceFixture(t), errors = [], disposed = [];
    const hydration = load('referenceHydration.ts').createReferenceHydration({maxConcurrent: 1, onError: e => errors.push(e.message)});
    const owner = load('referenceResources.ts').createReferenceResources({hydration,
        session: {isDirty: () => false, subscribe: () => () => {}}, load: async () => ({dispose() {disposed.push('resource');}})});
    const connection = owner.connect('key', 'entity', resource => {if (resource) throw new Error('Host detached');});
    connection.setVisible(true); await tick(); assert.deepEqual(errors, ['Host detached']);
    assert.deepEqual(disposed, ['resource']); owner.dispose(); assert.deepEqual(disposed, ['resource']);
});

test('selecting a collapsed clean shell does not allocate hidden rich text or assets', async t => {
    const {load} = await workspaceFixture(t); let loaded = 0;
    const owner = load('referenceResources.ts').createReferenceResources({
        hydration: load('referenceHydration.ts').createReferenceHydration({maxConcurrent: 4}),
        session: {isDirty: () => false, subscribe: () => () => {}},
        load: async () => {loaded++; return {dispose() {}};}
    });
    const connection = owner.connect('canvas:p', 'entity', () => {}, 'p', true);
    owner.setSelected(['p']); connection.setVisible(false); await tick(); assert.equal(loaded, 0); owner.dispose();
});
