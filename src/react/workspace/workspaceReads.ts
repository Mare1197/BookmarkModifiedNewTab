import Dexie from 'dexie';
import type {WorkspaceEntity, RelationshipRecord} from '../../workspace/types';
import {workspaceClient as db} from './workspaceClient';
import {queryLibraryPage} from './libraryQueries';
import type {LibraryCursor, LibraryQuery} from './libraryQueryTypes';
import type {WorkspaceSnapshot} from './workspaceRepository';
import type {WorkspaceShell, BoardReadModel, ObjectReadModel, GraphScope, GraphPage, FolderCursor, FolderPage} from './workspaceReadModels';

const present = (entity: WorkspaceEntity | undefined): entity is WorkspaceEntity => Boolean(entity);
const uniqueLinks = (rows: RelationshipRecord[]) => [...new Map(rows.map(row => [row.id, row])).values()];

export type WorkflowKind = 'tasks' | 'sessions' | 'activity' | 'templates';
export async function loadWorkflowPage(kind: WorkflowKind, index: number, status = 'all') {
    const result: Pick<WorkspaceSnapshot, 'entities' | 'tasks' | 'relationships' | 'activities' | 'workspaceSessions' | 'boardTemplates'> &
        {hasMore: boolean; total: number} = {entities: [], tasks: [], relationships: [], activities: [], workspaceSessions: [], boardTemplates: [], hasMore: false, total: 0};
    const start = Math.max(0, index) * 50;
    if (kind === 'tasks') {
        // Task records are compact metadata. Due-date ordering must retain tasks
        // without an indexed dueAt value, so order IDs before loading object bodies.
        const tasks = await (status === 'all' ? db.tasks.toCollection() : db.tasks.where('status').equals(status)).toArray();
        tasks.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
        result.total = tasks.length; result.tasks = tasks.slice(start, start + 50);
        const ids = result.tasks.map(task => task.entityId);
        const [entities, outgoing, incoming] = await Promise.all([db.entities.bulkGet(ids),
            db.relationships.where('fromEntityId').anyOf(ids).toArray(), db.relationships.where('toEntityId').anyOf(ids).toArray()]);
        result.entities = entities.filter(present); result.relationships = uniqueLinks([...outgoing, ...incoming]);
    } else if (kind === 'sessions') {
        const ids = await db.workspaceSessions.orderBy('updatedAt').reverse().primaryKeys();
        result.total = ids.length; result.workspaceSessions = (await db.workspaceSessions.bulkGet(ids.slice(start, start + 50))).filter(item => item !== undefined);
    } else if (kind === 'templates') {
        const ids = await db.boardTemplates.orderBy('name').primaryKeys();
        result.total = ids.length; result.boardTemplates = (await db.boardTemplates.bulkGet(ids.slice(start, start + 50))).filter(item => item !== undefined);
    } else {
        const ids = await db.activities.orderBy('createdAt').reverse().primaryKeys();
        result.total = ids.length; result.activities = (await db.activities.bulkGet(ids.slice(start, start + 50))).filter(item => item !== undefined);
        result.entities = (await db.entities.bulkGet([...new Set(result.activities.flatMap(item => item.entityId ? [item.entityId] : []))])).filter(present);
    }
    result.hasMore = start + 50 < result.total;
    return result;
}

/** Complete confirmed project scope, never a page of library results. */
export async function loadProject(projectId: string) {
    return db.transaction('r', [db.entities, db.relationships, db.tasks], async () => {
        const relationships = (await db.relationships.where('toEntityId').equals(projectId).toArray())
            .filter(link => link.confirmed && link.type === 'project-member');
        const ids = [...new Set([projectId, ...relationships.map(link => link.fromEntityId)])];
        const [entities, tasks] = await Promise.all([db.entities.bulkGet(ids), db.tasks.where('entityId').anyOf(ids).toArray()]);
        return {scope: {kind: 'project' as const, id: projectId}, entities: entities.filter(present), relationships, tasks};
    });
}

/** Companions for a visible collection page; never presented as complete history. */
export async function loadPageCompanions(ids: string[]) {
    const [tasks, relationships, activities] = await Promise.all([
        db.tasks.where('entityId').anyOf(ids).toArray(), db.relationships.where('fromEntityId').anyOf(ids).toArray(),
        db.activities.where('entityId').anyOf(ids).toArray()
    ]);
    const entities = (await db.entities.bulkGet([...new Set(relationships.map(link => link.toEntityId))])).filter(present);
    activities.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    return {tasks, relationships, activities, entities};
}

// Initialization is deliberately not part of these reads: live queries must not
// seed defaults or write to the database when another tab changes data.
export async function loadShell(): Promise<WorkspaceShell> {
    const [boards, folders, savedFilters, entities, inbox, tasks, sessions] = await Promise.all([
        db.boards.orderBy('createdAt').toArray(), db.folders.toArray(), db.savedFilters.orderBy('name').toArray(),
        db.entities.count(), db.entities.where('inboxAt').above(0).count(),
        db.tasks.where('status').notEqual('done').count(), db.workspaceSessions.count()
    ]);
    folders.sort((a, b) => a.title.localeCompare(b.title));
    return {boards, folders, savedFilters, counts: {entities, inbox, tasks, sessions}};
}

