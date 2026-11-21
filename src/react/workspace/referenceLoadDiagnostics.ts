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

export type ReferenceRevealEvent =
    | {phase: 'visibility'; visible: boolean; intersectionAt?: number}
    | {phase: 'eligible'; eligible: boolean; activeLoads: number}
    | {phase: 'slot'; activeLoads: number};

export function createReferenceLoadDiagnostics(options: {historyLimit?: number; activeLimit?: number; placementId?: string; now?: () => number} = {}) {
    const {historyLimit = 200, activeLimit = 64, placementId, now = () => performance.now()} = options;
    for (const limit of [historyLimit, activeLimit]) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid diagnostic limit');
    }
    const active = new Map<number, ActiveLoad>();
    const completed: CompletedLoad[] = [];
    const revealEvents: Array<ReferenceRevealEvent & {occurrenceId: string; at: number}> = [];
    const documentId = placementId && 'document:' + placementId;
    const canvasId = placementId && 'canvas:' + placementId;
    const tracks = (occurrenceId: string) => !closed && Boolean(placementId) && (occurrenceId === documentId || occurrenceId === canvasId);
    let nextId = 0, closed = false, droppedActive = 0, droppedHistory = 0;
    let droppedRevealEvents = 0;
    return {
        tracks,
        record(occurrenceId: string, event: ReferenceRevealEvent) {
            if (!tracks(occurrenceId)) return;
            revealEvents.push({...event, occurrenceId, at: now()});
            if (revealEvents.length > historyLimit) {revealEvents.shift(); droppedRevealEvents++;}
        },
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
                completed: completed.map(record => ({...record})), droppedActive, droppedHistory,
                revealEvents: revealEvents.map(event => ({...event})), droppedRevealEvents};
        },
        dispose() {closed = true; active.clear(); completed.length = 0; revealEvents.length = 0;}
    };
}
export type ReferenceLoadDiagnostics = ReturnType<typeof createReferenceLoadDiagnostics>;
