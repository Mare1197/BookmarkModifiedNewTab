const os = require('node:os');
const path = require('node:path');
const {expect, test} = require('./fixtures');

test('recovery comparison and guarded page history are reachable without leaving the editor', async ({context, extensionId}) => {
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
    await page.setViewportSize({width: 1440, height: 960});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await expect(page.locator('page-editor')).toBeVisible();
    await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, tx = db.transaction(['entities', 'workspaceDrafts'], 'readwrite');
            const get = tx.objectStore('entities').getAll();
            get.onsuccess = () => {
                const note = get.result.find(e => e.type === 'note');
                const base = {kind: 'entity', entityId: note.id, title: note.title,
                    content: note.richContent || {version: 1, blocks: [{id: 'paragraph:legacy', kind: 'paragraph', runs: [{insert: note.metadata.body || ''}]}]}};
                const snapshot = {...base, title: 'Recovered title', content: {version: 1, blocks: [{id: 'paragraph:legacy', kind: 'paragraph', runs: [{insert: 'Recovered private draft', attributes: {bold: true}}]}]}};
                const operations = [{id: 'test-op', sequence: 1, kind: 'entity', snapshot}];
                tx.objectStore('workspaceDrafts').put({id: 'test-draft', version: 1, sessionId: 'closed-test-session', target: {kind: 'entity', id: note.id},
                    targetKey: JSON.stringify(['entity', note.id]), generation: 1, appliedThrough: 0, base, baseVersion: {kind: 'entity', revision: note.contentRevision || 0},
                    operations, updatedAt: Date.now(), leaseUntil: 0, payloadBytes: new TextEncoder().encode(JSON.stringify({base, operations})).length});
            };
            tx.oncomplete = () => {db.close(); resolve();}; tx.onerror = () => reject(tx.error);
        };
    }));
    await page.getByRole('button', {name: 'Recovery', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Workspace recovery'})).toBeVisible();
    await page.getByRole('button', {name: 'Preview draft', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Current saved', exact: true})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Your draft', exact: true})).toBeVisible();
    await page.screenshot({path: path.join(os.tmpdir(), 'workspace-recovery-comparison.png')});
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: path.join(os.tmpdir(), 'workspace-recovery-narrow.png')});
    await page.getByRole('button', {name: 'Use draft', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Workspace recovery'})).toContainText('No unresolved drafts');
    await page.getByRole('button', {name: 'Close recovery', exact: true}).click();
    await page.setViewportSize({width: 1440, height: 960});
    await page.getByRole('button', {name: 'Page history', exact: true}).click();
    await page.getByRole('button', {name: 'Preview revision', exact: true}).first().click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: 'Restore revision', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Version history'})).toContainText('Restored');
    await page.getByRole('button', {name: 'Close recovery', exact: true}).press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(errors).toEqual([]); expect(requests).toEqual([]);
});
