import type {BoardPlacement, RelationshipRecord, WorkspaceEntity, WorkspaceTask} from '../../workspace/types';
import {buildBrainContext} from './brainContext';
export {buildBrainContext} from './brainContext';

export function objectConnections(entityId: string, relationships: RelationshipRecord[]) {
    const related = relationships.filter(link => link.confirmed &&
        (link.fromEntityId === entityId || link.toEntityId === entityId));
    const outgoing = related.filter(link => link.fromEntityId === entityId);
    const incoming = related.filter(link => link.toEntityId === entityId);
    return {
        related, outgoing, incoming,
        mentionedIn: incoming.filter(link => link.type === 'mentions'),
        projects: outgoing.filter(link => link.type === 'project-member'),
        sources: outgoing.filter(link => link.type === 'derived-from')
    };
}

export function projectMembers(entities: WorkspaceEntity[], relationships: RelationshipRecord[], projectId: string) {
    const ids = new Set(relationships.filter(link => link.confirmed && link.type === 'project-member' &&
        link.toEntityId === projectId).map(link => link.fromEntityId));
    return entities.filter(entity => ids.has(entity.id));
}

export function brainStatus(entity: WorkspaceEntity, tasks: WorkspaceTask[]): string {
    return tasks.find(task => task.entityId === entity.id)?.status || String(entity.properties?.status || 'backlog');
}

export interface BrainQuery {projectId?: string; query?: string; type?: string; status?: string; sort?: 'title' | 'updated'}
export function queryBrain(entities: WorkspaceEntity[], links: RelationshipRecord[], tasks: WorkspaceTask[], query: BrainQuery) {
    const collection = query.projectId ? projectMembers(entities, links, query.projectId) : entities;
    const words = (query.query || '').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return collection.filter(entity => (!query.type || entity.type === query.type) &&
        (!query.status || brainStatus(entity, tasks) === query.status) &&
        words.every(word => [entity.title, entity.canonicalUrl || '', String(entity.metadata?.body || ''),
            ...(entity.tags || [])].join(' ').toLocaleLowerCase().includes(word)))
        .sort((a, b) => query.sort === 'updated' ? b.updatedAt - a.updatedAt || a.id.localeCompare(b.id) :
            a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

// An ephemeral view projection, never persisted as real board placements.
export function graphProjection(allEntities: WorkspaceEntity[], relationships: RelationshipRecord[], options: {entityIds?: Set<string>; limit?: number} = {}) {
    const scoped = options.entityIds ? allEntities.filter(entity => options.entityIds!.has(entity.id)) : allEntities;
    const entities = [...scoped].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, options.limit ?? 200);
    const ids = new Set(entities.map(entity => entity.id));
    const placements: BoardPlacement[] = entities.map((entity, index) => ({id: 'graph:' + entity.id,
        boardId: 'graph', entityId: entity.id, kind: entity.type, x: (index % 4) * 310,
        y: Math.floor(index / 4) * 220, width: 280, height: 150, zIndex: 0, createdAt: 0, updatedAt: 0}));
    return {placements, total: scoped.length, relationships: relationships.filter(link => link.confirmed &&
        ids.has(link.fromEntityId) && ids.has(link.toEntityId))};
}

export function projectResumePreview(projectId: string, entities: WorkspaceEntity[], relationships: RelationshipRecord[], openUrls: string[] = []) {
    const normalized = (value?: string) => {
        try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; }
        catch { return undefined; }
    };
    const seen = new Set(openUrls.map(normalized).filter(Boolean));
    return projectMembers(entities, relationships, projectId).sort((a, b) => b.updatedAt - a.updatedAt).flatMap(entity => {
        const url = normalized(entity.canonicalUrl || entity.source?.url);
        if (!url || seen.has(url)) return [];
        seen.add(url);
        return [{entityId: entity.id, title: entity.title, url}];
    });
}

export function brainContext(entityId: string, entities: WorkspaceEntity[], relationships: RelationshipRecord[]): string {
    return buildBrainContext(entityId, entities, relationships).text;
}
