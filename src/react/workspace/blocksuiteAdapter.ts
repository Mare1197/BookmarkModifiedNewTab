import {BlockComponent, BlockViewExtension} from '@blocksuite/block-std';
import {AffineSchemas, PageEditorBlockSpecs, EdgelessEditorBlockSpecs} from '@blocksuite/blocks';
import {effects as blockEffects} from '@blocksuite/blocks/effects';
import {PageEditor, EdgelessEditor} from '@blocksuite/presets';
import {effects as presetEffects} from '@blocksuite/presets/effects';
import {DocCollection, Schema, defineBlockSchema, type SchemaToModel} from '@blocksuite/store';
import {html} from 'lit';
import {literal} from 'lit/static-html.js';
import {liveQuery, type Subscription} from 'dexie';
import type {WorkspaceEntity} from '../../workspace/types';
import {workspaceClient} from './workspaceClient';
import {updateEntity} from './workspaceRepository';
import '@toeverything/theme/style.css';

// No title/body/source is ever stored in this schema or a BlockSuite persistence provider.
export const BrainReferenceSchema = defineBlockSchema({
    flavour: 'affine:embed-brain-reference', props: () => ({entityId: ''}),
    metadata: {version: 1, role: 'content', parent: ['affine:note'], children: []}
});
type ReferenceModel = SchemaToModel<typeof BrainReferenceSchema>;
declare global {
    // BlockSuite exposes its custom-schema registry through this ambient namespace.
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace BlockSuite { interface BlockModels { 'affine:embed-brain-reference': ReferenceModel } }
}

class BrainReferenceBlock extends BlockComponent<ReferenceModel> {
    private subscription?: Subscription;
    private entity?: WorkspaceEntity;
    private status = '';
    private saving = false;
    override connectedCallback() {
        super.connectedCallback();
        this.subscription = liveQuery(() => workspaceClient.entities.get(this.model.entityId)).subscribe({
            next: entity => { this.entity = entity; this.requestUpdate(); },
            error: error => { this.status = String(error); this.requestUpdate(); }
        });
    }
    override disconnectedCallback() { this.subscription?.unsubscribe(); super.disconnectedCallback(); }
    private save = async (event: Event) => {
        event.preventDefault(); event.stopPropagation();
        if (this.saving || !this.entity) return;
        const form = event.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const title = String(data.get('title') || '').trim();
        if (!title) return;
        this.saving = true;
        try {
            await updateEntity(this.entity.id, {title, metadata: {body: String(data.get('body') || '')}});
            this.status = 'Saved to canonical object';
        } catch (error) { this.status = String(error); }
        finally { this.saving = false; this.requestUpdate(); }
    };
    override renderBlock() {
        const entity = this.entity;
        if (!entity) return html`<p>Reference unavailable: ${this.model.entityId}</p>`;
        // Above the native edgeless background/selection mask: only this form is editable,
        // while the surrounding BlockSuite document remains read-only.
        return html`<article style="position:relative;z-index:2;padding:16px;border:1px solid #bac8d4;border-radius:8px;background:white;color:#17212c" contenteditable="false"
            @pointerdown=${(event: Event) => event.stopPropagation()} @keydown=${(event: Event) => event.stopPropagation()}>
            <strong>${entity.title}</strong><p>${entity.type} · Canonical reference</p>
            <small>${entity.id}</small>
            <form @submit=${this.save}>
                <label style="display:block">Reference title<input name="title" required .value=${entity.title} style="display:block;width:100%;color:#17212c;background:white" /></label>
                <label style="display:block">Reference notes<textarea name="body" rows="3" .value=${String(entity.metadata?.body || '')} style="display:block;width:100%;color:#17212c;background:white"></textarea></label>
                <button type="submit" ?disabled=${this.saving}>Save to Brain</button>
            </form><p role="status">${this.status}</p>
        </article>`;
    }
}

let registered = false;
export function mountBrainEditor(container: HTMLElement, entityId: string, mode: 'document' | 'edgeless') {
    if (!registered) {
        blockEffects(); presetEffects();
        customElements.define('brain-reference-block', BrainReferenceBlock);
        registered = true;
    }
    const schema = new Schema().register([...AffineSchemas, BrainReferenceSchema]);
    const collection = new DocCollection({schema});
    collection.meta.initialize();
    const doc = collection.createDoc();
    doc.load();
    const root = doc.addBlock('affine:page', {});
    doc.addBlock('affine:surface', {}, root);
    const note = doc.addBlock('affine:note', {xywh: '[0,0,640,440]'}, root);
    doc.addBlock('affine:embed-brain-reference', {entityId}, note);
    // Native content creation is disabled in this bounded experiment. All actual edits go through Brain.
    collection.awarenessStore.setReadonly(doc.blockCollection, true);
    const editor = mode === 'document' ? new PageEditor() : new EdgelessEditor();
    editor.specs = [...(mode === 'document' ? PageEditorBlockSpecs : EdgelessEditorBlockSpecs),
        BlockViewExtension('affine:embed-brain-reference', literal`brain-reference-block`)];
    editor.doc = doc;
    editor.style.cssText = 'display:block;width:100%;height:100%;min-height:520px;background:white;color:#17212c';
    container.replaceChildren(editor);
    return () => { editor.remove(); doc.dispose(); collection.dispose(); };
}
