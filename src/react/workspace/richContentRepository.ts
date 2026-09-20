import {workspaceClient as db} from './workspaceClient';
import {syncObjectMentions} from './brainRepository';
import {richContentToPlainText, validateRichContent} from './richContent';
import type {RichContent} from '../../workspace/pageTypes';
import type {WorkspaceEntity} from '../../workspace/types';
import type {ContentSnapshot} from '../../workspace/recoveryTypes';
import {captureEntityTransition} from './revisionRepository';
import {validateSnapshot} from './recoveryValidation';

export function saveRichContent(entityId: string, expectedRevision: number, content: RichContent, sourceSessionId?: string): Promise<WorkspaceEntity> {
    return saveContent(entityId, expectedRevision, content, undefined, sourceSessionId);
}
export function saveContentSnapshot(entityId: string, expectedRevision: number, snapshot: ContentSnapshot, sourceSessionId?: string, reason = 'content-updated') {
    validateSnapshot(snapshot);
    if (snapshot.kind !== 'entity' || snapshot.entityId !== entityId) throw new Error('Content snapshot target mismatch.');
    return saveContent(entityId, expectedRevision, snapshot.content, snapshot.title, sourceSessionId, reason);
}
function saveContent(entityId: string, expectedRevision: number, content: RichContent, title?: string, sourceSessionId?: string, reason = 'content-updated'): Promise<WorkspaceEntity> {
    validateRichContent(content);
    const draft = structuredClone(content);
    return db.transaction('rw', [db.entities, db.relationships, db.activities, db.workspaceRevisions], async () => {
        const current = await db.entities.get(entityId);
        if (!current) throw new Error('Object no longer exists.');
        if (!['note', 'document'].includes(current.type)) throw new Error('Only notes and documents support rich text.');
        if (!Number.isSafeInteger(expectedRevision) || (current.contentRevision || 0) !== expectedRevision) {
            throw new Error('Content conflict: another view changed this object. Your draft is retained.');
        }
        const body = richContentToPlainText(draft), time = Date.now();
        const nextTitle = title ?? current.title;
        const next: WorkspaceEntity = {...current, title: nextTitle, richContent: draft, contentRevision: expectedRevision + 1, updatedAt: time,
            metadata: {...current.metadata, body, workspaceEditedAt: time},
            searchTerms: [...new Set([nextTitle, current.canonicalUrl, body].filter(Boolean).join(' ').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))]};
        await db.entities.put(next);
        await captureEntityTransition(current, next, reason, sourceSessionId);
        await syncObjectMentions(entityId);
        await db.activities.add({id: 'activity:' + crypto.randomUUID(), entityId, type: 'rich-content-updated',
            summary: 'Updated canonical rich text', createdAt: time});
        return next;
    });
}
