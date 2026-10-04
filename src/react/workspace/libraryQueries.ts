import type {WorkspaceEntity, RelationshipRecord} from '../../workspace/types';
import {workspaceClient as db} from './workspaceClient';
import {parseSmartQuery, filterWorkspaceEntities} from './workspaceSearch';
import {queryBrain} from './brainSelectors';
import {compareLibraryRows, libraryQueryKey, type LibraryOrderRow} from './libraryOrdering';
import type {WorkspaceSnapshot} from './workspaceRepository';
import type {LibraryQuery, LibraryReadOptions, LibraryPage, LibraryCursor} from './libraryQueryTypes';

const PAGE_SIZE = 50;
const SCAN_SIZE = 250;
const abort = (signal?: AbortSignal) => {if (signal?.aborted) throw new DOMException('Query aborted', 'AbortError');};
const uniqueLinks = (links: RelationshipRecord[]) => [...new Map(links.map(link => [link.id, link])).values()];

async function candidateScope(query: LibraryQuery): Promise<Set<string> | undefined> {
    let ids: Set<string> | undefined;
    const intersect = (next: string[]) => {
        const candidates = new Set(next);
        ids = ids ? new Set([...ids].filter(id => candidates.has(id))) : candidates;
    };
    if (query.boardId) intersect((await db.placements.where('boardId').equals(query.boardId).toArray()).map(p => p.entityId));
    const parsed = query.dialect === 'smart' ? parseSmartQuery(query.text, query.referenceTime) : undefined;
    const type = query.type || parsed?.type;
    if (type) intersect(await db.entities.where('type').equals(type).primaryKeys());
    if (parsed?.board) {
        const boards = await db.boards.filter(board => board.name.toLocaleLowerCase().includes(parsed.board!)).primaryKeys();
        intersect((await db.placements.where('boardId').anyOf(boards).toArray()).map(p => p.entityId));
    }
    if (query.projectId) intersect((await db.relationships.where('toEntityId').equals(query.projectId).toArray())
        .filter(link => link.confirmed && link.type === 'project-member').map(link => link.fromEntityId));
    if (query.relatedTo) {
        const links = await Promise.all([db.relationships.where('fromEntityId').equals(query.relatedTo).toArray(),
            db.relationships.where('toEntityId').equals(query.relatedTo).toArray()]);
        intersect([query.relatedTo, ...links.flat().filter(link => link.confirmed).flatMap(link => [link.fromEntityId, link.toEntityId])]);
    }
    return ids;
}

async function matching(query: LibraryQuery, entities: WorkspaceEntity[]): Promise<WorkspaceEntity[]> {
    const parsed = query.dialect === 'smart' ? parseSmartQuery(query.text, query.referenceTime) : undefined;
    const ids = entities.map(e => e.id);
    const needTasks = Boolean(query.status || parsed?.status || parsed?.has === 'task');
    const needLinks = Boolean(parsed?.has === 'backlinks' || parsed?.has === 'task');
    const [tasks, outgoing, incoming] = await Promise.all([
        needTasks ? db.tasks.where('entityId').anyOf(ids).toArray() : [],
        needLinks ? db.relationships.where('fromEntityId').anyOf(ids).toArray() : [],
        needLinks ? db.relationships.where('toEntityId').anyOf(ids).toArray() : []
    ]);
    const candidates = entities.filter(e => (!query.type || e.type === query.type) && (!query.inbox || Boolean(e.inboxAt)));
    if (query.dialect === 'explorer') {
        const text = query.text.trim().toLocaleLowerCase();
        return candidates.filter(e => !text || [e.title, e.type, e.canonicalUrl || ''].some(v => v.toLocaleLowerCase().includes(text)));
    }
    if (query.dialect === 'brain') return queryBrain(candidates, [], tasks, {query: query.text, status: query.status, sort: 'updated'});
    // Board matching has already narrowed the candidate IDs. Supply only a small
    // synthetic view of that proven membership to the existing predicate.
    const snapshot: WorkspaceSnapshot = {entities: candidates, tasks, relationships: uniqueLinks([...outgoing, ...incoming]),
        boards: parsed?.board ? [{id: 'query-board', name: parsed.board, createdAt: 0, updatedAt: 0}] : [],
        boardMemberships: parsed?.board ? candidates.map(e => ({boardId: 'query-board', entityId: e.id})) : [],
        activities: [], assets: [], placements: [], folders: [], folderMemberships: [], savedFilters: [], boardTemplates: [], workspaceSessions: []};
    return filterWorkspaceEntities(snapshot, query.text, query.referenceTime);
}

