import {placementPresentation, type PageSnapshot} from './pageRepository';

// The native document is disposable; this plan retains canonical identities and
// geometry and never hydrates content or mutates the supplied page snapshot.
export function planNativeProjection(snapshot: PageSnapshot) {
    const entitiesById = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    const placementsById = new Map(snapshot.placements.map(placement => [placement.id, placement]));
    const groupsById = new Map(snapshot.presentation.groups.map(group => [group.id, group]));
    const collapsedGroups = new Map<string, boolean>();
    for (const start of groupsById.keys()) {
        let current: string | undefined = start;
        const path: string[] = [], seen = new Set<string>();
        while (current !== undefined && !collapsedGroups.has(current)) {
            if (seen.has(current)) throw new Error('Page group cycle.');
            const group = groupsById.get(current);
            if (!group) throw new Error('Missing parent group.');
            seen.add(current); path.push(current); current = group.parentId;
        }
        let collapsed = current === undefined ? false : collapsedGroups.get(current)!;
        for (let i = path.length - 1; i >= 0; i--) {
            const id = path[i]!;
            collapsed ||= groupsById.get(id)!.collapsed;
            collapsedGroups.set(id, collapsed);
        }
    }
    const placements = snapshot.placements.map((p, index) => ({p, presentation: placementPresentation(p, index)}))
        .sort((a, b) => a.presentation.order - b.presentation.order);
    const collapsedByPlacement = new Map<string, boolean>();
    const groupChildren = new Map(snapshot.presentation.groups.map(group => [group.id, [] as string[]]));
    for (const {p, presentation} of placements) {
        const groupId = presentation.groupId;
        if (groupId !== undefined && !groupsById.has(groupId)) throw new Error('Missing placement group.');
        collapsedByPlacement.set(p.id, presentation.collapsed || (groupId !== undefined && collapsedGroups.get(groupId)!) || false);
        if (groupId !== undefined) groupChildren.get(groupId)!.push(p.id);
    }
    // Existing projection skips unavailable connector endpoints. Keep offscreen
    // endpoints, which are represented by the complete placement map.
    const connectors = snapshot.presentation.connectors.filter(connector =>
        placementsById.has(connector.fromPlacementId) && placementsById.has(connector.toPlacementId));
    const connectorsById = new Map(connectors.map(connector => [connector.id, connector]));
    return {placements, entitiesById, placementsById, groupsById, collapsedByPlacement, groupChildren, connectors, connectorsById};
}
export type NativeProjectionPlan = ReturnType<typeof planNativeProjection>;
