import {workspaceClient as db} from './workspaceClient';
import {contentSnapshot, layoutSnapshot, readRevision} from './revisionRepository';
import {loadPageSnapshot, restorePageLayout} from './pageRepository';
import {saveContentSnapshot} from './richContentRepository';
import {targetKey, validateTargetVersion} from './recoveryValidation';
import type {RecoverySnapshot, Target, TargetVersion} from '../../workspace/recoveryTypes';
export const sameVersion = (a?: TargetVersion, b?: TargetVersion) => JSON.stringify(a) === JSON.stringify(b);
export async function readRecoveryTarget(target: Target): Promise<{snapshot: RecoverySnapshot; version: TargetVersion}> {
    if (target.kind === 'entity') {
        const entity = await db.entities.get(target.id); if (!entity) throw new Error('Object no longer exists.');
        return {snapshot: contentSnapshot(entity), version: {kind: 'entity', revision: entity.contentRevision || 0}};
    }
    const page = await loadPageSnapshot(target.id);
    return {snapshot: layoutSnapshot(page), version: {kind: 'page', value: page.version}};
}
export async function restoreRevision(id: string, expected: TargetVersion): Promise<void> {
    await db.transaction('rw', db.tables, async () => {
        const revision = await readRevision(id); if (!revision) throw new Error('History record no longer exists.');
        validateTargetVersion(expected, revision.target.kind);
        const current = await readRecoveryTarget(revision.target);
        if (!sameVersion(current.version, expected)) throw new Error('Restore conflict. Refresh the history preview.');
        const pending = await db.workspaceDrafts.where('targetKey').equals(targetKey(revision.target)).toArray();
        if (pending.some(d => d.operations.length && d.recoveredGeneration !== d.generation)) throw new Error('Review pending drafts for this object before restoring history.');
        if (revision.snapshot.kind === 'entity' && expected.kind === 'entity') {
            await saveContentSnapshot(revision.target.id, expected.revision, revision.snapshot, undefined, 'restore');
        } else if (revision.snapshot.kind === 'page' && expected.kind === 'page') await restorePageLayout(revision.target.id, expected.value, revision.snapshot);
        else throw new Error('History target mismatch.');
    });
}
