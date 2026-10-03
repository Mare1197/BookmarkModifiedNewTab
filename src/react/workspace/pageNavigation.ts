import {workspaceClient as db} from './workspaceClient';

export interface PageNavigationItem {id: string; boardId: string; title: string; parentId?: string; depth: number}
export async function loadPageNavigation(): Promise<PageNavigationItem[]> {
    return db.transaction('r', [db.settings, db.entities, db.relationships, db.boards], async () => {
        const [settings, links] = await Promise.all([
            db.settings.where('key').startsWith('workspace-page:').toArray(),
            db.relationships.where('type').equals('page-parent').toArray()
        ]);
        const candidates = settings.flatMap(setting => {
            const owner = (setting.value as {ownerEntityId?: unknown} | null)?.ownerEntityId;
            return typeof owner === 'string' ? [{id: owner, boardId: setting.key.slice('workspace-page:'.length)}] : [];
        });
        const [entities, boards] = await Promise.all([
            db.entities.bulkGet(candidates.map(c => c.id)), db.boards.bulkGet(candidates.map(c => c.boardId))
        ]);
        const items = new Map<string, PageNavigationItem>();
        candidates.forEach((candidate, index) => {
            const entity = entities[index];
            if (boards[index] && entity && (entity.type === 'project' || entity.type === 'document' && entity.metadata?.workspacePage)) {
                items.set(entity.id, {...candidate, title: entity.title, depth: 0});
            }
        });
        for (const link of links) if (link.confirmed && items.has(link.fromEntityId) && items.has(link.toEntityId)) {
            items.get(link.fromEntityId)!.parentId = link.toEntityId;
        }
        const ordered = [...items.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
        const children = new Map<string, PageNavigationItem[]>();
        for (const item of ordered) if (item.parentId) {
            const siblings = children.get(item.parentId) || []; siblings.push(item); children.set(item.parentId, siblings);
        }
        const result: PageNavigationItem[] = [], seen = new Set<string>();
        const visit = (root: PageNavigationItem) => {
            const stack = [{...root, depth: 0}];
            while (stack.length) {
                const item = stack.pop()!; if (seen.has(item.id)) continue;
                seen.add(item.id); result.push(item);
                for (const child of [...children.get(item.id) || []].reverse()) stack.push({...child, depth: item.depth + 1});
            }
        };
        ordered.filter(item => !item.parentId).forEach(visit);
        // Damaged cyclic data remains navigable without changing the user's stored links.
        ordered.filter(item => !seen.has(item.id)).forEach(visit);
        return result;
    });
}
