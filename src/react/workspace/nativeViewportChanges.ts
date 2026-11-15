import type {PagePresentation} from '../../workspace/pageTypes';
type Viewport = PagePresentation['viewport'];

export function createViewportChanges(initial: Viewport, publish: (viewport: Viewport) => void) {
    let previous = {...initial};
    return (next: Viewport) => {
        if (next.x === previous.x && next.y === previous.y && next.zoom === previous.zoom) return;
        const value = {...next};
        publish(value); previous = {...value};
    };
}
