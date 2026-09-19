const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadAdapter() {
    const filename = path.resolve(__dirname, '../src/react/workspace/chatExportAdapters.ts');
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
    }).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(require, exports);
    return exports;
}

test('ChatGPT mapping import preserves branches, timestamps, and attachment references', () => {
    const {parseChatExport} = loadAdapter();
    const parsed = parseChatExport([{
        id: 'chat-1',
        title: 'Branching research',
        create_time: 1720000000,
        update_time: 1720000030,
        mapping: {
            root: {id: 'root', parent: null, children: ['node-user'], message: null},
            'node-user': {id: 'node-user', parent: 'root', children: ['node-answer-a', 'node-answer-b'], message: {
                id: 'message-user', author: {role: 'user'}, create_time: 1720000001,
                content: {content_type: 'multimodal_text', parts: ['Compare these exports']},
                metadata: {attachments: [{id: 'file-1', name: 'notes.txt', mime_type: 'text/plain',
                    url: 'https://files.example/notes.txt'}]}
            }},
            'node-answer-a': {id: 'node-answer-a', parent: 'node-user', children: [], message: {
                id: 'message-a', author: {role: 'assistant'}, create_time: 1720000002,
                content: {content_type: 'text', parts: ['First branch']}, metadata: {}
            }},
            'node-answer-b': {id: 'node-answer-b', parent: 'node-user', children: [], message: {
                id: 'message-b', author: {role: 'assistant'}, create_time: 1720000003,
                content: {content_type: 'text', parts: ['Second branch']}, metadata: {}
            }}
        }
    }]);

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].provider, 'chatgpt');
    assert.equal(parsed[0].sourceId, 'chat-1');
    assert.equal(parsed[0].createdAt, 1720000000000);
    assert.equal(parsed[0].updatedAt, 1720000030000);
    assert.deepEqual(parsed[0].messages.map(message => ({id: message.id, parentId: message.parentId})), [
        {id: 'message-user', parentId: undefined},
        {id: 'message-a', parentId: 'message-user'},
        {id: 'message-b', parentId: 'message-user'}
    ]);
    assert.deepEqual(parsed[0].messages[0].attachments, [{
        id: 'file-1', name: 'notes.txt', mimeType: 'text/plain', url: 'https://files.example/notes.txt'
    }]);
});

test('Claude export import converts ISO dates and fixture-supported message fields', () => {
    const {parseChatExport} = loadAdapter();
    const parsed = parseChatExport([{
        uuid: 'claude-chat-1',
        name: 'Claude notes',
        created_at: '2025-01-02T03:04:05.000Z',
        updated_at: '2025-01-02T03:05:05.000Z',
        chat_messages: [{
            uuid: 'claude-message-1',
            sender: 'human',
            text: 'Review the document',
            created_at: '2025-01-02T03:04:06.000Z',
            attachments: [{id: 'attachment-1', file_name: 'brief.pdf', file_type: 'application/pdf'}]
        }, {
            uuid: 'claude-message-2',
            sender: 'assistant',
            text: 'Ready',
            parent_message_uuid: 'claude-message-1'
        }]
    }]);

    assert.deepEqual(parsed, [{
        provider: 'claude',
        sourceId: 'claude-chat-1',
        title: 'Claude notes',
        createdAt: Date.parse('2025-01-02T03:04:05.000Z'),
        updatedAt: Date.parse('2025-01-02T03:05:05.000Z'),
        messages: [{
            id: 'claude-message-1', role: 'user', text: 'Review the document',
            createdAt: Date.parse('2025-01-02T03:04:06.000Z'),
            attachments: [{id: 'attachment-1', name: 'brief.pdf', mimeType: 'application/pdf'}]
        }, {
            id: 'claude-message-2', role: 'assistant', text: 'Ready', parentId: 'claude-message-1'
        }]
    }]);
});

test('normalized input preserves absent timestamps instead of inventing them', () => {
    const {parseChatExport} = loadAdapter();
    const parsed = parseChatExport({
        provider: 'other-local', sourceId: 'source-1', title: 'Normalized',
        url: 'https://example.test/conversation/source-1',
        messages: [{id: 'message-1', role: 'user', text: 'Hello'}]
    });

    assert.deepEqual(parsed, [{
        provider: 'other-local', sourceId: 'source-1', title: 'Normalized',
        url: 'https://example.test/conversation/source-1',
        messages: [{id: 'message-1', role: 'user', text: 'Hello'}]
    }]);
    assert.equal(Object.hasOwn(parsed[0], 'createdAt'), false);
    assert.equal(Object.hasOwn(parsed[0].messages[0], 'createdAt'), false);
});

test('unsupported ChatGPT content is omitted with a clear warning', () => {
    const {parseChatExport} = loadAdapter();
    const parsed = parseChatExport([{
        id: 'chat-audio', title: 'Audio export', mapping: {
            root: {id: 'root', parent: null, children: ['audio'], message: null},
            audio: {id: 'audio', parent: 'root', children: [], message: {
                id: 'message-audio', author: {role: 'assistant'},
                content: {content_type: 'audio_transcription', parts: [{audio_asset_pointer: 'asset-1'}]}
            }}
        }
    }]);

    assert.equal(parsed[0].messages[0].text, '');
    assert.match(parsed[0].warnings.join(' '), /unsupported.*message-audio/i);
});

test('malformed roots, missing IDs, duplicate IDs, and unsafe URLs are rejected', () => {
    const {parseChatExport} = loadAdapter();
    assert.throws(() => parseChatExport({conversations: 'not-an-array'}), /root/i);
    assert.throws(() => parseChatExport([{title: 'Missing ID', mapping: {}}]), /source ID/i);
    assert.throws(() => parseChatExport([{
        id: 'duplicate-messages', title: 'Bad', mapping: {
            one: {id: 'one', parent: null, children: [], message: {
                id: 'same', author: {role: 'user'}, content: {parts: ['One']}
            }},
            two: {id: 'two', parent: null, children: [], message: {
                id: 'same', author: {role: 'assistant'}, content: {parts: ['Two']}
            }}
        }
    }]), /duplicate message ID/i);
    assert.throws(() => parseChatExport([{
        provider: 'normalized', sourceId: 'unsafe', title: 'Unsafe', url: 'javascript:alert(1)', messages: []
    }]), /URL/i);
    assert.throws(() => parseChatExport([
        {provider: 'normalized', sourceId: 'same', title: 'One', messages: []},
        {provider: 'NORMALIZED', sourceId: 'same', title: 'Two', messages: []}
    ]), /duplicate conversation source/i);
});

test('ChatGPT mappings reject dangling parents and cycles as malformed roots', () => {
    const {parseChatExport} = loadAdapter();
    assert.throws(() => parseChatExport([{
        id: 'dangling', title: 'Dangling', mapping: {
            one: {id: 'one', parent: 'missing', children: [], message: {
                id: 'message-1', author: {role: 'user'}, content: {parts: ['Hello']}
            }}
        }
    }]), /parent|root/i);
    assert.throws(() => parseChatExport([{
        id: 'cycle', title: 'Cycle', mapping: {
            one: {id: 'one', parent: 'two', children: ['two'], message: {
                id: 'message-1', author: {role: 'user'}, content: {parts: ['Hello']}
            }},
            two: {id: 'two', parent: 'one', children: ['one'], message: {
                id: 'message-2', author: {role: 'assistant'}, content: {parts: ['Hi']}
            }}
        }
    }]), /cycle|root/i);
});
