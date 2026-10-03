import {workspaceClient as db} from './workspaceClient';
import type {EntityType, MemoryPolicy, RelationshipRecord, WorkspaceEntity, WorkspaceTaskStatus} from '../../workspace/types';
import {validateBrainView, validateMemoryPolicy, validateTileLayout} from './brainValidation';
import type {BrainQuery} from './brainSelectors';
import {syncTaskReminder} from './taskReminders';
import {captureEntityTransition} from './revisionRepository';

export const BRAIN_TYPES: EntityType[] = ['project', 'conversation', 'message', 'note', 'idea', 'memory',
    'task', 'prompt', 'repository', 'file', 'image', 'automation', 'automation-run', 'feature',
    'codex-session', 'commit', 'website', 'bookmark', 'browser-visit', 'tab', 'search',
    'analysis', 'clip', 'document', 'folder', 'page', 'screenshot'];
export const BRAIN_STATUSES: WorkspaceTaskStatus[] = ['backlog', 'next', 'in-progress', 'blocked', 'done'];
const id = (prefix: string) => prefix + ':' + crypto.randomUUID();
const key = (...parts: string[]) => parts.map(part => encodeURIComponent(part)).join(':');
const terms = (text: string) => [...new Set(text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))];

function required(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required.');
    return value.trim();
}

function safeUrl(value?: string): string | undefined {
    if (!value) return undefined;
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        return url.href;
    } catch { throw new Error('Source URL must be HTTP or HTTPS.'); }
}

async function object(entityId: string) {
    const entity = await db.entities.get(entityId);
    if (!entity) throw new Error('The referenced object no longer exists.');
    return entity;
}

async function activity(entityId: string, type: string, summary: string) {
    await db.activities.add({id: id('activity'), entityId, type, summary, createdAt: Date.now()});
}

export async function createBrainObject(input: {type: EntityType; title: string; body?: string; tags?: string[]}) {
    if (!BRAIN_TYPES.includes(input.type)) throw new Error('Unsupported object type.');
    const title = required(input.title, 'Title');
    const timestamp = Date.now();
    const entity: WorkspaceEntity = {id: id(input.type), type: input.type, title,
        createdAt: timestamp, updatedAt: timestamp, inboxAt: input.type === 'project' ? undefined : timestamp,
        searchTerms: terms(title + ' ' + (input.body || '')), tags: input.tags || [],
        properties: input.type === 'task' ? {} : {status: 'backlog'}, metadata: {body: input.body || '', sourceKind: 'user'},
        ...(input.type === 'memory' ? {memory: {status: 'active' as const, excludedFromAI: false, scope: 'project' as const, reviewedAt: timestamp}} : {})};
    await db.transaction('rw', [db.entities, db.tasks, db.activities, db.workspaceRevisions], async () => {
        await db.entities.add(entity);
        await captureEntityTransition(undefined, entity, 'created');
        if (entity.type === 'task') await db.tasks.add({id: id('task'), entityId: entity.id,
            status: 'backlog', dependencyIds: [], createdAt: timestamp, updatedAt: timestamp});
        await activity(entity.id, 'object-created', 'Created ' + entity.type + ': ' + title);
    });
    return entity;
}

// Validate before writing and again within the relationship transaction to prevent races.
async function validateLink(fromId: string, toId: string, type: string) {
    const from = await object(fromId);
    const to = await object(toId);
    if (fromId === toId) throw new Error('An object cannot link to itself.');
    if (type !== 'project-member') return;
    if (to.type !== 'project') throw new Error('Membership destination must be a project.');
    if (from.type !== 'project') return;
    const links = (await db.relationships.toArray()).filter(link => link.confirmed && link.type === 'project-member');
    const pending = [toId];
    const visited = new Set<string>();
    while (pending.length) {
        const current = pending.pop()!;
        if (current === fromId) throw new Error('Project membership would create a cycle.');
        if (visited.has(current)) continue;
        visited.add(current);
        links.filter(link => link.fromEntityId === current).forEach(link => pending.push(link.toEntityId));
    }
}

function relation(fromEntityId: string, toEntityId: string, type: string): RelationshipRecord {
    const timestamp = Date.now();
    return {id: key('brain-link', fromEntityId, toEntityId, type), fromEntityId, toEntityId, type,
        origin: 'user', confirmed: true, createdAt: timestamp, updatedAt: timestamp};
}

export async function linkBrainObjects(fromId: string, toId: string, type = 'related') {
    required(type, 'Relationship type');
    await db.transaction('rw', [db.entities, db.relationships, db.activities], async () => {
        await validateLink(fromId, toId, type);
        const existing = (await db.relationships.where('fromEntityId').equals(fromId).toArray())
            .find(link => link.toEntityId === toId && link.type === type && link.confirmed);
        if (existing) return;
        await db.relationships.put(relation(fromId, toId, type));
        await activity(fromId, 'object-linked', type + ' → ' + (await object(toId)).title);
    });
}

