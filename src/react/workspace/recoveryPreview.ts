import {workspaceClient as db} from './workspaceClient';
import {commitDraftOperation, copyDraft, discardDraft, readDraft, releaseSession} from './recoveryRepository';
import {readRecoveryTarget, sameVersion} from './revisionRestore';
import {projectPresentation, SemanticCommandError} from './pagePresentationCommands';
import {applyPageCommand, restorePageLayout} from './pageRepository';
import {saveContentSnapshot} from './richContentRepository';
import {contentSnapshot, layoutSnapshot} from './revisionRepository';
import type {DraftPreview, Resolution} from '../../workspace/recoveryTypes';

export async function previewDraft(id: string): Promise<DraftPreview> {
    return db.transaction('r', db.tables, async () => {
        const record = await readDraft(id); if (!record) throw new Error('Draft no longer exists.');
        const preview: DraftPreview = {record, activeElsewhere: record.leaseUntil > Date.now(), blockers: []};
        try {const current = await readRecoveryTarget(record.target); preview.current = current.snapshot; preview.currentVersion = current.version;}
        catch (error) {preview.blockers.push(String(error));}
        if (!record.operations.length || !record.base) preview.blockers.push('No pending operations remain.');
        else if (record.target.kind === 'entity') {
            const last = record.operations.at(-1)!; if (last.kind === 'entity') preview.proposed = last.snapshot;
        } else if (record.base.kind === 'page') {
            try {preview.proposed = projectPresentation(record.base, record.operations.map(op => {if (op.kind !== 'page') throw new Error('Invalid page operation.'); return op.command;}));}
            catch (error) {
                if (!(error instanceof SemanticCommandError) || !sameVersion(record.baseVersion, preview.currentVersion)) {
                    preview.blockers.push(String(error) + ' Review these commands against the current page before reapplying.');
                }
            }
        }
        return preview;
    });
}
export async function resolveDraft(preview: DraftPreview, decision: Resolution): Promise<void> {
    await db.transaction('rw', db.tables, async () => {
        const fresh = await previewDraft(preview.record.id);
        if (fresh.record.generation !== preview.record.generation || fresh.record.appliedThrough !== preview.record.appliedThrough ||
            !sameVersion(fresh.currentVersion, preview.currentVersion)) throw new Error('Recovery conflict. Refresh the comparison.');
        if (decision.kind === 'keep-current') {await discardDraft(fresh.record.id, fresh.record.generation); return;}
        if (fresh.blockers.length || !fresh.current || !fresh.currentVersion) throw new Error(fresh.blockers.join(' ') || 'Saved target is unavailable.');
        const sessionId = 'recovery:' + crypto.randomUUID(), copy = await copyDraft(fresh.record.id, fresh.record.generation, sessionId);
        let current = {snapshot: fresh.current, version: fresh.currentVersion};
        const last = copy.operations.at(-1)!;
        for (const operation of copy.operations) await commitDraftOperation(copy.id, operation.sequence, async op => {
            if (op.kind === 'entity' && current.version.kind === 'entity') {
                if (op.sequence === last.sequence) {
                    const proposed = decision.kind === 'manual' ? decision.snapshot : op.snapshot;
                    const entity = await saveContentSnapshot(copy.target.id, current.version.revision, proposed, sessionId, 'restore');
                    current = {snapshot: contentSnapshot(entity), version: {kind: 'entity', revision: entity.contentRevision || 0}};
                }
            } else if (op.kind === 'page' && current.version.kind === 'page') {
                if (decision.kind === 'manual') throw new Error('Manual block combination is only available for notes and documents.');
                if (sameVersion(copy.baseVersion, fresh.currentVersion)) {
                    const page = await applyPageCommand(copy.target.id, current.version.value, op.command, sessionId);
                    current = {snapshot: layoutSnapshot(page), version: {kind: 'page', value: page.version}};
                } else if (op.sequence === last.sequence) {
                    if (fresh.proposed?.kind !== 'page') throw new Error('Layout preview is unavailable.');
                    const page = await restorePageLayout(copy.target.id, current.version.value, fresh.proposed, sessionId);
                    current = {snapshot: layoutSnapshot(page), version: {kind: 'page', value: page.version}};
                }
            } else throw new Error('Recovery target mismatch.');
            return {value: undefined, nextBase: current.snapshot, nextVersion: current.version};
        });
        await releaseSession(sessionId);
    });
}
