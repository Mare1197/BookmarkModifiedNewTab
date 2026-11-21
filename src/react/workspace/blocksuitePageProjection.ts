import {AffineSchemas, PageEditorBlockSpecs, EdgelessEditorBlockSpecs, getSurfaceBlock,
    pageRootWidgetViewMap, edgelessRootWidgetViewMap, AFFINE_FORMAT_BAR_WIDGET,
    ConnectorMode, StrokeStyle, type NoteBlockModel} from '@blocksuite/blocks';
import {effects as blockEffects} from '@blocksuite/blocks/effects';
import {PageEditor, EdgelessEditor} from '@blocksuite/presets';
import {effects as presetEffects} from '@blocksuite/presets/effects';
import {BlockViewExtension, BlockViewIdentifier, WidgetViewMapIdentifier} from '@blocksuite/block-std';
import {GfxController, LayerManager} from '@blocksuite/block-std/gfx';
import {DocCollection, Schema, type Y} from '@blocksuite/store';
import {literal} from 'lit/static-html.js';
import {PageReferenceSchema, WorkspaceReferenceBlock, WorkspaceReferenceNote, referenceContexts, type ReferenceInput, type ReferenceContext} from './blocksuiteBrainReference';
import type {PageSnapshot} from './pageRepository';
import {planNativeProjection} from './nativeProjectionPlan';
import {nativeProjectionIndexes} from './nativeProjectionIndexes';
import {createNativePreparationIndex} from './nativePreparationIndex';
import {createNativeReferenceGeometry} from './nativeReferenceGeometry';
import {validateGeometry} from './pageValidation';
import {mountConnectorRouting} from './blocksuiteConnectorRouting';
import {attachNativeClientOffsets} from './nativeClientOffsets';
import {attachNativePointerCoordinates} from './nativePointerCoordinates';
import {prepareNativeMount, runProjectionBatches, type NativeMountScope, type NativeMountOptions} from './cooperativeProjection';
import {createViewportChanges} from './nativeViewportChanges';
import {workspaceClient} from './workspaceClient';
import {createReferenceDataSource} from './referenceDataSource';
import {createReferenceHydration} from './referenceHydration';
import {createReferenceResources} from './referenceResources';
import {loadReferenceContent} from './referenceContent';
import {createReferenceLoadDiagnostics, type ReferenceLoadDiagnostics} from './referenceLoadDiagnostics';
import {observeCanvasReferences} from './referenceVisibility';
import type {PageCommand, PageMode} from '../../workspace/pageTypes';
import '@toeverything/theme/style.css';

