function content(text = 'Before') {
    return {kind: 'entity', entityId: 'n', title: 'Note', content: {version: 1,
        blocks: [{id: 'b', kind: 'paragraph', runs: [{insert: text}]}]}};
}
function draft(sessionId = 's', text = 'After') {
    const record = {id: 'draft-' + sessionId, version: 1, sessionId, targetKey: '["entity","n"]', target: {kind: 'entity', id: 'n'},
        generation: 1, appliedThrough: 0, base: content(), baseVersion: {kind: 'entity', revision: 0},
        operations: [{id: 'op-' + sessionId, sequence: 1, kind: 'entity', snapshot: content(text)}],
        updatedAt: 1, leaseUntil: 0};
    return sized(record);
}
function sized(record) {return {...record, payloadBytes: Buffer.byteLength(JSON.stringify({base: record.base, operations: record.operations}), 'utf8')};}
module.exports = {content, draft, sized};
