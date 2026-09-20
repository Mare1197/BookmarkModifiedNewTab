import {browser} from 'wxt/browser';
import {syncObjectMentions} from './brainRepository';
import {validateBrainSetting, validateMemoryPolicy} from './brainValidation';
import {syncTaskReminder} from './taskReminders';
import {richContentToPlainText, validateRichContent} from './richContent';
import {validateAssetDataUrl, validateEffectivePageState} from './pageBackupValidation';
import {validateGeometry, validatePagePresentation, validatePlacementPresentation} from './pageValidation';
import {captureEntityTransition} from './revisionRepository';
import {mutatePages, openWorkspacePage, recordPageTransition} from './pageRepository';
import type {PagePresentation} from '../../workspace/pageTypes';

import type {
    AssetRecord,
    BoardPlacement,
    BoardRecord,
    BoardTemplateLayout,
    BoardTemplateRecord,
    FolderMembership,
    RelationshipRecord,
    SavedFilter,
    WorkspaceActivity,
    WorkspaceEntity,
    WorkspaceFolder,
    WorkspaceSession,
    WorkspaceTask
} from '../../workspace/types';
import {workspaceClient} from './workspaceClient';
import {canonicalizeUrl, pageEntityId} from './workspaceIdentity';

export interface WorkspaceSnapshot {
    assets: AssetRecord[];
    boards: BoardRecord[];
    boardTemplates: BoardTemplateRecord[];
    entities: WorkspaceEntity[];
    folders: WorkspaceFolder[];
    folderMemberships: FolderMembership[];
    placements: BoardPlacement[];
    boardMemberships: Array<Pick<BoardPlacement, 'boardId' | 'entityId'>>;
    relationships: RelationshipRecord[];
    savedFilters: SavedFilter[];
    tasks: WorkspaceTask[];
    activities: WorkspaceActivity[];
    workspaceSessions: WorkspaceSession[];
}

const now = () => Date.now();
const makeId = (prefix: string) => prefix + ':' + crypto.randomUUID();

const defaultFilters: Array<Pick<SavedFilter, 'id' | 'name' | 'query'>> = [
    {id: 'filter:recent', name: 'Recently updated', query: 'after:7d'},
    {id: 'filter:notes', name: 'Notes', query: 'type:note'},
    {id: 'filter:clips', name: 'Web clips', query: 'type:clip'},
    {id: 'filter:tasks', name: 'With tasks', query: 'has:task'}
];

export function isBuiltInFilter(filterId: string): boolean {
    return defaultFilters.some(filter => filter.id === filterId);
}

const defaultTemplates: Array<Pick<BoardTemplateRecord, 'id' | 'name' | 'description' | 'layout'>> = [
    {id: 'template:research', name: 'Research', description: 'Sources, working notes, and a synthesis task.', layout: 'research'},
    {id: 'template:reading', name: 'Reading', description: 'An inbox-style reading queue with summary notes.', layout: 'reading'},
    {id: 'template:project', name: 'Project', description: 'Goals, next actions, references, and review space.', layout: 'project'},
    {id: 'template:blank', name: 'Blank', description: 'An empty board ready for your own layout.', layout: 'blank'}
];

function searchTerms(...values: Array<string | undefined>): string[] {
    return Array.from(new Set(values
        .flatMap(value => (value || '').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u))
        .filter(Boolean))).slice(0, 128);
}

async function recordActivity(
    type: string,
    summary: string,
    context: Partial<Pick<WorkspaceActivity, 'boardId' | 'entityId' | 'sessionId' | 'metadata'>> = {}
): Promise<void> {
    await workspaceClient.activities.add({
        id: makeId('activity'),
        type,
        summary,
        boardId: context.boardId,
        entityId: context.entityId,
        sessionId: context.sessionId,
        createdAt: now(),
        metadata: context.metadata
    });
}

async function ensureWorkspaceDefaults(): Promise<void> {
    const timestamp = now();
    const [filterCount, templateCount] = await Promise.all([
        workspaceClient.savedFilters.count(),
        workspaceClient.boardTemplates.count()
    ]);
    await workspaceClient.transaction('rw', workspaceClient.savedFilters,
        workspaceClient.boardTemplates, async () => {
            if (filterCount === 0) {
                await workspaceClient.savedFilters.bulkPut(defaultFilters.map(filter => ({
                    ...filter,
                    createdAt: timestamp,
                    updatedAt: timestamp
                })));
            }
            if (templateCount === 0) {
                await workspaceClient.boardTemplates.bulkPut(defaultTemplates.map(template => ({
                    ...template,
                    builtIn: true,
                    createdAt: timestamp,
                    updatedAt: timestamp
                })));
            }
        });
}

async function findOpenPosition(
    boardId: string,
    width: number,
    height: number
): Promise<{x: number; y: number}> {
    const placements = await workspaceClient.placements.where('boardId').equals(boardId).toArray();
    for (let row = 0; row < 20; row++) {
        for (let column = 0; column < 3; column++) {
            const candidate = {x: 70 + column * 320, y: 70 + row * 230};
            const overlaps = placements.some(placement =>
                candidate.x < placement.x + placement.width + 18 &&
                candidate.x + width + 18 > placement.x &&
                candidate.y < placement.y + placement.height + 18 &&
                candidate.y + height + 18 > placement.y);
            if (!overlaps) {
                return candidate;
            }
        }
    }
    return {x: 70, y: 70 + placements.length * 36};
}

async function seedBoard(board: BoardRecord): Promise<void> {
    const existingEntities = await workspaceClient.entities.limit(5).toArray();
    const entities = [...existingEntities];
    if (entities.length === 0) {
        const tabs = await browser.tabs.query({currentWindow: true});
        for (const tab of tabs.slice(0, 4)) {
            if (!tab.url) {
                continue;
            }
            const url = canonicalizeUrl(tab.url);
            if (!url) {
                continue;
            }
            const entity: WorkspaceEntity = {
                id: pageEntityId(url),
                type: 'page',
                title: tab.title || url,
                canonicalUrl: url,
                createdAt: now(),
                updatedAt: now(),
                searchTerms: searchTerms(tab.title, url),
                metadata: {sourceKind: 'tab', tabId: tab.id, live: true}
            };
            await workspaceClient.entities.put(entity);
            entities.push(entity);
        }
    }
    const starter = entities.slice(0, 3);
    const note: WorkspaceEntity = {
        id: makeId('note'),
        type: 'note',
        title: 'Start collecting ideas',
        createdAt: now(),
        updatedAt: now(),
        searchTerms: ['start', 'collecting', 'ideas'],
        metadata: {body: 'Add a tab, note, image, or connection to this board.', tone: 'yellow'}
    };
    await workspaceClient.entities.put(note);
    starter.push(note);
    await workspaceClient.placements.bulkPut(starter.map((entity, index) => ({
        id: makeId('placement'),
        boardId: board.id,
        entityId: entity.id,
        kind: entity.type,
        x: 70 + (index % 2) * 310,
        y: 70 + Math.floor(index / 2) * 220,
        width: entity.type === 'note' ? 250 : 280,
        height: entity.type === 'note' ? 180 : 150,
        zIndex: index + 1,
        createdAt: now(),
        updatedAt: now()
    })));
}

