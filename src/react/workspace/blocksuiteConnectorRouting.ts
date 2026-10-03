import {ConnectorMode, StrokeStyle, type ConnectorElementModel, type getSurfaceBlock} from '@blocksuite/blocks';
import {ConnectorPathGenerator} from '@blocksuite/affine-block-surface';
import {PointLocation} from '@blocksuite/global/utils';
import type {LitElement} from 'lit';
import type {GfxController} from '@blocksuite/block-std/gfx';
import type {PageCommand, PageConnector} from '../../workspace/pageTypes';
import type {PageSnapshot} from './pageRepository';
import {orthogonalRoute} from './connectorGeometry';
import {validateCommand} from './recoveryValidation';

type Surface = NonNullable<ReturnType<typeof getSurfaceBlock>>;
const defaults = {source: {x: 1, y: 0.5}, target: {x: 0, y: 0.5}};

// BlockSuite remains a disposable projection. Only canonical placement IDs,
// attachment anchors and manual waypoints cross the persistence boundary.
export function mountConnectorRouting(container: HTMLElement, surface: Surface, gfx: GfxController,
    snapshot: PageSnapshot, nativeIds: Map<string, string>, placementIds: Map<string, string>,
    onCommand: (command: PageCommand) => void, onError: (error: unknown) => void) {
    const records = new Map<string, PageConnector>();
    for (const [native, id] of nativeIds) {
        const saved = snapshot.presentation.connectors.find(c => c.id === id);
        if (saved) records.set(native, structuredClone(saved));
    }
    const placements = new Map(snapshot.placements.map(p => [p.id, p]));
    const dirty = new Set<string>();
    const overlay = document.createElement('div'); overlay.className = 'brainConnectorRouting'; container.append(overlay);
    let disposed = false, applying = false, pointerActive = false, cancelled = false, dragging = false, nativeEndpointDrag = false;
    let cancelBend: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const element = (id: string) => surface.getElementById(id) as ConnectorElementModel | null;
    const nativePlacement = (id: string) => [...placementIds].find(([, p]) => p === id)?.[0];
    function restore(id: string, saved: PageConnector) {
        const c = element(id); if (!c) return;
        const a = saved.anchors || defaults;
        applying = true;
        c.source = {id: nativePlacement(saved.fromPlacementId), position: [a.source.x, a.source.y]};
        c.target = {id: nativePlacement(saved.toPlacementId), position: [a.target.x, a.target.y]};
        applying = false;
        // Native endpoint setters queue an automatic path update. Restore manual
        // waypoints after that update, not before it can overwrite them.
        queueMicrotask(() => {if (!disposed) {route(id); render();}});
    }
    function route(id: string) {
        const c = element(id), saved = records.get(id);
        if (!c || !saved || applying) return;
        applying = true;
        try {
            ConnectorPathGenerator.updatePath(c, null, key => gfx.getElementById(key));
            if (c.mode === ConnectorMode.Orthogonal && saved.points.length && c.absolutePath.length > 1) {
                const start = c.absolutePath[0]!, end = c.absolutePath.at(-1)!;
                ConnectorPathGenerator.updatePath(c, orthogonalRoute({x: start[0], y: start[1]}, {x: end[0], y: end[1]}, saved.points)
                    .map(p => new PointLocation([p.x, p.y])));
            }
        } finally {applying = false;}
        // The native handle receives the same model reference, so Lit does not
        // automatically redraw its local path coordinates after a manual route.
        container.querySelector('edgeless-selected-rect')?.shadowRoot?.querySelector<LitElement>('edgeless-connector-handle')?.requestUpdate();
    }
    function capture(id: string) {
        const c = element(id); if (!c || c.type !== 'connector') return;
        const previous = records.get(id);
        const from = c.source.id && placementIds.get(c.source.id), to = c.target.id && placementIds.get(c.target.id);
        if (!from || !to || placements.get(from)?.entityId === placements.get(to)?.entityId) {
            if (previous) {restore(id, previous); onError(new Error('Connect two different object cards. The previous connection was restored.'));}
            return;
        }
        const a = c.source.position || [1, 0.5], b = c.target.position || [0, 0.5];
        const next: PageConnector = {...previous, id: previous?.id || 'connector:' + crypto.randomUUID(), relationshipId: previous?.relationshipId || 'pending',
            fromPlacementId: from, toPlacementId: to, anchors: {source: {x: a[0], y: a[1]}, target: {x: b[0], y: b[1]}},
            points: previous?.points || [], color: /^#[0-9a-f]{6}$/i.test(String(c.stroke)) ? String(c.stroke) : previous?.color || '#64748b',
            dashed: c.strokeStyle === StrokeStyle.Dash, mode: c.mode === ConnectorMode.Straight ? 'straight' : c.mode === ConnectorMode.Curve ? 'curve' : 'orthogonal'};
        const retargeted = previous && (from !== previous.fromPlacementId || to !== previous.toPlacementId);
        const command: PageCommand = retargeted ? {type: 'reconnect', connectorId: next.id, fromPlacementId: from, toPlacementId: to, anchors: next.anchors!, points: next.points}
            : {type: 'connector-route', connectorId: next.id, anchors: next.anchors!, points: next.points};
        try {validateCommand(command);} catch (error) {if (previous) restore(id, previous); onError(error); return;}
        if (!previous) onCommand({type: 'connect', connectorId: next.id, fromPlacementId: from, toPlacementId: to, relationType: 'related'});
        if (retargeted || JSON.stringify(previous?.anchors) !== JSON.stringify(next.anchors)) onCommand(command);
        if (!previous || previous.color !== next.color || previous.dashed !== next.dashed || previous.mode !== next.mode) {
            onCommand({type: 'connector-style', connectorId: next.id, points: next.points, color: next.color, dashed: next.dashed, mode: next.mode});
        }
        nativeIds.set(id, next.id); records.set(id, next); route(id);
    }
    function flush() {
        clearTimeout(timer); if (disposed || pointerActive || !dirty.size) return;
        for (const id of dirty) capture(id);
        dirty.clear(); render();
    }
    function setPoints(id: string, points: PageConnector['points']) {
        const saved = records.get(id); if (!saved) return;
        const command: PageCommand = {type: 'connector-route', connectorId: saved.id, anchors: saved.anchors || defaults, points};
        try {validateCommand(command);} catch (error) {onError(error); return;}
        records.set(id, {...saved, anchors: command.anchors, points}); onCommand(command); route(id); render();
    }
    function render() {
        if (disposed || dragging) return;
        overlay.replaceChildren();
        const selected = gfx.selection.selectedElements;
        if (selected.length !== 1) return;
        const id = selected[0]!.id, saved = records.get(id), c = element(id);
        if (!saved || !c || c.mode !== ConnectorMode.Orthogonal) return;
        const toolbar = document.createElement('div'); toolbar.className = 'brainRouteToolbar';
        const add = document.createElement('button'); add.textContent = 'Add route bend'; add.disabled = saved.points.length >= 1000;
        add.onclick = () => {
            const path = c.absolutePath, mid = Math.floor((path.length - 1) / 2), a = path[mid], b = path[mid + 1];
            if (a && b) setPoints(id, [...saved.points, {x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2}]);
        };
        const reset = document.createElement('button'); reset.textContent = 'Reset route'; reset.disabled = !saved.points.length;
        reset.onclick = () => setPoints(id, []); toolbar.append(add, reset); overlay.append(toolbar);
        saved.points.forEach((point, index) => {
            const handle = document.createElement('button'); handle.className = 'brainRouteBend'; handle.setAttribute('aria-label', `Route bend ${index + 1}`);
            handle.title = 'Drag or use arrow keys to move; Delete to remove; Escape to cancel drag';
            const position = (p: {x: number; y: number}) => {
                const [x, y] = gfx.viewport.toViewCoord(p.x, p.y), rect = container.getBoundingClientRect();
                handle.style.left = `${x + gfx.viewport.left - rect.left}px`; handle.style.top = `${y + gfx.viewport.top - rect.top}px`;
            };
            position(point);
            handle.onpointerdown = event => {
                event.preventDefault(); event.stopPropagation(); dragging = true; cancelled = false;
                const original = structuredClone(saved.points); let proposed = original;
                handle.setPointerCapture(event.pointerId);
                handle.onpointermove = move => {
                    const [x, y] = gfx.viewport.toModelCoordFromClientCoord([move.clientX, move.clientY]);
                    proposed = original.map((p, i) => i === index ? {x: Math.max(-1e6, Math.min(1e6, x)), y: Math.max(-1e6, Math.min(1e6, y))} : p);
                    records.set(id, {...saved, points: proposed}); route(id); position(proposed[index]!);
                };
                const finish = (abort: boolean) => {
                    handle.onpointermove = null; handle.onpointerup = null; handle.onpointercancel = null;
                    cancelBend = undefined;
                    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
                    dragging = false; records.set(id, saved);
                    if (abort || cancelled) {route(id); render();} else setPoints(id, proposed);
                };
                cancelBend = () => finish(true);
                handle.onpointerup = () => finish(false); handle.onpointercancel = () => finish(true);
            };
            handle.onkeydown = event => {
                const vectors: Record<string, [number, number]> = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
                if (event.key === 'Delete' || event.key === 'Backspace') {event.preventDefault(); setPoints(id, saved.points.filter((_, i) => i !== index));}
                else if (vectors[event.key]) {
                    event.preventDefault(); const [dx, dy] = vectors[event.key]!, step = event.shiftKey ? 10 : 1;
                    setPoints(id, saved.points.map((p, i) => i === index ? {x: p.x + dx * step, y: p.y + dy * step} : p));
                    overlay.querySelector<HTMLButtonElement>(`[aria-label="Route bend ${index + 1}"]`)?.focus();
                }
            };
            overlay.append(handle);
        });
    }
    const down = (event: PointerEvent) => {if (event.composedPath().includes(container)) {
        pointerActive = true; cancelled = false;
        nativeEndpointDrag = event.composedPath().some(node => node instanceof HTMLElement && node.matches('.line-start,.line-end'));
    }};
    const cancelGesture = () => {
        if (!pointerActive) return;
        cancelled = true; pointerActive = false; cancelBend?.();
        // Pinned BlockSuite releases its document movement listeners only on up.
        // End that native gesture before restoring, so later movement cannot save it.
        if (nativeEndpointDrag) document.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}));
        nativeEndpointDrag = false;
        for (const id of dirty) {const saved = records.get(id); if (saved) restore(id, saved);}
        dirty.clear(); render();
    };
    const up = (event: PointerEvent) => {
        if (!pointerActive) return;
        if (event.type === 'pointercancel') {cancelGesture(); return;}
        queueMicrotask(() => {
            if (disposed) return; pointerActive = false; nativeEndpointDrag = false;
            flush();
        });
    };
    const key = (event: KeyboardEvent) => {if (event.key === 'Escape' && pointerActive) cancelGesture();};
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true); document.addEventListener('keydown', key, true);
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    const disposables = [surface.elementAdded.on(({id}) => {
        if (element(id)?.type === 'connector') {dirty.add(id); clearTimeout(timer); timer = setTimeout(flush, 250);}
    }), surface.elementUpdated.on(({id, props, local}) => {
        if (disposed || applying || !local || element(id)?.type !== 'connector') return;
        if (['source', 'target', 'mode', 'stroke', 'strokeStyle'].some(k => k in props)) {
            dirty.add(id); clearTimeout(timer); timer = setTimeout(flush, 250);
        }
    }), surface.elementRemoved.on(({id}) => {
        const saved = records.get(id); dirty.delete(id); records.delete(id); nativeIds.delete(id);
        if (!disposed && saved) onCommand({type: 'remove-connector', connectorId: saved.id, scope: 'page'});
        render();
    }), gfx.selection.slots.updated.on(render), gfx.viewport.viewportUpdated.on(render)];
    for (const id of records.keys()) route(id);
    return {flush, refresh() {if (!disposed) {for (const id of records.keys()) route(id); render();}}, dispose() {
        disposed = true; clearTimeout(timer); disposables.forEach(d => d.dispose()); overlay.remove();
        document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true);
        document.removeEventListener('pointercancel', up, true); document.removeEventListener('keydown', key, true);
    }};
}