let registered = false;
const colors: Record<string, string> = {default: '#ffffff', blue: '#e5efff', green: '#e5f5ea', yellow: '#fff6d8', purple: '#f0e8ff'};
export async function mountPageProjection(container: HTMLElement, snapshot: PageSnapshot, mode: PageMode, context: ReferenceInput,
    onCommand: (command: PageCommand) => void, options: NativeMountOptions = {}) {
    const start = performance.now();
    const mounted = await prepareNativeMount(scope => buildPageProjection(container, snapshot, mode, context, onCommand, scope, options), options);
    options.onMeasure?.('projection-total', performance.now() - start);
    return {...mounted.value, dispose: mounted.dispose};
}
async function buildPageProjection(container: HTMLElement, snapshot: PageSnapshot, mode: PageMode, input: ReferenceInput,
    onCommand: (command: PageCommand) => void, scope: NativeMountScope, options: NativeMountOptions) {
    scope.check();
    const query = new URLSearchParams(container.ownerDocument.defaultView?.location.search);
    const tracePlacementId = query.get('nativeLoadPlacement') || undefined;
    const loadDiagnostics = query.get('nativeLoadTrace') === '1' ? createReferenceLoadDiagnostics({placementId: tracePlacementId}) : undefined;
    if (loadDiagnostics) {
        const diagnosticHost = container as HTMLElement & {nativeLoadDiagnostics?: {snapshot: ReferenceLoadDiagnostics['snapshot']}};
        const reader = {snapshot: loadDiagnostics.snapshot};
        diagnosticHost.nativeLoadDiagnostics = reader;
        scope.own(() => {
            if (diagnosticHost.nativeLoadDiagnostics === reader) delete diagnosticHost.nativeLoadDiagnostics;
            loadDiagnostics.dispose();
        });
    }
    const plan = planNativeProjection(snapshot);
    const geometryState = createNativeReferenceGeometry(snapshot.placements, plan.collapsedByPlacement);
    const groupByPlacement = new Map(plan.placements.map(row => [row.p.id, row.presentation.groupId]));
    let acknowledgedPlacements = plan.placementsById;
    const data = createReferenceDataSource(workspaceClient, snapshot, input.onError); scope.own(() => data.dispose());
    container.dataset.nativeContentLoading = '0'; container.dataset.nativeContentHydrated = '0'; container.dataset.nativeContentPeak = '0';
    const hydration = createReferenceHydration({maxConcurrent: 4, trace: tracePlacementId ? loadDiagnostics : undefined,
        onError: input.onError, onState: ({loading, hydrated}) => {
        container.dataset.nativeContentLoading = String(loading); container.dataset.nativeContentHydrated = String(hydrated);
        container.dataset.nativeContentPeak = String(Math.max(Number(container.dataset.nativeContentPeak), loading));
    }});
    const resources = createReferenceResources({session: input.session, hydration,
        load: (entityId, signal, occurrenceId) => loadReferenceContent(entityId, signal, input, loadDiagnostics ? {loads: loadDiagnostics, occurrenceId} : undefined)});
    scope.own(() => resources.dispose());
    const visibility = new Map<string, Set<() => void>>();
    const context: ReferenceContext = {...input, data, resources, loadDiagnostics, canvasVisibility: new Map(),
        subscribeVisibility(id, listener) {
            const listeners = visibility.get(id) || new Set(); listeners.add(listener); visibility.set(id, listeners);
            return () => {listeners.delete(listener); if (!listeners.size) visibility.delete(id);};
        }};
    if (!registered) {
        blockEffects(); presetEffects();
        customElements.define('workspace-reference-block', WorkspaceReferenceBlock);
        customElements.define('workspace-reference-note', WorkspaceReferenceNote); registered = true;
    }
    const collection = new DocCollection({schema: new Schema().register([...AffineSchemas, PageReferenceSchema])});
    scope.own(() => collection.dispose());
    collection.meta.initialize(); const doc = collection.createDoc();
    const preparationOwner: {index?: ReturnType<typeof createNativePreparationIndex>} = {};
    scope.own(() => preparationOwner.index?.dispose());
    scope.own(() => doc.dispose());
    doc.load();
    const preparationIndex = preparationOwner.index = createNativePreparationIndex(doc);
    let root = '';
    let surface!: NonNullable<ReturnType<typeof getSurfaceBlock>>;
    const notes = new Map<string, string>(), placementIds = new Map<string, string>(), connectors = new Map<string, string>();
    const groups = new Map<string, string>();
    let hydrating = true, disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const dirtyNotes = new Set<string>();
    const disposables: Array<{dispose(): void}> = [];
    let routing: ReturnType<typeof mountConnectorRouting> | undefined;
    const editors: Array<PageEditor | EdgelessEditor> = [], panes: HTMLElement[] = [];
    let canvasVisibility: ReturnType<typeof observeCanvasReferences> | undefined, visibilityFrame = 0;
    let removePaste = () => {};
    scope.own(() => {
        disposed = true; clearTimeout(timer); cancelAnimationFrame(visibilityFrame); routing?.dispose(); disposables.forEach(d => d.dispose()); removePaste();
        editors.forEach(editor => editor.remove()); panes.forEach(pane => pane.remove()); referenceContexts.delete(doc.id);
    });
    const operations: Array<() => void> = [() => {root = preparationIndex.addBlock('affine:page', {});},
        () => {preparationIndex.addBlock('affine:surface', {}, root); surface = getSurfaceBlock(doc)!;}];
    const placements = plan.placements;
    for (const {p, presentation} of placements) {
        const collapsed = plan.collapsedByPlacement.get(p.id)!;
        if (collapsed) context.collapsed.add(p.id);
        context.colors.set(p.id, colors[presentation.color]!);
        operations.push(() => {
            const note = preparationIndex.addBlock('affine:note', {xywh: `[${p.x},${p.y},${p.width},${p.height}]`, background: colors[presentation.color]}, root);
            notes.set(p.id, note); placementIds.set(note, p.id);
        }, () => {
            const model = doc.getBlockById(notes.get(p.id)!) as NoteBlockModel;
            preparationIndex.mutate(() => doc.updateBlock(model, {edgeless: {...model.edgeless, collapse: collapsed, collapsedHeight: 100},
                ...(collapsed ? {xywh: JSON.stringify([p.x, p.y, p.width, 100])} : {})}));
        }, () => {preparationIndex.addBlock('affine:embed-workspace-object', {entityId: p.entityId, placementId: p.id}, notes.get(p.id)!);});
    }
    for (const group of snapshot.presentation.groups) operations.push(() => {
        const children = new DocCollection.Y.Map<boolean>();
        for (const id of plan.groupChildren.get(group.id)!) children.set(notes.get(id)!, true);
        const id = preparationIndex.mutate(() => surface.addElement({type: 'group', children, title: new DocCollection.Y.Text(group.label)}));
        groups.set(group.id, id);
    });
    for (const group of snapshot.presentation.groups) if (group.parentId) {
        const parentId = group.parentId;
        operations.push(() => {
            const parent = surface.getElementById(groups.get(parentId)!);
            if (parent && 'children' in parent) preparationIndex.mutate(() => (parent.children as Y.Map<boolean>).set(groups.get(group.id)!, true));
        });
    }
    const modes = {straight: ConnectorMode.Straight, orthogonal: ConnectorMode.Orthogonal, curve: ConnectorMode.Curve};
    for (const c of plan.connectors) operations.push(() => {
        const id = preparationIndex.mutate(() => surface.addElement({type: 'connector', mode: modes[c.mode], stroke: c.color, strokeStyle: c.dashed ? StrokeStyle.Dash : StrokeStyle.Solid,
            source: {id: notes.get(c.fromPlacementId), position: [c.anchors?.source.x ?? 1, c.anchors?.source.y ?? 0.5]},
            target: {id: notes.get(c.toPlacementId), position: [c.anchors?.target.x ?? 0, c.anchors?.target.y ?? 0.5]}}));
        connectors.set(id, c.id);
    });
    const modelStart = performance.now(), total = operations.length + placements.length;
    await runProjectionBatches(operations, {...options, onProgress: done => options.onProgress?.(done, total)});
    preparationIndex.verify();
    scope.check(); options.onMeasure?.('projection-models', performance.now() - modelStart);
    // Use the same native ordering generator before any renderer observes the
    // document, avoiding a layer/render rebuild for every initial note index.
    const indexStart = performance.now(), indexLayer = new LayerManager(doc, surface, {watch: false});
    let indexLayerClosed = false;
    const closeIndexLayer = () => {if (!indexLayerClosed) {indexLayerClosed = true; indexLayer.dispose();}};
    scope.own(closeIndexLayer);
    try {
        const indexes = nativeProjectionIndexes(indexLayer.generateIndex(), notes.size);
        await runProjectionBatches([...notes.values()].map((id, index) => () => {preparationIndex.mutate(() => doc.updateBlock(doc.getBlockById(id)!, {index: indexes[index]!}));}),
            {...options, onProgress: done => options.onProgress?.(operations.length + done, total)});
        scope.check();
    } finally {closeIndexLayer();}
    options.onMeasure?.('projection-indexes', performance.now() - indexStart);
    referenceContexts.set(doc.id, context);
    const renderStart = performance.now();
    for (const kind of mode === 'mixed' ? ['document', 'canvas'] : [mode]) {
        const editor = kind === 'document' ? new PageEditor() : new EdgelessEditor();
        // Canonical notes own their rich-text toolbar. The native format bar assumes
        // native content blocks and can resume an async selection callback after unmount.
        const widgets = {...(kind === 'document' ? pageRootWidgetViewMap : edgelessRootWidgetViewMap)};
        delete (widgets as Record<string, unknown>)[AFFINE_FORMAT_BAR_WIDGET];
        editor.specs = [...(kind === 'document' ? PageEditorBlockSpecs : EdgelessEditorBlockSpecs),
            {setup: di => {
                di.override(WidgetViewMapIdentifier('affine:page'), () => widgets);
                if (kind === 'canvas') di.override(BlockViewIdentifier('affine:note'), () => literal`workspace-reference-note`);
            }},
            BlockViewExtension('affine:embed-workspace-object', literal`workspace-reference-block`)];
        editor.doc = doc; editor.classList.add('brainNativeEditor');
        scope.check();
        const pane = document.createElement('div'); pane.className = 'brainNativePane'; pane.append(editor); panes.push(pane); container.append(pane);
        editors.push(editor);
        await editor.updateComplete;
        scope.check();
        if (editor instanceof EdgelessEditor) {
            routing = mountConnectorRouting(pane, surface, editor.std.get(GfxController), snapshot, connectors, placementIds, onCommand, context.onError);
            const viewport = editor.std.get(GfxController).viewport;
            disposables.push({dispose: attachNativePointerCoordinates(editor.std.host, editor.std.event)});
            disposables.push({dispose: attachNativeClientOffsets(pane, container.parentElement || container, viewport)});
            const v = snapshot.presentation.viewport; viewport.setViewport(v.zoom, [v.x, v.y]);
            const gfx = editor.std.get(GfxController);
            canvasVisibility = observeCanvasReferences(viewport, () => placements.flatMap(({p}) => {
                const note = doc.getBlockById(notes.get(p.id)!) as NoteBlockModel | undefined;
                if (!note) return [];
                const [x, y, width, height] = JSON.parse(note.xywh) as number[];
                return [{id: p.id, x: x!, y: y!, width: width!, height: height!}];
            }), (id, visible) => {
                if (loadDiagnostics && id === tracePlacementId) loadDiagnostics.record('canvas:' + id, {phase: 'visibility', visible});
                context.canvasVisibility.set(id, visible);
                visibility.get(id)?.forEach(listener => listener());
            });
            disposables.push({dispose: canvasVisibility});
            const select = () => {
                const queue = [...gfx.selection.selectedIds], seen = new Set<string>(), selected: string[] = [];
                while (queue.length) {
                    const id = queue.pop()!; if (seen.has(id)) continue; seen.add(id);
                    const placement = placementIds.get(id); if (placement) selected.push(placement);
                    else {
                        const group = surface.getElementById(id);
                        if (group?.type === 'group' && 'children' in group) queue.push(...(group.children as Y.Map<boolean>).keys());
                    }
                }
                resources.setSelected(selected, 'native');
            };
            disposables.push(gfx.selection.slots.updated.on(select)); select();
            const changedViewport = createViewportChanges(v, next => onCommand({type: 'view', mode, viewport: next}));
            disposables.push(viewport.viewportUpdated.on(({zoom, center}) => {
                if (!hydrating && !disposed) changedViewport({x: center[0], y: center[1], zoom});
            }));
        }
    }
    scope.check(); options.onMeasure?.('projection-render', performance.now() - renderStart);
    function flushGeometry() {
        clearTimeout(timer);
        routing?.flush();
        if (!dirtyNotes.size || disposed) return;
        const changes = [...dirtyNotes].flatMap(id => {
            const note = doc.getBlockById(id) as NoteBlockModel | undefined;
            if (!note) return [];
            const [x, y, width, height] = JSON.parse(note.xywh) as number[];
            const placementId = placementIds.get(id)!;
            const geometry = geometryState.observe(placementId, {x: x!, y: y!, width: width!, height: height!}, Boolean(note.edgeless.collapse)).geometry;
            const change = {id: placementId, ...geometry}, saved = acknowledgedPlacements.get(placementId);
            if (saved && saved.x === change.x && saved.y === change.y && saved.width === change.width && saved.height === change.height) return [];
            try {validateGeometry(change); return [change];} catch (error) {context.onError(error); return [];}
        });
        dirtyNotes.clear();
        if (changes.length) onCommand({type: 'move-resize', placements: changes});
    }
    disposables.push(doc.slots.blockUpdated.on(event => {
        if (hydrating || disposed) return;
        if (event.type === 'update' && placementIds.has(event.id)) {
            if (event.props.key === 'xywh' || event.props.key === 'edgeless') {
                const note = doc.getBlockById(event.id) as NoteBlockModel, id = placementIds.get(event.id)!;
                const groupId = groupByPlacement.get(id);
                const collapsed = Boolean(note.edgeless.collapse || groupId && plan.collapsedGroups.get(groupId));
                const [x, y, width, height] = JSON.parse(note.xywh) as number[];
                const geometry = geometryState.observe(id, {x: x!, y: y!, width: width!, height: height!}, collapsed);
                if (geometry.restoreHeight !== undefined || collapsed !== Boolean(note.edgeless.collapse)) {
                    hydrating = true;
                    try {doc.updateBlock(note, {xywh: JSON.stringify([x, y, width, geometry.restoreHeight ?? height]),
                        edgeless: {...note.edgeless, collapse: collapsed}});} finally {hydrating = false;}
                }
                const wasCollapsed = context.collapsed.has(id);
                if (collapsed) context.collapsed.add(id); else context.collapsed.delete(id);
                if (wasCollapsed !== collapsed) {
                    resources.setCollapsed(id, collapsed); onCommand({type: 'collapse', placementId: id, collapsed});
                }
                visibility.get(id)?.forEach(listener => listener());
            }
            if (event.props.key === 'xywh' && mode !== 'document') {
                dirtyNotes.add(event.id); clearTimeout(timer); timer = setTimeout(flushGeometry, 250);
                queueMicrotask(() => routing?.refresh());
                if (!visibilityFrame) visibilityFrame = requestAnimationFrame(() => {visibilityFrame = 0; if (!disposed) canvasVisibility?.refresh();});
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
            canvasVisibility?.refresh();
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
    const down = () => resources.setDragging(true), up = () => resources.setDragging(false);
    container.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    removePaste = () => {
        container.removeEventListener('paste', blockUnsupported, true); container.removeEventListener('pointerdown', down, true);
        document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true);
    };
    scope.check(); preparationIndex.verify(); preparationIndex.dispose();
    hydrating = false;
    return {flushGeometry, setSelectedReferences: (ids: readonly string[]) => resources.setSelected(ids),
        acknowledgeSnapshot(next: PageSnapshot) {acknowledgedPlacements = new Map(next.placements.map(p => [p.id, p]));}};
}
