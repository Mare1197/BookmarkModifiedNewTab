import type {FolderMembership, WorkspaceFolder} from '../../workspace/types';
import {workspaceClient as db} from './workspaceClient';

export type HierarchyItem = {kind: 'folder' | 'entity'; id: string; sourceFolderId?: string};
type MoveHistory = {folders: WorkspaceFolder[]; before: FolderMembership[]; after: FolderMembership[];
    folderBefore?: WorkspaceFolder; folderAfter?: WorkspaceFolder};
const undoKey = 'workspaceHierarchyUndoV1';

async function destination(folderId?: string): Promise<WorkspaceFolder | undefined> {
    if (!folderId) return undefined;
    const folder = await db.folders.get(folderId);
    if (!folder || folder.sourceKind !== 'workspace') {
        throw new Error('Choose a workspace folder. Native bookmark folders are read-only here.');
    }
    return folder;
}

export async function createWorkspaceFolder(title: string, parentId?: string): Promise<void> {
    if (!title.trim()) throw new Error('Enter a folder name.');
    await db.transaction('rw', db.folders, async () => {
        await destination(parentId);
        const timestamp = Date.now();
        await db.folders.add({id: 'folder:' + crypto.randomUUID(), title: title.trim(),
            parentId, sourceKind: 'workspace', createdAt: timestamp, updatedAt: timestamp});
    });
}

export async function moveHierarchyItem(item: HierarchyItem, targetId?: string): Promise<void> {
    await db.transaction('rw', [db.entities, db.folders, db.folderMemberships, db.settings], async () => {
        await destination(targetId);
        const folders = await db.folders.toArray();
        const history: MoveHistory = {folders, before: [], after: []};
        if (item.kind === 'folder') {
            const folder = await db.folders.get(item.id);
            if (!folder || folder.sourceKind !== 'workspace') throw new Error('Native folders cannot be moved here.');
            const visited = new Set<string>();
            let ancestor = targetId;
            while (ancestor) {
                if (ancestor === item.id || visited.has(ancestor)) throw new Error('A folder cannot be moved into itself or its descendants.');
                visited.add(ancestor);
                ancestor = folders.find(candidate => candidate.id === ancestor)?.parentId;
            }
            if (folder.parentId === targetId) return;
            history.folderBefore = folder;
            history.folderAfter = {...folder, parentId: targetId, updatedAt: Date.now()};
            await db.folders.put(history.folderAfter);
        } else {
            if (!await db.entities.get(item.id)) throw new Error('This object no longer exists.');
            if (item.sourceFolderId === targetId) return;
            if (item.sourceFolderId) await destination(item.sourceFolderId);
            history.before = await db.folderMemberships.where('entityId').equals(item.id).toArray();
            const source = history.before.find(member => member.folderId === item.sourceFolderId);
            if (item.sourceFolderId && (!source || source.sourceKind !== 'user')) {
                throw new Error('Only workspace memberships can be moved here. Native bookmarks stay unchanged.');
            }
            if (source) await db.folderMemberships.delete(source.id);
            if (targetId && !history.before.some(member => member.folderId === targetId)) {
                const timestamp = Date.now();
                await db.folderMemberships.add({id: 'membership:' + crypto.randomUUID(), folderId: targetId,
                    entityId: item.id, sourceKind: 'user', position: await db.folderMemberships.where('folderId').equals(targetId).count(),
                    createdAt: timestamp, updatedAt: timestamp});
            }
            history.after = await db.folderMemberships.where('entityId').equals(item.id).toArray();
            if (JSON.stringify(history.before) === JSON.stringify(history.after)) return;
        }
        await db.settings.put({key: undoKey, value: {item, history}, updatedAt: Date.now()});
    });
}

export async function undoHierarchyMove(): Promise<void> {
    await db.transaction('rw', [db.entities, db.folders, db.folderMemberships, db.settings], async () => {
        const saved = await db.settings.get(undoKey);
        if (!saved) throw new Error('No folder move to undo.');
        const {item, history} = saved.value as {item: HierarchyItem; history: MoveHistory};
        if (history.folderBefore && history.folderAfter) {
            const current = await db.folders.get(item.id);
            if (JSON.stringify(current) !== JSON.stringify(history.folderAfter)) throw new Error('Folder changed since this move; undo was not applied.');
            await destination(history.folderBefore.parentId);
            // Any intervening hierarchy edit can invalidate the old parent chain.
            const others = (await db.folders.toArray()).filter(folder => folder.id !== item.id);
            if (JSON.stringify(others) !== JSON.stringify(history.folders.filter(folder => folder.id !== item.id))) {
                throw new Error('Folder hierarchy changed since this move; undo was not applied.');
            }
            await db.folders.put(history.folderBefore);
        } else {
            if (!await db.entities.get(item.id)) throw new Error('This object no longer exists.');
            const current = await db.folderMemberships.where('entityId').equals(item.id).toArray();
            if (JSON.stringify(current) !== JSON.stringify(history.after)) throw new Error('Memberships changed since this move; undo was not applied.');
            for (const member of history.before) {
                if (!await db.folders.get(member.folderId)) throw new Error('The original folder no longer exists.');
            }
            await db.folderMemberships.bulkDelete(history.after.map(member => member.id));
            await db.folderMemberships.bulkPut(history.before);
        }
        await db.settings.delete(undoKey);
    });
}
