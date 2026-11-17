const test = require('node:test');
const assert = require('node:assert/strict');
const {workspaceFixture} = require('./helpers/workspaceFixture');

function fakeDoc() {
    const blocks = new Map(), listeners = new Set(), events = new Set();
    const scans = {parent: 0, root: 0, flavour: 0, ids: 0};
    class NativeDoc {
        get root() {scans.root++; return [...blocks.values()].find(b => b.flavour === 'affine:page')?.model || null;}
        get generateBlockId() {return () => 'native:' + ++scans.ids;}
        getBlocks() {return [...blocks.values()].map(b => b.model);}
        getBlock(id) {return blocks.get(id) || null;}
        getParent(target) {
            assert.equal(this, doc); scans.parent++; const id = typeof target === 'string' ? target : target.id;
            return this.getBlocks().find(model => model.children.some(child => child.id === id)) || null;
        }
        getBlocksByFlavour(flavour) {scans.flavour++; return [...blocks.values()].filter(b => [flavour].flat().includes(b.flavour));}
        addBlock(flavour, props = {}, parent) {
            const id = props.id || this.generateBlockId(), parentId = typeof parent === 'string' ? parent : parent?.id;
            doc.spaceDoc.transact(() => {
                const model = {id, flavour, children: [], ...props}; blocks.set(id, {id, flavour, model});
                if (parentId) blocks.get(parentId).model.children.push(model);
                events.forEach(fn => fn({type: 'add', id, flavour, model}));
            });
            return id;
        }
        deleteBlock(model) {doc.spaceDoc.transact(() => {events.forEach(fn => fn({type: 'delete', id: model.id})); blocks.delete(model.id);});}
        moveBlocks(models, parent) {doc.spaceDoc.transact(() => {
            for (const block of blocks.values()) block.model.children = block.model.children.filter(child => !models.includes(child));
            parent.children.push(...models);
        });}
    }
    const doc = new NativeDoc();
    doc.updateBlock = (model, props) => doc.spaceDoc.transact(() => typeof props === 'function' ? props() : Object.assign(model, props));
    doc.spaceDoc = {on: (_, fn) => listeners.add(fn), off: (_, fn) => listeners.delete(fn),
        transact: action => {listeners.forEach(fn => fn()); action();}};
    doc.slots = {blockUpdated: {on: fn => {events.add(fn); return {dispose: () => events.delete(fn)};}}};
    return {doc, scans, blocks, listeners, events};
}
async function fixture(t) {
    const {load} = await workspaceFixture(t);
    return {create: load('nativePreparationIndex.ts').createNativePreparationIndex, ...fakeDoc()};
}
function populate(index, doc) {
    const root = index.addBlock('affine:page'), surface = index.addBlock('affine:surface', {}, root);
    const note = index.addBlock('affine:note', {}, root), ref = index.addBlock('affine:embed-workspace-object', {}, note);
    return {root, surface, note, ref, model: id => doc.getBlock(id).model};
}
test('controlled native lookups retain identity with constant-time reads and native IDs', async t => {
    const {create, doc, scans} = await fixture(t), index = create(doc), ids = populate(index, doc);
    const before = {...scans};
    for (let i = 0; i < 10000; i++) {
        assert.equal(doc.getParent(ids.ref), ids.model(ids.note)); assert.equal(doc.getParent(ids.model(ids.note)), ids.model(ids.root));
        assert.equal(doc.root, ids.model(ids.root)); assert.equal(doc.getParent(ids.root), null);
        assert.equal(doc.getBlocksByFlavour('affine:surface')[0], doc.getBlock(ids.surface));
    }
    assert.deepEqual(scans, before); assert.equal(scans.ids, 4);
    const results = doc.getBlocksByFlavour(['affine:surface']); results.length = 0;
    assert.equal(doc.getBlocksByFlavour('affine:surface').length, 1);
    assert.equal(doc.getBlocksByFlavour(['affine:note', 'affine:surface']).length, 2);
    assert.equal(doc.getBlocksByFlavour('unknown').length, 0); assert.equal(scans.flavour, before.flavour + 2);
    index.verify(); index.dispose(); index.dispose();
});
for (const operation of ['add', 'move', 'delete', 'callback', 'children', 'unowned', 'reentrant']) {
    test('falls back before ' + operation + ' native topology can change', async t => {
        const {create, doc, scans, listeners} = await fixture(t), descriptors = Object.getOwnPropertyDescriptors(doc);
        const index = create(doc), ids = populate(index, doc), captured = doc.getParent;
        let observedRestored = false;
        const check = () => {observedRestored = !Object.hasOwn(doc, 'getParent');};
        if (operation === 'add') {doc.addBlock('affine:note', {}, ids.root); check();}
        if (operation === 'move') {doc.moveBlocks([ids.model(ids.ref)], ids.model(ids.root)); check();}
        if (operation === 'delete') {doc.deleteBlock(ids.model(ids.ref)); check();}
        if (operation === 'callback') doc.updateBlock(ids.model(ids.note), check);
        if (operation === 'children') {doc.updateBlock(ids.model(ids.note), {children: []}); check();}
        if (operation === 'unowned') doc.spaceDoc.transact(check);
        if (operation === 'reentrant') index.mutate(() => doc.spaceDoc.transact(() => doc.spaceDoc.transact(check)));
        assert.equal(observedRestored, true); assert.equal(listeners.size, 0);
        assert.deepEqual(Object.getOwnPropertyDescriptors(doc), descriptors);
        const before = scans.parent; assert.equal(captured.call(doc, ids.note), doc.getParent(ids.note)); assert.equal(scans.parent, before + 2);
        if (['move', 'delete', 'children'].includes(operation)) assert.throws(() => index.verify(), /native|parent|missing/i);
        else index.verify();
        index.dispose(); assert.deepEqual(Object.getOwnPropertyDescriptors(doc), descriptors);
    });
}
test('ordinary presentation updates and approved surface transactions retain fast lookups', async t => {
    const {create, doc} = await fixture(t), index = create(doc), ids = populate(index, doc);
    doc.updateBlock(ids.model(ids.note), {index: 'a0', edgeless: {collapse: false}, xywh: '[1,2,3,4]'});
    index.mutate(() => doc.spaceDoc.transact(() => {}));
    assert.equal(Object.hasOwn(doc, 'getParent'), true); index.verify(); index.dispose();
});
test('captured root getter and existing own descriptors restore exactly', async t => {
    const {create, doc} = await fixture(t), originalParent = doc.getParent;
    Object.defineProperty(doc, 'getParent', {value: originalParent, writable: true, configurable: true, enumerable: true});
    const before = Object.getOwnPropertyDescriptors(doc), index = create(doc), ids = populate(index, doc);
    const root = Object.getOwnPropertyDescriptor(doc, 'root').get;
    index.dispose();
    assert.deepEqual(Object.getOwnPropertyDescriptors(doc), before); assert.equal(root.call(doc), ids.model(ids.root));
});
test('captured native property writers still delegate after the preparation owner closes', async t => {
    const {create, doc} = await fixture(t), index = create(doc), ids = populate(index, doc);
    const update = doc.updateBlock.bind(doc);
    index.dispose(); update(ids.model(ids.note), {index: 'after-ready'});
    assert.equal(ids.model(ids.note).index, 'after-ready');
    assert.throws(() => index.mutate(() => assert.fail('late owned operation')), {name: 'AbortError'});
});
test('duplicate controlled IDs fail instead of validating a previously existing model', async t => {
    const {create, doc} = await fixture(t), index = create(doc), ids = populate(index, doc);
    assert.throws(() => index.addBlock('affine:note', {id: ids.note}, ids.root), /duplicate/i);
    assert.equal(Object.hasOwn(doc, 'getParent'), false); index.dispose();
});
test('nonempty and incompatible documents keep native APIs while verifying new creations', async t => {
    const {create, doc} = await fixture(t); const root = doc.addBlock('affine:page');
    const index = create(doc); assert.equal(Object.hasOwn(doc, 'getParent'), false);
    index.addBlock('affine:note', {}, root); index.verify(); index.dispose();
    const other = fakeDoc().doc; delete other.spaceDoc.on; const fallback = create(other);
    assert.equal(Object.hasOwn(other, 'getParent'), false); populate(fallback, other); fallback.verify(); fallback.dispose();
});
for (const failure of ['missing', 'wrong flavour', 'wrong parent', 'throw']) test('fails preparation when native creation has ' + failure, async t => {
    const {create, doc, blocks} = await fixture(t), nativeAdd = doc.addBlock;
    doc.addBlock = function (flavour, props, parent) {
        if (flavour !== 'affine:embed-workspace-object') return nativeAdd.call(this, flavour, props, parent);
        if (failure === 'throw') throw new Error('native creation failed');
        if (failure === 'missing') return props.id;
        const id = nativeAdd.call(this, flavour, props, failure === 'wrong parent' ? null : parent);
        if (failure === 'wrong flavour') blocks.get(id).model.flavour = 'wrong'; return id;
    };
    const descriptor = Object.getOwnPropertyDescriptor(doc, 'addBlock'), index = create(doc);
    if (failure === 'wrong parent') {populate(index, doc); assert.throws(() => index.verify(), /parent/i);}
    else assert.throws(() => populate(index, doc), /native|missing|flavour/i);
    index.dispose(); assert.deepEqual(Object.getOwnPropertyDescriptor(doc, 'addBlock'), descriptor);
    assert.throws(() => index.addBlock('affine:note'), {name: 'AbortError'});
});
