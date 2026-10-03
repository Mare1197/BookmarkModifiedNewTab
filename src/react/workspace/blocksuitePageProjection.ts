import {AffineSchemas, PageEditorBlockSpecs, EdgelessEditorBlockSpecs, getSurfaceBlock,
    pageRootWidgetViewMap, edgelessRootWidgetViewMap, AFFINE_FORMAT_BAR_WIDGET,
    ConnectorMode, StrokeStyle, type NoteBlockModel} from '@blocksuite/blocks';
import {effects as blockEffects} from '@blocksuite/blocks/effects';
import {PageEditor, EdgelessEditor} from '@blocksuite/presets';
import {effects as presetEffects} from '@blocksuite/presets/effects';
import {BlockViewExtension, WidgetViewMapIdentifier} from '@blocksuite/block-std';
import {GfxController} from '@blocksuite/block-std/gfx';
import {DocCollection, Schema, type Y} from '@blocksuite/store';
import {literal} from 'lit/static-html.js';
import {PageReferenceSchema, WorkspaceReferenceBlock, referenceContexts, type ReferenceContext} from './blocksuiteBrainReference';
import {placementPresentation, type PageSnapshot} from './pageRepository';
import {validateGeometry} from './pageValidation';
import {mountConnectorRouting} from './blocksuiteConnectorRouting';
import type {PageCommand, PageMode} from '../../workspace/pageTypes';
import '@toeverything/theme/style.css';