export interface ConversationImport {
    provider: string;
    sourceId: string;
    title: string;
    url?: string;
    createdAt?: number;
    updatedAt?: number;
    messages: {id: string; role: string; text: string; createdAt?: number; updatedAt?: number; parentId?: string;
        attachments?: {id: string; name: string; mimeType?: string; url?: string}[]}[];
}

export async function importConversation(input: ConversationImport, options: {conflictPolicy?: 'preserve-local' | 'take-source'} = {}): Promise<WorkspaceEntity> {
    if (options.conflictPolicy && !['preserve-local', 'take-source'].includes(options.conflictPolicy)) throw new Error('Invalid conflict policy.');
    const preserve = options.conflictPolicy !== 'take-source';
    const dates = (value: {createdAt?: number; updatedAt?: number}) => {
        for (const date of [value.createdAt, value.updatedAt]) if (date !== undefined &&
            (typeof date !== 'number' || !Number.isFinite(date) || date < 0)) throw new Error('Invalid source timestamp.');
    };
    dates(input);
    const provider = required(input?.provider, 'Provider').toLocaleLowerCase();
    const sourceId = required(input.sourceId, 'Conversation source ID');
    const title = required(input.title, 'Title');
    const url = safeUrl(input.url);
    if (!Array.isArray(input.messages) || input.messages.length > 10000) throw new Error('Invalid messages (maximum 10000).');
    const seen = new Set<string>();
    input.messages.forEach(message => {
        const messageId = required(message?.id, 'Message ID');
        if (seen.has(messageId)) throw new Error('Duplicate message ID.');
        seen.add(messageId);
        required(message.role, 'Message role');
        if (typeof message.text !== 'string') throw new Error('Message text is required.');
        dates(message);
        if (message.parentId !== undefined) required(message.parentId, 'Parent message ID');
        if (message.attachments !== undefined) {
            if (!Array.isArray(message.attachments) || message.attachments.length > 1000) throw new Error('Invalid attachments.');
            message.attachments.forEach(attachment => {
                required(attachment.id, 'Attachment ID'); required(attachment.name, 'Attachment name');
                safeUrl(attachment.url);
                if (attachment.mimeType !== undefined && typeof attachment.mimeType !== 'string') throw new Error('Invalid attachment MIME type.');
            });
        }
    });
    const conversationId = key('conversation', provider, sourceId);
    return db.transaction('rw', [db.entities, db.sourceRefs, db.relationships, db.activities], async () => {
        const timestamp = Date.now();
        const existing = await db.entities.get(conversationId);
        const conversation: WorkspaceEntity = {...existing, id: conversationId, type: 'conversation',
            title: preserve && existing?.metadata?.workspaceEditedAt ? existing.title : title,
            source: {provider, externalId: sourceId, url, createdAt: input.createdAt, updatedAt: input.updatedAt}, canonicalUrl: url,
            createdAt: existing?.createdAt || timestamp, updatedAt: timestamp,
            inboxAt: existing ? existing.inboxAt : timestamp,
            searchTerms: terms(preserve && existing?.metadata?.workspaceEditedAt ? existing.title : title),
            metadata: {...existing?.metadata, ...(!preserve ? {workspaceEditedAt: undefined} : {}), sourceKind: 'ai-chat'}};
        await db.entities.put(conversation);
        const sourceRef = async (entityId: string, externalId: string) => {
            const sourceKey = key('ai-chat', entityId);
            const previous = await db.sourceRefs.get(sourceKey);
            await db.sourceRefs.put({id: sourceKey, sourceKey, sourceKind: 'ai-chat', sourceId: externalId,
                entityId, createdAt: previous?.createdAt || timestamp, updatedAt: timestamp,
                metadata: {provider, url}});
        };
        await sourceRef(conversationId, sourceId);
        for (const [index, message] of input.messages.entries()) {
            const messageId = key('message', provider, sourceId, message.id.trim());
            const prior = await db.entities.get(messageId);
            const body = preserve && prior?.metadata?.workspaceEditedAt ? String(prior.metadata.body || '') : message.text;
            await db.entities.put({...prior, id: messageId, type: 'message',
                title: preserve && prior?.metadata?.workspaceEditedAt ? prior.title : message.role + ': ' + body.slice(0, 80),
                source: {provider, externalId: message.id, url, createdAt: message.createdAt, updatedAt: message.updatedAt},
                createdAt: prior?.createdAt || timestamp, updatedAt: timestamp,
                searchTerms: terms(body), properties: {...prior?.properties, role: message.role, sequence: index},
                metadata: {...prior?.metadata, ...(!preserve ? {workspaceEditedAt: undefined} : {}), body, sourceKind: 'ai-chat',
                    parentMessageId: message.parentId, attachments: message.attachments || []}});
            await sourceRef(messageId, key(sourceId, message.id));
            const link = relation(messageId, conversationId, 'message-of');
            if (!await db.relationships.get(link.id)) await db.relationships.add({...link, origin: 'imported'});
        }
        if (!existing) await activity(conversation.id, 'conversation-imported', 'Imported ' + provider + ': ' + title);
        return conversation;
    });
}