async function* idBatches(query: LibraryQuery, scope: Set<string> | undefined, lastId: string | undefined,
    options: LibraryReadOptions): AsyncGenerator<WorkspaceEntity[]> {
    if (scope) {
        const ids = [...scope].filter(id => lastId === undefined || id > lastId).sort();
        for (let offset = 0; offset < ids.length; offset += SCAN_SIZE) {
            abort(options.signal);
            yield (await db.entities.bulkGet(ids.slice(offset, offset + SCAN_SIZE))).filter((e): e is WorkspaceEntity => Boolean(e));
        }
        return;
    }
    const parsed = query.dialect === 'smart' ? parseSmartQuery(query.text, query.referenceTime) : undefined;
    const type = query.type || parsed?.type;
    // Primary keys from a type index avoid hydrating unrelated types. The compact
    // ID list is ephemeral, not a second object store.
    if (type) {
        const ids = (await db.entities.where('type').equals(type).primaryKeys()).filter(id => lastId === undefined || id > lastId).sort();
        for (let offset = 0; offset < ids.length; offset += SCAN_SIZE) {
            abort(options.signal);
            yield (await db.entities.bulkGet(ids.slice(offset, offset + SCAN_SIZE))).filter((e): e is WorkspaceEntity => Boolean(e));
        }
        return;
    }
    let key = lastId;
    while (true) {
        abort(options.signal);
        // Smaller unfiltered pages do not hydrate the next 200 unused objects.
        const limit = !query.text && !query.status && !query.inbox ? PAGE_SIZE + 1 : SCAN_SIZE;
        const batch = await (key === undefined ? db.entities.orderBy('id') : db.entities.where('id').above(key)).limit(limit).toArray();
        if (!batch.length) return;
        yield batch;
        key = batch[batch.length - 1]!.id;
        if (batch.length < limit) return;
    }
}

async function* updatedBatches(scope: Set<string> | undefined, cursor: LibraryCursor | undefined,
    options: LibraryReadOptions, field: 'updatedAt' | 'inboxAt' = 'updatedAt'): AsyncGenerator<WorkspaceEntity[]> {
    if (field === 'updatedAt') {
        let upper = cursor?.updatedAt;
        const hydrate = async function* (ids: string[]) {
            const scoped = scope ? ids.filter(id => scope.has(id)) : ids;
            for (let offset = 0; offset < scoped.length; offset += PAGE_SIZE + 1) {
                abort(options.signal);
                yield (await db.entities.bulkGet(scoped.slice(offset, offset + PAGE_SIZE + 1))).filter((entity): entity is WorkspaceEntity => Boolean(entity));
            }
        };
        if (upper !== undefined) {
            const ties = (await db.entities.where('updatedAt').equals(upper).primaryKeys())
                .filter(id => !cursor?.lastId || id.localeCompare(cursor.lastId) > 0).sort((a, b) => a.localeCompare(b));
            yield* hydrate(ties);
        }
        while (true) {
            abort(options.signal);
            const keys = await (upper === undefined ? db.entities.orderBy('[updatedAt+id]') :
                db.entities.where('[updatedAt+id]').below([upper, Dexie.minKey])).reverse().limit(SCAN_SIZE).keys() as [number, string][];
            if (!keys.length) return;
            const boundary = keys[keys.length - 1]![0];
            // Complete the boundary timestamp before locale ordering; a native
            // index slice can split ties in a different order from localeCompare.
            const ties = await db.entities.where('updatedAt').equals(boundary).primaryKeys();
            const ordered = [...keys.filter(key => key[0] > boundary), ...ties.map(id => [boundary, id] as [number, string])]
                .sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
            yield* hydrate(ordered.map(key => key[1]));
            if (keys.length < SCAN_SIZE) return;
            upper = boundary;
        }
    }
    let timestamp = cursor?.updatedAt;
    if (timestamp === undefined) {
        const key = await db.entities.orderBy(field).reverse().limit(1).keys(keys => keys[0]);
        timestamp = key as number | undefined;
    }
    while (timestamp !== undefined) {
        abort(options.signal);
        const keys = await db.entities.where(field).equals(timestamp).primaryKeys();
        const ids = keys.filter(id => (!scope || scope.has(id)) &&
            (timestamp !== cursor?.updatedAt || !cursor?.lastId || id.localeCompare(cursor.lastId) > 0)).sort((a, b) => a.localeCompare(b));
        for (let offset = 0; offset < ids.length; offset += PAGE_SIZE + 1) {
            abort(options.signal);
            yield (await db.entities.bulkGet(ids.slice(offset, offset + PAGE_SIZE + 1))).filter((e): e is WorkspaceEntity => Boolean(e));
        }
        const key = await db.entities.where(field).below(timestamp).reverse().limit(1).keys();
        timestamp = key[0] as number | undefined;
    }
}

