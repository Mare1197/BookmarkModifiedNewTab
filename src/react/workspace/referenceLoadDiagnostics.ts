export type ReferenceLoadPhase = 'entity' | 'messages' | 'task' | 'asset' | 'raster' | 'render' | 'attach' | 'abort' | 'dispose';
type Outcome = 'complete' | 'error' | 'aborted' | 'released';
interface ActiveLoad {
    id: number;
    entityId: string;
    occurrenceId: string;
    phase: ReferenceLoadPhase;
    startedAt: number;
}
interface CompletedLoad extends ActiveLoad {finishedAt: number; durationMs: number; status: Outcome}

export function createReferenceLoadDiagnostics(options: {historyLimit?: number; activeLimit?: number; now?: () => number} = {}) {
    const {historyLimit = 200, activeLimit = 64, now = () => performance.now()} = options;
    for (const limit of [historyLimit, activeLimit]) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid diagnostic limit');
    }
    const active = new Map<number, ActiveLoad>();
    const completed: CompletedLoad[] = [];
    let nextId = 0, closed = false, droppedActive = 0, droppedHistory = 0;
    return {
        begin(entityId: string, occurrenceId: string, phase: ReferenceLoadPhase): (status: Outcome) => void {
            if (closed) return () => {};
            const record: ActiveLoad = {id: ++nextId, entityId, occurrenceId, phase, startedAt: now()};
            if (active.size < activeLimit) active.set(record.id, record);
            else droppedActive++;
            let finished = false;
            return (status: Outcome) => {
                if (closed || finished) return;
                finished = true;
                active.delete(record.id);
                const finishedAt = now();
                completed.push({...record, finishedAt, durationMs: Math.max(0, finishedAt - record.startedAt), status});
                if (completed.length > historyLimit) {completed.shift(); droppedHistory++;}
            };
        },
        snapshot() {
            const time = now();
            return {active: [...active.values()].map(record => ({...record, elapsedMs: Math.max(0, time - record.startedAt)})),
                completed: completed.map(record => ({...record})), droppedActive, droppedHistory};
        },
        dispose() {closed = true; active.clear(); completed.length = 0;}
    };
}
export type ReferenceLoadDiagnostics = ReturnType<typeof createReferenceLoadDiagnostics>;
