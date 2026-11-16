import {liveQuery} from 'dexie';
import type {WorkspaceClient} from './workspaceClient';
import type {PageSnapshot} from './pageRepository';
import type {WorkspaceEntity} from '../../workspace/types';

export interface ReferenceShell {id: string; title: string; type: WorkspaceEntity['type']; updatedAt: number; missing: boolean}
const shell = (id: string, entity?: WorkspaceEntity): ReferenceShell => entity ?
    {id, title: entity.title, type: entity.type, updatedAt: entity.updatedAt, missing: false} :
    {id, title: 'Object unavailable', type: 'note', updatedAt: 0, missing: true};
export function createReferenceDataSource(db: WorkspaceClient, snapshot: PageSnapshot, onError?: (error: unknown) => void) {
    const ids = [...new Set(snapshot.placements.map(p => p.entityId))], initial = new Map(snapshot.entities.map(entity => [entity.id, entity]));
    const shells = new Map(ids.map(id => [id, shell(id, initial.get(id))])); initial.clear();
    const listeners = new Set<(ids: readonly string[]) => void>(); let closed = false;
    const subscription = liveQuery(async () => {
        const result: ReferenceShell[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
            const batch = ids.slice(offset, offset + 100), records = await db.entities.bulkGet(batch);
            result.push(...batch.map((id, index) => shell(id, records[index])));
        }
        return result;
    }).subscribe({next: next => {
        if (closed) return;
        const changed = next.filter(value => JSON.stringify(value) !== JSON.stringify(shells.get(value.id))).map(value => value.id);
        next.forEach(value => shells.set(value.id, value));
        if (changed.length) listeners.forEach(listener => listener(changed));
    }, error: error => {if (!closed) onError?.(error);}});
    return {
        readShell: (id: string): ReferenceShell => ({...(shells.get(id) || shell(id))}),
        subscribe(listener: (ids: readonly string[]) => void) {if (!closed) listeners.add(listener); return () => {listeners.delete(listener);};},
        dispose() {closed = true; subscription.unsubscribe(); listeners.clear(); shells.clear();}
    };
}
