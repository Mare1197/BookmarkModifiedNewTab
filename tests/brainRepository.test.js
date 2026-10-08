require('fake-indexeddb/auto');
const assert = require('node:assert/strict');
const {readFileSync, existsSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const {createWorkspaceDatabase} = require('../src/workspace/workspaceDb');

async function fixture(t) {
    const db = createWorkspaceDatabase('brain-test-' + crypto.randomUUID());
    await db.open();
    t.after(() => db.delete());
    const alarms = new Map();
    const storage = {};
    const browser = {alarms: {create: async (name, value) => alarms.set(name, value), clear: async name => alarms.delete(name)},
        storage: {local: {get: async () => storage, set: async value => Object.assign(storage, value)}}};
    const cache = new Map();
    function load(filename) {
        if (cache.has(filename)) return cache.get(filename);
        if (!existsSync(filename)) return {};
        const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}
        }).outputText;
        const exports = {};
        cache.set(filename, exports);
        new Function('require', 'exports', compiled)(name => {
            if (name === './workspaceClient') return {workspaceClient: db};
            if (name === 'wxt/browser') return {browser};
            if (!name.startsWith('.')) return require(name);
            const dependency = path.resolve(path.dirname(filename), name + '.ts');
            return load(existsSync(dependency) ? dependency : dependency + 'x');
        }, exports);
        return exports;
    }
    return {db, alarms, ...load(path.resolve(__dirname, '../src/react/workspace/brainRepository.ts')),
        views: load(path.resolve(__dirname, '../src/react/workspace/brainSelectors.ts')),
        imports: load(path.resolve(__dirname, '../src/react/workspace/chatImportService.ts')),
        backup: load(path.resolve(__dirname, '../src/react/workspace/workspaceRepository.ts')),
        ui: load(path.resolve(__dirname, '../src/react/workspace/BrainWorkspace.tsx')),
        home: load(path.resolve(__dirname, '../src/react/workspace/ProjectHome.tsx')),
        objectUi: load(path.resolve(__dirname, '../src/react/workspace/BrainObjectTools.tsx'))};
}

const chat = {provider: 'chatgpt', sourceId: 'chat-1', title: 'New Tab OS research',
    url: 'https://chatgpt.com/c/chat-1', messages: [
        {id: 'm1', role: 'user', text: 'Connect shared AI memory'},
        {id: 'm2', role: 'assistant', text: 'Use source-backed objects'}
    ]};

test('a failed multi-conversation import rolls back the entire batch', async t => {
    const api = await fixture(t);
    await assert.rejects(api.imports.applyConversationImport([chat,
        {...chat, sourceId: 'invalid', url: 'javascript:alert(1)'}]), /URL/);
    for (const table of [api.db.entities, api.db.relationships, api.db.sourceRefs, api.db.activities]) {
        assert.equal(await table.count(), 0, table.name + ' must not contain a partial import');
    }
});

test('chat imports are atomic, source-idempotent and preserve local edits and triage', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.importConversation, 'function', 'conversation adapter is available');
    const first = await api.importConversation(chat);
    await api.db.entities.update(first.id, {title: 'My title', inboxAt: undefined,
        metadata: {workspaceEditedAt: 12}});
    const second = await api.importConversation(chat);
    assert.equal(first.id, second.id);
    assert.equal(await api.db.entities.count(), 3);
    assert.equal(second.title, 'My title');
    assert.equal(second.inboxAt, undefined);
    assert.equal(await api.db.sourceRefs.count(), 3);
    assert.equal(await api.db.relationships.count(), 2);
    assert.equal(await api.db.activities.count(), 1);
    await assert.rejects(api.importConversation({...chat, sourceId: 'bad',
        messages: [{id: 'm', role: 'user', text: 'okay'}, {id: 'm', role: 'user', text: 'duplicate'}]}), /duplicate/i);
    assert.equal(await api.db.entities.count(), 3);
    await assert.rejects(api.importConversation({...chat, url: 'javascript:alert(1)'}), /URL/);
});

