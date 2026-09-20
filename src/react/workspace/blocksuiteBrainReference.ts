import {BlockComponent} from '@blocksuite/block-std';
import {defineBlockSchema, type SchemaToModel} from '@blocksuite/store';
import {html} from 'lit';
import {liveQuery, type Subscription} from 'dexie';
import {workspaceClient as db} from './workspaceClient';
import {mountCanonicalRichText} from './blocksuiteRichText';
import {isSafeRaster, loadPageAsset} from './pageAssets';
import {setMemoryPolicy} from './brainRepository';
import {updateTask} from './workspaceRepository';
import type {ContentSession} from './pageEditorSession';
import type {WorkspaceEntity} from '../../workspace/types';

export const PageReferenceSchema = defineBlockSchema({
    flavour: 'affine:embed-workspace-object', props: () => ({entityId: '', placementId: ''}),
    metadata: {version: 1, role: 'content', parent: ['affine:note'], children: []}
});
type ReferenceModel = SchemaToModel<typeof PageReferenceSchema>;
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace BlockSuite {interface BlockModels {'affine:embed-workspace-object': ReferenceModel}}
}
export interface ReferenceContext {
    session: ContentSession;
    onSelect: (entityId: string, placementId?: string) => void;
    onAction: (entityId: string, action: 'source' | 'inspector' | 'graph' | 'ai') => void;
    onError: (error: unknown) => void;
    collapsed: Set<string>;
    colors: Map<string, string>;
}
export const referenceContexts = new Map<string, ReferenceContext>();
export class WorkspaceReferenceBlock extends BlockComponent<ReferenceModel> {
    private subscription?: Subscription;
    private card = document.createElement('article');
    private heading = document.createElement('strong');
    private body = document.createElement('div');
    private actions = document.createElement('div');
    private richDispose?: () => void;
    private assetUrl?: string;
    private active = false;
    private generation = 0;
    override connectedCallback() {
        super.connectedCallback();
        this.active = true;
        const ctx = referenceContexts.get(this.doc.id);
        if (!ctx) return;
        this.card.dataset.brainReference = this.model.entityId;
        this.card.dataset.placementId = this.model.placementId;
        this.card.className = 'brainReferenceCard';
        this.card.style.background = ctx.colors.get(this.model.placementId) || '#ffffff';
        const handle = document.createElement('div');
        handle.className = 'brainReferenceHandle'; handle.textContent = '⋮⋮ Select / drag card';
        handle.addEventListener('pointerdown', () => ctx.onSelect(this.model.entityId, this.model.placementId));
        const controls = document.createElement('div'); controls.className = 'brainReferenceContent';
        controls.addEventListener('pointerdown', e => e.stopPropagation());
        controls.addEventListener('keydown', e => e.stopPropagation());
        controls.addEventListener('click', () => ctx.onSelect(this.model.entityId, this.model.placementId));
        controls.addEventListener('focusin', () => ctx.onSelect(this.model.entityId, this.model.placementId));
        controls.append(this.heading, this.body, this.actions); this.card.replaceChildren(handle, controls);
        this.body.hidden = ctx.collapsed.has(this.model.placementId);
        this.subscription = liveQuery(async () => {
            const entity = await db.entities.get(this.model.entityId);
            const links = await db.relationships.where('toEntityId').equals(this.model.entityId).toArray();
            const messages = entity?.type === 'conversation' ? (await db.entities.bulkGet(links.filter(r => r.confirmed && r.type === 'message-of').map(r => r.fromEntityId)))
                .filter((e): e is WorkspaceEntity => Boolean(e)).sort((a, b) => a.createdAt - b.createdAt) : [];
            const task = entity?.type === 'task' ? await db.tasks.where('entityId').equals(entity.id).first() : undefined;
            return {entity, messages, task};
        }).subscribe({next: ({entity, messages, task}) => {
            if (!entity) {this.heading.textContent = 'Object unavailable'; this.body.replaceChildren(); return;}
            ctx.session.acceptExternal(entity);
            this.heading.textContent = entity.title;
            const button = (label: string, action: () => void | Promise<void>) => {
                const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
                b.addEventListener('click', () => {void Promise.resolve().then(action).catch(ctx.onError);}); return b;
            };
            this.actions.replaceChildren(...(['inspector', 'graph', 'ai'] as const).map(action =>
                button({inspector: 'Inspect object', graph: 'Show in Graph', ai: 'Ask AI'}[action], () => ctx.onAction(entity.id, action))));
            const url = entity.source?.url || entity.canonicalUrl;
            if (url && /^https?:\/\//i.test(url)) this.actions.append(button('Open original', () => ctx.onAction(entity.id, 'source')));
            if (['note', 'document'].includes(entity.type)) {
                if (!this.richDispose) this.richDispose = mountCanonicalRichText(this.body, entity.id, ctx.session, ctx.onError);
            } else if (!['file', 'image', 'screenshot'].includes(entity.type)) {
                this.body.textContent = entity.type === 'conversation' ? messages.map(e => String(e.metadata?.body || '')).join('\n\n') : String(entity.metadata?.body || '');
            } else {void this.renderAsset(entity.id).catch(ctx.onError);}
            if (task) {
                const select = document.createElement('select'); select.setAttribute('aria-label', 'Task status');
                for (const status of ['backlog', 'next', 'in-progress', 'blocked', 'done'] as const) {
                    const o = document.createElement('option'); o.value = status; o.textContent = status; select.append(o);
                }
                select.value = task.status;
                select.addEventListener('change', () => {void updateTask(task.id, {status: select.value as typeof task.status}).catch(ctx.onError);});
                this.actions.append(select);
            }
            if (entity.memory) {
                const policy = document.createElement('p'); policy.textContent = 'AI memory: ' + entity.memory.status + (entity.memory.excludedFromAI ? ' · excluded from AI' : '');
                this.actions.append(policy, button(entity.memory.excludedFromAI ? 'Allow in AI' : 'Exclude from AI', () => setMemoryPolicy(entity.id, {excludedFromAI: !entity.memory!.excludedFromAI})));
            }
            this.requestUpdate();
        }, error: ctx.onError});
    }
    private async renderAsset(id: string) {
        const generation = ++this.generation;
        const asset = await loadPageAsset(id);
        if (!asset || !this.active || generation !== this.generation) return;
        const image = await isSafeRaster(asset);
        if (!this.active || generation !== this.generation) return;
        if (this.assetUrl) URL.revokeObjectURL(this.assetUrl);
        this.assetUrl = URL.createObjectURL(image ? asset.blob : new Blob([asset.blob], {type: 'application/octet-stream'}));
        this.body.replaceChildren();
        if (image) {const img = document.createElement('img'); img.src = this.assetUrl; img.alt = asset.name; this.body.append(img);}
        const a = document.createElement('a'); a.href = this.assetUrl; a.download = asset.name; a.textContent = 'Download ' + asset.name;
        this.body.append(a);
    }
    override disconnectedCallback() {
        this.active = false; this.subscription?.unsubscribe(); this.richDispose?.(); this.richDispose = undefined;
        if (this.assetUrl) URL.revokeObjectURL(this.assetUrl);
        super.disconnectedCallback();
    }
    override renderBlock() {return html`${this.card}`;}
}
