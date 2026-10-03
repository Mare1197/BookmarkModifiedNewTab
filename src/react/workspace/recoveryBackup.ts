import {payloadBytes, validateDraft, validateRevision} from './recoveryValidation';
import {RECOVERY_RECORD_LIMIT, RECOVERY_TOTAL_LIMIT, type DraftRecord, type RevisionRecord} from '../../workspace/recoveryTypes';

export function prepareRecoveryImport(tables: Record<string, unknown[]>): {workspaceDrafts: DraftRecord[]; workspaceRevisions: RevisionRecord[]} {
    const sessions = new Map<string, string>();
    const session = (id: string) => {if (!sessions.has(id)) sessions.set(id, 'import:' + crypto.randomUUID()); return sessions.get(id)!;};
    const drafts = tables.workspaceDrafts ?? [], revisions = tables.workspaceRevisions ?? [];
    if (!Array.isArray(drafts) || !Array.isArray(revisions)) throw new Error('Invalid recovery tables.');
    const workspaceDrafts = drafts.map(value => {
        validateDraft(value);
        const record = structuredClone(value);
        record.id = 'import-draft:' + crypto.randomUUID(); record.sessionId = session(record.sessionId); record.leaseUntil = 0;
        delete record.recoverySource;
        record.operations = record.operations.map(op => ({...op, id: crypto.randomUUID()}));
        record.payloadBytes = payloadBytes({base: record.base, operations: record.operations}); validateDraft(record); return record;
    });
    const workspaceRevisions = revisions.map(value => {
        validateRevision(value);
        const record = structuredClone(value); record.id = 'import-revision:' + crypto.randomUUID();
        if (record.sourceSessionId) record.sourceSessionId = session(record.sourceSessionId);
        validateRevision(record); return record;
    });
    validateRecoveryLimits(workspaceDrafts, workspaceRevisions);
    return {workspaceDrafts, workspaceRevisions};
}

export function validateRecoveryLimits(drafts: DraftRecord[], revisions: RevisionRecord[]) {
    if (drafts.reduce((sum, r) => sum + r.payloadBytes, 0) > RECOVERY_TOTAL_LIMIT ||
        revisions.reduce((sum, r) => sum + r.payloadBytes, 0) > RECOVERY_TOTAL_LIMIT) throw new Error('Recovery import exceeds total storage limit.');
    const targets = new Map<string, {count: number; bytes: number}>();
    for (const record of revisions) {
        const value = targets.get(record.targetKey) ?? {count: 0, bytes: 0}; value.count++; value.bytes += record.payloadBytes;
        if (value.count > 50 || value.bytes > RECOVERY_RECORD_LIMIT) throw new Error('Recovery import exceeds target history limit.');
        targets.set(record.targetKey, value);
    }
}
