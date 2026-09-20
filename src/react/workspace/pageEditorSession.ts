import {workspaceClient as db} from './workspaceClient';
import {saveRichContent} from './richContentRepository';
import {readRichContent, validateRichContent} from './richContent';
import type {RichContent} from '../../workspace/pageTypes';
import type {WorkspaceEntity} from '../../workspace/types';
import {contentSnapshot} from './revisionRepository';
import {createSessionJournal, type JournalRepository} from './sessionJournal';
import {targetKey} from './recoveryValidation';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'saving-local' | 'recoverable' | 'conflict' | 'error';
export const hasUnsavedWork = (status: SaveStatus) => status !== 'saved';
export interface PageEditorSession {
    flush(): Promise<void>; flushJournal(): Promise<void>; reload(): Promise<void>; getDraftIds(): string[];
    getStatus(): SaveStatus; exportDrafts(): string; dispose(): void;
}
export function createPageEditorSession(initial: WorkspaceEntity[], dependencies: {
    save: typeof saveRichContent; read: (id: string) => Promise<WorkspaceEntity | undefined>; journal?: JournalRepository;
} = {
    save: saveRichContent, read: (id: string) => db.entities.get(id)
}, onStatus: (status: SaveStatus) => void = () => {}) {
    const entities = new Map(initial.map(e => [e.id, e]));
    const drafts = new Map<string, {content: RichContent; generation: number}>();
    const history = new Map<string, {content: RichContent; revision: number}>();
    const listeners = new Set<(id: string) => void>();
    let status: SaveStatus = 'saved', closed = false, lastError: unknown;
    let running: Promise<void> | undefined;
    const assertOpen = () => {if (closed) throw new Error('Editor session is closed.');};
    const notify = (id: string) => listeners.forEach(listener => listener(id));
    const setStatus = (next: SaveStatus) => {status = next; onStatus(next);};
    const errorStatus = (error: unknown) => {lastError = error; setStatus(/conflict/i.test(String(error)) ? 'conflict' : 'error');};
    const journal = createSessionJournal(undefined, dependencies.journal, (next, error) => {
        if (closed) return;
        if (error) errorStatus(error);
        else if (!lastError) setStatus(running ? 'saving' : next);
    });
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
        const entity = entities.get(id)!;
        const generation = journal.enqueue({kind: 'entity', id}, contentSnapshot(entity), {kind: 'entity', revision: entity.contentRevision || 0},
            {kind: 'entity', snapshot: {...contentSnapshot(entity), content: structuredClone(content)}});
        drafts.set(id, {content: structuredClone(content), generation}); notify(id);
    }
    async function flush() {
        assertOpen();
        if (running) return running;
        if (!drafts.size) return;
        running = (async () => {
            try {
                while (drafts.size) {
                    assertOpen();
                    const [id] = drafts.entries().next().value!;
                    const entity = entities.get(id)!;
                    setStatus('saving');
                    const applied = await journal.applyNext(targetKey({kind: 'entity', id}), async (op, version) => {
                        if (op.kind !== 'entity' || version.kind !== 'entity') throw new Error('Invalid content journal.');
                        const saved = await dependencies.save(id, version.revision, op.snapshot.content, journal.sessionId);
                        return {value: saved, nextBase: contentSnapshot(saved), nextVersion: {kind: 'entity' as const, revision: saved.contentRevision || 0}};
                    }, async () => {
                        const current = await dependencies.read(id);
                        if (!current) throw new Error('Object no longer exists; export your draft.');
                        return {value: current, nextBase: contentSnapshot(current), nextVersion: {kind: 'entity' as const, revision: current.contentRevision || 0}};
                    });
                    if (!applied) throw new Error('Draft journal is unavailable.');
                    const saved = applied.value;
                    history.set(id, {content: readRichContent(entity), revision: saved.contentRevision!});
                    entities.set(id, saved);
                    if (drafts.get(id)?.generation === applied.sequence) drafts.delete(id);
                    notify(id);
                }
                lastError = undefined;
                setStatus('saved');
            } catch (error) {if (!closed) errorStatus(error); throw error;}
            finally {running = undefined;}
        })();
        return running;
    }
    async function reload() {
        assertOpen();
        await running?.catch(() => {});
        await journal.discard();
        for (const id of entities.keys()) {
            const current = await dependencies.read(id);
            if (current) entities.set(id, current);
        }
        drafts.clear(); history.clear(); lastError = undefined; setStatus('saved');
        entities.forEach(e => notify(e.id));
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
    return {read, edit, flush, flushJournal: journal.flushJournal, reload, undo, getDraftIds: journal.getDraftIds, dirtyCount: () => drafts.size,
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
        dispose() {closed = true; listeners.clear(); return journal.dispose();}
    };
}
export type ContentSession = ReturnType<typeof createPageEditorSession>;
