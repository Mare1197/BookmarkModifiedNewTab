import type {ContentSession} from './pageEditorSession';
import type {createReferenceHydration, HydrationPins} from './referenceHydration';
type Hydration = ReturnType<typeof createReferenceHydration>;
interface Resource {dispose(): void}
interface Entry<T> {
    entityId: string; placementId: string; collapsed: boolean; resource?: T; publish?: (resource?: T) => void; token?: symbol;
    pins: HydrationPins; visible: boolean; focused: boolean; unregister: () => void;
}
// Occurrences retain the actual editor/DOM/asset lifetime, rather than rebuilding
// it from a draft value whenever the native renderer disconnects an element.
export function createReferenceResources<T extends Resource>(options: {
    session: Pick<ContentSession, 'isDirty' | 'subscribe'>; hydration: Hydration;
    load: (entityId: string, signal: AbortSignal, key: string) => Promise<T>;
}) {
    const entries = new Map<string, Entry<T>>(), selections = new Map<string, Set<string>>(); let closed = false, dragging = false;
    function update(key: string, entry: Entry<T>) {
        entry.pins.dirty = options.session.isDirty(entry.entityId);
        // A clean collapsed selection needs its shell, not a hidden body editor.
        entry.pins.selected = !entry.collapsed && [...selections.values()].some(ids => ids.has(entry.placementId));
        entry.pins.dragging = dragging && entry.pins.selected;
        entry.pins.focused = entry.focused && !entry.collapsed;
        options.hydration.setVisible(key, entry.visible && !entry.collapsed);
        options.hydration.setPins(key, entry.pins);
    }
    const unsubscribe = options.session.subscribe(entityId => {
        if (!closed) for (const [key, entry] of entries) if (entry.entityId === entityId) update(key, entry);
    });
    return {
        connect(key: string, entityId: string, publish: (resource?: T) => void, placementId = key, collapsed = false) {
            if (closed) throw new Error('Reference resources are closed');
            let entry = entries.get(key);
            if (!entry) {
                entry = {entityId, placementId, collapsed, visible: false, focused: false,
                    pins: {selected: false, focused: false, dragging: false, dirty: false}, unregister: () => {}};
                const owned = entry;
                entry.unregister = options.hydration.register(key, async signal => {
                    const resource = await options.load(entityId, signal, key);
                    if (signal.aborted || closed) {resource.dispose(); throw new DOMException('Reference released', 'AbortError');}
                    owned.resource = resource;
                    try {owned.publish?.(resource);} catch (error) {owned.resource = undefined; resource.dispose(); throw error;}
                    return () => {owned.resource = undefined; try {owned.publish?.();} finally {resource.dispose();}};
                });
                entries.set(key, entry);
            }
            const owned = entry, token = Symbol(key); owned.token = token; owned.publish = publish;
            update(key, owned); if (owned.resource) publish(owned.resource);
            return {
                setVisible(visible: boolean) {if (owned.token === token) {owned.visible = visible; update(key, owned);}},
                setFocused(focused: boolean) {if (owned.token === token) {owned.focused = focused; update(key, owned);}},
                disconnect() {
                    if (owned.token !== token) return;
                    owned.token = undefined; owned.publish = undefined; owned.focused = false; owned.visible = false;
                    update(key, owned);
                }
            };
        },
        setCollapsed(placementId: string, collapsed: boolean) {
            for (const [key, entry] of entries) if (entry.placementId === placementId) {
                entry.collapsed = collapsed; if (collapsed) entry.focused = false; update(key, entry);
            }
        },
        setSelected(ids: readonly string[], source = 'app') {
            selections.set(source, new Set(ids)); for (const [key, entry] of entries) update(key, entry);
        },
        setDragging(active: boolean) {dragging = active; for (const [key, entry] of entries) update(key, entry);},
        dispose() {
            if (closed) return; closed = true; unsubscribe(); options.hydration.dispose();
            entries.clear(); selections.clear();
        }
    };
}
