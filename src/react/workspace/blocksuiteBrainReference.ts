import {BlockComponent} from '@blocksuite/block-std';
import {EdgelessNoteBlockComponent} from '@blocksuite/blocks';
import {defineBlockSchema, type SchemaToModel} from '@blocksuite/store';
import {html} from 'lit';
import type {ContentSession} from './pageEditorSession';
import type {createReferenceDataSource} from './referenceDataSource';
import type {createReferenceResources} from './referenceResources';
import type {ReferenceContent} from './referenceContent';
import {observeDocumentReference} from './referenceVisibility';

export const PageReferenceSchema = defineBlockSchema({
    flavour: 'affine:embed-workspace-object', props: () => ({entityId: '', placementId: ''}),
    metadata: {version: 1, role: 'content', parent: ['affine:note'], children: []}
});
type ReferenceModel = SchemaToModel<typeof PageReferenceSchema>;
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace BlockSuite {interface BlockModels {'affine:embed-workspace-object': ReferenceModel}}
}
export interface ReferenceInput {
    session: ContentSession;
    onSelect: (entityId: string, placementId?: string) => void;
    onAction: (entityId: string, action: 'source' | 'inspector' | 'graph' | 'ai') => void;
    onError: (error: unknown) => void;
    collapsed: Set<string>; colors: Map<string, string>;
}
export interface ReferenceContext extends ReferenceInput {
    data: ReturnType<typeof createReferenceDataSource>;
    resources: ReturnType<typeof createReferenceResources<ReferenceContent>>;
    canvasVisibility: Map<string, boolean>;
    subscribeVisibility: (placementId: string, listener: () => void) => () => void;
}
export const referenceContexts = new Map<string, ReferenceContext>();
// Brain cards have canonical dimensions; asynchronous bodies must not resize them.
export class WorkspaceReferenceNote extends EdgelessNoteBlockComponent {
    override connectedCallback() {super.connectedCallback(); this.classList.add('brainReferenceNote');}
    override getRenderingRect() {
        const rect = super.getRenderingRect();
        return {...rect, h: (JSON.parse(this.model.xywh) as number[])[3]! / (this.model.edgeless.scale ?? 1)};
    }
}
export class WorkspaceReferenceBlock extends BlockComponent<ReferenceModel> {
    private card = document.createElement('article');
    private heading = document.createElement('strong');
    private content = document.createElement('div');
    private body = document.createElement('div');
    private cleanups: Array<() => void> = [];
    override connectedCallback() {
        super.connectedCallback();
        const ctx = referenceContexts.get(this.doc.id); if (!ctx) return;
        const {entityId, placementId} = this.model, canvas = Boolean(this.closest('edgeless-editor'));
        this.card.dataset.brainReference = entityId; this.card.dataset.placementId = placementId;
        this.card.className = 'brainReferenceCard'; this.card.style.background = ctx.colors.get(placementId) || '#ffffff';
        const select = () => {ctx.resources.setSelected([placementId]); ctx.onSelect(entityId, placementId);};
        const handle = document.createElement('div'); handle.className = 'brainReferenceHandle'; handle.textContent = '⋮⋮ Select / drag card';
        handle.onpointerdown = select;
        this.content.className = 'brainReferenceContent';
        this.content.onpointerdown = event => event.stopPropagation(); this.content.onkeydown = event => event.stopPropagation();
        this.content.onclick = select;
        this.content.replaceChildren(this.heading, this.body);
        const actions = document.createElement('div');
        for (const [label, action] of [['Inspect object', 'inspector'], ['Show in Graph', 'graph'], ['Ask AI', 'ai']] as const) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
            button.onclick = () => {void Promise.resolve().then(() => ctx.onAction(entityId, action)).catch(ctx.onError);}; actions.append(button);
        }
        this.content.append(actions); this.body.className = 'brainReferenceBody';
        this.card.replaceChildren(handle, this.content);
        const updateShell = () => {this.heading.textContent = ctx.data.readShell(entityId).title;};
        updateShell(); this.cleanups.push(ctx.data.subscribe(ids => {if (ids.includes(entityId)) updateShell();}));
        const connection = ctx.resources.connect((canvas ? 'canvas:' : 'document:') + placementId, entityId, resource => {
            this.body.replaceChildren(...(resource ? [resource.element] : []));
            this.card.dataset.hydrated = String(Boolean(resource));
        }, placementId, ctx.collapsed.has(placementId));
        const updatePresentation = () => {
            const collapsed = ctx.collapsed.has(placementId), note = this.doc.getParent(this.model) as {xywh?: string} | null;
            this.body.hidden = collapsed; actions.hidden = !collapsed;
            this.card.style.minHeight = (collapsed ? 100 : note?.xywh ? (JSON.parse(note.xywh) as number[])[3]! : 100) + 'px';
            if (canvas) connection.setVisible(Boolean(ctx.canvasVisibility.get(placementId)));
        };
        updatePresentation(); this.cleanups.push(ctx.subscribeVisibility(placementId, updatePresentation));
        const focus = () => {connection.setFocused(true); select();};
        const blur = () => queueMicrotask(() => {connection.setFocused(this.content.contains(document.activeElement));});
        this.content.addEventListener('focusin', focus); this.content.addEventListener('focusout', blur);
        this.cleanups.push(() => {this.content.removeEventListener('focusin', focus); this.content.removeEventListener('focusout', blur);});
        this.cleanups.push(() => connection.disconnect());
        if (!canvas) {
            const pane = this.closest<HTMLElement>('.brainNativePane');
            if (pane) this.cleanups.push(observeDocumentReference(this.card, pane,
                visible => connection.setVisible(visible)));
        }
    }
    override disconnectedCallback() {
        this.cleanups.splice(0).forEach(cleanup => cleanup());
        super.disconnectedCallback();
    }
    override renderBlock() {return html`${this.card}`;}
}
