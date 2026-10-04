(function(root, factory) {
    const isCommonJs = typeof module === 'object' && module.exports;
    const DexieModule = isCommonJs ? require('dexie') : root.Dexie;
    const schemaCore = isCommonJs ? require('./schemaCore.js') : root.workspaceSchemaCore;
    const api = factory(DexieModule, schemaCore);

    if (isCommonJs) {
        module.exports = api;
        return;
    }
    if (!root.app) {
        return;
    }
    const repository = api.createWorkspaceRepository();
    root.app.workspaceDb = repository;
    root.app.workspaceReady = repository.open()
        .then(async () => {
            const bookmarkTree = root.app.getBookmarkTree ? await root.app.getBookmarkTree() : [];
            const report = await repository.migrateLegacy({
                legacyData: root.app.data || {},
                bookmarkTree,
                dryRun: false
            });
            root.app.workspaceMigrationReport = report;
            return repository;
        })
        .catch(error => {
            root.app.workspaceMigrationError = error;
            return null;
        });
}(typeof globalThis !== 'undefined' ? globalThis : this, function(DexieModule, schemaCore) {
    const DexieClass = DexieModule && (DexieModule.Dexie || DexieModule.default || DexieModule);
    const DATABASE_NAME = 'browserOsWorkspace';
    const SCHEMA_V1 = {
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
    const SCHEMA_V2 = Object.assign({}, SCHEMA_V1, {
        entities: 'id,type,canonicalUrl,domainId,updatedAt,*searchTerms',
        placements: 'id,boardId,entityId,kind,updatedAt,[boardId+entityId]',
        relationships: 'id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt'
    });
    const SCHEMA_V3 = Object.assign({}, SCHEMA_V2, {
        entities: 'id,type,canonicalUrl,domainId,inboxAt,updatedAt,*searchTerms',
        tasks: 'id,&entityId,status,dueAt,reminderAt,updatedAt',
        activities: 'id,type,boardId,entityId,sessionId,createdAt',
        savedFilters: 'id,&name,query,updatedAt',
        workspaceSessions: 'id,boardId,createdAt,updatedAt',
        boardTemplates: 'id,&name,layout,updatedAt'
    });

    const createWorkspaceDatabase = (name = DATABASE_NAME) => {
        if (!DexieClass) {
            throw new Error('Dexie is not available.');
        }
        const db = new DexieClass(name);
        db.version(1).stores(SCHEMA_V1);
        db.version(2).stores(SCHEMA_V2).upgrade(transaction => Promise.all([
            transaction.table('entities').toCollection().modify(entity => {
                entity.searchTerms = schemaCore.normalizeSearchTerms(entity.title, entity.canonicalUrl);
            }),
            transaction.table('placements').toCollection().modify(placement => {
                placement.kind = placement.kind || 'entity';
            }),
            transaction.table('relationships').toCollection().modify(relationship => {
                relationship.confirmed = relationship.origin === 'ai-suggested' ? false : true;
            })
        ]));
        db.version(3).stores(SCHEMA_V3);
        db.version(4).stores({
            workspaceDrafts: 'id,sessionId,targetKey,boardId,updatedAt',
            workspaceRevisions: 'id,targetKey,createdAt,[targetKey+createdAt],[targetKey+createdAt+id]'
        });
        db.version(5).stores({
            entities: 'id,type,canonicalUrl,domainId,inboxAt,updatedAt,*searchTerms,[updatedAt+id]',
            placements: 'id,boardId,entityId,kind,updatedAt,[boardId+entityId],[boardId+id]',
            relationships: 'id,fromEntityId,toEntityId,type,origin,confirmed,updatedAt,[fromEntityId+id],[toEntityId+id]',
            folderMemberships: 'id,folderId,entityId,sourceKind,position,[folderId+entityId],[folderId+position+id]',
            activities: 'id,type,boardId,entityId,sessionId,createdAt,[entityId+createdAt+id]'
        });
        db.on('versionchange', () => {db.close();
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('workspace-reload-required'));});
        return db;
    };

    const createWorkspaceRepository = (options = {}) => {
        const db = options.db || createWorkspaceDatabase(options.name || DATABASE_NAME);
        let opened = false;

        const open = async () => {
            if (!opened) {
                await db.open();
                opened = true;
                await db.meta.put({
                    key: 'schema',
                    version: schemaCore.CURRENT_SCHEMA_VERSION,
                    updatedAt: Date.now()
                });
            }
            return repository;
        };

        const upsertSource = async source => {
            await open();
            const now = source.updatedAt || Date.now();
            const entity = schemaCore.makePageEntity(source, now);
            const sourceRef = schemaCore.makeSourceReference(source, entity.id, now);
            let saved;
            await db.transaction('rw', db.entities, db.sourceRefs, db.domains, async () => {
                const existing = await db.entities.get(entity.id);
                const edited = existing && existing.metadata && existing.metadata.workspaceEditedAt;
                saved = Object.assign({}, existing || {}, entity, {
                    title: edited ? existing.title : entity.title,
                    createdAt: existing ? existing.createdAt : entity.createdAt,
                    metadata: Object.assign({}, existing && existing.metadata, entity.metadata)
                });
                if (edited) {
                    saved.metadata.body = existing.metadata.body;
                    saved.metadata.workspaceEditedAt = existing.metadata.workspaceEditedAt;
                }
                saved.searchTerms = schemaCore.normalizeSearchTerms(saved.title, saved.canonicalUrl,
                    schemaCore.getHost(saved.canonicalUrl), String(saved.metadata.body || ''));
                await db.entities.put(saved);
                await db.sourceRefs.put(sourceRef);
                if (entity.domainId) {
                    const host = schemaCore.getHost(entity.canonicalUrl);
                    const existingDomain = await db.domains.get(entity.domainId);
                    await db.domains.put({
                        id: entity.domainId,
                        host,
                        createdAt: existingDomain ? existingDomain.createdAt : now,
                        updatedAt: now
                    });
                }
            });
            return saved;
        };

        const migrateLegacy = async ({legacyData = {}, bookmarkTree = [], dryRun = true, beforeCommit} = {}) => {
            await open();
            const plan = schemaCore.buildLegacyMigrationPlan({legacyData, bookmarkTree});
            if (dryRun) {
                return plan;
            }
            const tables = ['entities', 'sourceRefs', 'domains', 'folders', 'folderMemberships'];
            await db.transaction('rw', db.entities, db.sourceRefs, db.domains, db.folders,
                db.folderMemberships, db.meta, async () => {
                    for (const tableName of tables) {
                        if (plan.operations[tableName].length) {
                            if (tableName === 'entities') {
                                for (const projectedEntity of plan.operations.entities) {
                                    const existingEntity = await db.entities.get(projectedEntity.id);
                                    const workspaceEdited = existingEntity &&
                                        existingEntity.metadata &&
                                        existingEntity.metadata.workspaceEditedAt;
                                    await db.entities.put(workspaceEdited ? Object.assign(
                                        {},
                                        projectedEntity,
                                        existingEntity,
                                        {
                                            metadata: Object.assign(
                                                {},
                                                projectedEntity.metadata,
                                                existingEntity.metadata
                                            )
                                        }
                                    ) : Object.assign({}, existingEntity || {}, projectedEntity, {
                                        metadata: Object.assign(
                                            {},
                                            existingEntity && existingEntity.metadata,
                                            projectedEntity.metadata
                                        )
                                    }));
                                }
                            } else {
                                await db.table(tableName).bulkPut(plan.operations[tableName]);
                            }
                        }
                    }
                    if (beforeCommit) {
                        await beforeCommit(plan);
                    }
                    await db.meta.bulkPut([
                        {key: 'legacyLayoutSnapshot', value: plan.layoutSnapshot, updatedAt: plan.generatedAt},
                        {key: 'legacyMigration', value: {
                            schemaVersion: plan.schemaVersion,
                            generatedAt: plan.generatedAt,
                            counts: plan.counts,
                            errors: plan.errors
                        }, updatedAt: plan.generatedAt}
                    ]);
                });
            return plan;
        };

        const projectBookmarkTree = bookmarkTree => migrateLegacy({bookmarkTree, legacyData: {}, dryRun: false});

        const recordTabGroups = async groups => {
            await open();
            const tabs = (groups || []).flatMap(group => group.tabs || []).slice(0, 500);
            for (const tab of tabs) {
                const entity = await upsertSource({
                    sourceKind: 'tab',
                    sourceId: `${tab.tabId}:${tab.openedAt || 'observed'}`,
                    title: tab.title,
                    url: tab.url,
                    createdAt: tab.openedAt,
                    metadata: {tabId: tab.tabId, windowId: tab.windowId}
                });
                await db.tabSessions.put({
                    id: schemaCore.stableId('tab-session', `${tab.tabId}:${tab.openedAt || 'observed'}`),
                    tabId: tab.tabId,
                    entityId: entity.id,
                    openedAt: tab.openedAt,
                    openedAtSource: tab.openedAtSource || 'first-observed',
                    openedFromEntityId: tab.openedFrom && tab.openedFrom.url ?
                        schemaCore.makePageEntity({url: tab.openedFrom.url}).id : undefined,
                    metadata: {openedBySearch: tab.openedBySearch, windowId: tab.windowId}
                });
            }
            return tabs.length;
        };

        const getEntityBySource = async (sourceKind, sourceId) => {
            await open();
            const sourceRef = await db.sourceRefs.where('sourceKey').equals(`${sourceKind}:${sourceId}`).first();
            return sourceRef ? db.entities.get(sourceRef.entityId) : undefined;
        };

        const readThroughEntity = async (sourceKind, sourceId, legacyFallback) => {
            const entity = await getEntityBySource(sourceKind, sourceId);
            return entity || (typeof legacyFallback === 'function' ? legacyFallback() : legacyFallback);
        };

        const exportSnapshot = async (options = {}) => {
            await open();
            const tables = await db.transaction('r', db.tables, async () => {
                const records = {};
                for (const table of db.tables) {
                    if (!options.includeRecovery && ['workspaceDrafts', 'workspaceRevisions'].includes(table.name)) continue;
                    records[table.name] = await table.toArray();
                }
                return records;
            });
            return {
                format: 'browser-os-workspace',
                schemaVersion: schemaCore.CURRENT_SCHEMA_VERSION,
                exportedAt: Date.now(),
                tables
            };
        };

        const close = () => {
            db.close();
            opened = false;
        };

        const deleteDatabase = async () => {
            close();
            await db.delete();
        };

        const repository = {
            close,
            db,
            deleteDatabase,
            exportSnapshot,
            getEntityBySource,
            migrateLegacy,
            open,
            projectBookmarkTree,
            readThroughEntity,
            recordTabGroups,
            upsertSource
        };
        return repository;
    };

    return {
        DATABASE_NAME,
        SCHEMA_V1,
        SCHEMA_V2,
        SCHEMA_V3,
        createWorkspaceDatabase,
        createWorkspaceRepository
    };
}));
