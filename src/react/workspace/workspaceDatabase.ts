import Dexie, {type EntityTable, type Table} from 'dexie';
import {SEARCH_SCHEMA, installSearchInvalidation, initializeSearchState} from '../../workspace/searchInvalidation.js';
import type {SearchState, SearchChange, SearchDocument} from './searchIndexTypes';
import type {DraftRecord, RevisionRecord} from '../../workspace/recoveryTypes';

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

export class WorkspaceClient extends Dexie {
    searchState!: EntityTable<SearchState, 'key'>;
    searchChanges!: EntityTable<SearchChange, 'id'>;
    searchDocuments!: EntityTable<SearchDocument, 'id'>;
    workspaceDrafts!: EntityTable<DraftRecord, 'id'>;
    workspaceRevisions!: EntityTable<RevisionRecord, 'id'>;
    reloadRequired = false;
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
        this.version(4).stores({
            workspaceDrafts: 'id,sessionId,targetKey,boardId,updatedAt',
            workspaceRevisions: 'id,targetKey,createdAt,[targetKey+createdAt],[targetKey+createdAt+id]'
        });
        this.version(5).stores({
            entities: 'id,type,canonicalUrl,domainId,inboxAt,updatedAt,*searchTerms,[updatedAt+id]',
            placements: 'id,boardId,entityId,kind,updatedAt,[boardId+entityId],[boardId+id]',
            relationships: 'id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt,[fromEntityId+id],[toEntityId+id]',
            folderMemberships: 'id,folderId,entityId,sourceKind,position,[folderId+entityId],[folderId+position+id]',
            activities: 'id,type,boardId,entityId,sessionId,createdAt,[entityId+createdAt+id]'
        });
        this.version(6).stores(SEARCH_SCHEMA).upgrade(initializeSearchState);
        this.on('populate', initializeSearchState);
        installSearchInvalidation(this);
        this.on('versionchange', () => {this.reloadRequired = true; this.close();
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('workspace-reload-required'));});
    }
}

export const workspaceClient = new WorkspaceClient();

