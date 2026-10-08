import type {UIEventDispatcher} from '@blocksuite/block-std';

// BlockSuite 0.19's pointer controller polls its host rectangle once a second.
// Shell wrapping and scrolling can move the host between polls. Normalize at
// the supported dispatcher boundary, before native tools consume the event;
// never reach into the controller's private cache or replace native dragging.
export function attachNativePointerCoordinates(host: HTMLElement, dispatcher: Pick<UIEventDispatcher, 'add'>) {
    let down: {id: number; x: number; y: number} | undefined;
    const events = ['pointerDown', 'pointerMove', 'pointerUp', 'pointerOut', 'click', 'doubleClick', 'tripleClick',
        'dragStart', 'dragMove', 'dragEnd'] as const;
    const remove = events.map(name => dispatcher.add(name, context => {
        const state = context.get('pointerState'), rect = host.getBoundingClientRect();
        state.point = {x: state.raw.clientX - rect.left, y: state.raw.clientY - rect.top};
        state.containerOffset = {x: rect.left, y: rect.top};
        if (name === 'pointerDown') down = {id: state.raw.pointerId, x: state.point.x, y: state.point.y};
        if (down?.id === state.raw.pointerId && Number.isFinite(state.start.x)) state.start = {x: down.x, y: down.y};
    }));
    return () => {remove.forEach(dispose => dispose()); down = undefined;};
}
