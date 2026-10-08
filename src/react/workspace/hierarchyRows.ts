import type {FolderMembership, WorkspaceEntity, WorkspaceFolder} from '../../workspace/types';
import type {FolderPage} from './workspaceReadModels';

export type HierarchyRow = {id: string; depth: number; folder: WorkspaceFolder} & (
    {kind: 'folder' | 'move' | 'pager'} | {kind: 'member'; member: FolderMembership; entity: WorkspaceEntity});

/** One flat viewport across every expanded branch, not one viewport per folder. */
export function flattenHierarchyRows(folders: WorkspaceFolder[], expanded: Record<string, boolean>, pages: Record<string, FolderPage>, hasPrevious: Record<string, boolean> = {}) {
    const rows: HierarchyRow[] = [], byId = new Map(folders.map(folder => [folder.id, folder]));
    const children = new Map<string, WorkspaceFolder[]>();
    for (const folder of folders) {
        const parent = folder.parentId && byId.has(folder.parentId) ? folder.parentId : '';
        const siblings = children.get(parent) || []; siblings.push(folder); children.set(parent, siblings);
    }
    const seen = new Set<string>();
    const visit = (folder: WorkspaceFolder, depth: number) => {
        if (seen.has(folder.id)) return;
        seen.add(folder.id);
        rows.push({id: 'folder:' + folder.id, kind: 'folder', folder, depth});
        if (!expanded[folder.id]) return;
        if (folder.sourceKind === 'workspace') rows.push({id: 'move:' + folder.id, kind: 'move', folder, depth: depth + 1});
        const page = pages[folder.id], entities = new Map(page?.entities.map(entity => [entity.id, entity]));
        for (const member of page?.memberships || []) {
            const entity = entities.get(member.entityId);
            if (entity) rows.push({id: 'member:' + member.id, kind: 'member', folder, member, entity, depth: depth + 1});
        }
        if (page?.hasMore || hasPrevious[folder.id]) rows.push({id: 'pager:' + folder.id, kind: 'pager', folder, depth: depth + 1});
        for (const child of children.get(folder.id) || []) visit(child, depth + 1);
    };
    for (const folder of children.get('') || []) visit(folder, 0);
    return rows;
}
