import {createPageEditorSession, type PageEditorSession, type SaveStatus} from './pageEditorSession';
import {applyPageCommand, loadPageSnapshot, type PageSnapshot} from './pageRepository';
import {mountPageProjection} from './blocksuitePageProjection';
import type {PageMode} from '../../workspace/pageTypes';
import {createPagePersistenceQueue} from './pagePersistenceQueue';
import {createSessionJournal} from './sessionJournal';
import {layoutSnapshot} from './revisionRepository';
import {targetKey} from './recoveryValidation';

export interface WorkspaceEditorInput {
    snapshot: PageSnapshot; mode: PageMode;
    onSelect: (entityId: string, placementId?: string) => void;
    onOpenPage: (boardId: string) => void;
    onAction: (entityId: string, action: 'source' | 'inspector' | 'graph' | 'ai') => void;
    onStatus: (status: string) => void;
}
export async function mountWorkspaceEditor(host: HTMLElement, input: WorkspaceEditorInput): Promise<PageEditorSession> {
    let snapshot = input.snapshot, status: SaveStatus = 'saved', disposed = false;
    let layoutStatus: SaveStatus = 'saved';
    let error: unknown, timer: ReturnType<typeof setTimeout> | undefined;
    let flushing: Promise<void> | undefined;
    const report = (e: unknown) => {error = e; status = /conflict/i.test(String(e)) ? 'conflict' : 'error'; input.onStatus(String(e));};
    const session = createPageEditorSession(snapshot.entities, undefined, next => {
        status = next; input.onStatus(getStatus());
        if (next === 'unsaved' || next === 'saving-local') schedule();
    });
    const layoutJournal = createSessionJournal(undefined, undefined, (next, failure) => {
        layoutStatus = next;
        if (failure) report(failure);
        else if (!error) input.onStatus(getStatus());
    });
    const queue = createPagePersistenceQueue({flushContent: () => session.flush(),
        hasContentDraft: () => session.dirtyCount() > 0, coalesce: false,
        saveCommand: async () => {
            status = 'saving'; input.onStatus(status);
            const result = await layoutJournal.applyNext(targetKey({kind: 'page', id: snapshot.board.id}), async (op, version) => {
                if (op.kind !== 'page' || version.kind !== 'page') throw new Error('Invalid page journal.');
                const saved = await applyPageCommand(snapshot.board.id, version.value, op.command, layoutJournal.sessionId);
                return {value: saved, nextBase: layoutSnapshot(saved), nextVersion: {kind: 'page' as const, value: saved.version}};
            }, async () => {
                const saved = await loadPageSnapshot(snapshot.board.id);
                return {value: saved, nextBase: layoutSnapshot(saved), nextVersion: {kind: 'page' as const, value: saved.version}};
            });
            if (!result) throw new Error('Layout draft journal is unavailable.');
            snapshot = result.value;
            projection.reconcileConnectors(snapshot);
        }});
    function schedule() {clearTimeout(timer); timer = setTimeout(() => {void flush().catch(report);}, 400);}
    const projection = await mountPageProjection(host, snapshot, input.mode, {
        session, onSelect: input.onSelect, onAction: input.onAction, onError: report, collapsed: new Set(), colors: new Map()
    }, command => {
        layoutJournal.enqueue({kind: 'page', id: snapshot.board.id}, layoutSnapshot(snapshot), {kind: 'page', value: snapshot.version},
            {kind: 'page', command}, snapshot.board.id);
        queue.enqueue(command);
        status = 'saving-local'; input.onStatus(status); schedule();
    });
    async function flush() {
        if (disposed) throw new Error('Editor session is closed.');
        clearTimeout(timer); projection.flushGeometry();
        if (flushing) return flushing;
        flushing = Promise.resolve().then(async () => {
            await queue.flush();
            error = undefined; status = 'saved'; input.onStatus(status);
        }).catch(e => {report(e); throw e;}).finally(() => {flushing = undefined;});
        return flushing;
    }
    function getStatus(): SaveStatus {
        if (error) return status;
        const content = session.getStatus();
        if (content !== 'saved') return content;
        return queue.pending().length ? (layoutStatus === 'saved' ? 'saving' : layoutStatus) : content;
    }
    return {flush,
        async flushJournal() {projection.flushGeometry(); await Promise.all([session.flushJournal(), layoutJournal.flushJournal()]);},
        getDraftIds: () => [...session.getDraftIds(), ...layoutJournal.getDraftIds()],
        async reload() {await flushing?.catch(() => {}); await session.reload(); await layoutJournal.discard(); queue.clear(); snapshot = await loadPageSnapshot(snapshot.board.id); error = undefined; status = 'saved'; input.onStatus(status);},
        getStatus,
        exportDrafts: () => JSON.stringify({content: JSON.parse(session.exportDrafts()), boardId: snapshot.board.id, commands: queue.pending()}, null, 2),
        dispose() {disposed = true; clearTimeout(timer); queue.dispose(); projection.dispose(); void session.dispose(); void layoutJournal.dispose();}
    };
}
