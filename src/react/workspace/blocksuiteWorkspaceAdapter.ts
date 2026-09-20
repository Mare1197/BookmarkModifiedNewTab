import {createPageEditorSession, type PageEditorSession, type SaveStatus} from './pageEditorSession';
import {applyPageCommand, loadPageSnapshot, type PageSnapshot} from './pageRepository';
import {mountPageProjection} from './blocksuitePageProjection';
import type {PageMode} from '../../workspace/pageTypes';
import {createPagePersistenceQueue} from './pagePersistenceQueue';

export interface WorkspaceEditorInput {
    snapshot: PageSnapshot; mode: PageMode;
    onSelect: (entityId: string, placementId?: string) => void;
    onOpenPage: (boardId: string) => void;
    onAction: (entityId: string, action: 'source' | 'inspector' | 'graph' | 'ai') => void;
    onStatus: (status: string) => void;
}
export async function mountWorkspaceEditor(host: HTMLElement, input: WorkspaceEditorInput): Promise<PageEditorSession> {
    let snapshot = input.snapshot, status: SaveStatus = 'saved', disposed = false;
    let error: unknown, timer: ReturnType<typeof setTimeout> | undefined;
    let flushing: Promise<void> | undefined;
    const report = (e: unknown) => {error = e; status = /conflict/i.test(String(e)) ? 'conflict' : 'error'; input.onStatus(String(e));};
    const session = createPageEditorSession(snapshot.entities, undefined, next => {
        status = next; input.onStatus(next);
        if (next === 'unsaved') schedule();
    });
    const queue = createPagePersistenceQueue({flushContent: () => session.flush(),
        hasContentDraft: () => JSON.parse(session.exportDrafts()).drafts.length > 0,
        saveCommand: async command => {
            status = 'saving'; input.onStatus(status);
            snapshot = await applyPageCommand(snapshot.board.id, snapshot.version, command);
            projection.reconcileConnectors(snapshot);
        }});
    function schedule() {clearTimeout(timer); timer = setTimeout(() => {void flush().catch(report);}, 400);}
    const projection = await mountPageProjection(host, snapshot, input.mode, {
        session, onSelect: input.onSelect, onAction: input.onAction, onError: report, collapsed: new Set(), colors: new Map()
    }, command => {
        queue.enqueue(command);
        status = 'unsaved'; input.onStatus(status); schedule();
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
    return {flush,
        async reload() {await flushing?.catch(() => {}); await session.reload(); queue.clear(); snapshot = await loadPageSnapshot(snapshot.board.id); error = undefined; status = 'saved'; input.onStatus(status);},
        async replaceConflictingDraft(id) {await session.replaceConflictingDraft(id); await flush();},
        getStatus: () => error ? status : (queue.pending().length ? 'unsaved' : session.getStatus()),
        exportDrafts: () => JSON.stringify({content: JSON.parse(session.exportDrafts()), boardId: snapshot.board.id, commands: queue.pending()}, null, 2),
        dispose() {disposed = true; clearTimeout(timer); queue.dispose(); projection.dispose(); session.dispose();}
    };
}
