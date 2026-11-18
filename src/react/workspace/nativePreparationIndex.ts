import type {Doc} from '@blocksuite/store';

/** A disposable read accelerator for this adapter's new, controlled native Doc.
 * Native writers still own validation, IDs, models and notifications. Any
 * unowned transaction restores their original lookup implementations first.
 */
export function createNativePreparationIndex(doc: Doc) {
    const nativeAdd = doc.addBlock, nativeParent = doc.getParent, nativeFlavour = doc.getBlocksByFlavour;
    const nativeUpdate = doc.updateBlock;
    const initialIds = new Set(doc.getBlocks().map(model => model.id));
    let rootOwner: object | null = doc;
    while (rootOwner && !Object.getOwnPropertyDescriptor(rootOwner, 'root')) rootOwner = Object.getPrototypeOf(rootOwner);
    const nativeRoot = rootOwner && Object.getOwnPropertyDescriptor(rootOwner, 'root');
    const expected = new Map<string, {flavour: string; parent?: string}>();
    const surfaces = new Set<string>();
    let root: string | undefined, creating: string | undefined, active = false, closed = false;
    let approval: {used: boolean} | undefined;
    const saved = new Map<PropertyKey, PropertyDescriptor | undefined>();
    let stopEvents: {dispose(): void} | undefined;
    const ydoc = doc.spaceDoc;
    function restore() {
        active = false;
        ydoc?.off?.('beforeTransaction', beforeTransaction);
        stopEvents?.dispose(); stopEvents = undefined;
        for (const [key, descriptor] of saved) {
            if (descriptor) Object.defineProperty(doc, key, descriptor);
            else Reflect.deleteProperty(doc, key);
        }
        saved.clear();
    }
    function beforeTransaction() {
        if (!active) return;
        if (!approval || approval.used) restore();
        else approval.used = true;
    }
    function mutate<T>(action: () => T): T {
        if (closed) throw new DOMException('Native preparation has closed', 'AbortError');
        if (!active) return action();
        // A nested approved call cannot grant a second transaction to observers.
        if (approval) return action();
        approval = {used: false};
        try {return action();} catch (error) {restore(); throw error;} finally {approval = undefined;}
    }
    function install(key: PropertyKey, descriptor: PropertyDescriptor) {
        saved.set(key, Object.getOwnPropertyDescriptor(doc, key));
        Object.defineProperty(doc, key, {configurable: true, enumerable: false, ...descriptor});
    }
    // Only a fresh public Doc with restorable descriptors is eligible. A native
    // fallback still records and verifies all creations made by this adapter.
    const keys = ['root', 'getParent', 'getBlocksByFlavour', 'addBlock', 'moveBlocks', 'deleteBlock', 'updateBlock'];
    const eligible = Object.isExtensible(doc) && initialIds.size === 0 && typeof ydoc?.on === 'function' && typeof ydoc?.off === 'function' &&
        keys.every(key => Object.getOwnPropertyDescriptor(doc, key)?.configurable !== false);
    if (eligible) {
        try {
            install('getParent', {value: function (this: Doc, target: Parameters<Doc['getParent']>[0]) {
                const id = typeof target === 'string' ? target : target.id;
                if (active && this === doc && expected.has(id)) {
                    const parent = expected.get(id)!.parent;
                    return parent ? doc.getBlock(parent)?.model ?? null : null;
                }
                return nativeParent.call(this, target);
            }, writable: true});
            install('root', {get(this: Doc) {
                if (active && this === doc) return root ? doc.getBlock(root)?.model ?? null : null;
                return nativeRoot?.get ? nativeRoot.get.call(this) : nativeRoot?.value ?? null;
            }});
            install('getBlocksByFlavour', {value: function (this: Doc, flavour: string | string[]) {
                if (active && this === doc && (flavour === 'affine:surface' || Array.isArray(flavour) && flavour.length === 1 && flavour[0] === 'affine:surface')) {
                    return [...surfaces].flatMap(id => {const block = doc.getBlock(id); return block ? [block] : [];});
                }
                return nativeFlavour.call(this, flavour);
            }, writable: true});
            for (const key of ['addBlock', 'moveBlocks', 'deleteBlock'] as const) {
                const original = doc[key];
                install(key, {value: function (this: Doc, ...args: unknown[]) {
                    restore(); return Reflect.apply(original, this, args);
                }, writable: true});
            }
            install('updateBlock', {value: function (this: Doc, model: Parameters<Doc['updateBlock']>[0], props: object | (() => void)) {
                if (!active) return Reflect.apply(nativeUpdate, this, [model, props]);
                if (this !== doc || !approval || approval.used || typeof props === 'function' || !props || 'children' in props || 'id' in props || 'flavour' in props) {
                    restore(); return Reflect.apply(nativeUpdate, this, [model, props]);
                }
                return Reflect.apply(nativeUpdate, this, [model, props]);
            }, writable: true});
            active = true;
            ydoc.on('beforeTransaction', beforeTransaction);
            stopEvents = doc.slots.blockUpdated.on(event => {
                if (event.type === 'delete' || event.type === 'add' && event.id !== creating ||
                    event.type === 'update' && event.props.key === 'children' && !creating) restore();
            });
        } catch (error) {restore(); throw error;}
    }
    const addBlock = (flavour: string, props: NonNullable<Parameters<Doc['addBlock']>[1]> = {},
        parent?: Parameters<Doc['getParent']>[0] | null, parentIndex?: number): string => {
        if (closed) throw new DOMException('Native preparation has closed', 'AbortError');
        const id = props.id ?? doc.generateBlockId();
        if (expected.has(id) || doc.getBlock(id)) {restore(); throw new Error(`Native preparation failed: duplicate id ${id}`);}
        if (props.children) restore();
        const parentId = typeof parent === 'string' ? parent : parent?.id;
        expected.set(id, {flavour, parent: parentId});
        if (flavour === 'affine:page') root = id;
        if (flavour === 'affine:surface') surfaces.add(id);
        creating = id;
        try {
            const result: string = mutate(() => Reflect.apply(nativeAdd, doc, [flavour, {...props, id}, parent, parentIndex]));
            const model = doc.getBlock(id)?.model;
            if (result !== id || !model || model.flavour !== flavour) throw new Error(`Native preparation failed: missing or mismatched flavour for ${id}`);
            return result;
        } catch (error) {restore(); throw error;} finally {creating = undefined;}
    };
    return {addBlock, mutate, verify() {
        if (closed) throw new DOMException('Native preparation has closed', 'AbortError');
        // Independently inspect actual native models/child edges. Do not validate
        // our expected parents by querying the accelerator itself.
        const models = doc.getBlocks(), actual = new Map(models.map(model => [model.id, model]));
        for (const id of actual.keys()) if (!expected.has(id) && !initialIds.has(id)) throw new Error(`Native preparation failed: unexpected model ${id}`);
        const parents = new Map<string, string[]>();
        for (const model of models) for (const child of model.children) {
            const list = parents.get(child.id) || []; list.push(model.id); parents.set(child.id, list);
        }
        for (const [id, record] of expected) {
            if (actual.get(id)?.flavour !== record.flavour) throw new Error(`Native preparation failed: missing or mismatched flavour for ${id}`);
            const owners = parents.get(id) || [];
            if (record.parent ? owners.length !== 1 || owners[0] !== record.parent : owners.length !== 0) {
                throw new Error(`Native preparation failed: parent mismatch for ${id}`);
            }
        }
    }, dispose() {
        if (closed) return;
        restore(); closed = true; expected.clear(); initialIds.clear(); surfaces.clear(); root = undefined;
    }};
}
