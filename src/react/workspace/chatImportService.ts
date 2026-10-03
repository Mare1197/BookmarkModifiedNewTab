import type {WorkspaceEntity} from '../../workspace/types';
import {importConversation} from './brainRepository';
import type {PreparedAttachment, PreparedConversation, PreparedMessage} from './chatExportAdapters';
import {workspaceClient} from './workspaceClient';

export type ConflictPolicy = 'preserve-local' | 'take-source';
export type ImportObjectStatus = 'new' | 'updated' | 'unchanged';

export interface ImportPreviewItem {
    id: string;
    type: 'conversation' | 'message';
    title: string;
    status: ImportObjectStatus;
    conflict: boolean;
}

export interface ConversationImportPreview {
    conversationCount: number;
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    conflictCount: number;
    items: ImportPreviewItem[];
    warnings: string[];
}

interface SourceWithTimestamps {
    provider: string;
    externalId: string;
    url?: string;
    createdAt?: number;
    updatedAt?: number;
}

interface DesiredObject {
    id: string;
    type: 'conversation' | 'message';
    title: string;
    matches: (existing: WorkspaceEntity) => boolean;
}

const canonicalId = (...parts: string[]) => parts.map(encodeURIComponent).join(':');

function sourceOf(entity: WorkspaceEntity): SourceWithTimestamps | undefined {
    return entity.source as SourceWithTimestamps | undefined;
}

function sameAttachments(existing: unknown, incoming: PreparedAttachment[] | undefined): boolean {
    if ((existing === undefined || Array.isArray(existing) && existing.length === 0) &&
        (incoming === undefined || incoming.length === 0)) return true;
    if (!Array.isArray(existing) || !incoming || existing.length !== incoming.length) return false;
    return incoming.every((attachment, index) => {
        const current = existing[index];
        if (!current || typeof current !== 'object' || Array.isArray(current)) return false;
        const value = current as Record<string, unknown>;
        return value.id === attachment.id && value.name === attachment.name &&
            value.mimeType === attachment.mimeType && value.url === attachment.url;
    });
}

function sameSource(entity: WorkspaceEntity, provider: string, externalId: string,
    createdAt?: number, updatedAt?: number, url?: string): boolean {
    const source = sourceOf(entity);
    return source?.provider.toLocaleLowerCase() === provider.toLocaleLowerCase() &&
        source.externalId === externalId && source.createdAt === createdAt && source.updatedAt === updatedAt &&
        source.url === url;
}

function conversationObject(conversation: PreparedConversation): DesiredObject {
    const provider = conversation.provider.toLocaleLowerCase();
    return {
        id: canonicalId('conversation', provider, conversation.sourceId),
        type: 'conversation',
        title: conversation.title,
        matches: existing => existing.type === 'conversation' && existing.title === conversation.title &&
            existing.canonicalUrl === conversation.url && sameSource(existing, provider, conversation.sourceId,
                conversation.createdAt, conversation.updatedAt, conversation.url)
    };
}

function messageObject(conversation: PreparedConversation, message: PreparedMessage): DesiredObject {
    const provider = conversation.provider.toLocaleLowerCase();
    return {
        id: canonicalId('message', provider, conversation.sourceId, message.id),
        type: 'message',
        title: message.role + ': ' + message.text.slice(0, 80),
        matches: existing => existing.type === 'message' && existing.metadata?.body === message.text &&
            existing.properties?.role === message.role && existing.metadata?.parentMessageId === message.parentId &&
            sameAttachments(existing.metadata?.attachments, message.attachments) &&
            sameSource(existing, provider, message.id, message.createdAt, message.updatedAt, conversation.url)
    };
}

function desiredObjects(conversations: PreparedConversation[]): DesiredObject[] {
    const objects: DesiredObject[] = [];
    const ids = new Set<string>();
    conversations.forEach(conversation => {
        const conversationEntry = conversationObject(conversation);
        const entries = [conversationEntry, ...conversation.messages.map(message => messageObject(conversation, message))];
        entries.forEach(entry => {
            if (ids.has(entry.id)) throw new Error('Duplicate prepared object ID "' + entry.id + '".');
            ids.add(entry.id);
            objects.push(entry);
        });
    });
    return objects;
}

export async function previewConversationImport(
    conversations: PreparedConversation[]
): Promise<ConversationImportPreview> {
    const desired = desiredObjects(conversations);
    const existing = await workspaceClient.entities.bulkGet(desired.map(item => item.id));
    const items = desired.map((item, index): ImportPreviewItem => {
        const current = existing[index];
        const status: ImportObjectStatus = !current ? 'new' : item.matches(current) ? 'unchanged' : 'updated';
        return {id: item.id, type: item.type, title: item.title, status,
            conflict: status === 'updated' && Boolean(current?.metadata?.workspaceEditedAt)};
    });
    const warnings = conversations.flatMap(conversation => (conversation.warnings || []).map(warning =>
        conversation.provider + ' / ' + conversation.sourceId + ': ' + warning));
    return {
        conversationCount: conversations.length,
        newCount: items.filter(item => item.status === 'new').length,
        updatedCount: items.filter(item => item.status === 'updated').length,
        unchangedCount: items.filter(item => item.status === 'unchanged').length,
        conflictCount: items.filter(item => item.conflict).length,
        items,
        warnings
    };
}

export async function applyConversationImport(
    conversations: PreparedConversation[],
    conflictPolicy: ConflictPolicy = 'preserve-local'
): Promise<{imported: number; conflictPolicy: ConflictPolicy}> {
    if (conflictPolicy !== 'preserve-local' && conflictPolicy !== 'take-source') {
        throw new Error('Invalid conflict policy.');
    }
    desiredObjects(conversations); // Reject duplicate IDs before any writes.
    await workspaceClient.transaction('rw', [workspaceClient.entities, workspaceClient.relationships,
        workspaceClient.sourceRefs, workspaceClient.activities], async () => {
        for (const conversation of conversations) {
            await importConversation(conversation, {conflictPolicy});
        }
    });
    return {imported: conversations.length, conflictPolicy};
}
