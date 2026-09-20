import {workspaceClient as db} from './workspaceClient';
import {saveRichContent} from './richContentRepository';
import {readRichContent, validateRichContent} from './richContent';
import type {RichContent} from '../../workspace/pageTypes';
import type {WorkspaceEntity} from '../../workspace/types';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error';
export interface PageEditorSession {
    flush(): Promise<void>; reload(): Promise<void>; replaceConflictingDraft(entityId: string): Promise<void>;
    getStatus(): SaveStatus; exportDrafts(): string; dispose(): void;
}
export function createPageEditorSession(initial: WorkspaceEntity[], dependencies = {
    save: saveRichContent, read: (id: string) => db.entities.get(id)
}, onStatus: (status: SaveStatus) => void = () => {}) {
    const entities = new Map(initial.map(e => [e.id, e]));
    const drafts = new Map<string, {content: RichContent; generation: number}>();
    const history = new Map<string, {content: RichContent; revision: number}>();
    const listeners = new Set<(id: string) => void>();
    let status: SaveStatus = 'saved', closed = false, generation = 0;
    let running: Promise<void> | undefined;
    const assertOpen = () => {if (closed) throw new Error('Editor session is closed.');};
    const notify = (id: string) => listeners.forEach(listener => listener(id));
    const setStatus = (next: SaveStatus) => {status = next; onStatus(next);};
    const errorStatus = (error: unknown) => setStatus(/conflict/i.test(String(error)) ? 'conflict' : 'error');
    function read(id: string): RichContent {
        const draft = drafts.get(id);
        if (draft) return structuredClone(draft.content);
        const e = entities.get(id);
        if (!e) throw new Error('Object unavailable.');
        return readRichContent(e);
    }
    function edit(id: string, content: RichContent) {
        assertOpen(); validateRichContent(content);
        if (!entities.has(id)) throw new Error('Object unavailable.');
        drafts.set(id, {content: structuredClone(content), generation: ++generation});
        setStatus('unsaved'); notify(id);
    }
    async function flush() {
        assertOpen();
        if (running) return running;
        if (!drafts.size) return;
        running = (async () => {
            try {
                while (drafts.size) {
                    assertOpen();
                    const [id, draft] = drafts.entries().next().value!;
                    const entity = entities.get(id)!;
                    setStatus('saving');
                    const saved = await dependencies.save(id, entity.contentRevision || 0, draft.content);
                    if (closed) return;
                    history.set(id, {content: readRichContent(entity), revision: saved.contentRevision!});
                    entities.set(id, saved);
                    if (drafts.get(id)?.generation === draft.generation) drafts.delete(id);
                    notify(id);
                }
                setStatus('saved');
            } catch (error) {if (!closed) errorStatus(error); throw error;}
            finally {running = undefined;}
        })();
        return running;
    }
    async function reload() {
        assertOpen();
        await running?.catch(() => {});
        for (const id of entities.keys()) {
            const current = await dependencies.read(id);
            if (current) entities.set(id, current);
        }
        drafts.clear(); history.clear(); setStatus('saved');
        entities.forEach(e => notify(e.id));
    }
    async function replaceConflictingDraft(id: string) {
        assertOpen(); await running?.catch(() => {});
        const current = await dependencies.read(id);
        if (!current) throw new Error('Object no longer exists; export your draft.');
        entities.set(id, current);
        await flush();
    }
    async function undo(id: string) {
        assertOpen(); await flush();
        const entry = history.get(id);
        if (!entry) throw new Error('No content undo available.');
        try {
            const saved = await dependencies.save(id, entry.revision, entry.content);
            entities.set(id, saved); history.delete(id); notify(id);
        } catch (error) {errorStatus(error); throw error;}
    }
    return {read, edit, flush, reload, replaceConflictingDraft, undo,
        acceptExternal(entity: WorkspaceEntity) {
            if (closed || drafts.has(entity.id)) return;
            const before = entities.get(entity.id);
            if (before?.contentRevision === entity.contentRevision && JSON.stringify(before?.richContent) === JSON.stringify(entity.richContent) &&
                before?.metadata?.body === entity.metadata?.body) return;
            entities.set(entity.id, entity); notify(entity.id);
        },
        subscribe(listener: (id: string) => void) {listeners.add(listener); return () => listeners.delete(listener);},
        getStatus: () => status,
        exportDrafts: () => JSON.stringify({version: 1, drafts: [...drafts].map(([entityId, draft]) => ({entityId, content: draft.content}))}, null, 2),
        dispose() {closed = true; listeners.clear();}
    };
}
export type ContentSession = ReturnType<typeof createPageEditorSession>;