export async function ensureWorkspace(): Promise<BoardRecord> {
    await workspaceClient.open();
    await ensureWorkspaceDefaults();
    const existing = await workspaceClient.boards.orderBy('createdAt').first();
    if (existing) {
        return existing;
    }
    const board: BoardRecord = {
        id: makeId('board'),
        name: 'Research Board',
        createdAt: now(),
        updatedAt: now()
    };
    await workspaceClient.boards.add(board);
    await seedBoard(board);
    return board;
}

export async function loadWorkspace(boardId?: string): Promise<WorkspaceSnapshot> {
    const defaultBoard = await ensureWorkspace();
    const selectedBoardId = boardId || defaultBoard.id;
    const activePlacements = await workspaceClient.placements.where('boardId').equals(selectedBoardId).toArray();
    const [assets, boards, boardTemplates, folders, folderMemberships, placements, relationships,
        savedFilters, tasks, activities, workspaceSessions] = await Promise.all([
        workspaceClient.assets.where('entityId').anyOf(activePlacements.map(item => item.entityId)).toArray(),
        workspaceClient.boards.orderBy('createdAt').toArray(),
        workspaceClient.boardTemplates.orderBy('name').toArray(),
        workspaceClient.folders.toArray().then(items => items.sort((left, right) =>
            left.title.localeCompare(right.title))),
        workspaceClient.folderMemberships.toArray(),
        workspaceClient.placements.toArray(),
        workspaceClient.relationships.toArray(),
        workspaceClient.savedFilters.orderBy('name').toArray(),
        workspaceClient.tasks.toArray(),
        workspaceClient.activities.orderBy('createdAt').reverse().limit(500).toArray(),
        workspaceClient.workspaceSessions.orderBy('updatedAt').reverse().toArray()
    ]);
    const entities = await workspaceClient.entities.toArray();
    return {
        activities,
        assets,
        boards,
        boardTemplates,
        entities,
        folders,
        folderMemberships,
        placements: placements.filter(placement => placement.boardId === selectedBoardId),
        boardMemberships: placements.map(({boardId, entityId}) => ({boardId, entityId})),
        relationships,
        savedFilters,
        tasks,
        workspaceSessions
    };
}

export async function createBoard(name = 'Untitled board'): Promise<BoardRecord> {
    const board = {id: makeId('board'), name, createdAt: now(), updatedAt: now()};
    await workspaceClient.boards.add(board);
    await recordActivity('board-created', 'Board created', {boardId: board.id});
    return board;
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
    await mutatePages([boardId], async () => {
    await workspaceClient.boards.update(boardId, {name: name.trim() || 'Untitled board', updatedAt: now()});
    const setting = await workspaceClient.settings.get('workspace-page:' + boardId);
    if (setting) {
        validatePagePresentation(setting.value);
        const owner = await workspaceClient.entities.get(setting.value.ownerEntityId);
        if (owner) {
            const next = {...owner, title: name.trim() || 'Untitled board', updatedAt: now(),
                contentRevision: (owner.contentRevision || 0) + 1, searchTerms: searchTerms(name, String(owner.metadata?.body || ''))};
            await workspaceClient.entities.put(next); await captureEntityTransition(owner, next, 'renamed');
        }
    }
    await recordActivity('board-renamed', 'Board renamed', {boardId});
    }, 'renamed');
}

export async function duplicateBoard(boardId: string): Promise<BoardRecord> {
    return workspaceClient.transaction('rw', workspaceClient.tables, async () => {
    const source = await workspaceClient.boards.get(boardId);
    if (!source) {
        throw new Error('Board not found.');
    }
    const board = await createBoard(source.name + ' copy');
    const placements = await workspaceClient.placements.where('boardId').equals(boardId).toArray();
    const ids = new Map(placements.map(p => [p.id, makeId('placement')]));
    await workspaceClient.placements.bulkPut(placements.map(placement => ({
        ...placement,
        id: ids.get(placement.id)!,
        boardId: board.id,
        createdAt: now(),
        updatedAt: now()
    })));
    const setting = await workspaceClient.settings.get('workspace-page:' + boardId);
    if (setting) {
        validatePagePresentation(setting.value);
        const owner: WorkspaceEntity = {id: makeId('document'), type: 'document', title: board.name, createdAt: now(), updatedAt: now(),
            searchTerms: searchTerms(board.name), metadata: {workspacePage: true}};
        await workspaceClient.entities.add(owner);
        await captureEntityTransition(undefined, owner, 'created');
        const value: PagePresentation = {...setting.value, ownerEntityId: owner.id, revision: 0,
            connectors: setting.value.connectors.map(c => ({...c, id: makeId('connector'), fromPlacementId: ids.get(c.fromPlacementId)!, toPlacementId: ids.get(c.toPlacementId)!}))};
        validatePagePresentation(value);
        await workspaceClient.settings.put({key: 'workspace-page:' + board.id, value, updatedAt: now()});
    }
    await recordActivity('board-duplicated', 'Board duplicated', {boardId: board.id});
    await recordPageTransition(undefined, await openWorkspacePage(board.id), 'created');
    return board;
    });
}

export async function deleteBoard(boardId: string): Promise<BoardRecord> {
    const boards = await workspaceClient.boards.toArray();
    if (boards.length <= 1) {
        throw new Error('Keep at least one board.');
    }
    const board = boards.find(candidate => candidate.id === boardId);
    const placements = await workspaceClient.placements.where('boardId').equals(boardId).toArray();
    await workspaceClient.transaction('rw', workspaceClient.boards, workspaceClient.placements,
        workspaceClient.settings, async () => {
            await workspaceClient.settings.put({
                key: 'trash:' + now() + ':board',
                value: {kind: 'board', board, placements, pageSetting: await workspaceClient.settings.get('workspace-page:' + boardId)},
                updatedAt: now()
            });
        await workspaceClient.placements.where('boardId').equals(boardId).delete();
        await workspaceClient.boards.delete(boardId);
        await workspaceClient.settings.delete('workspace-page:' + boardId);
    });
    await recordActivity('board-trashed', 'Board moved to Trash', {boardId});
    return boards.find(board => board.id !== boardId) as BoardRecord;
}

