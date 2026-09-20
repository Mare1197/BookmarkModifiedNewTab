import {workspaceClient as db} from './workspaceClient';
import {openBrainCanvas} from './brainRepository';
import {validateGeometry, validatePagePresentation, validatePlacementPresentation} from './pageValidation';
import type {BoardPlacement, BoardRecord, RelationshipRecord, WorkspaceEntity} from '../../workspace/types';
import type {PageCommand, PagePresentation, PageVersion, PlacementPresentation} from '../../workspace/pageTypes';
import {captureEntityTransition, captureTransition, layoutSnapshot} from './revisionRepository';
import {validateSnapshot} from './recoveryValidation';
import type {LayoutSnapshot} from '../../workspace/recoveryTypes';

export interface PageSnapshot {
    board: BoardRecord; owner: WorkspaceEntity; presentation: PagePresentation; version: PageVersion;
    placements: BoardPlacement[]; entities: WorkspaceEntity[]; relationships: RelationshipRecord[];
    parent?: WorkspaceEntity; children: WorkspaceEntity[]; undoToken?: string;
}
const key = (boardId: string) => 'workspace-page:' + boardId;
const uid = (prefix: string) => prefix + ':' + crypto.randomUUID();
const tables = () => [db.entities, db.boards, db.placements, db.relationships, db.settings, db.activities, db.workspaceRevisions];
const defaults = (ownerEntityId: string): PagePresentation => ({version: 1, ownerEntityId, revision: 0,
    mode: 'document', viewport: {x: 0, y: 0, zoom: 1}, groups: [], connectors: []});