export async function createSourcedMemory(sourceId: string, title: string, body: string) {
    required(body, 'Memory content');
    return db.transaction('rw', [db.entities, db.tasks, db.relationships, db.activities, db.workspaceRevisions], async () => {
        await object(sourceId);
        const memory = await createBrainObject({type: 'memory', title, body});
        await linkBrainObjects(memory.id, sourceId, 'derived-from');
        const memberships = (await db.relationships.where('fromEntityId').equals(sourceId).toArray())
            .filter(link => link.confirmed && link.type === 'project-member');
        for (const membership of memberships) await linkBrainObjects(memory.id, membership.toEntityId, 'project-member');
        return memory;
    });
}

export async function setBrainStatus(entityId: string, status: WorkspaceTaskStatus) {
    if (!BRAIN_STATUSES.includes(status)) throw new Error('Invalid status.');
    await db.transaction('rw', [db.entities, db.tasks, db.activities], async () => {
        const entity = await object(entityId);
        const timestamp = Date.now();
        const task = await db.tasks.where('entityId').equals(entityId).first();
        // Existing task records remain the sole authority for task status.
        if (task) {
            await db.tasks.update(task.id, {status, updatedAt: timestamp,
                completedAt: status === 'done' ? timestamp : undefined});
            await db.entities.update(entityId, {updatedAt: timestamp});
        }
        else await db.entities.update(entityId, {properties: {...entity.properties, status}, updatedAt: timestamp});
        await activity(entityId, 'status-changed', entity.title + ' → ' + status);
    });
    const task = await db.tasks.where('entityId').equals(entityId).first();
    if (task) await syncTaskReminder(task, (await object(entityId)).title);
}

export async function setMemoryPolicy(entityId: string, patch: Partial<MemoryPolicy>) {
    await db.transaction('rw', [db.entities, db.activities], async () => {
        const entity = await object(entityId);
        if (entity.type !== 'memory') throw new Error('Select a memory first.');
        const memory: MemoryPolicy = {status: 'active', excludedFromAI: false, scope: 'project', ...entity.memory, ...patch};
        validateMemoryPolicy(memory);
        await db.entities.update(entityId, {memory, updatedAt: Date.now()});
        await activity(entityId, 'memory-policy-changed', memory.status === 'forgotten' ? 'Memory forgotten (retained for audit)' : 'Memory controls updated');
    });
}

// Transparent offline candidate generator, NOT a model/AI inference service.
export async function suggestInboxProjects() {
    await db.transaction('rw', [db.entities, db.relationships], async () => {
        const entities = await db.entities.toArray();
        const projects = entities.filter(entity => entity.type === 'project');
        const existing = new Set((await db.relationships.toArray()).map(link =>
            key(link.fromEntityId, link.toEntityId, link.type)));
        for (const entity of entities.filter(item => item.inboxAt && item.type !== 'project')) {
            const words = new Set(terms(entity.title + ' ' + String(entity.metadata?.body || '') + ' ' + (entity.tags || []).join(' ')));
            for (const project of projects) {
                if (existing.has(key(entity.id, project.id, 'project-member'))) continue;
                const tokens = terms(project.title).filter(word => word.length > 2);
                const matches = tokens.filter(word => words.has(word));
                if (!tokens.length || matches.length < Math.min(2, tokens.length)) continue;
                const link = relation(entity.id, project.id, 'project-member');
                await db.relationships.add({...link, origin: 'rule-suggested', confirmed: false,
                    reviewStatus: 'pending', confidence: matches.length / tokens.length,
                    generator: 'local-keyword-v1', evidence: ['Shared project keywords: ' + matches.join(', ')]});
            }
        }
    });
}

export async function reviewRelationship(relationshipId: string, decision: 'accepted' | 'rejected') {
    if (!['accepted', 'rejected'].includes(decision)) throw new Error('Invalid review decision.');
    await db.transaction('rw', [db.entities, db.relationships, db.activities], async () => {
        const link = await db.relationships.get(relationshipId);
        if (!link || link.confirmed || link.reviewStatus === 'rejected') throw new Error('Suggestion is no longer pending.');
        if (decision === 'accepted') await validateLink(link.fromEntityId, link.toEntityId, link.type);
        await db.relationships.update(link.id, {confirmed: decision === 'accepted', reviewStatus: decision, updatedAt: Date.now()});
        if (decision === 'accepted' && link.type === 'project-member') {
            await db.entities.update(link.fromEntityId, {inboxAt: undefined, updatedAt: Date.now()});
        }
        await activity(link.fromEntityId, 'relationship-reviewed', decision + ': ' + link.type);
    });
}

