import {workspaceClient as db} from './workspaceClient';
import {syncObjectMentions} from './brainRepository';
import {richContentToPlainText, validateRichContent} from './richContent';
import type {RichContent} from '../../workspace/pageTypes';
import type {WorkspaceEntity} from '../../workspace/types';

export function saveRichContent(entityId: string, expectedRevision: number, content: RichContent): Promise<WorkspaceEntity> {
    validateRichContent(content);
    const draft = structuredClone(content);
    return db.transaction('rw', [db.entities, db.relationships, db.activities], async () => {
        const current = await db.entities.get(entityId);
        if (!current) throw new Error('Object no longer exists.');
        if (!['note', 'document'].includes(current.type)) throw new Error('Only notes and documents support rich text.');
        if (!Number.isSafeInteger(expectedRevision) || (current.contentRevision || 0) !== expectedRevision) {
            throw new Error('Content conflict: another view changed this object. Your draft is retained.');
        }
        const body = richContentToPlainText(draft), time = Date.now();
        const next: WorkspaceEntity = {...current, richContent: draft, contentRevision: expectedRevision + 1, updatedAt: time,
            metadata: {...current.metadata, body, workspaceEditedAt: time},
            searchTerms: [...new Set([current.title, current.canonicalUrl, body].filter(Boolean).join(' ').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))]};
        await db.entities.put(next);
        await syncObjectMentions(entityId);
        await db.activities.add({id: 'activity:' + crypto.randomUUID(), entityId, type: 'rich-content-updated',
            summary: 'Updated canonical rich text', createdAt: time});
        return next;
    });
}
