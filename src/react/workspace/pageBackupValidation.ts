import {workspaceClient as db} from './workspaceClient';
import {validateGeometry, validatePagePresentation, validatePlacementPresentation} from './pageValidation';
import type {WorkspaceEntity, BoardRecord, BoardPlacement, RelationshipRecord, WorkspaceSetting} from '../../workspace/types';

// Called inside the import transaction: validation and writes see the same effective state.
export async function validateEffectivePageState(incoming: Record<string, unknown[]>) {
    const merge = <T extends {id: string}>(existing: T[], next: unknown[] | undefined) =>
        [...new Map([...existing, ...(next || []) as T[]].map(r => [r.id, r])).values()];
    const entities = new Map(merge<WorkspaceEntity>(await db.entities.toArray(), incoming.entities).map(e => [e.id, e]));
    const boards = new Set(merge<BoardRecord>(await db.boards.toArray(), incoming.boards).map(b => b.id));
    const placements = new Map(merge<BoardPlacement>(await db.placements.toArray(), incoming.placements).map(p => [p.id, p]));
    const links = new Map(merge<RelationshipRecord>(await db.relationships.toArray(), incoming.relationships).map(r => [r.id, r]));
    const settings = new Map([...(await db.settings.toArray()), ...(incoming.settings || []) as WorkspaceSetting[]].map(s => [s.key, s]));
    const isOwner = (id: string) => {const e = entities.get(id); return e?.type === 'project' || e?.type === 'document' && e.metadata?.workspacePage === true;};
    for (const p of placements.values()) if (!entities.has(p.entityId) || !boards.has(p.boardId)) throw new Error('Placement references a missing board or object.');
    for (const r of links.values()) if (!entities.has(r.fromEntityId) || !entities.has(r.toEntityId)) throw new Error('Relationship references a missing object.');
    for (const value of incoming.assets || []) if (!entities.has((value as {entityId: string}).entityId)) throw new Error('Asset references a missing object.');
    const owned = new Set<string>();
    for (const s of settings.values()) {
        if (!s.key.startsWith('workspace-page:')) continue;
        const boardId = s.key.slice('workspace-page:'.length);
        validatePagePresentation(s.value); const page = s.value;
        if (!boards.has(boardId) || !isOwner(page.ownerEntityId)) throw new Error('Page references a missing board or owner.');
        if (owned.has(page.ownerEntityId)) throw new Error('Duplicate page owner.'); owned.add(page.ownerEntityId);
        const groupIds = new Set(page.groups.map(g => g.id));
        for (const p of placements.values()) if (p.boardId === boardId) {
            validateGeometry(p);
            if (p.metadata?.page !== undefined) {
                validatePlacementPresentation(p.metadata.page);
                if (p.metadata.page.groupId && !groupIds.has(p.metadata.page.groupId)) throw new Error('Missing page group.');
            }
        }
        for (const c of page.connectors) {
            const from = placements.get(c.fromPlacementId), to = placements.get(c.toPlacementId), relation = links.get(c.relationshipId);
            if (!from || !to || from.boardId !== boardId || to.boardId !== boardId || !relation?.confirmed ||
                relation.fromEntityId !== from.entityId || relation.toEntityId !== to.entityId) throw new Error('Invalid page connector endpoints or relationship.');
        }
    }
    const parents = new Map<string, string>();
    for (const r of links.values()) if (r.type === 'page-parent' && r.confirmed) {
        if (!isOwner(r.fromEntityId) || !isOwner(r.toEntityId)) throw new Error('Missing page parent owner.');
        if (parents.has(r.fromEntityId)) throw new Error('Duplicate page parent.');
        parents.set(r.fromEntityId, r.toEntityId);
    }
    for (const id of parents.keys()) {
        const visited = new Set<string>(); let current: string | undefined = id;
        while (current) {if (visited.has(current)) throw new Error('Page parent cycle.'); visited.add(current); current = parents.get(current);}
    }
}

export function validateAssetDataUrl(value: Record<string, unknown>) {
    if (typeof value.blobDataUrl !== 'string' || value.blobDataUrl.length > 36 * 1024 * 1024) throw new Error('Invalid or oversized asset blob.');
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value.blobDataUrl);
    if (!match || (!match[1]!.startsWith('image/') && match[1] !== 'application/octet-stream') || match[1] !== value.mimeType ||
        !['file', 'image', 'screenshot'].includes(String(value.type)) || match[2]!.length % 4 !== 0) throw new Error('Invalid asset blob type.');
    const bytes = match[2]!.length / 4 * 3 - (match[2]!.endsWith('==') ? 2 : match[2]!.endsWith('=') ? 1 : 0);
    if (!Number.isSafeInteger(value.size) || bytes !== value.size || bytes > 25 * 1024 * 1024) throw new Error('Asset blob size mismatch or exceeds 25 MiB.');
}
