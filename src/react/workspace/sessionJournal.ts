import * as repository from './recoveryRepository';
import {payloadBytes, targetKey, validateCommand, validateSnapshot} from './recoveryValidation';
import type {DraftOperation, DraftRecord, RecoverySnapshot, Target, TargetVersion} from '../../workspace/recoveryTypes';

export type JournalRepository = Pick<typeof repository, 'writeDraft' | 'readDraft' | 'commitDraftOperation' | 'discardDraft' | 'touchSession' | 'releaseSession'>;
type Intent = {kind: 'entity'; snapshot: Extract<RecoverySnapshot, {kind: 'entity'}>} | {kind: 'page'; command: Extract<DraftOperation, {kind: 'page'}>['command']};
type State = {record: DraftRecord; base: RecoverySnapshot; version: TargetVersion; storedGeneration: number | null};
export function createSessionJournal(sessionId = crypto.randomUUID(), repo: JournalRepository = repository,
    changed: (status: 'saving-local' | 'recoverable' | 'saved' | 'error', error?: unknown) => void = () => {}) {
    const states = new Map<string, State>();
    let chain: Promise<unknown> = Promise.resolve(), closed = false, disposal: Promise<void> | undefined;
    const report = () => changed([...states.values()].some(s => s.record.generation !== s.storedGeneration) ? 'saving-local' :
        [...states.values()].some(s => s.record.operations.length) ? 'recoverable' : 'saved');
    function serial<T>(work: () => Promise<T>): Promise<T> {
        const result = chain.catch(() => {}).then(work);
        chain = result; void result.catch(error => changed('error', error)); return result;
    }
    async function persist() {
        for (const state of states.values()) {
            while (state.record.generation !== state.storedGeneration) {
                const record = structuredClone({...state.record, base: state.record.operations.length ? state.base : undefined,
                    baseVersion: state.version, updatedAt: Date.now(), leaseUntil: closed ? 0 : Date.now() + 60000});
                record.payloadBytes = payloadBytes({base: record.base, operations: record.operations});
                const saved = await repo.writeDraft(record, state.storedGeneration);
                state.storedGeneration = saved.generation;
                state.record.appliedThrough = saved.appliedThrough;
            }
        }
        report();
    }
    function enqueue(target: Target, base: RecoverySnapshot, version: TargetVersion, intent: Intent, boardId?: string) {
        if (closed) throw new Error('Editor session is closed.');
        validateSnapshot(base);
        if (intent.kind === 'entity') validateSnapshot(intent.snapshot); else validateCommand(intent.command);
        const key = targetKey(target);
        let state = states.get(key);
        // A completed target may have changed through Undo or another view. Start a new
        // journal from that observed canonical version; never rebase a pending journal.
        if (state && !state.record.operations.length && JSON.stringify(state.version) !== JSON.stringify(version)) state = undefined;
        if (!state) {
            state = {base: structuredClone(base), version: structuredClone(version), storedGeneration: null,
                record: {id: 'draft:' + crypto.randomUUID(), version: 1, sessionId, targetKey: key, target, boardId,
                    generation: 0, appliedThrough: 0, baseVersion: version, operations: [], updatedAt: Date.now(), leaseUntil: 0, payloadBytes: 0}};
            states.set(key, state);
        }
        const sequence = ++state.record.generation;
        state.record.operations.push({...structuredClone(intent), id: crypto.randomUUID(), sequence});
        changed('saving-local'); void serial(persist).catch(() => {});
        return sequence;
    }
    const flushJournal = () => serial(persist);
    function applyNext<T>(key: string, write: (op: DraftOperation, version: TargetVersion) => Promise<{value: T; nextBase: RecoverySnapshot; nextVersion: TargetVersion}>,
        readCurrent: () => Promise<{value: T; nextBase: RecoverySnapshot; nextVersion: TargetVersion}>) {
        return serial(async () => {
            await persist(); const state = states.get(key);
            if (!state?.record.operations.length) return undefined;
            const op = state.record.operations[0]!;
            let applied: Awaited<ReturnType<typeof readCurrent>> | undefined;
            const result = await repo.commitDraftOperation(state.record.id, op.sequence, async (operation, version) => {
                applied = await write(operation, version); return applied;
            });
            if (result.status === 'already-applied') applied = await readCurrent();
            if (!applied) throw new Error('Saved state is unavailable. Reload before retrying.');
            state.base = applied.nextBase; state.version = applied.nextVersion;
            state.record.appliedThrough = op.sequence;
            state.record.operations = state.record.operations.filter(pending => pending.sequence > op.sequence);
            report(); return {value: applied.value, sequence: op.sequence};
        });
    }
    const heartbeat = typeof window === 'undefined' ? undefined : setInterval(() => {
        void serial(() => repo.touchSession(sessionId, Date.now())).catch(() => {});
    }, 15000);
    return {sessionId, enqueue, flushJournal, applyNext,
        settleResolved: () => serial(async () => {
            const settled: Target[] = [];
            for (const [key, state] of states) {
                if (state.storedGeneration === null || state.record.generation !== state.storedGeneration) continue;
                const generation = state.record.generation, storedGeneration = state.storedGeneration;
                const stored = await repo.readDraft(state.record.id);
                if (states.get(key) !== state || state.record.generation !== generation || state.storedGeneration !== storedGeneration) continue;
                if (!stored || (stored.generation === state.storedGeneration && stored.recoveredGeneration === stored.generation)) {
                    states.delete(key); settled.push(state.record.target);
                }
            }
            report(); return settled;
        }),
        pending: () => [...states.values()].filter(s => s.record.operations.length).map(s => s.record.targetKey),
        count: () => [...states.values()].reduce((n, s) => n + s.record.operations.length, 0),
        getDraftIds: () => [...states.values()].map(s => s.record.id),
        exportRecords: () => [...states.values()].map(s => ({...structuredClone(s.record), base: s.base, baseVersion: s.version})),
        discard: () => serial(async () => {
            // Discard must still work when local persistence failed (for example quota).
            // Delete only this session's last acknowledged generation, never a newer row.
            for (const state of states.values()) if (state.storedGeneration !== null) await repo.discardDraft(state.record.id, state.storedGeneration);
            states.clear(); report();
        }),
        dispose() {
            if (disposal) return disposal;
            closed = true; clearInterval(heartbeat);
            disposal = chain.catch(() => {}).then(() => repo.releaseSession(sessionId)).catch(error => {changed('error', error);});
            return disposal;
        }
    };
}
