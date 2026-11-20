import {liveQuery} from 'dexie';
import {workspaceClient as db} from './workspaceClient';
import {mountCanonicalRichText} from './blocksuiteRichText';
import {loadPageAsset, isSafeRaster} from './pageAssets';
import {loadConversationMessages} from './conversationMessages';
import {updateTask} from './workspaceRepository';
import {setMemoryPolicy} from './brainRepository';
import type {ReferenceContext} from './blocksuiteBrainReference';
import type {ReferenceLoadDiagnostics, ReferenceLoadPhase} from './referenceLoadDiagnostics';

export interface ReferenceContent {element: HTMLElement; dispose(): void}
export function loadReferenceContent(entityId: string, signal: AbortSignal,
    context: Pick<ReferenceContext, 'session' | 'onAction' | 'onError'>,
    diagnostic?: {loads: ReferenceLoadDiagnostics; occurrenceId: string}): Promise<ReferenceContent> {
    const begin = (phase: ReferenceLoadPhase) => diagnostic?.loads.begin(entityId, diagnostic.occurrenceId, phase);
    function read<T>(phase: ReferenceLoadPhase, action: () => Promise<T>): Promise<T> {
        const finish = begin(phase);
        if (!finish) return action();
        try {
            return action().then(value => {finish('complete'); return value;}, error => {finish('error'); throw error;});
        } catch (error) {finish('error'); throw error;}
    }
    const element = document.createElement('div'), body = document.createElement('div'), actions = document.createElement('div');
    element.append(body, actions);
    let closed = false, pending = true, reading = false, richDispose: (() => void) | undefined, assetUrl: string | undefined;
    let rejectFirst: (error: unknown) => void = () => {};
    const clearAsset = () => {if (assetUrl) {URL.revokeObjectURL(assetUrl); assetUrl = undefined;}};
    const dispose = () => {
        if (closed) return; closed = true; signal.removeEventListener('abort', abort);
        begin('dispose')?.('released');
        richDispose?.(); richDispose = undefined; clearAsset(); element.remove();
        // Let the first pending read settle before releasing its concurrency slot.
        if (!pending || !reading) subscription.unsubscribe();
    };
    const abort = () => {begin('abort')?.('aborted'); dispose(); if (!reading) rejectFirst(new DOMException('Content load cancelled', 'AbortError'));};
    const button = (label: string, action: () => void | Promise<void>) => {
        const control = document.createElement('button'); control.type = 'button'; control.textContent = label;
        control.onclick = () => {void Promise.resolve().then(action).catch(context.onError);}; return control;
    };
    const subscription = liveQuery(async () => {
        reading = true;
        try {
            if (closed || signal.aborted) throw new DOMException('Content load cancelled', 'AbortError');
            const entity = await read('entity', () => db.entities.get(entityId));
            const messages = entity?.type === 'conversation' ? await read('messages', () => loadConversationMessages(entityId)) : [];
            const task = entity?.type === 'task' ? await read('task', () => db.tasks.where('entityId').equals(entityId).first()) : undefined;
            const asset = entity && ['file', 'image', 'screenshot'].includes(entity.type) ? await read('asset', () => loadPageAsset(entityId)) : undefined;
            const raster = asset ? await read('raster', () => isSafeRaster(asset)) : false;
            if (closed || signal.aborted) throw new DOMException('Content load cancelled', 'AbortError');
            return {entity, messages, task, asset, raster};
        } catch (error) {
            if (pending) rejectFirst(error);
            throw error;
        } finally {reading = false; if (closed) subscription.unsubscribe();}
    }).subscribe({next: ({entity, messages, task, asset, raster}) => {
        if (closed || signal.aborted) return;
        const finishRender = begin('render');
        try {
            if (!entity) {
                if (!context.session.isDirty(entityId)) {richDispose?.(); richDispose = undefined; clearAsset(); body.textContent = 'Object unavailable'; actions.replaceChildren();}
            } else {
                context.session.acceptExternal(entity);
                actions.replaceChildren(...(['inspector', 'graph', 'ai'] as const).map(action =>
                    button({inspector: 'Inspect object', graph: 'Show in Graph', ai: 'Ask AI'}[action], () => context.onAction(entityId, action))));
                const url = entity.source?.url || entity.canonicalUrl;
                if (url && /^https?:\/\//i.test(url)) actions.append(button('Open original', () => context.onAction(entityId, 'source')));
                if (['note', 'document'].includes(entity.type)) {
                    if (!richDispose) {body.replaceChildren(); richDispose = mountCanonicalRichText(body, entityId, context.session, context.onError);}
                } else {
                    richDispose?.(); richDispose = undefined; clearAsset();
                    body.textContent = entity.type === 'conversation' ? messages.map(message => String(message.metadata?.body || '')).join('\n\n') : String(entity.metadata?.body || '');
                    if (asset) {
                        assetUrl = URL.createObjectURL(raster ? asset.blob : new Blob([asset.blob], {type: 'application/octet-stream'}));
                        body.replaceChildren();
                        if (raster) {const image = document.createElement('img'); image.src = assetUrl; image.alt = asset.name; body.append(image);}
                        const download = document.createElement('a'); download.href = assetUrl; download.download = asset.name;
                        download.textContent = 'Download ' + asset.name; body.append(download);
                    }
                }
                if (task) {
                    const select = document.createElement('select'); select.setAttribute('aria-label', 'Task status');
                    for (const status of ['backlog', 'next', 'in-progress', 'blocked', 'done'] as const) {
                        const option = document.createElement('option'); option.value = status; option.textContent = status; select.append(option);
                    }
                    select.value = task.status;
                    select.onchange = () => {void updateTask(task.id, {status: select.value as typeof task.status}).catch(context.onError);}; actions.append(select);
                }
                if (entity.memory) {
                    const memory = entity.memory, policy = document.createElement('p');
                    policy.textContent = 'AI memory: ' + memory.status + (memory.excludedFromAI ? ' · excluded from AI' : '');
                    actions.append(policy, button(memory.excludedFromAI ? 'Allow in AI' : 'Exclude from AI',
                        () => setMemoryPolicy(entityId, {excludedFromAI: !memory.excludedFromAI})));
                }
            }
            finishRender?.('complete');
            if (pending) {pending = false; resolveFirst({element, dispose});}
        } catch (error) {finishRender?.('error'); if (pending) rejectFirst(error); else context.onError(error); dispose();}
    }, error: error => {if (pending) rejectFirst(error); else if (!closed) context.onError(error); dispose();}});
    let resolveFirst: (resource: ReferenceContent) => void = () => {};
    const ready = new Promise<ReferenceContent>((resolve, reject) => {resolveFirst = resolve; rejectFirst = reject;});
    signal.addEventListener('abort', abort, {once: true}); if (signal.aborted) abort();
    return ready;
}
