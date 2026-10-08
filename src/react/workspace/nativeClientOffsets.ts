import type {GfxController} from '@blocksuite/block-std/gfx';
type OffsetViewport = Pick<GfxController['viewport'], 'setRect' | 'left' | 'top'> &
    Partial<Pick<GfxController['viewport'], 'sizeUpdated'>>;
// Position-only layout changes do not resize the native canvas. Observe the
// shell siblings, not the rich-content subtree; keep the world camera intact.
export function attachNativeClientOffsets(pane: HTMLElement, layout: HTMLElement, viewport: OffsetViewport) {
    let closed = false, previous: number[] | undefined;
    const sync = () => {
        if (closed) return;
        const rect = pane.getBoundingClientRect(), next = [rect.left, rect.top, rect.width, rect.height];
        if (previous?.every((value, i) => value === next[i]) &&
            (viewport.left === undefined || viewport.left === rect.left) && (viewport.top === undefined || viewport.top === rect.top)) return;
        previous = next; viewport.setRect(rect.left, rect.top, rect.width, rect.height);
    };
    const resize = new ResizeObserver(sync);
    const observe = () => {resize.disconnect(); resize.observe(pane); for (const sibling of Array.from(layout.children)) resize.observe(sibling);};
    const mutation = new MutationObserver(() => {if (!closed) {observe(); sync();}});
    observe(); mutation.observe(layout, {childList: true});
    const nativeSize = viewport.sizeUpdated?.on(sync);
    pane.ownerDocument.addEventListener('scroll', sync, true); pane.addEventListener('pointerdown', sync, true); sync();
    return () => {
        closed = true; resize.disconnect(); mutation.disconnect(); nativeSize?.dispose();
        pane.ownerDocument.removeEventListener('scroll', sync, true); pane.removeEventListener('pointerdown', sync, true);
    };
}