test('graph projection is capped after scope and project resume preview deduplicates safe URLs', async t => {
    const api = await fixture(t);
    const project = await api.createBrainObject({type: 'project', title: 'Home'});
    const entries = Array.from({length: 250}, (_, index) => ({...project, id: 'web:' + index, type: 'website',
        canonicalUrl: index === 0 ? 'javascript:alert(1)' : 'https://example.com/' + index % 2, updatedAt: index}));
    const relationships = entries.map(entity => ({id: entity.id, fromEntityId: entity.id, toEntityId: project.id,
        type: 'project-member', confirmed: true}));
    assert.equal(api.views.graphProjection(entries, relationships).placements.length, 200);
    assert.equal(api.views.graphProjection(entries, relationships, {entityIds: new Set(['web:249'])}).placements[0].entityId, 'web:249');
    assert.equal(typeof api.views.projectResumePreview, 'function');
    const preview = api.views.projectResumePreview(project.id, [project, ...entries], relationships, ['https://example.com/1']);
    assert.equal(preview.length, 1);
    assert.equal(preview[0].url, 'https://example.com/0');
});

test('backup merging cannot silently restore a forgotten memory', async t => {
    const api = await fixture(t);
    const memory = await api.createBrainObject({type: 'memory', title: 'Keep forgotten'});
    const old = await api.backup.exportWorkspace();
    await api.setMemoryPolicy(memory.id, {status: 'forgotten'});
    await api.backup.importWorkspace(old);
    assert.equal((await api.db.entities.get(memory.id)).memory.status, 'forgotten');
    assert.equal(old.tables.entities.find(entity => entity.id === memory.id).memory.status, 'active', 'backup input stays unchanged');
});

test('Brain shell waits for paged data and exposes preview-first provider import', async t => {
    const api = await fixture(t);
    const React = require('react');
    const {renderToStaticMarkup} = require('react-dom/server');
    const base = await api.createBrainObject({type: 'note', title: 'Paginated'});
    const entities = Array.from({length: 120}, (_, index) => ({...base, id: 'page:' + index}));
    const html = renderToStaticMarkup(React.createElement(api.ui.BrainWorkspace, {
        snapshot: {entities, relationships: [], tasks: [], activities: []}, onSelect() {}, onCanvas: async () => {}, onRefresh: async () => {}, onStatus() {}
    }));
    assert.equal((html.match(/data-entity-id=/g) || []).length, 0);
    assert.ok(html.includes('Searching'));
    assert.ok(html.includes('Next page'));
    assert.ok(html.includes('Create an object or import a conversation'));
});

test('project homepage exposes its loading state before the scoped read resolves', async t => {
    const api = await fixture(t);
    const React = require('react');
    const {renderToStaticMarkup} = require('react-dom/server');
    const project = await api.createBrainObject({type: 'project', title: 'Grouped project'});
    const conversation = await api.importConversation(chat);
    await api.linkBrainObjects(conversation.id, project.id, 'project-member');
    const html = renderToStaticMarkup(React.createElement(api.home.ProjectHome, {
        projectId: project.id,
        snapshot: {entities: await api.db.entities.toArray(), relationships: await api.db.relationships.toArray(), tasks: [], activities: []},
        onSelect() {}, onCanvas: async () => {}, onRefresh: async () => {}, onStatus() {}
    }));
    assert.ok(html.includes('Loading project'));
    assert.ok(html.includes('Research (0)'));
});

test('source reference namespace separates conversation IDs from message IDs', async t => {
    const api = await fixture(t);
    await api.importConversation(chat);
    await api.importConversation({...chat, sourceId: 'chat-1:m1', messages: []});
    assert.equal(await api.db.sourceRefs.count(), 4);
});

test('project membership shares object identity and rejects nested project cycles', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.createBrainObject, 'function');
    const project = await api.createBrainObject({type: 'project', title: 'New Tab OS'});
    const nested = await api.createBrainObject({type: 'project', title: 'Canvas'});
    const note = await api.createBrainObject({type: 'note', title: 'One note'});
    await api.linkBrainObjects(note.id, project.id, 'project-member');
    await api.linkBrainObjects(note.id, project.id, 'project-member');
    await api.linkBrainObjects(nested.id, project.id, 'project-member');
    assert.equal(await api.db.relationships.count(), 2);
    await assert.rejects(api.linkBrainObjects(project.id, nested.id, 'project-member'), /cycle/);
    await assert.rejects(api.linkBrainObjects(project.id, note.id, 'project-member'), /project/);
    await assert.rejects(api.linkBrainObjects('missing', project.id), /object/);
    assert.equal(await api.db.entities.count(), 3);
});