export interface TileLayout {order: number; width: number}
export async function loadTileLayout(scope: string): Promise<Record<string, TileLayout>> {
    const value = (await db.settings.get(key('brain-tiles', scope)))?.value ?? {};
    validateTileLayout(value);
    return value;
}
export async function saveTileLayout(scope: string, entityId: string, layout: TileLayout) {
    if (!Number.isFinite(layout.order) || ![1, 2, 3].includes(layout.width)) throw new Error('Invalid tile layout.');
    await db.transaction('rw', [db.entities, db.settings], async () => {
        await object(entityId);
        const previous = await loadTileLayout(scope);
        await db.settings.put({key: key('brain-tiles', scope), value: {...previous, [entityId]: layout}, updatedAt: Date.now()});
    });
}

export async function openBrainCanvas(entityId: string, activeBoardId?: string): Promise<string> {
    return db.transaction('rw', [db.entities, db.relationships, db.boards, db.placements, db.activities], async () => {
        const entity = await object(entityId);
        const timestamp = Date.now();
        const boardId = entity.type === 'project' ? key('project-board', entity.id) : activeBoardId;
        if (!boardId) throw new Error('Select a board first.');
        if (entity.type === 'project') {
            const existing = await db.boards.get(boardId);
            if (!existing) await db.boards.add({id: boardId, name: entity.title, createdAt: timestamp, updatedAt: timestamp});
        } else if (!await db.boards.get(boardId)) throw new Error('Board no longer exists.');
        const members = entity.type === 'project' ? (await db.relationships.where('toEntityId').equals(entity.id).toArray())
            .filter(link => link.confirmed && link.type === 'project-member').map(link => link.fromEntityId) : [];
        const placements = await db.placements.where('boardId').equals(boardId).toArray();
        const placed = new Set(placements.map(item => item.entityId));
        const bottom = placements.reduce((max, item) => Math.max(max, item.y + item.height), -20) + 40;
        let added = 0;
        for (const memberId of new Set([entity.id, ...members])) {
            if (placed.has(memberId)) continue;
            const member = await object(memberId);
            await db.placements.add({id: id('placement'), boardId, entityId: memberId, kind: member.type,
                x: 40 + (added % 3) * 320, y: bottom + Math.floor(added / 3) * 200,
                width: 280, height: 160, zIndex: timestamp, createdAt: timestamp, updatedAt: timestamp});
            added++;
        }
        if (added) await activity(entity.id, 'canvas-opened', 'Added references to canvas');
        return boardId;
    });
}

export interface BrainView {name: string; query: BrainQuery; mode: 'Table' | 'Kanban' | 'Tiles' | 'Timeline' | 'AI Inbox'}
export async function saveBrainView(name: string, query: BrainQuery, mode: BrainView['mode']) {
    const title = required(name, 'View name');
    validateBrainView({name: title, query, mode});
    if (!['Table', 'Kanban', 'Tiles', 'Timeline', 'AI Inbox'].includes(mode)) throw new Error('Invalid view mode.');
    await db.settings.put({key: key('brain-view', title), value: {name: title, query, mode}, updatedAt: Date.now()});
}
export async function loadBrainViews(): Promise<BrainView[]> {
    const settings = await db.settings.where('key').startsWith('brain-view:').toArray();
    return settings.map(setting => { validateBrainView(setting.value); return setting.value; });
}

export async function syncObjectMentions(entityId: string) {
    await db.transaction('rw', [db.entities, db.relationships], async () => {
        const entity = await object(entityId);
        const body = String(entity.metadata?.body || '');
        const ids = new Set([...body.matchAll(/\[\[([^\]\r\n]+)\]\]/g)].map(match => match[1]!));
        const prior = (await db.relationships.where('fromEntityId').equals(entityId).toArray())
            .filter(link => link.generator === 'explicit-object-mention-v1');
        for (const link of prior) if (!ids.has(link.toEntityId)) await db.relationships.delete(link.id);
        for (const targetId of ids) {
            if (targetId === entityId || !await db.entities.get(targetId)) continue;
            const link = relation(entityId, targetId, 'mentions');
            link.id = key('mention', entityId, targetId);
            if (!await db.relationships.get(link.id)) await db.relationships.add({...link,
                generator: 'explicit-object-mention-v1', evidence: ['Explicit [[' + targetId + ']] reference']});
        }
    });
}
