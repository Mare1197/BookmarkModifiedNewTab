import {workspaceClient as db} from './workspaceClient';
import {payloadBytes, validateDraft, validateSnapshot, validateTargetVersion} from './recoveryValidation';
import {RECOVERY_TOTAL_LIMIT, type DraftOperation, type DraftRecord, type DraftSummary, type RecoverySnapshot, type TargetVersion} from '../../workspace/recoveryTypes';

const clone = <T,>(value: T): T => structuredClone(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sized = (record: DraftRecord): DraftRecord => ({...record, payloadBytes: payloadBytes({base: record.base, operations: record.operations})});

export function createRecoveryRepository(options: {totalLimit?: number} = {}) {
    const totalLimit = options.totalLimit ?? RECOVERY_TOTAL_LIMIT;
    async function readDraft(id: string): Promise<DraftRecord | undefined> {
        const record = await db.workspaceDrafts.get(id);
        if (record) validateDraft(record);
        return record;
    }
    async function put(record: DraftRecord, previous?: DraftRecord) {
        validateDraft(record);
        if (record.payloadBytes > (previous?.payloadBytes ?? 0)) {
            const total = (await db.workspaceDrafts.toArray()).reduce((sum, row) => sum + row.payloadBytes, 0);
            if (total - (previous?.payloadBytes ?? 0) + record.payloadBytes > totalLimit) {
                throw new Error('Draft storage limit reached. Export or discard reviewed drafts before retrying.');
            }
        }
        await db.workspaceDrafts.put(record);
        return clone(record);
    }
    async function writeDraft(input: DraftRecord, expectedGeneration: number | null): Promise<DraftRecord> {
        validateDraft(input);
        return db.transaction('rw', db.workspaceDrafts, async () => {
            const previous = await readDraft(input.id);
            if ((previous?.generation ?? null) !== expectedGeneration) throw new Error('Journal generation conflict.');
            if (!previous) return put(clone(input));
            if (previous.sessionId !== input.sessionId || previous.targetKey !== input.targetKey || previous.boardId !== input.boardId ||
                !equal(previous.recoverySource, input.recoverySource)) throw new Error('Journal session ownership conflict.');
            if (input.generation <= previous.generation) throw new Error('Journal generation conflict.');
            const operations = input.operations.filter(op => op.sequence > previous.appliedThrough);
            // Once durable, an operation is immutable. Only an unpersisted tail can coalesce.
            for (let index = 0; index < previous.operations.length; index++) {
                if (!equal(previous.operations[index], operations[index])) throw new Error('Journal operation conflict.');
            }
            if (operations.slice(previous.operations.length).some(op => op.sequence <= previous.generation)) throw new Error('Journal sequence conflict.');
            if (!previous.base && operations.length && !equal(input.baseVersion, previous.baseVersion)) {
                throw new Error('Journal base changed. Reload the saved base before retrying.');
            }
            return put(sized({...input, appliedThrough: previous.appliedThrough,
                base: operations.length ? previous.base ?? input.base : undefined,
                baseVersion: previous.baseVersion, operations, recoveredGeneration: previous.recoveredGeneration}), previous);
        });
    }
    async function listDrafts(): Promise<DraftSummary[]> {
        return (await db.workspaceDrafts.orderBy('updatedAt').reverse().toArray()).filter(record => record.operations.length).map(record => {
            validateDraft(record);
            const {base: _base, operations, ...summary} = record;
            void _base;
            return {...summary, operationCount: operations.length};
        });
    }
    async function touchSession(sessionId: string, now: number) {
        if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid heartbeat time.');
        await db.workspaceDrafts.where('sessionId').equals(sessionId).modify({leaseUntil: now + 60000});
    }
    async function releaseSession(sessionId: string) {
        await db.transaction('rw', db.workspaceDrafts, async () => {
            const records = await db.workspaceDrafts.where('sessionId').equals(sessionId).toArray();
            for (const record of records) {
                if (record.operations.length) await db.workspaceDrafts.update(record.id, {leaseUntil: 0});
                else await db.workspaceDrafts.delete(record.id);
            }
        });
    }
    async function checked(id: string, generation: number) {
        const record = await readDraft(id);
        if (!record || record.generation !== generation) throw new Error('Journal generation conflict. Refresh the preview.');
        return record;
    }
    async function discardDraft(id: string, expectedGeneration: number) {
        await db.transaction('rw', db.workspaceDrafts, async () => {await checked(id, expectedGeneration); await db.workspaceDrafts.delete(id);});
    }
    async function copyDraft(id: string, expectedGeneration: number, newSessionId: string) {
        return db.transaction('rw', db.workspaceDrafts, async () => {
            const source = await checked(id, expectedGeneration);
            if (!source.operations.length || source.sessionId === newSessionId) throw new Error('A new recovery session is required.');
            return put(sized({...source, id: crypto.randomUUID(), sessionId: newSessionId, leaseUntil: 0,
                updatedAt: Date.now(), recoveredGeneration: undefined, recoverySource: {id, generation: source.generation},
                operations: source.operations.map(op => ({...op, id: crypto.randomUUID()}))}));
        });
    }
    async function commitDraftOperation<T>(id: string, sequence: number, write: (operation: DraftOperation, baseVersion: TargetVersion) =>
        Promise<{value: T; nextBase: RecoverySnapshot; nextVersion: TargetVersion}>): Promise<{status: 'applied'; value: T} | {status: 'already-applied'}> {
        return db.transaction('rw', db.tables, async () => {
            const record = await readDraft(id);
            if (!record) throw new Error('Recovery record unavailable.');
            if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Journal sequence conflict.');
            if (sequence <= record.appliedThrough) return {status: 'already-applied'};
            const head = record.operations[0];
            if (!head || head.sequence !== sequence) throw new Error('Journal sequence conflict.');
            const result = await write(clone(head), clone(record.baseVersion));
            validateSnapshot(result.nextBase); validateTargetVersion(result.nextVersion, record.target.kind);
            if (result.nextBase.kind !== record.target.kind ||
                (result.nextBase.kind === 'entity' ? result.nextBase.entityId : result.nextBase.boardId) !== record.target.id) {
                throw new Error('Journal target conflict.');
            }
            const operations = record.operations.slice(1);
            await put(sized({...record, base: operations.length ? result.nextBase : undefined, baseVersion: result.nextVersion,
                operations, appliedThrough: sequence, updatedAt: Date.now()}), record);
            if (!operations.length && record.recoverySource) {
                const source = await readDraft(record.recoverySource.id);
                if (source?.generation === record.recoverySource.generation) {
                    await db.workspaceDrafts.update(source.id, {recoveredGeneration: source.generation});
                }
            }
            return {status: 'applied', value: result.value};
        });
    }
    return {writeDraft, readDraft, listDrafts, touchSession, releaseSession, discardDraft, copyDraft, commitDraftOperation};
}

export const {writeDraft, readDraft, listDrafts, touchSession, releaseSession, discardDraft, copyDraft, commitDraftOperation} = createRecoveryRepository();
