require('fake-indexeddb/auto');

const assert = require('node:assert/strict');
const test = require('node:test');

const DexieModule = require('dexie');
const fixture = require('./fixtures/extension-profile.json');
const {SCHEMA_V1, SCHEMA_V2, createWorkspaceRepository} = require('../src/workspace/workspaceDb.js');

const Dexie = DexieModule.Dexie || DexieModule.default || DexieModule;
const uniqueName = label => `browser-os-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

test('legacy backup excludes private recovery unless explicitly opted in', async () => {
    const repository = createWorkspaceRepository({name: uniqueName('private-backup')});
    try {
        await repository.open();
        await repository.db.workspaceDrafts.put(require('./helpers/recoveryFixture').draft());
        assert.equal('workspaceDrafts' in (await repository.exportSnapshot()).tables, false);
        assert.equal((await repository.exportSnapshot({includeRecovery: true})).tables.workspaceDrafts.length, 1);
    } finally {await repository.deleteDatabase();}
});

test('migrates a fresh legacy fixture without deleting the source state', async () => {
    const repository = createWorkspaceRepository({name: uniqueName('fresh')});
    const legacyData = {icons: {'103': {x: 2, y: 3}}, locations: {'2,3': '103'}};
    const sourceBefore = JSON.stringify({legacyData, bookmarkTree: fixture.bookmarksTree});

    try {
        const report = await repository.migrateLegacy({
            legacyData,
            bookmarkTree: fixture.bookmarksTree,
            dryRun: false
        });
        assert.equal(report.counts.entities, 3);
        assert.equal(await repository.db.entities.count(), 3);
        assert.equal(await repository.db.sourceRefs.count(), 3);
        assert.equal((await repository.db.meta.get('legacyLayoutSnapshot')).value.icons['103'].x, 2);
        assert.equal(JSON.stringify({legacyData, bookmarkTree: fixture.bookmarksTree}), sourceBefore);
    } finally {
        await repository.deleteDatabase();
    }
});

test('keeps source identity separate while reusing canonical entity identity', async () => {
    const repository = createWorkspaceRepository({name: uniqueName('identity')});
    try {
        const first = await repository.upsertSource({
            sourceKind: 'bookmark', sourceId: 'a', title: 'Article',
            url: 'https://example.test/article?utm_source=one'
        });
        const second = await repository.upsertSource({
            sourceKind: 'history', sourceId: 'b', title: 'Article revisited',
            url: 'https://example.test/article'
        });
        assert.equal(first.id, second.id);
        assert.equal(await repository.db.entities.count(), 1);
        assert.equal(await repository.db.sourceRefs.count(), 2);
        assert.equal((await repository.getEntityBySource('bookmark', 'a')).id, first.id);
    } finally {
        await repository.deleteDatabase();
    }
});

test('preserves workspace-edited fields during repeated legacy projection', async () => {
    const repository = createWorkspaceRepository({name: uniqueName('workspace-edits')});
    try {
        await repository.migrateLegacy({bookmarkTree: fixture.bookmarksTree, dryRun: false});
        const article = await repository.db.entities
            .where('canonicalUrl').equals('https://example.test/article').first();
        await repository.db.entities.update(article.id, {
            title: 'My workspace title',
            metadata: {...article.metadata, workspaceEditedAt: 1787155200000}
        });
        const changedFixture = structuredClone(fixture.bookmarksTree);
        const visit = nodes => {
            for (const node of nodes) {
                if (node.url === 'https://example.test/article') {
                    return node;
                }
                const found = visit(node.children || []);
                if (found) {
                    return found;
                }
            }
            return undefined;
        };
        visit(changedFixture).title = 'Native title changed';
        await repository.migrateLegacy({bookmarkTree: changedFixture, dryRun: false});
        const preserved = await repository.db.entities.get(article.id);
        assert.equal(preserved.title, 'My workspace title');
        assert.equal(preserved.metadata.workspaceEditedAt, 1787155200000);
    } finally {
        await repository.deleteDatabase();
    }
});

test('rolls back an interrupted projection transaction and supports legacy read-through', async () => {
    const repository = createWorkspaceRepository({name: uniqueName('rollback')});
    try {
        await assert.rejects(repository.migrateLegacy({
            bookmarkTree: fixture.bookmarksTree,
            dryRun: false,
            beforeCommit() {
                throw new Error('simulated interruption');
            }
        }), /simulated interruption/);
        assert.equal(await repository.db.entities.count(), 0);
        const fallback = {id: 'legacy-only', title: 'Legacy fallback'};
        assert.deepEqual(await repository.readThroughEntity('bookmark', 'missing', fallback), fallback);
    } finally {
        await repository.deleteDatabase();
    }
});

test('upgrades version-one records with current indexed defaults', async () => {
    const name = uniqueName('upgrade');
    const oldDatabase = new Dexie(name);
    oldDatabase.version(1).stores(SCHEMA_V1);
    await oldDatabase.open();
    await oldDatabase.entities.put({
        id: 'page_old', type: 'page', title: 'Old Page',
        canonicalUrl: 'https://example.test/old', updatedAt: 1
    });
    await oldDatabase.relationships.put({
        id: 'relationship_old', fromEntityId: 'page_old', toEntityId: 'page_other',
        type: 'related', origin: 'ai-suggested', updatedAt: 1
    });
    oldDatabase.close();

    const repository = createWorkspaceRepository({name});
    try {
        await repository.open();
        const entity = await repository.db.entities.get('page_old');
        const relationship = await repository.db.relationships.get('relationship_old');
        assert.ok(entity.searchTerms.includes('old'));
        assert.equal(relationship.confirmed, false);
    } finally {
        await repository.deleteDatabase();
    }
});

test('upgrades version-two workspaces with workflow tables without losing entities', async () => {
    const name = uniqueName('workflow-upgrade');
    const oldDatabase = new Dexie(name);
    oldDatabase.version(2).stores(SCHEMA_V2);
    await oldDatabase.open();
    await oldDatabase.entities.put({
        id: 'page_kept', type: 'page', title: 'Kept Page',
        canonicalUrl: 'https://example.test/kept', searchTerms: ['kept'], updatedAt: 2
    });
    oldDatabase.close();

    const repository = createWorkspaceRepository({name});
    try {
        await repository.open();
        assert.equal(repository.db.verno, 5);
        assert.equal((await repository.db.entities.get('page_kept')).title, 'Kept Page');
        for (const table of ['activities', 'boardTemplates', 'savedFilters', 'tasks', 'workspaceSessions']) {
            assert.equal(await repository.db.table(table).count(), 0);
        }
    } finally {
        await repository.deleteDatabase();
    }
});