test('memory requires resolvable evidence and inherits only confirmed project scope', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.createSourcedMemory, 'function');
    const project = await api.createBrainObject({type: 'project', title: 'OS'});
    const source = await api.importConversation(chat);
    await api.linkBrainObjects(source.id, project.id, 'project-member');
    const memory = await api.createSourcedMemory(source.id, 'Decision', 'Keep one store');
    const edges = await api.db.relationships.toArray();
    assert.ok(edges.some(r => r.fromEntityId === memory.id && r.toEntityId === source.id && r.type === 'derived-from'));
    assert.ok(edges.some(r => r.fromEntityId === memory.id && r.toEntityId === project.id && r.type === 'project-member'));
    await assert.rejects(api.createSourcedMemory('missing', 'Bad memory', 'Unsourced'), /object/);
    assert.equal((await api.db.entities.where('type').equals('memory').toArray()).length, 1);
});

test('suggestions never silently classify and rejection survives regeneration', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.suggestInboxProjects, 'function');
    const project = await api.createBrainObject({type: 'project', title: 'New Tab OS'});
    const source = await api.importConversation(chat);
    await api.suggestInboxProjects();
    let edges = await api.db.relationships.toArray();
    let suggestion = edges.find(r => r.fromEntityId === source.id && r.toEntityId === project.id);
    assert.equal(suggestion.confirmed, false);
    assert.equal(suggestion.origin, 'rule-suggested');
    assert.ok(suggestion.confidence > 0 && suggestion.evidence.length > 0);
    assert.equal(api.views.projectMembers(await api.db.entities.toArray(), edges, project.id).length, 0);
    await api.reviewRelationship(suggestion.id, 'rejected');
    await api.suggestInboxProjects();
    assert.equal((await api.db.relationships.get(suggestion.id)).reviewStatus, 'rejected');
    const other = await api.createBrainObject({type: 'idea', title: 'New Tab OS idea'});
    await api.suggestInboxProjects();
    suggestion = (await api.db.relationships.toArray()).find(r => r.fromEntityId === other.id && r.toEntityId === project.id);
    await api.reviewRelationship(suggestion.id, 'accepted');
    edges = await api.db.relationships.toArray();
    assert.equal(api.views.projectMembers(await api.db.entities.toArray(), edges, project.id)[0].id, other.id);
    assert.equal((await api.db.entities.get(other.id)).inboxAt, undefined);
});

test('status and tile layout persist separately without copying content', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.setBrainStatus, 'function');
    const entity = await api.createBrainObject({type: 'task', title: 'Build'});
    await api.setBrainStatus(entity.id, 'in-progress');
    assert.equal((await api.db.tasks.where('entityId').equals(entity.id).first()).status, 'in-progress');
    assert.equal((await api.db.entities.get(entity.id)).properties?.status, undefined);
    await api.saveTileLayout('all', entity.id, {order: 2, width: 2});
    api.db.close();
    await api.db.open();
    assert.deepEqual((await api.loadTileLayout('all'))[entity.id], {order: 2, width: 2});
    assert.equal(await api.db.entities.count(), 1);
    await assert.rejects(api.saveTileLayout('all', entity.id, {order: NaN, width: 9}), /layout/);
});

test('Kanban status changes preserve existing task reminder behavior', async t => {
    const api = await fixture(t);
    const entity = await api.createBrainObject({type: 'task', title: 'Reminder task'});
    const task = await api.db.tasks.where('entityId').equals(entity.id).first();
    await api.db.tasks.update(task.id, {reminderAt: Date.now() + 600000});
    await api.setBrainStatus(entity.id, 'next');
    assert.equal(api.alarms.size, 1);
    await api.setBrainStatus(entity.id, 'done');
    assert.equal(api.alarms.size, 0);
});

