import Dexie, {type EntityTable, type Table} from 'dexie';
import {useEffect, useState} from 'react';

import type {
    AssetRecord,
    BoardPlacement,
    BoardRecord,
    BoardTemplateRecord,
    DomainRecord,
    FolderMembership,
    RelationshipRecord,
    SavedFilter,
    SourceReference,
    TabSessionRecord,
    WorkspaceActivity,
    WorkspaceEntity,
    WorkspaceFolder,
    WorkspaceSession,
    WorkspaceSetting,
    WorkspaceTask
} from '../../workspace/types';

export interface WorkspaceSummary {
    entities: number;
    boards: number;
    relationships: number;
}

export class WorkspaceClient extends Dexie {
    entities!: EntityTable<WorkspaceEntity, 'id'>;
    sourceRefs!: EntityTable<SourceReference, 'id'>;
    domains!: EntityTable<DomainRecord, 'id'>;
    folders!: EntityTable<WorkspaceFolder, 'id'>;
    folderMemberships!: EntityTable<FolderMembership, 'id'>;
    boards!: EntityTable<BoardRecord, 'id'>;
    placements!: EntityTable<BoardPlacement, 'id'>;
    relationships!: EntityTable<RelationshipRecord, 'id'>;
    tabSessions!: EntityTable<TabSessionRecord, 'id'>;
    assets!: EntityTable<AssetRecord, 'id'>;
    tasks!: EntityTable<WorkspaceTask, 'id'>;
    activities!: EntityTable<WorkspaceActivity, 'id'>;
    savedFilters!: EntityTable<SavedFilter, 'id'>;
    workspaceSessions!: EntityTable<WorkspaceSession, 'id'>;
    boardTemplates!: EntityTable<BoardTemplateRecord, 'id'>;
    settings!: EntityTable<WorkspaceSetting, 'key'>;
    meta!: Table<Record<string, unknown>, string>;

    constructor(name = 'browserOsWorkspace') {
        super(name);
        const versionOne = {
            meta: 'key',
            entities: 'id,type,canonicalUrl,domainId,updatedAt',
            sourceRefs: 'id,&sourceKey,entityId,sourceKind,sourceId',
            domains: 'id,&host,updatedAt',
            folders: 'id,parentId,sourceKind,sourceId,updatedAt',
            folderMemberships: 'id,folderId,entityId,sourceKind,position,[folderId+entityId]',
            boards: 'id,name,createdAt,updatedAt',
            placements: 'id,boardId,entityId,updatedAt,[boardId+entityId]',
            relationships: 'id,fromEntityId,toEntityId,type,origin,updatedAt',
            tabSessions: 'id,tabId,entityId,openedAt,closedAt',
            assets: 'id,entityId,type,createdAt',
            settings: 'key'
        };
        this.version(1).stores(versionOne);
        this.version(2).stores({
            ...versionOne,
            entities: 'id,type,canonicalUrl,domainId,updatedAt,*searchTerms',
            placements: 'id,boardId,entityId,kind,updatedAt,[boardId+entityId]',
            relationships: 'id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt'
        }).upgrade(transaction => Promise.all([
            transaction.table('entities').toCollection().modify(entity => {
                entity.searchTerms = Array.isArray(entity.searchTerms) ? entity.searchTerms :
                    [entity.title, entity.canonicalUrl]
                        .filter((value): value is string => typeof value === 'string')
                        .flatMap(value => value.toLocaleLowerCase().split(/[^a-z0-9]+/))
                        .filter(Boolean);
            }),
            transaction.table('placements').toCollection().modify(placement => {
                placement.kind = placement.kind || 'entity';
            }),
            transaction.table('relationships').toCollection().modify(relationship => {
                relationship.confirmed = relationship.origin !== 'ai-suggested';
            })
        ]));
        this.version(3).stores({
            ...versionOne,
            entities: 'id,type,canonicalUrl,domainId,inboxAt,updatedAt,*searchTerms',
            placements: 'id,boardId,entityId,kind,updatedAt,[boardId+entityId]',
            relationships: 'id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt',
            tasks: 'id,&entityId,status,dueAt,reminderAt,updatedAt',
            activities: 'id,type,boardId,entityId,sessionId,createdAt',
            savedFilters: 'id,&name,query,updatedAt',
            workspaceSessions: 'id,boardId,createdAt,updatedAt',
            boardTemplates: 'id,&name,layout,updatedAt'
        });
    }
}

export const workspaceClient = new WorkspaceClient();

export async function getWorkspaceSummary(): Promise<WorkspaceSummary> {
    const [entities, boards, relationships] = await Promise.all([
        workspaceClient.entities.count(),
        workspaceClient.boards.count(),
        workspaceClient.relationships.count()
    ]);
    return {entities, boards, relationships};
}

export function useWorkspaceSummary(enabled: boolean): WorkspaceSummary | null {
    const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
    useEffect(() => {
        if (!enabled) {
            return;
        }
        let cancelled = false;
        getWorkspaceSummary().then(nextSummary => {
            if (!cancelled) {
                setSummary(nextSummary);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [enabled]);
    return summary;
}
