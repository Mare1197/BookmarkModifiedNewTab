// Synthetic data only. This module never opens a user's browser profile.
function makeLargeLibraryFixture(size, shape) {
    if (!Number.isSafeInteger(size) || size < 1 || size > 50000 ||
        !['small-board', 'large-board'].includes(shape)) throw new Error('Invalid performance fixture');
    const stamp = 1700000000000, boardSize = shape === 'small-board' ? Math.min(50, size) : size;
    const id = index => 'perf:object:' + String(index).padStart(6, '0');
    const types = ['note', 'bookmark', 'task', 'idea', 'conversation'];
    const data = {entities: [], boards: [{id: 'perf:board', name: 'Performance board', createdAt: 0, updatedAt: stamp},
        {id: 'perf:other', name: 'Unrelated board', createdAt: 1, updatedAt: stamp}],
    placements: [], relationships: [], folderMemberships: [], tasks: [],
    folders: [{id: 'perf:folder', title: 'Performance folder', sourceKind: 'workspace', createdAt: stamp, updatedAt: stamp}]};
    for (let i = 0; i < size; i++) {
        const entityId = id(i), type = types[i % types.length], updatedAt = stamp + Math.floor(i / 10);
        const title = (i % 17 === 0 ? 'Žltý výskum ' : 'Performance object ') + String(i).padStart(6, '0');
        data.entities.push({id: entityId, type, title, createdAt: stamp, updatedAt,
            canonicalUrl: 'https://example.invalid/research/' + i, searchTerms: ['performance', 'research', String(i)],
            tags: ['synthetic'], metadata: {body: 'Synthetic research content. '.padEnd(1024, 'x'), sourceKind: 'user'},
            ...(i % 7 === 0 ? {inboxAt: stamp} : {})});
        data.placements.push({id: 'perf:placement:' + i, boardId: i < boardSize ? 'perf:board' : 'perf:other',
            entityId, kind: type, x: (i % 10) * 310, y: Math.floor(i / 10) * 220, width: 280, height: 150,
            zIndex: 0, createdAt: stamp, updatedAt});
        data.relationships.push({id: 'perf:link:' + i, fromEntityId: entityId, toEntityId: id((i + 1) % size),
            type: 'related', confirmed: true, origin: 'user', createdAt: stamp, updatedAt});
        data.folderMemberships.push({id: 'perf:member:' + i, folderId: 'perf:folder', entityId,
            sourceKind: 'user', position: i, createdAt: stamp, updatedAt});
        if (type === 'task') data.tasks.push({id: 'perf:task:' + i, entityId, status: 'next',
            dependencyIds: [], createdAt: stamp, updatedAt});
    }
    return data;
}

async function seedLargeLibrary(page, fixture) {
    // Caller is the repository's temporary-profile Playwright fixture, never IAB.
    for (const [table, rows] of Object.entries(fixture)) {
        for (let offset = 0; offset < rows.length; offset += 500) {
            await page.evaluate(records => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, names = Object.keys(records);
            const tx = db.transaction(names, 'readwrite');
            tx.oncomplete = () => {db.close(); resolve();};
            tx.onabort = () => {db.close(); reject(tx.error || new Error('Fixture transaction aborted'));};
            for (const name of names) {
                const store = tx.objectStore(name);
                for (const record of records[name]) store.put(record);
            }
        };
            }), {[table]: rows.slice(offset, offset + 500)});
        }
    }
}

module.exports = {makeLargeLibraryFixture, seedLargeLibrary};