test('reusable views store only query configuration and survive reopen', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.saveBrainView, 'function');
    await api.saveBrainView('Research', {type: 'conversation', sort: 'updated'}, 'Tiles');
    api.db.close(); await api.db.open();
    const views = await api.loadBrainViews();
    assert.equal(views.length, 1);
    assert.deepEqual(views[0].query, {type: 'conversation', sort: 'updated'});
    assert.equal(views[0].mode, 'Tiles');
    assert.equal(await api.db.entities.count(), 0);
});

test('AI context resolves conversation messages and sourced memory without unrelated project leakage', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.views.brainContext, 'function');
    const conversation = await api.importConversation(chat);
    const memory = await api.createSourcedMemory(conversation.id, 'Local decision', 'Keep one store');
    await api.createBrainObject({type: 'note', title: 'Unrelated private note', body: 'Do not include'});
    const context = api.views.brainContext(conversation.id, await api.db.entities.toArray(), await api.db.relationships.toArray());
    assert.ok(context.includes('Keep one store'));
    assert.ok(context.includes('Connect shared AI memory'));
    assert.ok(context.includes(memory.id));
    assert.ok(!context.includes('Do not include'));
});

test('explicit object mentions create derived backlinks and remove only obsolete derived links', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.syncObjectMentions, 'function');
    const note = await api.createBrainObject({type: 'note', title: 'Source'});
    const target = await api.createBrainObject({type: 'project', title: 'Target'});
    await api.db.entities.update(note.id, {metadata: {body: '[[' + target.id + ']]'}});
    await api.syncObjectMentions(note.id);
    let links = await api.db.relationships.toArray();
    assert.equal(links.length, 1);
    assert.equal(links[0].type, 'mentions');
    assert.equal(links[0].toEntityId, target.id);
    await api.linkBrainObjects(note.id, target.id, 'related');
    await api.db.entities.update(note.id, {metadata: {body: 'Removed mention'}});
    await api.syncObjectMentions(note.id);
    links = await api.db.relationships.toArray();
    assert.equal(links.length, 1);
    assert.equal(links[0].type, 'related');
});

test('backup rejects unsafe source URLs and invalid relationship confidence', async t => {
    const api = await fixture(t);
    const conversation = await api.importConversation(chat);
    const exported = await api.backup.exportWorkspace();
    exported.tables.entities.find(e => e.id === conversation.id).source.url = 'javascript:alert(1)';
    await assert.rejects(api.backup.importWorkspace(exported), /source URL/);
    const valid = await api.backup.exportWorkspace();
    valid.tables.relationships[0].confidence = 2;
    await assert.rejects(api.backup.importWorkspace(valid), /confidence/);
});

test('backlinks exclude unconfirmed edges and distinguish mentions and sources', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.views.objectConnections, 'function');
    const links = [
        {id: 'a', fromEntityId: 'note', toEntityId: 'chat', type: 'mentions', confirmed: true},
        {id: 'b', fromEntityId: 'chat', toEntityId: 'project', type: 'project-member', confirmed: true},
        {id: 'c', fromEntityId: 'chat', toEntityId: 'guess', type: 'related', confirmed: false},
        {id: 'd', fromEntityId: 'chat', toEntityId: 'source', type: 'derived-from', confirmed: true}
    ];
    const result = api.views.objectConnections('chat', links);
    assert.deepEqual(result.mentionedIn.map(r => r.id), ['a']);
    assert.deepEqual(result.projects.map(r => r.id), ['b']);
    assert.deepEqual(result.sources.map(r => r.id), ['d']);
    assert.equal(result.related.length, 3);
});

test('extended objects and provenance survive the existing export/import pathway', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.importConversation, 'function');
    const conversation = await api.importConversation(chat);
    const memory = await api.createSourcedMemory(conversation.id, 'Memory', 'A decision');
    const exported = await api.backup.exportWorkspace();
    await api.db.transaction('rw', api.db.tables, () => Promise.all(api.db.tables.map(table => table.clear())));
    await api.backup.importWorkspace(exported);
    assert.equal((await api.db.entities.get(memory.id)).type, 'memory');
    assert.equal(await api.db.sourceRefs.count(), 3);
    assert.equal(await api.db.relationships.count(), 3);
});