export async function loadBoard(boardId: string): Promise<BoardReadModel> {
    return db.transaction('r', [db.boards, db.placements, db.entities, db.assets, db.relationships, db.tasks], async () => {
        const [board, placements] = await Promise.all([db.boards.get(boardId), db.placements.where('boardId').equals(boardId).toArray()]);
        const ids = [...new Set(placements.map(p => p.entityId))], idSet = new Set(ids);
        const [entities, assets, links, tasks] = await Promise.all([
            db.entities.bulkGet(ids), db.assets.where('entityId').anyOf(ids).toArray(),
            db.relationships.where('fromEntityId').anyOf(ids).toArray(), db.tasks.where('entityId').anyOf(ids).toArray()
        ]);
        return {scope: {kind: 'board', id: boardId}, board, placements, entities: entities.filter(present), assets, tasks,
            relationships: links.filter(link => idSet.has(link.toEntityId))};
    });
}

export async function loadObject(entityId: string): Promise<ObjectReadModel | null> {
    return db.transaction('r', [db.entities, db.relationships, db.tasks, db.placements, db.folderMemberships, db.activities], async () => {
        const entity = await db.entities.get(entityId);
        if (!entity) return null;
        const [outgoing, incoming, tasks, placements, folderMemberships, activities] = await Promise.all([
            db.relationships.where('fromEntityId').equals(entityId).toArray(),
            db.relationships.where('toEntityId').equals(entityId).toArray(),
            db.tasks.where('entityId').equals(entityId).toArray(),
            db.placements.where('entityId').equals(entityId).toArray(),
            db.folderMemberships.where('entityId').equals(entityId).toArray(),
            db.activities.where('[entityId+createdAt+id]').between([entityId, Dexie.minKey, Dexie.minKey],
                [entityId, Infinity, Dexie.maxKey]).reverse().limit(50).toArray()
        ]);
        const relationships = uniqueLinks([...outgoing, ...incoming]);
        const ids = [...new Set([entityId, ...relationships.flatMap(link => [link.fromEntityId, link.toEntityId])])];
        return {entity, entities: (await db.entities.bulkGet(ids)).filter(present), relationships, tasks,
            boardMemberships: placements.map(({boardId, entityId}) => ({boardId, entityId})), folderMemberships, activities};
    });
}

export async function loadNeighborhood(scope: GraphScope, cursor?: LibraryCursor): Promise<GraphPage> {
    const query: LibraryQuery = {dialect: 'brain', text: '', sort: 'updated', referenceTime: 0,
        ...(scope.kind === 'board' ? {boardId: scope.id} : {}),
        ...(scope.kind === 'project' ? {projectId: scope.id} : {}),
        ...(scope.kind === 'entity' ? {relatedTo: scope.id} : {})};
    const entities: WorkspaceEntity[] = [];
    let nextCursor = cursor, hasMore = true;
    for (let i = 0; i < 4 && hasMore; i++) {
        const page = await queryLibraryPage(query, {cursor: nextCursor});
        entities.push(...page.items); nextCursor = page.nextCursor; hasMore = page.hasMore;
    }
    const ids = new Set(entities.map(e => e.id));
    const relationships = (await db.relationships.where('fromEntityId').anyOf([...ids]).toArray())
        .filter(link => link.confirmed && ids.has(link.toEntityId));
    return {scope, entities, relationships, nextCursor, hasMore,
        total: scope.kind === 'library' ? await db.entities.count() : undefined};
}

export async function loadExpandedNeighborhood(scope: GraphScope, pages: number): Promise<GraphPage> {
    const entities = new Map<string, WorkspaceEntity>();
    let result: GraphPage | undefined;
    for (let i = 0; i < Math.max(1, pages); i++) {
        result = await loadNeighborhood(scope, result?.nextCursor);
        result.entities.forEach(entity => entities.set(entity.id, entity));
        if (!result.hasMore) break;
    }
    const relationships = (await db.relationships.where('fromEntityId').anyOf([...entities.keys()]).toArray())
        .filter(link => link.confirmed && entities.has(link.toEntityId));
    return {...result!, entities: [...entities.values()], relationships};
}

export async function loadFolderMembers(folderId: string, cursor?: FolderCursor): Promise<FolderPage> {
    if (cursor && cursor.folderId !== folderId) throw new Error('Cursor belongs to another folder');
    const rows = await db.folderMemberships.where('[folderId+position+id]').between(
        cursor ? [folderId, cursor.position, cursor.id] : [folderId, Dexie.minKey, Dexie.minKey],
        [folderId, Infinity, Dexie.maxKey], !cursor, true).limit(51).toArray();
    const memberships = rows.slice(0, 50), last = memberships[memberships.length - 1], hasMore = rows.length > 50;
    return {memberships, entities: (await db.entities.bulkGet(memberships.map(m => m.entityId))).filter(present), hasMore,
        nextCursor: hasMore && last ? {folderId, position: last.position, id: last.id} : undefined};
}