export function placementPresentation(p: BoardPlacement, index = 0): PlacementPresentation {
    const value = p.metadata?.page;
    if (value !== undefined) {validatePlacementPresentation(value); return value;}
    return {order: index, collapsed: false, color: 'default'};
}
export function stablePageJSON(value: unknown): string {
    return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ?
        Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
async function activity(boardId: string, type: string) {
    await db.activities.add({id: uid('activity'), boardId, type, summary: type, createdAt: Date.now()});
}
async function putPresentation(boardId: string, value: PagePresentation) {
    validatePagePresentation(value);
    await db.settings.put({key: key(boardId), value, updatedAt: Date.now()});
}
async function pageEntity(entityId: string) {
    const e = await db.entities.get(entityId);
    if (!e || !(e.type === 'project' || e.type === 'document' && e.metadata?.workspacePage === true)) {
        throw new Error('Missing workspace page owner.');
    }
    return e;
}
async function createOwner(title: string) {
    const time = Date.now();
    const owner: WorkspaceEntity = {id: uid('document'), type: 'document', title,
        createdAt: time, updatedAt: time, searchTerms: title.toLocaleLowerCase().split(/\s+/), metadata: {workspacePage: true}};
    await db.entities.add(owner);
    await captureEntityTransition(undefined, owner, 'created');
    return owner;
}
async function snapshot(boardId: string): Promise<PageSnapshot> {
    const board = await db.boards.get(boardId);
    const setting = await db.settings.get(key(boardId));
    if (!board || !setting) throw new Error('Workspace page no longer exists.');
    validatePagePresentation(setting.value);
    const presentation = setting.value;
    const owner = await pageEntity(presentation.ownerEntityId);
    const placements = (await db.placements.where('boardId').equals(boardId).toArray()).sort((a, b) => a.id.localeCompare(b.id));
    const allLinks = await db.relationships.toArray();
    const relationshipIds = new Set(presentation.connectors.map(c => c.relationshipId));
    const relationships = allLinks.filter(r => relationshipIds.has(r.id)).sort((a, b) => a.id.localeCompare(b.id));
    const entities = (await db.entities.bulkGet(placements.map(p => p.entityId))).filter((e): e is WorkspaceEntity => Boolean(e));
    const parents = allLinks.filter(r => r.type === 'page-parent' && r.confirmed);
    const parentId = parents.find(r => r.fromEntityId === owner.id)?.toEntityId;
    const children = (await db.entities.bulkGet(parents.filter(r => r.toEntityId === owner.id).map(r => r.fromEntityId)))
        .filter((e): e is WorkspaceEntity => Boolean(e));
    return {board, owner, presentation, placements, entities, relationships, children,
        parent: parentId ? await db.entities.get(parentId) : undefined,
        version: {revision: presentation.revision, fingerprint: stablePageJSON({board, placements, presentation, relationships})}};
}
export function loadPageSnapshot(boardId: string) {
    return db.transaction('r', tables(), () => snapshot(boardId));
}
export async function recordPageTransition(before: PageSnapshot | undefined, after: PageSnapshot, reason: string, sessionId?: string) {
    await captureTransition(before ? {snapshot: layoutSnapshot(before), version: {kind: 'page', value: before.version}} : undefined,
        layoutSnapshot(after), {kind: 'page', value: after.version}, reason, sessionId);
}
// Legacy actions use the same atomic boundary as native page commands.
export function mutatePages<T>(boardIds: string[] | (() => Promise<string[]>), write: () => Promise<T>, reason: string): Promise<T> {
    return db.transaction('rw', db.tables, async () => {
        const ids = [...new Set(typeof boardIds === 'function' ? await boardIds() : boardIds)];
        const before = await Promise.all(ids.map(id => openWorkspacePage(id)));
        const value = await write();
        for (const page of before) if (await db.boards.get(page.board.id)) await recordPageTransition(page, await snapshot(page.board.id), reason);
        return value;
    });
}
export function createWorkspacePage(title: string, parentEntityId?: string): Promise<PageSnapshot> {
    if (!title.trim() || title.length > 500) return Promise.reject(new Error('Page title is required (maximum 500 characters).'));
    return db.transaction('rw', tables(), async () => {
        const owner = await createOwner(title.trim());
        const time = Date.now();
        const board = {id: uid('board'), name: owner.title, createdAt: time, updatedAt: time};
        await db.boards.add(board);
        await putPresentation(board.id, defaults(owner.id));
        if (parentEntityId) await setPageParent(owner.id, parentEntityId);
        await activity(board.id, 'workspace-page-created');
        const after = await snapshot(board.id);
        await recordPageTransition(undefined, after, 'created');
        return after;
    });
}
export function openWorkspacePage(boardId: string): Promise<PageSnapshot> {
    return db.transaction('rw', tables(), async () => {
        const board = await db.boards.get(boardId);
        if (!board) throw new Error('Board no longer exists.');
        if (!await db.settings.get(key(boardId))) {
            const projectId = boardId.startsWith('project-board:') ? decodeURIComponent(boardId.slice(14)) : undefined;
            const project = projectId ? await db.entities.get(projectId) : undefined;
            const owner = project?.type === 'project' ? project : await createOwner(board.name);
            await putPresentation(boardId, defaults(owner.id));
            await activity(boardId, 'workspace-page-opened');
            await recordPageTransition(undefined, await snapshot(boardId), 'baseline');
        }
        return snapshot(boardId);
    });
}
export function openProjectWorkspace(projectEntityId: string) {
    return db.transaction('rw', tables(), async () => {
        if ((await pageEntity(projectEntityId)).type !== 'project') throw new Error('Expected a project.');
        const boardId = 'project-board:' + encodeURIComponent(projectEntityId);
        // Reopening never unexpectedly adds or rearranges members; explicit refresh does.
        if (!await db.boards.get(boardId)) await openBrainCanvas(projectEntityId);
        return openWorkspacePage(boardId);
    });
}
export function refreshProjectReferences(boardId: string) {
    return db.transaction('rw', tables(), async () => {
        const before = await snapshot(boardId);
        if (before.owner.type !== 'project') throw new Error('Page is not a project.');
        await openBrainCanvas(before.owner.id);
        const after = await snapshot(boardId);
        await recordPageTransition(before, after, 'references-refreshed');
        return after;
    });
}
export function addPageReference(boardId: string, entityId: string) {
    return db.transaction('rw', tables(), async () => {
        const before = await snapshot(boardId);
        const entity = await db.entities.get(entityId);
        if (!entity) throw new Error('Referenced object no longer exists.');
        if (before.placements.some(p => p.entityId === entityId)) return before;
        const time = Date.now();
        const bottom = before.placements.reduce((n, p) => Math.max(n, p.y + p.height), 0);
        const placement: BoardPlacement = {id: uid('placement'), boardId, entityId, kind: entity.type,
            x: 40, y: bottom + 40, width: 480, height: 240, zIndex: time, createdAt: time, updatedAt: time,
            metadata: {page: {order: Math.max(-1, ...before.placements.map((p, i) => placementPresentation(p, i).order)) + 1,
                collapsed: false, color: 'default'}}};
        validateGeometry(placement);
        await db.placements.add(placement);
        await putPresentation(boardId, {...before.presentation, revision: before.presentation.revision + 1});
        await activity(boardId, 'workspace-reference-added');
        const after = await snapshot(boardId);
        await recordPageTransition(before, after, 'reference-added');
        return after;
    });
}
export function setPageParent(pageEntityId: string, parentEntityId?: string) {
    return db.transaction('rw', tables(), async () => {
        await pageEntity(pageEntityId);
        if (parentEntityId) await pageEntity(parentEntityId);
        const links = (await db.relationships.toArray()).filter(r => r.type === 'page-parent' && r.confirmed);
        const visited = new Set<string>([pageEntityId]);
        let current = parentEntityId;
        while (current) {
            if (visited.has(current)) throw new Error('Page parent would create a cycle.');
            visited.add(current);
            current = links.find(r => r.fromEntityId === current)?.toEntityId;
        }
        await db.relationships.bulkDelete(links.filter(r => r.fromEntityId === pageEntityId).map(r => r.id));
        if (parentEntityId) {
            const time = Date.now();
            await db.relationships.add({id: uid('page-parent'), fromEntityId: pageEntityId, toEntityId: parentEntityId,
                type: 'page-parent', origin: 'user', confirmed: true, createdAt: time, updatedAt: time});
        }
        await db.activities.add({id: uid('activity'), entityId: pageEntityId, type: 'page-parent-changed',
            summary: 'Changed page parent', createdAt: Date.now()});
    });
}

interface LayoutState {placements: BoardPlacement[]; presentation: PagePresentation; relationships: RelationshipRecord[]}
// Session-local undo contains presentation only; never canonical text or binary assets.
const undos = new Map<string, {boardId: string; before: LayoutState; after: LayoutState; version: PageVersion}>();
function layout(s: PageSnapshot): LayoutState {
    return structuredClone({placements: s.placements, presentation: s.presentation, relationships: s.relationships});
}
function checkVersion(current: PageVersion, expected: PageVersion) {
    if (current.revision !== expected.revision || current.fingerprint !== expected.fingerprint) {
        throw new Error('Page conflict: another view changed this layout. Reload before retrying.');
    }
}
export function applyPageCommand(boardId: string, expected: PageVersion, command: PageCommand, sourceSessionId?: string): Promise<PageSnapshot> {
    return db.transaction('rw', tables(), async () => {
        const before = await snapshot(boardId);
        checkVersion(before.version, expected);
        const state = layout(before);
        const p = state.presentation;
        const placement = (id: string) => {
            const result = state.placements.find(item => item.id === id);
            if (!result) throw new Error('Missing placement in this page.');
            return result;
        };
        const connector = (id: string) => {
            const result = p.connectors.find(item => item.id === id);
            if (!result) throw new Error('Missing page connector.');
            return result;
        };
        const present = (id: string, patch: Partial<PlacementPresentation>) => {
            const item = placement(id);
            const value = {...placementPresentation(item, state.placements.indexOf(item)), ...patch};
            validatePlacementPresentation(value);
            item.metadata = {...item.metadata, page: value};
        };
        switch (command.type) {
            case 'move-resize':
                for (const change of command.placements) {
                    validateGeometry(change);
                    Object.assign(placement(change.id), {x: change.x, y: change.y, width: change.width, height: change.height});
                }
                break;
            case 'reorder':
                if (command.placementIds.length !== state.placements.length || new Set(command.placementIds).size !== state.placements.length) {
                    throw new Error('Order must contain each placement exactly once.');
                }
                command.placementIds.forEach((id, order) => present(id, {order}));
                break;
            case 'group':
                p.groups = [...p.groups.filter(g => g.id !== command.group.id), structuredClone(command.group)];
                command.placementIds.forEach(id => present(id, {groupId: command.group.id}));
                break;
            case 'ungroup': {
                const group = p.groups.find(g => g.id === command.groupId);
                if (!group) throw new Error('Missing group.');
                p.groups = p.groups.filter(g => g.id !== group.id).map(g => g.parentId === group.id ? {...g, parentId: group.parentId} : g);
                state.placements.filter(item => placementPresentation(item).groupId === group.id)
                    .forEach(item => present(item.id, {groupId: group.parentId}));
                break;
            }
            case 'collapse':
                if (Boolean(command.placementId) === Boolean(command.groupId)) throw new Error('Choose one collapse target.');
                if (command.placementId) present(command.placementId, {collapsed: command.collapsed});
                else {
                    const group = p.groups.find(g => g.id === command.groupId);
                    if (!group) throw new Error('Missing group.');
                    group.collapsed = command.collapsed;
                }
                break;
            case 'style': command.placementIds.forEach(id => present(id, {color: command.color})); break;
            case 'view': p.mode = command.mode; p.viewport = structuredClone(command.viewport); break;
            case 'remove-reference': {
                command.placementIds.forEach(placement);
                const removed = new Set(command.placementIds);
                state.placements = state.placements.filter(item => !removed.has(item.id));
                p.connectors = p.connectors.filter(c => !removed.has(c.fromPlacementId) && !removed.has(c.toPlacementId));
                break;
            }
            case 'connect': {
                const from = placement(command.fromPlacementId), to = placement(command.toPlacementId);
                if (from.entityId === to.entityId) throw new Error('Cannot connect an object to itself.');
                // Structural relationships require their own validation workflows.
                if (!['related', 'supports', 'depends-on', 'references'].includes(command.relationType)) throw new Error('Unsupported connector relationship type.');
                if (command.label !== undefined && (typeof command.label !== 'string' || command.label.length > 500)) throw new Error('Invalid connector label.');
                let r = (await db.relationships.where('fromEntityId').equals(from.entityId).toArray())
                    .find(r => r.toEntityId === to.entityId && r.type === command.relationType && r.confirmed);
                if (!r) {
                    const time = Date.now();
                    r = {id: uid('relationship'), fromEntityId: from.entityId, toEntityId: to.entityId, type: command.relationType,
                        label: command.label, origin: 'user', confirmed: true, createdAt: time, updatedAt: time};
                    await db.relationships.add(r);
                } else if (!state.relationships.some(item => item.id === r!.id)) {
                    // Existing semantic links must survive undo of their first visual reference.
                    before.relationships.push(r);
                }
                p.connectors.push({id: uid('connector'), relationshipId: r.id, fromPlacementId: from.id, toPlacementId: to.id,
                    points: [], color: '#64748b', dashed: false, mode: 'orthogonal'});
                break;
            }
            case 'connector-style': {
                const c = connector(command.connectorId);
                Object.assign(c, {points: command.points, color: command.color, dashed: command.dashed, mode: command.mode});
                break;
            }
            case 'remove-connector': {
                if (!['page', 'everywhere'].includes(command.scope)) throw new Error('Invalid connector removal scope.');
                const c = connector(command.connectorId);
                if (command.scope === 'everywhere') {
                    // Avoid dangling connectors on another page: require page-local removal first there.
                    const others = await db.settings.where('key').startsWith('workspace-page:').toArray();
                    for (const setting of others) {
                        validatePagePresentation(setting.value);
                        if (setting.key !== key(boardId) && setting.value.connectors.some(item => item.relationshipId === c.relationshipId)) {
                            throw new Error('Relationship is displayed on another page. Remove those connectors first.');
                        }
                    }
                    await db.relationships.delete(c.relationshipId);
                    p.connectors = p.connectors.filter(item => item.relationshipId !== c.relationshipId);
                } else p.connectors = p.connectors.filter(item => item.id !== c.id);
                break;
            }
            default: throw new Error('Unsupported page command.');
        }
        p.revision++;
        validatePagePresentation(p);
        for (const item of state.placements) {
            const page = placementPresentation(item);
            if (page.groupId && !p.groups.some(g => g.id === page.groupId)) throw new Error('Missing placement group.');
            if (!await db.entities.get(item.entityId)) throw new Error('Referenced object no longer exists.');
        }
        const removed = before.placements.filter(item => !state.placements.some(next => next.id === item.id));
        await db.placements.bulkDelete(removed.map(item => item.id));
        for (const item of state.placements) {
            if (stablePageJSON(item) !== stablePageJSON(before.placements.find(old => old.id === item.id))) {
                await db.placements.put({...item, updatedAt: Date.now()});
            }
        }
        await putPresentation(boardId, p);
        await activity(boardId, 'page-' + command.type);
        const after = await snapshot(boardId);
        await recordPageTransition(before, after, 'page-' + command.type, sourceSessionId);
        const token = uid('undo');
        undos.set(token, {boardId, before: layout(before), after: layout(after), version: after.version});
        if (undos.size > 100) undos.delete(undos.keys().next().value!);
        return {...after, undoToken: token};
    });
}
export function undoPageCommand(boardId: string, token: string): Promise<PageSnapshot> {
    return db.transaction('rw', tables(), async () => {
        const undo = undos.get(token);
        if (!undo || undo.boardId !== boardId) throw new Error('Undo is no longer available in this session.');
        const current = await snapshot(boardId);
        checkVersion(current.version, undo.version);
        const relationIds = new Set([...undo.before.relationships, ...undo.after.relationships].map(r => r.id));
        for (const id of relationIds) {
            const expected = undo.after.relationships.find(r => r.id === id);
            const previous = undo.before.relationships.find(r => r.id === id);
            const actual = await db.relationships.get(id);
            // Page-only removal does not change the semantic relationship.
            if (!expected && previous && stablePageJSON(actual) === stablePageJSON(previous)) continue;
            if (stablePageJSON(actual) !== stablePageJSON(expected)) throw new Error('Relationship conflict prevents undo.');
            if (previous) await db.relationships.put(previous);
            else {
                const settings = await db.settings.where('key').startsWith('workspace-page:').toArray();
                if (settings.some(s => s.key !== key(boardId) && (s.value as PagePresentation).connectors.some(c => c.relationshipId === id))) {
                    throw new Error('Relationship conflict: another page now uses this link.');
                }
                await db.relationships.delete(id);
            }
        }
        for (const placement of undo.before.placements) if (!await db.entities.get(placement.entityId)) throw new Error('Cannot restore missing object reference.');
        await db.placements.bulkDelete(current.placements.filter(p => !undo.before.placements.some(b => b.id === p.id)).map(p => p.id));
        await db.placements.bulkPut(undo.before.placements);
        await putPresentation(boardId, {...undo.before.presentation, revision: current.presentation.revision + 1});
        await activity(boardId, 'page-undo');
        const after = await snapshot(boardId);
        await recordPageTransition(current, after, 'undo');
        undos.delete(token);
        return after;
    });
}

export function restorePageLayout(boardId: string, expected: PageVersion, layout: LayoutSnapshot, sourceSessionId?: string): Promise<PageSnapshot> {
    validateSnapshot(layout);
    if (layout.kind !== 'page' || layout.boardId !== boardId) throw new Error('Page snapshot target mismatch.');
    return db.transaction('rw', tables(), async () => {
        const before = await snapshot(boardId); checkVersion(before.version, expected);
        if (layout.presentation.ownerEntityId !== before.owner.id) throw new Error('Page ownership conflict.');
        const restored: BoardPlacement[] = [];
        for (const item of layout.placements) {
            if (!await db.entities.get(item.entityId)) throw new Error('Cannot restore a missing object reference.');
            const existing = await db.placements.get(item.id);
            if (existing && (existing.boardId !== boardId || existing.entityId !== item.entityId)) throw new Error('Placement identity conflict.');
            const {page, ...geometry} = item;
            restored.push({...existing, ...geometry, boardId, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
                metadata: {...existing?.metadata, page}});
        }
        for (const c of layout.presentation.connectors) {
            const r = await db.relationships.get(c.relationshipId);
            const from = restored.find(p => p.id === c.fromPlacementId), to = restored.find(p => p.id === c.toPlacementId);
            if (!r || !r.confirmed || r.fromEntityId !== from?.entityId || r.toEntityId !== to?.entityId) {
                throw new Error('Missing or changed connector relationship. Restore its source explicitly first.');
            }
        }
        await db.placements.bulkDelete(before.placements.filter(p => !restored.some(next => next.id === p.id)).map(p => p.id));
        await db.placements.bulkPut(restored);
        await putPresentation(boardId, {...layout.presentation, revision: before.presentation.revision + 1});
        await activity(boardId, 'page-restored');
        const after = await snapshot(boardId); await recordPageTransition(before, after, 'restore', sourceSessionId);
        return after;
    });
}