test('project canvas stores references only and is idempotent while graph needs no placements', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.openBrainCanvas, 'function');
    const project = await api.createBrainObject({type: 'project', title: 'Workspace'});
    const chatObject = await api.importConversation(chat);
    await api.linkBrainObjects(chatObject.id, project.id, 'project-member');
    const boardId = await api.openBrainCanvas(project.id);
    assert.equal(await api.openBrainCanvas(project.id), boardId);
    const placements = await api.db.placements.toArray();
    assert.deepEqual(new Set(placements.map(p => p.entityId)), new Set([project.id, chatObject.id]));
    assert.equal(await api.db.entities.count(), 4);
    assert.equal(placements[0].title, undefined);
    assert.equal(placements[0].body, undefined);
    const graph = api.views.graphProjection(await api.db.entities.toArray(), await api.db.relationships.toArray());
    assert.equal(graph.placements.length, 4);
    assert.equal(graph.relationships.length, 3);
});

test('shared collection query retains IDs and filters confirmed project members across modes', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.views.queryBrain, 'function');
    const entities = [{id: 'a', title: 'Alpha', type: 'note', tags: ['work'], updatedAt: 1},
        {id: 'b', title: 'Beta', type: 'idea', updatedAt: 2}];
    const links = [{fromEntityId: 'a', toEntityId: 'p', type: 'project-member', confirmed: true},
        {fromEntityId: 'b', toEntityId: 'p', type: 'project-member', confirmed: false}];
    assert.deepEqual(api.views.queryBrain(entities, links, [], {projectId: 'p', query: 'work'}), [entities[0]]);
    assert.deepEqual(api.views.queryBrain(entities, links, [], {sort: 'updated'}).map(e => e.id), ['b', 'a']);
    assert.deepEqual(api.views.queryBrain(entities, links, [], {type: 'idea'}), [entities[1]]);
});

test('Brain workspace renders view and import controls without a full-library snapshot', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.ui.BrainWorkspace, 'function');
    const React = require('react');
    const {renderToStaticMarkup} = require('react-dom/server');
    const entity = await api.createBrainObject({type: 'project', title: 'Canonical project'});
    const html = renderToStaticMarkup(React.createElement(api.ui.BrainWorkspace, {
        snapshot: {entities: [entity], relationships: [], tasks: [], activities: []},
        onSelect() {}, onRefresh: async () => {}, onStatus() {}, onCanvas: async () => {}
    }));
    for (const expected of ['Searching', 'Table', 'Tiles', 'Kanban', 'Timeline', 'AI Inbox', 'Create an object or import a conversation']) {
        assert.ok(html.includes(expected), expected + ' is rendered');
    }
    assert.ok(!html.includes('data-entity-id="' + entity.id + '"'));
});

test('object tools render navigable backlinks and separate unconfirmed suggestions', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.objectUi.BrainObjectTools, 'function');
    const React = require('react');
    const {renderToStaticMarkup} = require('react-dom/server');
    const entity = await api.createBrainObject({type: 'note', title: 'Target'});
    const source = await api.createBrainObject({type: 'note', title: 'Evidence'});
    await api.linkBrainObjects(source.id, entity.id, 'mentions');
    const html = renderToStaticMarkup(React.createElement(api.objectUi.BrainObjectTools, {
        entity, entities: [entity, source], relationships: await api.db.relationships.toArray(),
        onSelect() {}, onCanvas: async () => {}, onGraph() {}, onAI() {}, onBrain() {},
        onRefresh: async () => {}, onStatus() {}
    }));
    for (const text of ['Links to', 'Linked from', 'Mentioned in', 'Projects', 'Evidence', 'Open in Canvas', 'Save sourced memory']) {
        assert.ok(html.includes(text), text + ' is rendered');
    }
});

test('object edit rolls back content and backlinks when activity persistence fails', async t => {
    const api = await fixture(t);
    const note = await api.createBrainObject({type: 'note', title: 'Before'});
    const target = await api.createBrainObject({type: 'project', title: 'Project'});
    api.db.activities.hook('creating', () => { throw new Error('Storage full'); });
    await assert.rejects(api.backup.updateEntity(note.id, {title: 'After', metadata: {body: '[[' + target.id + ']]'}}), /Storage full/);
    assert.equal((await api.db.entities.get(note.id)).title, 'Before');
    assert.equal(await api.db.relationships.count(), 0);
});