export async function queryLibraryPage(query: LibraryQuery, options: LibraryReadOptions = {}): Promise<LibraryPage> {
    abort(options.signal);
    const signature = libraryQueryKey(query);
    if (options.cursor && options.cursor.signature !== signature) throw new Error('Cursor belongs to a different query');
    const scope = await candidateScope(query);
    abort(options.signal);
    let scanned = 0;
    const progress = () => {options.onProgress?.(scanned); abort(options.signal);};
    const ordered = query.sort === 'title' || query.sort === 'tiles';
    if (ordered) {
        let ids = options.cursor?.orderedIds;
        let defaultOrders = options.cursor?.defaultOrders;
        if (!ids) {
            const rows: LibraryOrderRow[] = [];
            for await (const batch of idBatches(query, scope, undefined, options)) {
                const matches = await matching(query, batch);
                rows.push(...matches.map(({id, title, updatedAt}) => ({id, title, updatedAt})));
                scanned += batch.length; progress();
            }
            rows.sort((a, b) => compareLibraryRows(query.sort === 'tiles' ? query.tileBaseSort || 'updated' : 'title', a, b));
            if (query.sort === 'tiles') {
                const setting = await db.settings.get('brain-tiles:' + encodeURIComponent(query.tileScope || 'all'));
                const layout = (setting?.value || {}) as Record<string, {order: number}>;
                const defaultOrder = new Map(rows.map((row, index) => [row.id, index]));
                defaultOrders = Object.fromEntries(defaultOrder);
                rows.sort((a, b) => (layout[a.id]?.order ?? defaultOrder.get(a.id)!) -
                    (layout[b.id]?.order ?? defaultOrder.get(b.id)!));
            }
            ids = rows.map(row => row.id);
        }
        const position = options.cursor?.position || 0;
        const items = (await db.entities.bulkGet([...ids.slice(position, position + PAGE_SIZE)]))
            .filter((e): e is WorkspaceEntity => Boolean(e));
        abort(options.signal);
        const hasMore = position + PAGE_SIZE < ids.length;
        return {items, total: ids.length, scanned, hasMore,
            defaultOrders: defaultOrders && Object.fromEntries(items.map(item => [item.id, defaultOrders![item.id]!])),
            nextCursor: hasMore ? {signature, orderedIds: ids, defaultOrders, position: position + PAGE_SIZE} : undefined};
    }
    const items: WorkspaceEntity[] = [];
    const batches = query.sort === 'updated' || query.sort === 'inbox' ? updatedBatches(scope, options.cursor, options,
        query.sort === 'inbox' ? 'inboxAt' : 'updatedAt') :
        idBatches(query, scope, options.cursor?.lastId, options);
    for await (const batch of batches) {
        const allowed = new Set((await matching(query, batch)).map(e => e.id));
        scanned += batch.length; progress();
        for (const item of batch) {
            if (!allowed.has(item.id)) continue;
            if (items.length === PAGE_SIZE) {
                const last = items[items.length - 1]!;
                return {items, hasMore: true, scanned, nextCursor: {signature, lastId: last.id,
                    ...(query.sort === 'updated' || query.sort === 'inbox' ? {updatedAt: query.sort === 'inbox' ? last.inboxAt : last.updatedAt} : {})}};
            }
            items.push(item);
        }
    }
    abort(options.signal);
    return {items, hasMore: false, scanned};
}
import Dexie from 'dexie';
