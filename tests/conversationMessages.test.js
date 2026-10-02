const assert = require('node:assert/strict');
const test = require('node:test');
const {workspaceFixture} = require('./helpers/workspaceFixture');

test('reimported conversations retain canonical messages and render the latest provider sequence', async t => {
    const {db, load} = await workspaceFixture(t), {importConversation} = load('brainRepository.ts');
    const input = {provider: 'chatgpt', sourceId: 'chat', title: 'Research'};
    const first = {id: 'a', role: 'user', text: 'First', createdAt: 300};
    const last = {id: 'c', role: 'assistant', text: 'Last', createdAt: 100};
    const conversation = await importConversation({...input, messages: [first, last]});
    const original = await db.entities.where('type').equals('message').toArray();
    await importConversation({...input, messages: [first, {id: 'b', role: 'user', text: 'Middle', createdAt: 200}, last]});
    const messages = await load('conversationMessages.ts').loadConversationMessages(conversation.id);
    assert.deepEqual(messages.map(message => message.metadata.body), ['First', 'Middle', 'Last']);
    for (const message of original) assert.equal(messages.find(next => next.id === message.id).createdAt, message.createdAt);
    assert.equal(await db.entities.where('type').equals('message').count(), 3);
});

test('mixed legacy messages have a deterministic total order and only confirmed message links are rendered', async t => {
    const {db, load} = await workspaceFixture(t);
    const rows = [
        {id: 'zero', properties: {sequence: 0}, createdAt: 999},
        {id: 'one-b', properties: {sequence: 1}, source: {createdAt: 3}},
        {id: 'one-a', properties: {sequence: 1}, source: {createdAt: 3}},
        {id: 'legacy-local', createdAt: 2},
        {id: 'legacy-source', source: {createdAt: 0}},
        ...['1', -1, 1.5, null].map((sequence, index) => ({id: 'invalid-' + index, properties: {sequence}, createdAt: 5 + index}))
    ].map(row => ({type: 'message', title: row.id, createdAt: 100, updatedAt: 100, ...row}));
    await db.entities.bulkPut([...rows, {id: 'not-message', type: 'note', createdAt: 0}, {id: 'unconfirmed', type: 'message', createdAt: 0}]);
    const links = [...rows.map(row => row.id), 'not-message', 'unconfirmed', 'missing'].map(id => ({
        id: 'link-' + id, type: 'message-of', fromEntityId: id, toEntityId: 'chat', confirmed: id !== 'unconfirmed'
    }));
    await db.relationships.bulkPut([...links, {...links[0], id: 'duplicate'}, {...links[0], id: 'other-chat', toEntityId: 'elsewhere'}]);
    const api = load('conversationMessages.ts');
    assert.deepEqual((await api.loadConversationMessages('chat')).map(row => row.id),
        ['zero', 'one-a', 'one-b', 'legacy-source', 'legacy-local', 'invalid-0', 'invalid-1', 'invalid-2', 'invalid-3']);
    assert.deepEqual(await api.loadConversationMessages('empty'), []);
});