test('malformed saved view and tile imports fail before modifying the workspace', async t => {
    const api = await fixture(t);
    const exported = await api.backup.exportWorkspace();
    exported.tables.settings = [{key: 'brain-view:bad', value: {name: 'Bad', query: {query: 44}, mode: 'Tiles'}, updatedAt: 1}];
    await assert.rejects(api.backup.importWorkspace(exported), /view/i);
    await api.db.settings.put({key: 'brain-tiles:all', value: {note: {width: 99, order: 0}}, updatedAt: 1});
    await assert.rejects(api.loadTileLayout('all'), /tile/i);
    assert.equal(await api.db.entities.count(), 0);
});

test('forgotten excluded private and expired memories cannot leak through context selection', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.setMemoryPolicy, 'function');
    const source = await api.importConversation(chat);
    const memory = await api.createSourcedMemory(source.id, 'Secret decision', 'PRIVATE-CONTENT');
    await api.setMemoryPolicy(memory.id, {excludedFromAI: true});
    assert.ok(!api.views.brainContext(source.id, await api.db.entities.toArray(), await api.db.relationships.toArray()).includes('PRIVATE-CONTENT'));
    assert.equal(api.views.brainContext(memory.id, await api.db.entities.toArray(), await api.db.relationships.toArray()), '');
    await api.setMemoryPolicy(memory.id, {excludedFromAI: false, scope: 'private'});
    assert.ok(!api.views.brainContext(source.id, await api.db.entities.toArray(), await api.db.relationships.toArray()).includes('PRIVATE-CONTENT'));
    await api.setMemoryPolicy(memory.id, {scope: 'project', reviewBy: 1});
    assert.ok(!api.views.brainContext(source.id, await api.db.entities.toArray(), await api.db.relationships.toArray()).includes('PRIVATE-CONTENT'));
    await api.setMemoryPolicy(memory.id, {reviewBy: undefined, status: 'forgotten'});
    assert.equal(api.views.brainContext(memory.id, await api.db.entities.toArray(), await api.db.relationships.toArray()), '');
    assert.equal((await api.db.entities.get(memory.id)).memory.status, 'forgotten');
});

test('ranked context preserves complete items and reports exclusions and recall reasons', async t => {
    const api = await fixture(t);
    assert.equal(typeof api.views.buildBrainContext, 'function');
    const source = await api.importConversation(chat);
    const memory = await api.createSourcedMemory(source.id, 'Decision', 'COMPLETE MEMORY');
    const result = api.views.buildBrainContext(source.id, await api.db.entities.toArray(), await api.db.relationships.toArray(), {maxCharacters: 320});
    assert.ok(result.text.length <= 320);
    assert.equal(result.included[0].id, source.id);
    assert.ok(result.included.every(item => item.reason && item.sourceIds));
    assert.ok(result.excluded.some(item => item.reason === 'Context budget'));
    assert.ok(!result.text.includes('COMPLETE') || result.text.includes('COMPLETE MEMORY'));
    const full = api.views.buildBrainContext(source.id, await api.db.entities.toArray(), await api.db.relationships.toArray());
    assert.ok(full.included.find(item => item.id === memory.id).sourceIds.includes(source.id));
});

test('provider source metadata and explicit take-source policy preserve original timestamps and branches', async t => {
    const api = await fixture(t);
    const input = {...chat, createdAt: 1000, updatedAt: 2000, messages: [
        {...chat.messages[0], createdAt: 1100}, {...chat.messages[1], createdAt: 1200, parentId: 'm1',
            attachments: [{id: 'file1', name: 'notes.txt', mimeType: 'text/plain'}]}]};
    const original = await api.importConversation(input);
    assert.equal(original.source.createdAt, 1000);
    const message = await api.db.entities.get('message:chatgpt:chat-1:m2');
    assert.equal(message.source.createdAt, 1200);
    assert.equal(message.metadata.parentMessageId, 'm1');
    assert.equal(message.metadata.attachments[0].name, 'notes.txt');
    await api.backup.updateEntity(original.id, {title: 'Local title'});
    await api.importConversation({...input, title: 'Remote title'}, {conflictPolicy: 'take-source'});
    assert.equal((await api.db.entities.get(original.id)).title, 'Remote title');
});
