import type {PageSnapshot} from './pageRepository';

export function createPageLookups(snapshot: Pick<PageSnapshot, 'entities' | 'placements'>) {
    const entitiesById = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    const placementsById = new Map(snapshot.placements.map(placement => [placement.id, placement]));
    return {entitiesById, placementsById,
        titleForPlacement(id: string, fallback = 'Missing object') {
            const entityId = placementsById.get(id)?.entityId;
            return (entityId && entitiesById.get(entityId)?.title) || fallback;
        }};
}