let registered = false;
const colors: Record<string, string> = {default: '#ffffff', blue: '#e5efff', green: '#e5f5ea', yellow: '#fff6d8', purple: '#f0e8ff'};
export async function mountPageProjection(container: HTMLElement, snapshot: PageSnapshot, mode: PageMode, context: ReferenceContext,
    onCommand: (command: PageCommand) => void) {
    if (!registered) {
        blockEffects(); presetEffects();
        customElements.define('workspace-reference-block', WorkspaceReferenceBlock); registered = true;
    }
    const collection = new DocCollection({schema: new Schema().register([...AffineSchemas, PageReferenceSchema])});
    collection.meta.initialize(); const doc = collection.createDoc(); doc.load();
    const root = doc.addBlock('affine:page', {});
    doc.addBlock('affine:surface', {}, root);
    const surface = getSurfaceBlock(doc)!;
    const notes = new Map<string, string>(), placementIds = new Map<string, string>(), connectors = new Map<string, string>();
    const groups = new Map<string, string>();
    let hydrating = true, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const dirtyNotes = new Set<string>();
    const disposables: Array<{dispose(): void}> = [];
    let routing: ReturnType<typeof mountConnectorRouting> | undefined;
    const placements = snapshot.placements.map((p, i) => ({p, presentation: placementPresentation(p, i)}))
        .sort((a, b) => a.presentation.order - b.presentation.order);
    for (const {p, presentation} of placements) {
        let groupId = presentation.groupId, collapsed = presentation.collapsed;
        while (groupId) {const group = snapshot.presentation.groups.find(g => g.id === groupId); if (!group) break; collapsed ||= group.collapsed; groupId = group.parentId;}
        if (collapsed) context.collapsed.add(p.id);
        context.colors.set(p.id, colors[presentation.color]!);
        const note = doc.addBlock('affine:note', {xywh: `[${p.x},${p.y},${p.width},${p.height}]`,
            background: colors[presentation.color]}, root);
        const model = doc.getBlockById(note) as NoteBlockModel;
        doc.updateBlock(model, {edgeless: {...model.edgeless, collapse: collapsed, collapsedHeight: 100}});
        notes.set(p.id, note); placementIds.set(note, p.id);
        doc.addBlock('affine:embed-workspace-object', {entityId: p.entityId, placementId: p.id}, note);
    }
    for (const group of snapshot.presentation.groups) {
        const children = new DocCollection.Y.Map<boolean>();
        for (const {p, presentation} of placements) if (presentation.groupId === group.id) children.set(notes.get(p.id)!, true);
        const id = surface.addElement({type: 'group', children, title: new DocCollection.Y.Text(group.label)});
        groups.set(group.id, id);
    }
    for (const group of snapshot.presentation.groups) if (group.parentId) {
        const parent = surface.getElementById(groups.get(group.parentId)!);
        if (parent && 'children' in parent) (parent.children as Y.Map<boolean>).set(groups.get(group.id)!, true);
    }
    const modes = {straight: ConnectorMode.Straight, orthogonal: ConnectorMode.Orthogonal, curve: ConnectorMode.Curve};
    for (const c of snapshot.presentation.connectors) {
        if (!notes.has(c.fromPlacementId) || !notes.has(c.toPlacementId)) continue;
        const id = surface.addElement({type: 'connector', mode: modes[c.mode], stroke: c.color, strokeStyle: c.dashed ? StrokeStyle.Dash : StrokeStyle.Solid,
            source: {id: notes.get(c.fromPlacementId), position: [c.anchors?.source.x ?? 1, c.anchors?.source.y ?? 0.5]},
            target: {id: notes.get(c.toPlacementId), position: [c.anchors?.target.x ?? 0, c.anchors?.target.y ?? 0.5]}});
        connectors.set(id, c.id);
    }
    referenceContexts.set(doc.id, context);
    const editors: Array<PageEditor | EdgelessEditor> = [];
    for (const kind of mode === 'mixed' ? ['document', 'canvas'] : [mode]) {
        const editor = kind === 'document' ? new PageEditor() : new EdgelessEditor();
        // Canonical notes own their rich-text toolbar. The native format bar assumes
        // native content blocks and can resume an async selection callback after unmount.
        const widgets = {...(kind === 'document' ? pageRootWidgetViewMap : edgelessRootWidgetViewMap)};
        delete (widgets as Record<string, unknown>)[AFFINE_FORMAT_BAR_WIDGET];
        editor.specs = [...(kind === 'document' ? PageEditorBlockSpecs : EdgelessEditorBlockSpecs),
            {setup: di => {di.override(WidgetViewMapIdentifier('affine:page'), () => widgets);}},
            BlockViewExtension('affine:embed-workspace-object', literal`workspace-reference-block`)];
        editor.doc = doc; editor.classList.add('brainNativeEditor');
        const pane = document.createElement('div'); pane.className = 'brainNativePane'; pane.append(editor); container.append(pane);
        editors.push(editor);
        await editor.updateComplete;
        if (editors.length === 1) {
            const nextIndex = editor.std.get(GfxController).layer.createIndexGenerator();
            for (const id of notes.values()) doc.updateBlock(doc.getBlockById(id)!, {index: nextIndex()});
        }
        if (editor instanceof EdgelessEditor) {
            routing = mountConnectorRouting(pane, surface, editor.std.get(GfxController), snapshot, connectors, placementIds, onCommand, context.onError);
            const viewport = editor.std.get(GfxController).viewport;
            // BlockSuite observes its own resize, not scrolling in our outer shell.
            // Refresh client offsets before hit testing without changing world coordinates.
            const syncOffset = () => {
                const rect = pane.getBoundingClientRect();
                viewport.setRect(rect.left, rect.top, rect.width, rect.height);
            };
            document.addEventListener('scroll', syncOffset, true);
            pane.addEventListener('pointerdown', syncOffset, true);
            disposables.push({dispose() {
                document.removeEventListener('scroll', syncOffset, true);
                pane.removeEventListener('pointerdown', syncOffset, true);
            }});
            const v = snapshot.presentation.viewport; viewport.setViewport(v.zoom, [v.x, v.y]);
            disposables.push(viewport.viewportUpdated.on(({zoom, center}) => {
                if (!hydrating && !disposed) onCommand({type: 'view', mode, viewport: {x: center[0], y: center[1], zoom}});
            }));
        }
    }
    function flushGeometry() {
        clearTimeout(timer);
        routing?.flush();
        if (!dirtyNotes.size || disposed) return;
        const changes = [...dirtyNotes].flatMap(id => {
            const note = doc.getBlockById(id) as NoteBlockModel | undefined;
            if (!note) return [];
            const [x, y, width, height] = JSON.parse(note.xywh) as number[];
            const change = {id: placementIds.get(id)!, x: x!, y: y!, width: width!, height: height!};
            try {validateGeometry(change); return [change];} catch (error) {context.onError(error); return [];}
        });
        dirtyNotes.clear();
        if (changes.length) onCommand({type: 'move-resize', placements: changes});
    }
    disposables.push(doc.slots.blockUpdated.on(event => {
        if (hydrating || disposed) return;
        if (event.type === 'update' && placementIds.has(event.id)) {
            if (event.props.key === 'xywh' && mode !== 'document') {
                dirtyNotes.add(event.id); clearTimeout(timer); timer = setTimeout(flushGeometry, 250);
                queueMicrotask(() => routing?.refresh());
            }
            if (event.props.key === 'edgeless') {
                const note = doc.getBlockById(event.id) as NoteBlockModel;
                onCommand({type: 'collapse', placementId: placementIds.get(event.id)!, collapsed: Boolean(note.edgeless.collapse)});
            }
            return;
        }
        if (event.type === 'add') {
            queueMicrotask(() => {
                if (disposed) return;
                const block = doc.getBlockById(event.id);
                if (block) {hydrating = true; doc.deleteBlock(block); hydrating = false;}
                context.onError(new Error('Use New note, Upload file or Add existing object: unsupported native blocks are not saved.'));
            });
        }
        if (event.type === 'delete' && placementIds.has(event.id)) {
            onCommand({type: 'remove-reference', placementIds: [placementIds.get(event.id)!]});
        }
    }));
    disposables.push(surface.elementAdded.on(({id}) => {
        if (hydrating) return;
        if (surface.getElementById(id)?.type !== 'connector') {
            queueMicrotask(() => {if (!disposed) {surface.deleteElement(id); context.onError(new Error('Use workspace controls for persistent objects and groups.'));}});
        }
    }));
    const blockUnsupported = (event: Event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.brainReferenceContent')) return;
        event.preventDefault(); event.stopPropagation();
        context.onError(new Error('Paste into a note or use Add existing object / Upload file.'));
    };
    container.addEventListener('paste', blockUnsupported, true);
    hydrating = false;
    return {flushGeometry, dispose() {
        disposed = true; clearTimeout(timer); routing?.dispose(); disposables.forEach(d => d.dispose());
        container.removeEventListener('paste', blockUnsupported, true);
        editors.forEach(e => e.remove()); container.replaceChildren(); referenceContexts.delete(doc.id); doc.dispose(); collection.dispose();
    }};
}
