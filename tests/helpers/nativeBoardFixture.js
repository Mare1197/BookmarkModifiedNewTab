// Deterministic synthetic content; never reads a user's library.
const png = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')];
function makeNativeBoardFixture(count, mode) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 5000 || !['document', 'canvas', 'mixed'].includes(mode)) {
        throw new Error('Invalid native fixture');
    }
    const time = 1700000000000, boardId = 'native:board', ownerId = 'native:owner';
    const entity = (id, type, title, metadata = {}) => ({id, type, title, createdAt: time, updatedAt: time,
        searchTerms: ['native', 'synthetic'], metadata: {sourceKind: 'user', ...metadata}});
    const data = {entities: [entity(ownerId, 'document', 'Native performance board', {workspacePage: true})],
        boards: [{id: boardId, name: 'Native performance board', createdAt: 0, updatedAt: time}],
        placements: [], relationships: [], tasks: [], assets: [], settings: []};
    const presentation = {version: 1, ownerEntityId: ownerId, revision: 0, mode,
        viewport: {x: 400, y: 200, zoom: 1}, groups: [{id: 'native:group', label: 'Research', collapsed: false},
            {id: 'native:subgroup', label: 'Nested research', parentId: 'native:group', collapsed: false}], connectors: []};
    for (let i = 0; i < count; i++) {
        const id = 'native:object:' + String(i).padStart(5, '0');
        const type = ['note', 'conversation', 'task', 'image', 'note'][i % 5];
        data.entities.push(entity(id, type, 'Native object ' + i, {body: 'Synthetic content '.repeat(20)}));
        data.placements.push({id: 'native:placement:' + i, boardId, entityId: id, kind: type, x: (i % 10) * 400,
            y: Math.floor(i / 10) * 300, width: 340, height: 220, zIndex: i, createdAt: time, updatedAt: time,
            metadata: {page: {order: i, collapsed: false, color: 'default', ...(i < 5 ? {groupId: 'native:subgroup'} : {})}}});
        if (type === 'conversation') for (let j = 0; j < 3; j++) {
            const messageId = id + ':message:' + j;
            data.entities.push({...entity(messageId, 'message', 'Synthetic message ' + j, {body: `Message ${j} for ${i}`}), properties: {sequence: j}});
            data.relationships.push({id: messageId + ':link', fromEntityId: messageId, toEntityId: id, type: 'message-of',
                confirmed: true, origin: 'user', createdAt: time, updatedAt: time});
        }
        if (type === 'task') data.tasks.push({id: id + ':task', entityId: id, status: 'next', dependencyIds: [], createdAt: time, updatedAt: time});
        if (type === 'image') data.assets.push({id: id + ':asset', entityId: id, type: 'image', name: 'synthetic.png',
            mimeType: 'image/png', size: png.length, bytes: [...png], createdAt: time, updatedAt: time});
    }
    for (let i = 0; i + 1 < count; i += 10) {
        const relationshipId = 'native:relation:' + i;
        data.relationships.push({id: relationshipId, fromEntityId: data.placements[i].entityId, toEntityId: data.placements[i + 1].entityId,
            type: 'related', confirmed: true, origin: 'user', createdAt: time, updatedAt: time});
        presentation.connectors.push({id: 'native:connector:' + i, relationshipId, fromPlacementId: data.placements[i].id,
            toPlacementId: data.placements[i + 1].id, points: [], color: '#4477aa', dashed: false, mode: 'orthogonal'});
    }
    data.settings.push({key: 'workspace-page:' + boardId, value: presentation, updatedAt: time});
    return {boardId, data};
}
async function seedNativeBoardFixture(page, fixture) {
    const {seedLargeLibrary} = require('./largeLibraryFixture');
    const {assets, ...tables} = fixture.data;
    await seedLargeLibrary(page, tables);
    await page.evaluate(records => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {const db = request.result, tx = db.transaction('assets', 'readwrite');
            for (const {bytes, ...asset} of records) tx.objectStore('assets').put({...asset, blob: new Blob([new Uint8Array(bytes)], {type: asset.mimeType})});
            tx.oncomplete = () => {db.close(); resolve();}; tx.onabort = () => {db.close(); reject(tx.error);};};
    }), assets);
}
module.exports = {makeNativeBoardFixture, seedNativeBoardFixture};
