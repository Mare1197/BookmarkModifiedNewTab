import {workspaceClient as db} from './workspaceClient';
import type {WorkspaceEntity} from '../../workspace/types';

const sequence = (message: WorkspaceEntity) => {
    const value = message.properties?.sequence;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};
const timestamp = (message: WorkspaceEntity) => {
    const value = message.source?.createdAt;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : message.createdAt;
};

export async function loadConversationMessages(conversationId: string): Promise<WorkspaceEntity[]> {
    const links = await db.relationships.where('toEntityId').equals(conversationId).toArray();
    const ids = [...new Set(links.filter(link => link.confirmed && link.type === 'message-of').map(link => link.fromEntityId))];
    const messages = (await db.entities.bulkGet(ids)).filter((entity): entity is WorkspaceEntity => entity?.type === 'message');
    return messages.sort((a, b) => {
        const left = sequence(a), right = sequence(b);
        // Sequenced messages precede legacy records. A total order avoids mixed-record sort cycles.
        if (left !== undefined && right !== undefined && left !== right) return left - right;
        if (left !== undefined && right === undefined) return -1;
        if (left === undefined && right !== undefined) return 1;
        return timestamp(a) - timestamp(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
}
