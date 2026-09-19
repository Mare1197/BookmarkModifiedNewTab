import type {PagePresentation, PlacementPresentation} from '../../workspace/pageTypes';

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 1000;
function only(v: Record<string, unknown>, keys: string[]) {return Object.keys(v).every(key => keys.includes(key));}
export function validateGeometry(v: {x: number; y: number; width: number; height: number}) {
    if (!finite(v.x, -1e6, 1e6) || !finite(v.y, -1e6, 1e6) || !finite(v.width, 80, 10000) || !finite(v.height, 80, 10000)) {
        throw new Error('Invalid page geometry.');
    }
}
export function validatePlacementPresentation(v: unknown): asserts v is PlacementPresentation {
    if (!record(v) || !only(v, ['order', 'groupId', 'collapsed', 'color']) || !Number.isSafeInteger(v.order) ||
        typeof v.collapsed !== 'boolean' || !['default', 'blue', 'green', 'yellow', 'purple'].includes(String(v.color)) ||
        (v.groupId !== undefined && !id(v.groupId))) throw new Error('Invalid placement presentation.');
}
export function validatePagePresentation(v: unknown): asserts v is PagePresentation {
    if (!record(v) || !only(v, ['version', 'ownerEntityId', 'revision', 'mode', 'viewport', 'groups', 'connectors']) ||
        v.version !== 1 || !id(v.ownerEntityId) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 ||
        !['document', 'canvas', 'mixed'].includes(String(v.mode)) || !record(v.viewport) ||
        !only(v.viewport, ['x', 'y', 'zoom']) || !finite(v.viewport.x, -1e6, 1e6) || !finite(v.viewport.y, -1e6, 1e6) ||
        !finite(v.viewport.zoom, 0.1, 4) || !Array.isArray(v.groups) || !Array.isArray(v.connectors) ||
        v.groups.length > 10000 || v.connectors.length > 10000) throw new Error('Invalid page presentation.');
    const groups = new Map<string, string | undefined>();
    for (const g of v.groups) {
        if (!record(g) || !only(g, ['id', 'label', 'parentId', 'collapsed']) || !id(g.id) ||
            typeof g.label !== 'string' || g.label.length > 500 || typeof g.collapsed !== 'boolean' ||
            (g.parentId !== undefined && !id(g.parentId)) || groups.has(String(g.id))) throw new Error('Invalid page group.');
        groups.set(String(g.id), g.parentId as string | undefined);
    }
    for (const start of groups.keys()) {
        const seen = new Set<string>();
        let current: string | undefined = start;
        while (current !== undefined) {
            if (seen.has(current)) throw new Error('Page group cycle.');
            if (!groups.has(current)) throw new Error('Missing parent group.');
            seen.add(current);
            current = groups.get(current);
        }
    }
    const connectors = new Set<string>();
    for (const c of v.connectors) {
        if (!record(c) || !only(c, ['id', 'relationshipId', 'fromPlacementId', 'toPlacementId', 'points', 'color', 'dashed', 'mode']) ||
            !['id', 'relationshipId', 'fromPlacementId', 'toPlacementId'].every(key => id(c[key])) ||
            c.fromPlacementId === c.toPlacementId || connectors.has(String(c.id)) ||
            typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color) || typeof c.dashed !== 'boolean' ||
            !['straight', 'orthogonal', 'curve'].includes(String(c.mode)) || !Array.isArray(c.points) || c.points.length > 1000 ||
            c.points.some(p => !record(p) || !only(p, ['x', 'y']) || !finite(p.x, -1e6, 1e6) || !finite(p.y, -1e6, 1e6))) {
            throw new Error('Invalid page connector.');
        }
        connectors.add(String(c.id));
    }
}