export async function addNote(boardId: string): Promise<BoardPlacement> {
    const timestamp = now();
    const position = await findOpenPosition(boardId, 250, 180);
    const entity: WorkspaceEntity = {
        id: makeId('note'),
        type: 'note',
        title: 'New note',
        createdAt: timestamp,
        updatedAt: timestamp,
        searchTerms: ['new', 'note'],
        metadata: {body: '', tone: 'yellow'}
    };
    const placement: BoardPlacement = {
        id: makeId('placement'),
        boardId,
        entityId: entity.id,
        kind: 'note',
        x: position.x,
        y: position.y,
        width: 250,
        height: 180,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await mutatePages([boardId], async () => {
        await workspaceClient.entities.add(entity);
        await workspaceClient.placements.add(placement);
        await captureEntityTransition(undefined, entity, 'created');
    }, 'note-added');
    await recordActivity('note-added', 'Note added', {boardId, entityId: entity.id});
    return placement;
}

export async function addCurrentTab(boardId: string): Promise<BoardPlacement> {
    const tabs = await browser.tabs.query({currentWindow: true});
    const tab = tabs
        .filter(candidate => candidate.url && canonicalizeUrl(candidate.url))
        .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    if (!tab?.url) {
        throw new Error('No recent web tab is available.');
    }
    const timestamp = now();
    const url = canonicalizeUrl(tab.url);
    const entityId = pageEntityId(url);
    const existing = await workspaceClient.entities.get(entityId);
    const position = await findOpenPosition(boardId, 280, 150);
    await workspaceClient.entities.put({
        ...existing,
        id: entityId,
        type: 'page',
        title: tab.title || existing?.title || url,
        canonicalUrl: url,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
        searchTerms: searchTerms(tab.title, url),
        metadata: {...existing?.metadata, sourceKind: 'tab', tabId: tab.id, live: true}
    });
    const placement: BoardPlacement = {
        id: makeId('placement'),
        boardId,
        entityId,
        kind: 'page',
        x: position.x,
        y: position.y,
        width: 280,
        height: 150,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await workspaceClient.placements.add(placement);
    await recordActivity('page-added', 'Recent web tab added', {boardId, entityId});
    return placement;
}

export async function updatePlacement(placementId: string, patch: Partial<BoardPlacement>): Promise<void> {
    await mutatePages(async () => {const p = await workspaceClient.placements.get(placementId); return p ? [p.boardId] : [];}, async () => {
        const current = await workspaceClient.placements.get(placementId);
        if (!current) return;
        if (patch.id && patch.id !== current.id || patch.boardId && patch.boardId !== current.boardId || patch.entityId && patch.entityId !== current.entityId) {
            throw new Error('Placement identity cannot be changed.');
        }
        validateGeometry({...current, ...patch});
        await workspaceClient.placements.update(placementId, {...patch, updatedAt: now()});
    }, 'placement-updated');
}

export async function updateEntity(entityId: string, patch: Partial<WorkspaceEntity>): Promise<void> {
    await workspaceClient.transaction('rw', [workspaceClient.entities, workspaceClient.relationships, workspaceClient.activities, workspaceClient.workspaceRevisions], async () => {
    const current = await workspaceClient.entities.get(entityId);
    if (!current) {
        return;
    }
    if (patch.richContent !== undefined) validateRichContent(patch.richContent);
    const bodyChanged = patch.metadata?.body !== undefined && patch.metadata.body !== current.metadata?.body;
    if (current.richContent && bodyChanged && !patch.richContent) {
        throw new Error('Use the rich text editor to change formatted content.');
    }
    if (Object.hasOwn(patch, 'richContent') && !patch.richContent) throw new Error('Cannot remove rich text implicitly.');
    if (patch.id && patch.id !== current.id || patch.type && patch.type !== current.type) throw new Error('Object identity cannot be changed.');
    const next: WorkspaceEntity = {
        ...current,
        ...patch,
        updatedAt: now(),
        metadata: {
            ...current.metadata,
            ...patch.metadata,
            workspaceEditedAt: now()
        }
    };
    next.contentRevision = (current.contentRevision || 0) + 1;
    if (next.richContent) next.metadata = {...next.metadata, body: richContentToPlainText(next.richContent)};
    next.searchTerms = searchTerms(next.title, next.canonicalUrl, String(next.metadata?.body || ''));
    await workspaceClient.entities.put(next);
    await captureEntityTransition(current, next, 'entity-updated');
    await syncObjectMentions(entityId);
    await recordActivity('entity-updated', 'Object updated', {entityId});
    });
}

export async function removePlacements(placementIds: string[]): Promise<void> {
    await mutatePages(async () => (await workspaceClient.placements.bulkGet(placementIds)).filter((p): p is BoardPlacement => Boolean(p)).map(p => p.boardId), async () => {
    const placements = (await workspaceClient.placements.bulkGet(placementIds))
        .filter(Boolean) as BoardPlacement[];
    if (!placements.length) {
        return;
    }
    await workspaceClient.transaction('rw', workspaceClient.placements, workspaceClient.settings, async () => {
        await workspaceClient.settings.put({
            key: 'trash:' + now() + ':placements',
            value: {kind: 'placements', placements},
            updatedAt: now()
        });
        await workspaceClient.placements.bulkDelete(placementIds);
        const removed = new Set(placementIds);
        for (const boardId of new Set(placements.map(p => p.boardId))) {
            const setting = await workspaceClient.settings.get('workspace-page:' + boardId);
            if (!setting) continue;
            validatePagePresentation(setting.value);
            await workspaceClient.settings.put({...setting, updatedAt: now(), value: {...setting.value, revision: setting.value.revision + 1,
                connectors: setting.value.connectors.filter(c => !removed.has(c.fromPlacementId) && !removed.has(c.toPlacementId))}});
        }
    });
    await recordActivity('placements-trashed', 'Card placement moved to Trash', {
        boardId: placements[0]?.boardId,
        metadata: {count: placements.length}
    });
    }, 'references-removed');
}

export async function duplicatePlacements(placementIds: string[]): Promise<void> {
    await mutatePages(async () => (await workspaceClient.placements.bulkGet(placementIds)).filter((p): p is BoardPlacement => Boolean(p)).map(p => p.boardId), async () => {
    const placements = (await workspaceClient.placements.bulkGet(placementIds))
        .filter(Boolean) as BoardPlacement[];
    await workspaceClient.placements.bulkPut(placements.map(placement => ({
        ...placement,
        id: makeId('placement'),
        x: placement.x + 32,
        y: placement.y + 32,
        zIndex: now(),
        createdAt: now(),
        updatedAt: now()
    })));
    }, 'references-duplicated');
}

export async function createRelationship(
    fromEntityId: string,
    toEntityId: string,
    type = 'related'
): Promise<RelationshipRecord> {
    const timestamp = now();
    const relationship: RelationshipRecord = {
        id: makeId('relationship'),
        fromEntityId,
        toEntityId,
        type,
        label: type,
        origin: 'user',
        confirmed: true,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await workspaceClient.relationships.add(relationship);
    await recordActivity('relationship-created', 'Relationship created', {entityId: fromEntityId});
    return relationship;
}

export async function deleteRelationship(relationshipId: string): Promise<void> {
    await mutatePages(async () => (await workspaceClient.settings.where('key').startsWith('workspace-page:').toArray())
        .filter(s => {validatePagePresentation(s.value); return s.value.connectors.some(c => c.relationshipId === relationshipId);})
        .map(s => s.key.slice('workspace-page:'.length)), async () => {
    await workspaceClient.relationships.delete(relationshipId);
    for (const s of await workspaceClient.settings.where('key').startsWith('workspace-page:').toArray()) {
        validatePagePresentation(s.value);
        if (s.value.connectors.some(c => c.relationshipId === relationshipId)) await workspaceClient.settings.put({...s, updatedAt: now(),
            value: {...s.value, revision: s.value.revision + 1, connectors: s.value.connectors.filter(c => c.relationshipId !== relationshipId)}});
    }
    }, 'relationship-removed');
}

export async function addImageAsset(
    boardId: string,
    file: File,
    assetType: 'image' | 'screenshot' = 'image'
): Promise<void> {
    const timestamp = now();
    const position = await findOpenPosition(boardId, 300, 240);
    const entity: WorkspaceEntity = {
        id: makeId(assetType),
        type: assetType,
        title: file.name,
        createdAt: timestamp,
        updatedAt: timestamp,
        searchTerms: searchTerms(file.name),
        metadata: {mimeType: file.type, size: file.size}
    };
    const asset: AssetRecord = {
        id: makeId('asset'),
        entityId: entity.id,
        type: assetType,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    const placement: BoardPlacement = {
        id: makeId('placement'),
        boardId,
        entityId: entity.id,
        kind: assetType,
        x: position.x,
        y: position.y,
        width: 300,
        height: 240,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await mutatePages([boardId], async () => {
            await workspaceClient.entities.add(entity);
            await workspaceClient.assets.add(asset);
            await workspaceClient.placements.add(placement);
        }, 'asset-added');
    await recordActivity(assetType + '-added', assetType === 'screenshot' ? 'Screenshot added' : 'Image added', {
        boardId,
        entityId: entity.id
    });
}

export async function captureVisibleTabAsset(boardId: string): Promise<void> {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (tab?.windowId === undefined) {
        throw new Error('The visible tab is not available.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
        browser.tabs.captureVisibleTab(tab.windowId, {format: 'png'}, (result: string) => {
            const runtimeError = browser.runtime.lastError;
            if (runtimeError) {
                reject(new Error(runtimeError.message));
                return;
            }
            resolve(result);
        });
    });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await addImageAsset(
        boardId,
        new File([blob], 'screenshot-' + timestamp + '.png', {type: 'image/png'}),
        'screenshot'
    );
}

export async function saveAnalysis(
    boardId: string,
    title: string,
    body: string,
    metadata: Record<string, unknown>
): Promise<void> {
    const timestamp = now();
    const position = await findOpenPosition(boardId, 320, 220);
    const entity: WorkspaceEntity = {
        id: makeId('analysis'),
        type: 'analysis',
        title,
        createdAt: timestamp,
        updatedAt: timestamp,
        searchTerms: searchTerms(title, body),
        metadata: {...metadata, body}
    };
    const placement: BoardPlacement = {
        id: makeId('placement'),
        boardId,
        entityId: entity.id,
        kind: 'analysis',
        x: position.x,
        y: position.y,
        width: 320,
        height: 220,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await mutatePages([boardId], async () => {
        await workspaceClient.entities.add(entity);
        await workspaceClient.placements.add(placement);
    }, 'analysis-added');
    await recordActivity('analysis-added', 'Analysis card added', {boardId, entityId: entity.id});
}

function placementSize(type: WorkspaceEntity['type']): {width: number; height: number} {
    if (type === 'note' || type === 'task') {
        return {width: 260, height: 180};
    }
    if (type === 'clip' || type === 'analysis') {
        return {width: 320, height: 220};
    }
    if (type === 'image' || type === 'screenshot') {
        return {width: 300, height: 240};
    }
    return {width: 280, height: 150};
}

async function placeEntityOnBoard(boardId: string, entity: WorkspaceEntity): Promise<BoardPlacement> {
    const existing = await workspaceClient.placements
        .where('[boardId+entityId]').equals([boardId, entity.id]).first();
    if (existing) {
        return existing;
    }
    const timestamp = now();
    const size = placementSize(entity.type);
    const position = await findOpenPosition(boardId, size.width, size.height);
    const placement: BoardPlacement = {
        id: makeId('placement'),
        boardId,
        entityId: entity.id,
        kind: entity.type,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await workspaceClient.placements.add(placement);
    return placement;
}

export interface QuickAddInput {
    kind: 'clip' | 'note' | 'task' | 'web';
    title?: string;
    url?: string;
    body?: string;
    boardIds: string[];
    folderIds?: string[];
    inbox: boolean;
    linkEntityId?: string;
    dueAt?: number;
    reminderAt?: number;
}

export interface PreparedClip {
    title: string;
    url: string;
    body: string;
}

async function recentWebTab() {
    const tabs = await browser.tabs.query({currentWindow: true});
    return tabs
        .filter(tab => !tab.incognito && tab.id !== undefined && tab.url && canonicalizeUrl(tab.url))
        .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
}

export async function prepareClipFromRecentTab(): Promise<PreparedClip> {
    const tab = await recentWebTab();
    if (!tab?.url || tab.id === undefined) {
        throw new Error('No recent web page is available to clip.');
    }
    const canonicalUrl = canonicalizeUrl(tab.url);
    const originPattern = new URL(canonicalUrl).origin + '/*';
    const granted = await browser.permissions.request({
        permissions: ['scripting'],
        origins: [originPattern]
    });
    if (!granted) {
        throw new Error('Page access was not granted. You can still paste clip text manually.');
    }
    const results = await browser.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => {
            const selected = window.getSelection()?.toString().trim();
            const source = selected || document.querySelector('article')?.textContent || document.body?.innerText || '';
            return {
                title: document.title,
                text: source.replace(/\s+/g, ' ').trim().slice(0, 40000)
            };
        }
    });
    const captured = results[0]?.result as {title?: string; text?: string} | undefined;
    if (!captured?.text) {
        throw new Error('No readable text was found on that page.');
    }
    return {
        title: captured.title || tab.title || canonicalUrl,
        url: canonicalUrl,
        body: captured.text
    };
}

export async function quickAdd(input: QuickAddInput): Promise<WorkspaceEntity> {
    let reminder: WorkspaceTask | undefined;
    const saved = await mutatePages(input.boardIds, async () => {
    const timestamp = now();
    const canonicalUrl = input.url ? canonicalizeUrl(input.url) : '';
    if ((input.kind === 'web' || input.kind === 'clip') && !canonicalUrl) {
        throw new Error('Enter a valid HTTP(S) URL.');
    }
    if ((input.kind === 'note' || input.kind === 'task') && !input.title?.trim() && !input.body?.trim()) {
        throw new Error('Add a title or some text.');
    }
    const type: WorkspaceEntity['type'] = input.kind === 'web' ? 'page' : input.kind;
    const entityId = input.kind === 'web' ? pageEntityId(canonicalUrl) : makeId(input.kind);
    const existing = await workspaceClient.entities.get(entityId);
    const title = input.title?.trim() || existing?.title ||
        (input.kind === 'clip' ? 'Web clip' : input.kind === 'task' ? 'New task' :
            input.kind === 'note' ? 'New note' : new URL(canonicalUrl).hostname);
    const entity: WorkspaceEntity = {
        ...existing,
        id: entityId,
        type,
        title,
        canonicalUrl: canonicalUrl || existing?.canonicalUrl,
        inboxAt: input.inbox ? existing?.inboxAt || timestamp : existing?.inboxAt,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
        searchTerms: searchTerms(title, canonicalUrl, input.body),
        metadata: {
            ...existing?.metadata,
            body: input.body?.trim() || existing?.metadata?.body || '',
            capturedAt: input.kind === 'clip' ? timestamp : existing?.metadata?.capturedAt,
            sourceKind: input.kind === 'web' || input.kind === 'clip' ? 'user' : 'workspace'
        }
    };
    await workspaceClient.entities.put(entity);
    for (const boardId of Array.from(new Set(input.boardIds))) {
        await placeEntityOnBoard(boardId, entity);
    }
    for (const folderId of Array.from(new Set(input.folderIds || []))) {
        if (!await workspaceClient.folders.get(folderId)) throw new Error('Destination folder no longer exists.');
        const existingMembership = await workspaceClient.folderMemberships
            .where('[folderId+entityId]').equals([folderId, entity.id]).first();
        if (!existingMembership) {
            await workspaceClient.folderMemberships.add({
                id: makeId('membership'),
                folderId,
                entityId: entity.id,
                sourceKind: 'user',
                position: await workspaceClient.folderMemberships.where('folderId').equals(folderId).count(),
                createdAt: timestamp,
                updatedAt: timestamp
            });
        }
    }
    if (input.kind === 'task') {
        const task: WorkspaceTask = {
            id: makeId('task'),
            entityId: entity.id,
            status: 'next',
            dueAt: input.dueAt,
            reminderAt: input.reminderAt,
            dependencyIds: [],
            createdAt: timestamp,
            updatedAt: timestamp
        };
        await workspaceClient.tasks.add(task);
        reminder = task;
    }
    if (input.linkEntityId && input.linkEntityId !== entity.id) {
        if (!await workspaceClient.entities.get(input.linkEntityId)) throw new Error('Linked object no longer exists.');
        await createRelationship(entity.id, input.linkEntityId,
            input.kind === 'task' ? 'task-for' : 'related');
    }
    await recordActivity(input.kind + '-added',
        input.kind === 'clip' ? 'Web clip added' : input.kind === 'task' ? 'Task created' :
            input.kind === 'note' ? 'Note added' : 'Page added', {
            boardId: input.boardIds[0],
            entityId: entity.id,
            metadata: {destinations: input.boardIds.length + (input.inbox ? 1 : 0)}
        });
    await captureEntityTransition(undefined, entity, 'created');
    return entity;
    }, 'quick-add');
    if (reminder) await syncTaskReminder(reminder, saved.title);
    return saved;
}

export async function addEntityToBoard(entityId: string, boardId: string): Promise<void> {
    await mutatePages([boardId], async () => {
    const entity = await workspaceClient.entities.get(entityId);
    if (!entity) {
        throw new Error('Workspace object not found.');
    }
    await placeEntityOnBoard(boardId, entity);
    await recordActivity('entity-placed', 'Added to board', {boardId, entityId});
    }, 'reference-added');
}

export async function setInboxState(entityId: string, inInbox: boolean): Promise<void> {
    const entity = await workspaceClient.entities.get(entityId);
    if (!entity) {
        throw new Error('Workspace object not found.');
    }
    await workspaceClient.entities.update(entityId, {
        inboxAt: inInbox ? entity.inboxAt || now() : undefined,
        updatedAt: now()
    });
    await recordActivity(inInbox ? 'inbox-added' : 'inbox-triaged',
        inInbox ? 'Added to Quick Inbox' : 'Removed from Quick Inbox', {entityId});
}

export async function createSavedFilter(name: string, query: string): Promise<SavedFilter> {
    const timestamp = now();
    const filter: SavedFilter = {
        id: makeId('filter'),
        name: name.trim() || query.trim() || 'Saved filter',
        query: query.trim(),
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await workspaceClient.savedFilters.add(filter);
    return filter;
}

export async function deleteSavedFilter(filterId: string): Promise<void> {
    if (isBuiltInFilter(filterId)) {
        throw new Error('Built-in filters cannot be deleted.');
    }
    await workspaceClient.savedFilters.delete(filterId);
}

export async function captureWindowSession(boardId: string, name?: string): Promise<WorkspaceSession> {
    const tabs = (await browser.tabs.query({currentWindow: true}))
        .filter(tab => !tab.incognito && tab.url && canonicalizeUrl(tab.url));
    if (!tabs.length) {
        throw new Error('No web tabs are available in this window.');
    }
    const timestamp = now();
    const sessionTabs: WorkspaceSession['tabs'] = [];
    for (const tab of tabs) {
        const url = canonicalizeUrl(tab.url as string);
        const entityId = pageEntityId(url);
        const existing = await workspaceClient.entities.get(entityId);
        const entity: WorkspaceEntity = {
            ...existing,
            id: entityId,
            type: 'page',
            title: existing?.metadata?.workspaceEditedAt ? existing.title : tab.title || existing?.title || url,
            canonicalUrl: url,
            createdAt: existing?.createdAt || timestamp,
            updatedAt: timestamp,
            searchTerms: searchTerms(existing?.title, tab.title, url, String(existing?.metadata?.body || '')),
            metadata: {...existing?.metadata, sourceKind: 'tab', tabId: tab.id}
        };
        await workspaceClient.entities.put(entity);
        await placeEntityOnBoard(boardId, entity);
        sessionTabs.push({
            entityId,
            title: entity.title,
            url: tab.url as string,
            index: tab.index,
            pinned: Boolean(tab.pinned)
        });
    }
    const board = await workspaceClient.boards.get(boardId);
    const session: WorkspaceSession = {
        id: makeId('session'),
        boardId,
        name: name?.trim() || (board?.name || 'Workspace') + ' · ' + new Date(timestamp).toLocaleString(),
        tabs: sessionTabs,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    await workspaceClient.workspaceSessions.add(session);
    await recordActivity('session-captured', 'Window session captured', {
        boardId,
        sessionId: session.id,
        metadata: {tabCount: session.tabs.length}
    });
    return session;
}

export async function openWorkspaceSession(sessionId: string): Promise<void> {
    const session = await workspaceClient.workspaceSessions.get(sessionId);
    if (!session) {
        throw new Error('Workspace session not found.');
    }
    const tabs = session.tabs.slice().sort((left, right) => left.index - right.index);
    const urls = tabs.map(tab => tab.url);
    if (urls.some(url => !canonicalizeUrl(url))) {
        throw new Error('This session contains a non-web URL and cannot be restored.');
    }
    if (!urls.length) {
        throw new Error('This session has no restorable web tabs.');
    }
    const restored = await browser.windows.create({url: urls});
    if (!restored) {
        throw new Error('The browser did not return the restored window.');
    }
    await Promise.all((restored.tabs || []).map((tab, index) =>
        tab.id !== undefined && tabs[index]?.pinned ?
            browser.tabs.update(tab.id, {pinned: true}) : Promise.resolve()));
    await workspaceClient.workspaceSessions.update(session.id, {lastOpenedAt: now(), updatedAt: now()});
    await recordActivity('session-opened', 'Workspace session opened', {
        boardId: session.boardId,
        sessionId: session.id,
        metadata: {tabCount: urls.length}
    });
}

export async function deleteWorkspaceSession(sessionId: string): Promise<void> {
    const session = await workspaceClient.workspaceSessions.get(sessionId);
    await workspaceClient.workspaceSessions.delete(sessionId);
    if (session) {
        await recordActivity('session-deleted', 'Workspace session deleted', {
            boardId: session.boardId,
            sessionId
        });
    }
}

export async function updateTask(taskId: string, patch: Partial<WorkspaceTask>): Promise<void> {
    const task = await workspaceClient.tasks.get(taskId);
    if (!task) {
        throw new Error('Task not found.');
    }
    const timestamp = now();
    const next: WorkspaceTask = {
        ...task,
        ...patch,
        updatedAt: timestamp,
        completedAt: patch.status === 'done' ? task.completedAt || timestamp :
            patch.status ? undefined : task.completedAt
    };
    await workspaceClient.tasks.put(next);
    const entity = await workspaceClient.entities.get(task.entityId);
    await syncTaskReminder(next, entity?.title || 'Browser OS task');
    await recordActivity(next.status === 'done' ? 'task-completed' : 'task-updated',
        next.status === 'done' ? 'Task completed' : 'Task updated', {entityId: task.entityId});
}

export async function autoLayoutBoard(boardId: string): Promise<void> {
    await mutatePages([boardId], async () => {
    const placements = await workspaceClient.placements.where('boardId').equals(boardId).toArray();
    const entityMap = new Map((await workspaceClient.entities.bulkGet(placements.map(item => item.entityId)))
        .filter(Boolean).map(entity => [(entity as WorkspaceEntity).id, entity as WorkspaceEntity]));
    const ordered = placements.slice().sort((left, right) => {
        const leftEntity = entityMap.get(left.entityId);
        const rightEntity = entityMap.get(right.entityId);
        return (leftEntity?.type || '').localeCompare(rightEntity?.type || '') ||
            (leftEntity?.title || '').localeCompare(rightEntity?.title || '');
    });
    const timestamp = now();
    await workspaceClient.placements.bulkPut(ordered.map((placement, index) => ({
        ...placement,
        x: 70 + (index % 3) * 320,
        y: 70 + Math.floor(index / 3) * 230,
        zIndex: index + 1,
        updatedAt: timestamp
    })));
    await recordActivity('board-auto-layout', 'Board auto-layout applied', {boardId});
    }, 'auto-layout');
}

async function seedTemplate(board: BoardRecord, layout: BoardTemplateLayout): Promise<void> {
    if (layout === 'blank') {
        return;
    }
    const items: Record<Exclude<BoardTemplateLayout, 'blank'>, Array<{kind: 'note' | 'task'; title: string; body: string}>> = {
        research: [
            {kind: 'note', title: 'Research question', body: 'What do you want to understand or decide?'},
            {kind: 'note', title: 'Evidence', body: 'Capture sources and observations here.'},
            {kind: 'task', title: 'Synthesize findings', body: 'Review sources and write the conclusion.'}
        ],
        reading: [
            {kind: 'note', title: 'Reading queue', body: 'Add articles to the Inbox and place them here.'},
            {kind: 'task', title: 'Review reading queue', body: 'Summarize the most useful ideas.'}
        ],
        project: [
            {kind: 'note', title: 'Project outcome', body: 'Describe the result this board should produce.'},
            {kind: 'task', title: 'Next action', body: 'Choose the smallest useful next step.'},
            {kind: 'note', title: 'References', body: 'Add supporting pages, clips, and assets.'}
        ]
    };
    for (const item of items[layout]) {
        await quickAdd({
            kind: item.kind,
            title: item.title,
            body: item.body,
            boardIds: [board.id],
            inbox: false
        });
    }
}

export async function createBoardFromTemplate(templateId: string): Promise<BoardRecord> {
    const template = await workspaceClient.boardTemplates.get(templateId);
    if (!template) {
        throw new Error('Board template not found.');
    }
    const board = await createBoard(template.name + ' Board');
    await seedTemplate(board, template.layout);
    await recordActivity('board-from-template', 'Board created from ' + template.name + ' template', {
        boardId: board.id,
        metadata: {templateId}
    });
    return board;
}

export interface WorkspaceExport {
    exportedAt: number;
    format: 'browser-os-workspace';
    schemaVersion: 2 | 3 | 4;
    tables: Record<string, unknown[]>;
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result)));
        reader.addEventListener('error', () => reject(reader.error || new Error('Asset export failed.')));
        reader.readAsDataURL(blob);
    });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl);
    return response.blob();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string, table: string): string {
    const value = record[field];
    if (typeof value !== 'string' || !value) {
        throw new Error('Invalid ' + table + ' record: missing ' + field + '.');
    }
    return value;
}

function validateRecords(tableName: string, records: unknown[]): void {
    const entityTypes = new Set([
        'analysis', 'clip', 'document', 'file', 'folder', 'image', 'note', 'page', 'screenshot', 'task',
        'project', 'conversation', 'message', 'website', 'bookmark', 'browser-visit', 'tab', 'search',
        'idea', 'memory', 'prompt', 'repository', 'automation', 'automation-run', 'feature', 'codex-session', 'commit'
    ]);
    records.forEach(value => {
        if (!isRecord(value)) {
            throw new Error('Invalid ' + tableName + ' record.');
        }
        const primaryKey = tableName === 'settings' || tableName === 'meta' ? 'key' : 'id';
        requireString(value, primaryKey, tableName);
        if (tableName === 'settings') validateBrainSetting(String(value.key), value.value);
        if (tableName === 'entities') {
            if (value.richContent !== undefined) {
                validateRichContent(value.richContent);
                if (!['note', 'document'].includes(String(value.type))) throw new Error('Invalid rich text object type.');
                if (!isRecord(value.metadata) || value.metadata.body !== richContentToPlainText(value.richContent)) throw new Error('Rich text body projection mismatch.');
            }
            if (value.contentRevision !== undefined && (!Number.isSafeInteger(value.contentRevision) || Number(value.contentRevision) < 0)) throw new Error('Invalid content revision.');
            if (value.memory !== undefined) validateMemoryPolicy(value.memory);
            requireString(value, 'title', tableName);
            const type = requireString(value, 'type', tableName);
            if (!entityTypes.has(type) || !Array.isArray(value.searchTerms)) {
                throw new Error('Invalid entity type or search terms.');
            }
            if (value.canonicalUrl !== undefined &&
                (typeof value.canonicalUrl !== 'string' || !canonicalizeUrl(value.canonicalUrl))) {
                throw new Error('Invalid entity canonical URL.');
            }
            if (value.source !== undefined) {
                if (!isRecord(value.source)) throw new Error('Invalid object source.');
                requireString(value.source, 'provider', 'source');
                requireString(value.source, 'externalId', 'source');
                if (value.source.url !== undefined && (typeof value.source.url !== 'string' ||
                    !canonicalizeUrl(value.source.url))) throw new Error('Invalid source URL.');
            }
            if (value.tags !== undefined && (!Array.isArray(value.tags) ||
                value.tags.some(tag => typeof tag !== 'string'))) throw new Error('Invalid object tags.');
            if (value.properties !== undefined && (!isRecord(value.properties) ||
                Object.values(value.properties).some(item => item !== null &&
                    !['string', 'number', 'boolean'].includes(typeof item)))) throw new Error('Invalid object properties.');
        }
        if (tableName === 'boards') {
            requireString(value, 'name', tableName);
        }
        if (tableName === 'placements') {
            if (isRecord(value.metadata) && value.metadata.page !== undefined) validatePlacementPresentation(value.metadata.page);
            requireString(value, 'boardId', tableName);
            requireString(value, 'entityId', tableName);
            ['x', 'y', 'width', 'height'].forEach(field => {
                if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
                    throw new Error('Invalid placement geometry.');
                }
            });
        }
        if (tableName === 'relationships') {
            requireString(value, 'fromEntityId', tableName);
            requireString(value, 'toEntityId', tableName);
            if (value.confidence !== undefined && (typeof value.confidence !== 'number' ||
                !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
                throw new Error('Invalid relationship confidence.');
            }
            if (value.evidence !== undefined && (!Array.isArray(value.evidence) ||
                value.evidence.some(item => typeof item !== 'string'))) throw new Error('Invalid relationship evidence.');
        }
        if (tableName === 'tasks') {
            requireString(value, 'entityId', tableName);
            if (!['backlog', 'next', 'in-progress', 'blocked', 'done'].includes(String(value.status)) ||
                !Array.isArray(value.dependencyIds) ||
                value.dependencyIds.some(id => typeof id !== 'string')) {
                throw new Error('Invalid task status or dependencies.');
            }
            ['dueAt', 'reminderAt'].forEach(field => {
                if (value[field] !== undefined &&
                    (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) {
                    throw new Error('Invalid task date.');
                }
            });
        }
        if (tableName === 'savedFilters') {
            requireString(value, 'name', tableName);
            if (typeof value.query !== 'string') {
                throw new Error('Invalid saved filter query.');
            }
        }
        if (tableName === 'workspaceSessions') {
            requireString(value, 'boardId', tableName);
            requireString(value, 'name', tableName);
            if (!Array.isArray(value.tabs)) {
                throw new Error('Invalid workspace session tabs.');
            }
            value.tabs.forEach(tab => {
                if (!isRecord(tab) || typeof tab.url !== 'string' || !canonicalizeUrl(tab.url) ||
                    typeof tab.index !== 'number' || !Number.isInteger(tab.index) || tab.index < 0 ||
                    typeof tab.pinned !== 'boolean') {
                    throw new Error('Invalid workspace session tab.');
                }
                requireString(tab, 'entityId', tableName);
            });
        }
        if (tableName === 'assets') {
            requireString(value, 'entityId', tableName);
            validateAssetDataUrl(value);
        }
    });
}

export async function exportWorkspace(): Promise<WorkspaceExport> {
    const tables: Record<string, unknown[]> = {};
    for (const table of workspaceClient.tables) {
        if (['workspaceDrafts', 'workspaceRevisions'].includes(table.name)) continue;
        const records = await table.toArray();
        tables[table.name] = table.name === 'assets' ?
            await Promise.all((records as AssetRecord[]).map(async asset => ({
                ...asset,
                blobDataUrl: await blobToDataUrl(asset.blob),
                blob: undefined
            }))) :
            records;
    }
    return {
        exportedAt: now(),
        format: 'browser-os-workspace',
        schemaVersion: 4,
        tables
    };
}

export async function importWorkspace(snapshot: WorkspaceExport): Promise<void> {
    if (snapshot.format !== 'browser-os-workspace' ||
        ![2, 3, 4].includes(snapshot.schemaVersion) || !snapshot.tables) {
        throw new Error('This is not a supported Browser OS workspace export.');
    }
    const allowed = new Set(workspaceClient.tables.map(table => table.name));
    const tableNames = Object.keys(snapshot.tables);
    if (tableNames.some(name => ['workspaceDrafts', 'workspaceRevisions'].includes(name))) throw new Error('Recovery import is not enabled yet.');
    if (tableNames.some(name => !allowed.has(name))) {
        throw new Error('The export contains an unknown table.');
    }
    tableNames.forEach(tableName => {
        const records = snapshot.tables[tableName];
        if (!Array.isArray(records)) {
            throw new Error('Invalid ' + tableName + ' table.');
        }
        validateRecords(tableName, records);
    });
    const [existingEntityIds, existingBoardIds] = await Promise.all([
        workspaceClient.entities.toCollection().primaryKeys(),
        workspaceClient.boards.toCollection().primaryKeys()
    ]);
    const entityIds = new Set<string>(existingEntityIds.map(String));
    const boardIds = new Set<string>(existingBoardIds.map(String));
    (snapshot.tables.entities || []).forEach(record => entityIds.add(String((record as WorkspaceEntity).id)));
    (snapshot.tables.boards || []).forEach(record => boardIds.add(String((record as BoardRecord).id)));
    (snapshot.tables.placements || []).forEach(record => {
        const placement = record as BoardPlacement;
        if (!entityIds.has(placement.entityId) || !boardIds.has(placement.boardId)) {
            throw new Error('A placement references a missing board or entity.');
        }
    });
    (snapshot.tables.relationships || []).forEach(record => {
        const relationship = record as RelationshipRecord;
        if (!entityIds.has(relationship.fromEntityId) || !entityIds.has(relationship.toEntityId)) {
            throw new Error('A relationship references a missing entity.');
        }
    });
    (snapshot.tables.tasks || []).forEach(record => {
        const task = record as WorkspaceTask;
        if (!entityIds.has(task.entityId)) {
            throw new Error('A task references a missing entity.');
        }
    });
    (snapshot.tables.workspaceSessions || []).forEach(record => {
        const session = record as WorkspaceSession;
        if (!boardIds.has(session.boardId) || session.tabs.some(tab => !entityIds.has(tab.entityId))) {
            throw new Error('A workspace session references a missing board or entity.');
        }
    });
    const preparedTables: Record<string, unknown[]> = {...snapshot.tables};
    if (Array.isArray(preparedTables.assets)) {
        preparedTables.assets = await Promise.all(preparedTables.assets.map(async record => {
            const asset = record as AssetRecord & {blobDataUrl?: string};
            if (!asset.blobDataUrl) {
                return asset;
            }
            const blob = await dataUrlToBlob(asset.blobDataUrl);
            const next = {...asset, blob};
            delete next.blobDataUrl;
            return next;
        }));
    }
    await workspaceClient.transaction('rw', workspaceClient.tables, async () => {
        await validateEffectivePageState(preparedTables);
        for (const tableName of tableNames) {
            let records = preparedTables[tableName];
            if (Array.isArray(records) && records.length) {
                if (tableName === 'entities') {
                    records = (records as WorkspaceEntity[]).map(record => ({...record}));
                    for (const record of records as WorkspaceEntity[]) {
                        const existing = await workspaceClient.entities.get(record.id);
                        // Backup merge must not undo local privacy choices. Restoration is explicit in Memory controls.
                        if (existing?.memory) record.memory = existing.memory;
                        if (existing?.richContent && !record.richContent) {
                            record.richContent = existing.richContent;
                            record.metadata = {...record.metadata, body: richContentToPlainText(existing.richContent)};
                            record.searchTerms = searchTerms(record.title, record.canonicalUrl, String(record.metadata.body));
                        }
                        if (existing) record.contentRevision = Math.max(existing.contentRevision || 0, record.contentRevision || 0) + 1;
                    }
                }
                await workspaceClient.table(tableName).bulkPut(records);
            }
        }
    });
}

export async function restoreLatestTrash(): Promise<string> {
    return workspaceClient.transaction('rw', workspaceClient.tables, async () => {
    const record = await workspaceClient.settings
        .where('key').startsWith('trash:').reverse().first();
    if (!record) {
        throw new Error('Trash is empty.');
    }
    const value = record.value as {
        board?: BoardRecord;
        kind?: string;
        placements?: BoardPlacement[];
        pageSetting?: {key: string; value: PagePresentation; updatedAt: number};
    };
    const boardIds = [...new Set([...(value.board ? [value.board.id] : []), ...(value.placements || []).map(p => p.boardId)])];
    const before = new Map();
    for (const id of boardIds) if (await workspaceClient.boards.get(id)) before.set(id, await openWorkspacePage(id));
    await workspaceClient.transaction('rw', workspaceClient.boards, workspaceClient.placements,
        workspaceClient.settings, async () => {
            if (value.kind === 'board' && value.board) {
                await workspaceClient.boards.put(value.board);
                if (value.pageSetting) {validatePagePresentation(value.pageSetting.value); await workspaceClient.settings.put(value.pageSetting);}
            }
            if (Array.isArray(value.placements) && value.placements.length) {
                await workspaceClient.placements.bulkPut(value.placements);
            }
            await workspaceClient.settings.delete(record.key);
        });
    for (const id of boardIds) await recordPageTransition(before.get(id), await openWorkspacePage(id), 'restore');
    return value.board?.id || value.placements?.[0]?.boardId || '';
    });
}
