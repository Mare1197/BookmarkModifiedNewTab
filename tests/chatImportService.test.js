require('fake-indexeddb/auto');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const {createWorkspaceDatabase} = require('../src/workspace/workspaceDb');

function loadService(db, importer) {
    const filename = path.resolve(__dirname, '../src/react/workspace/chatImportService.ts');
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
    }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(name => {
        if (name === './workspaceClient') return {workspaceClient: db};
        if (name === './brainRepository') return {importConversation: importer};
        throw new Error('Unexpected import: ' + name);
    }, exports);
    return exports;
}

const source = (provider, externalId, createdAt, updatedAt, url) => ({
    provider, externalId, ...(url ? {url} : {}), ...(createdAt ? {createdAt} : {}), ...(updatedAt ? {updatedAt} : {})
});

const entity = input => ({createdAt: 1, updatedAt: 1, searchTerms: [], ...input});

test('preview reports new, updated, unchanged, and local-conflict objects without mutating', async t => {
    const db = createWorkspaceDatabase('chat-preview-' + crypto.randomUUID());
    await db.open();
    t.after(() => db.delete());
    const imported = [];
    const service = loadService(db, async (...args) => imported.push(args));
    await db.entities.bulkAdd([
        entity({id: 'conversation:chatgpt:same', type: 'conversation', title: 'Same',
            canonicalUrl: 'https://example.test/c/same',
            source: source('chatgpt', 'same', 1000, 2000, 'https://example.test/c/same')}),
        entity({id: 'message:chatgpt:same:m1', type: 'message', title: 'user: Hello',
            source: source('chatgpt', 'm1', 1100, 1200, 'https://example.test/c/same'),
            properties: {role: 'user', sequence: 0},
            metadata: {body: 'Hello', parentMessageId: undefined, attachments: [{id: 'a1', name: 'one.txt'}]}}),
        entity({id: 'message:chatgpt:same:m-empty', type: 'message', title: 'assistant: No file',
            source: source('chatgpt', 'm-empty', 1300, 1400, 'https://example.test/c/same'),
            properties: {role: 'assistant', sequence: 1},
            metadata: {body: 'No file', parentMessageId: 'm1', attachments: []}}),
        entity({id: 'conversation:claude:changed', type: 'conversation', title: 'My local title',
            source: source('claude', 'changed', 3000, 3500), metadata: {workspaceEditedAt: 4000}}),
        entity({id: 'message:claude:changed:m2', type: 'message', title: 'assistant: My local answer',
            source: source('claude', 'm2', 3100, 3200), properties: {role: 'assistant', sequence: 0},
            metadata: {body: 'My local answer', workspaceEditedAt: 4000}})
    ]);
    const conversations = [{
        provider: 'chatgpt', sourceId: 'same', title: 'Same', url: 'https://example.test/c/same',
        createdAt: 1000, updatedAt: 2000,
        messages: [{id: 'm1', role: 'user', text: 'Hello', createdAt: 1100, updatedAt: 1200,
            attachments: [{id: 'a1', name: 'one.txt'}]},
        {id: 'm-empty', role: 'assistant', text: 'No file', createdAt: 1300, updatedAt: 1400, parentId: 'm1'}]
    }, {
        provider: 'claude', sourceId: 'changed', title: 'Changed upstream', createdAt: 3000, updatedAt: 3600,
        messages: [{id: 'm2', role: 'assistant', text: 'Changed upstream answer', createdAt: 3100, updatedAt: 3300}]
    }, {
        provider: 'chatgpt', sourceId: 'new/id', title: 'New conversation',
        messages: [{id: 'new message', role: 'user', text: 'New'}], warnings: ['Fixture-only field was ignored.']
    }];
    const before = await db.entities.toArray();

    const preview = await service.previewConversationImport(conversations);

    assert.deepEqual({newCount: preview.newCount, updatedCount: preview.updatedCount,
        unchangedCount: preview.unchangedCount, conflictCount: preview.conflictCount},
    {newCount: 2, updatedCount: 2, unchangedCount: 3, conflictCount: 2});
    assert.deepEqual(preview.items.filter(item => item.conflict).map(item => item.id), [
        'conversation:claude:changed', 'message:claude:changed:m2'
    ]);
    assert.deepEqual(preview.warnings, ['chatgpt / new/id: Fixture-only field was ignored.']);
    assert.deepEqual(await db.entities.toArray(), before);
    assert.equal(imported.length, 0);
});

test('apply imports each prepared conversation with the explicit conflict policy', async t => {
    const db = createWorkspaceDatabase('chat-apply-' + crypto.randomUUID());
    await db.open();
    t.after(() => db.delete());
    const calls = [];
    const service = loadService(db, async (...args) => calls.push(args));
    const conversations = [
        {provider: 'chatgpt', sourceId: 'one', title: 'One', messages: []},
        {provider: 'claude', sourceId: 'two', title: 'Two', messages: []}
    ];

    const result = await service.applyConversationImport(conversations, 'take-source');

    assert.deepEqual(result, {imported: 2, conflictPolicy: 'take-source'});
    assert.deepEqual(calls, conversations.map(conversation => [conversation, {conflictPolicy: 'take-source'}]));
});

test('apply defaults to preserving local changes and rejects invalid policies', async t => {
    const db = createWorkspaceDatabase('chat-default-' + crypto.randomUUID());
    await db.open();
    t.after(() => db.delete());
    const calls = [];
    const service = loadService(db, async (...args) => calls.push(args));
    const conversation = {provider: 'chatgpt', sourceId: 'one', title: 'One', messages: []};

    await service.applyConversationImport([conversation]);

    assert.equal(calls[0][1].conflictPolicy, 'preserve-local');
    await assert.rejects(service.applyConversationImport([conversation], 'invalid'), /conflict policy/i);
});
