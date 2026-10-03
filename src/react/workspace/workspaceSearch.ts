import type {WorkspaceEntity} from '../../workspace/types';
import type {WorkspaceSnapshot} from './workspaceRepository';

interface ParsedQuery {
    after?: number;
    board?: string;
    domain?: string;
    has?: string;
    inbox?: boolean;
    status?: string;
    text: string[];
    type?: string;
}

function parseAfter(value: string, referenceTime: number): number | undefined {
    const relative = /^(\d+)([dhw])$/i.exec(value);
    if (relative) {
        const amount = Number(relative[1]);
        const unit = (relative[2] || 'd').toLocaleLowerCase();
        const multiplier = unit === 'h' ? 60 * 60 * 1000 : unit === 'w' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        return referenceTime - amount * multiplier;
    }
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function parseSmartQuery(rawQuery: string, referenceTime = Date.now()): ParsedQuery {
    const parsed: ParsedQuery = {text: []};
    (rawQuery.match(/(?:[^\s"]+|"[^"]*")+/g) || []).forEach(rawToken => {
        const token = rawToken.replace(/"/g, '');
        const separator = token.indexOf(':');
        if (separator < 1) {
            parsed.text.push(token.toLocaleLowerCase());
            return;
        }
        const key = token.slice(0, separator).toLocaleLowerCase();
        const value = token.slice(separator + 1).toLocaleLowerCase();
        if (key === 'after') {
            parsed.after = parseAfter(value, referenceTime);
        } else if (key === 'board') {
            parsed.board = value;
        } else if (key === 'domain') {
            parsed.domain = value;
        } else if (key === 'has') {
            parsed.has = value;
        } else if (key === 'is' && value === 'inbox') {
            parsed.inbox = true;
        } else if (key === 'status') {
            parsed.status = value;
        } else if (key === 'type') {
            parsed.type = value;
        } else {
            parsed.text.push(token.toLocaleLowerCase());
        }
    });
    return parsed;
}

export function filterWorkspaceEntities(
    snapshot: WorkspaceSnapshot,
    rawQuery: string,
    referenceTime = Date.now()
): WorkspaceEntity[] {
    const parsed = parseSmartQuery(rawQuery, referenceTime);
    const taskByEntity = new Map(snapshot.tasks.map(task => [task.entityId, task]));
    const relatedIds = new Set(snapshot.relationships.flatMap(relationship => [
        relationship.fromEntityId,
        relationship.toEntityId
    ]));
    const entityIdsWithTasks = new Set(snapshot.tasks.map(task => task.entityId));
    snapshot.relationships.filter(relationship => relationship.type === 'task-for').forEach(relationship => {
        entityIdsWithTasks.add(relationship.fromEntityId);
        entityIdsWithTasks.add(relationship.toEntityId);
    });
    let boardEntityIds: Set<string> | undefined;
    if (parsed.board) {
        const boardIds = new Set(snapshot.boards
            .filter(board => board.name.toLocaleLowerCase().includes(parsed.board as string))
            .map(board => board.id));
        boardEntityIds = new Set(snapshot.boardMemberships
            .filter(placement => boardIds.has(placement.boardId))
            .map(placement => placement.entityId));
    }
    return snapshot.entities.filter(entity => {
        if (parsed.type && entity.type !== parsed.type) {
            return false;
        }
        if (parsed.inbox && !entity.inboxAt) {
            return false;
        }
        if (parsed.after && entity.updatedAt < parsed.after) {
            return false;
        }
        if (parsed.domain) {
            try {
                if (!entity.canonicalUrl || !new URL(entity.canonicalUrl).hostname.toLocaleLowerCase().includes(parsed.domain)) {
                    return false;
                }
            } catch {
                return false;
            }
        }
        if (boardEntityIds && !boardEntityIds.has(entity.id)) {
            return false;
        }
        if (parsed.has === 'backlinks' && !relatedIds.has(entity.id)) {
            return false;
        }
        if (parsed.has === 'task' && !entityIdsWithTasks.has(entity.id)) {
            return false;
        }
        if (parsed.status && taskByEntity.get(entity.id)?.status !== parsed.status) {
            return false;
        }
        if (parsed.text.length) {
            const haystack = [entity.title, entity.canonicalUrl || '', ...entity.searchTerms,
                String(entity.metadata?.body || '')].join(' ').toLocaleLowerCase();
            if (!parsed.text.every(term => haystack.includes(term))) {
                return false;
            }
        }
        return true;
    });
}
