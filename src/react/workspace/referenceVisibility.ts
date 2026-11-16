import type {GfxController} from '@blocksuite/block-std/gfx';
type Viewport = GfxController['viewport'];
interface Rect {x: number; y: number; width: number; height: number}

export function referenceWorldBounds(viewport: Pick<Viewport, 'center' | 'width' | 'height' | 'zoom'>): Rect {
    const {center, width, height, zoom} = viewport;
    return {x: center.x - (width / 2 + 200) / zoom, y: center.y - (height / 2 + 200) / zoom,
        width: (width + 400) / zoom, height: (height + 400) / zoom};
}
export function referenceIntersects(a: Rect, b: Rect) {
    return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
export function observeCanvasReferences(viewport: Pick<Viewport, 'center' | 'width' | 'height' | 'zoom' | 'viewportUpdated' | 'sizeUpdated'>,
    read: () => ReadonlyArray<Rect & {id: string}>, publish: (id: string, visible: boolean) => void) {
    const previous = new Map<string, boolean>(); let closed = false;
    const update = () => {
        if (closed) return;
        const bounds = referenceWorldBounds(viewport), current = new Set<string>();
        for (const placement of read()) {
            current.add(placement.id); const visible = referenceIntersects(placement, bounds);
            if (previous.get(placement.id) !== visible) {previous.set(placement.id, visible); publish(placement.id, visible);}
        }
        for (const id of previous.keys()) if (!current.has(id)) {previous.delete(id); publish(id, false);}
    };
    const subscriptions = [viewport.viewportUpdated.on(update), viewport.sizeUpdated.on(update)]; update();
    return Object.assign(() => {closed = true; subscriptions.forEach(subscription => subscription.dispose()); previous.clear();}, {refresh: update});
}
const documentPanes = new WeakMap<HTMLElement, {observer: IntersectionObserver; targets: Map<Element, (visible: boolean) => void>}>();
export function observeDocumentReference(node: HTMLElement, pane: HTMLElement, publish: (visible: boolean) => void) {
    let owner = documentPanes.get(pane);
    if (!owner) {
        const targets = new Map<Element, (visible: boolean) => void>();
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) targets.get(entry.target)?.(entry.isIntersecting);
        }, {root: pane, rootMargin: '200px', threshold: 0});
        owner = {observer, targets}; documentPanes.set(pane, owner);
    }
    const {observer, targets} = owner; let closed = false;
    targets.set(node, publish); observer.observe(node);
    return () => {
        if (closed) return; closed = true;
        targets.delete(node); observer.unobserve(node);
        if (!targets.size) {observer.disconnect(); documentPanes.delete(pane);}
    };
}
