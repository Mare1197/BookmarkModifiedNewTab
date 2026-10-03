import type {RelationshipRecord, WorkspaceEntity} from '../../workspace/types';

export interface ContextItem {id: string; reason: string; sourceIds: string[]}
export function memoryExclusion(entity: WorkspaceEntity, selectedId: string, now = Date.now()): string | undefined {
    if (entity.type !== 'memory') return;
    if (entity.memory?.status === 'forgotten') return 'Forgotten memory';
    if (entity.memory?.excludedFromAI) return 'Excluded from AI';
    if (entity.memory?.scope === 'private' && entity.id !== selectedId) return 'Private memory';
    if (entity.memory?.reviewBy !== undefined && entity.memory.reviewBy <= now) return 'Review overdue';
}
export function buildBrainContext(entityId: string, entities: WorkspaceEntity[], relationships: RelationshipRecord[],
    options: {maxCharacters?: number; now?: number; includeConnected?: boolean} = {}) {
    const max = Math.max(0, Math.min(24000, Math.floor(options.maxCharacters ?? 24000)));
    const links = relationships.filter(link => link.confirmed);
    const projects = new Set(links.filter(link => link.fromEntityId === entityId && link.type === 'project-member').map(link => link.toEntityId));
    const selected = entities.find(entity => entity.id === entityId);
    if (selected?.type === 'project') projects.add(entityId);
    const direct = new Map(links.filter(link => link.toEntityId === entityId && ['message-of', 'derived-from'].includes(link.type))
        .map(link => [link.fromEntityId, link.type]));
    const projectMemories = new Set(links.filter(link => link.type === 'project-member' && projects.has(link.toEntityId)).map(link => link.fromEntityId));
    const words = new Set((selected?.searchTerms || []).filter(word => word.length > 2));
    const sources = new Map<string, string[]>();
    for (const link of links) if (link.type === 'derived-from') sources.set(link.fromEntityId, [...(sources.get(link.fromEntityId) || []), link.toEntityId]);
    const conflicting = new Set(links.filter(link => link.type === 'contradicts').flatMap(link => [link.fromEntityId, link.toEntityId]));
    const candidates = entities.filter(entity => entity.id === entityId || (options.includeConnected !== false &&
        (direct.has(entity.id) || (entity.type === 'memory' && projectMemories.has(entity.id))))).map(entity => ({entity,
        score: entity.id === entityId ? 10000 : (direct.has(entity.id) ? 1000 : 100) + entity.searchTerms.filter(word => words.has(word)).length,
        reason: entity.id === entityId ? 'Selected object' : direct.has(entity.id) ? 'Directly connected evidence' : 'Shared project memory'}))
        .sort((a, b) => b.score - a.score || Number(a.entity.properties?.sequence || 0) - Number(b.entity.properties?.sequence || 0) || a.entity.id.localeCompare(b.entity.id));
    const included: ContextItem[] = [], excluded: ContextItem[] = [];
    let text = '';
    for (const {entity, reason} of candidates) {
        const item = {id: entity.id, reason, sourceIds: sources.get(entity.id) || []};
        const denied = memoryExclusion(entity, entityId, options.now) || (entity.type === 'memory' && conflicting.has(entity.id) ? 'Conflicting memory requires review' : undefined);
        if (denied) { excluded.push({...item, reason: denied}); continue; }
        const block = '[' + entity.id + '] ' + entity.type + ': ' + entity.title + '\n' + String(entity.metadata?.body || entity.canonicalUrl || '') +
            (item.sourceIds.length ? '\nSources: ' + item.sourceIds.join(', ') : '');
        if (text.length + block.length + (text ? 2 : 0) > max) { excluded.push({...item, reason: 'Context budget'}); continue; }
        text += (text ? '\n\n' : '') + block;
        included.push(item);
    }
    return {text, included, excluded};
}
