const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {expect, test} = require('@playwright/test');
const {launchRestartableExtension} = require('./helpers/restartableExtension');

async function open(runtime, editor = true) {
    const page = await runtime.context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${runtime.extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    if (editor) {
        await page.getByRole('button', {name: 'Workspace', exact: true}).click();
        await expect(page.locator('workspace-reference-block').first()).toBeVisible();
    }
    return page;
}
async function records(page, name) {
    return page.evaluate(table => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {const db = request.result, tx = db.transaction(table), get = tx.objectStore(table).getAll();
            get.onsuccess = () => resolve(get.result); tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error);};
    }), name);
}
async function ownedProfile() {return fs.mkdtemp(path.join(os.tmpdir(), 'browser-os-restart-'));}
async function removeProfile(profile) {
    const absolute = path.resolve(profile), parent = path.resolve(os.tmpdir());
    if (path.dirname(absolute) !== parent || !path.basename(absolute).startsWith('browser-os-restart-')) throw new Error('Unexpected test profile path');
    await fs.rm(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
}
for (const kind of ['entity', 'page']) test(`acknowledged ${kind} draft survives renderer crash and profile restart`, async () => {
    test.setTimeout(180000);
    const profile = await ownedProfile(); let runtime;
    try {
        runtime = await launchRestartableExtension(profile);
        console.log(kind + ': isolated browser launched');
        const page = await open(runtime), ws = page.getByRole('region', {name: 'AFFiNE workspace'});
        const errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => {if (/^https?:/.test(r.url())) requests.push(r.url());});
        let placement;
        if (kind === 'page') {
            await ws.getByRole('button', {name: 'Canvas', exact: true}).click();
            await ws.getByRole('button', {name: 'Fit cards', exact: true}).click();
            await expect(ws.getByRole('status').first()).toHaveText('saved');
            placement = (await records(page, 'placements'))[0];
        }
        // Test-only storage failure: journal writes still reach IndexedDB; canonical writes fail.
        // This does not modify production code or any other browser profile.
        await page.evaluate(() => {
            const original = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) {
                if (['entities', 'placements'].includes(this.name)) throw new DOMException('Injected canonical storage failure', 'QuotaExceededError');
                return original.apply(this, args);
            };
        });
        if (kind === 'entity') await page.locator('workspace-reference-block rich-text [contenteditable="true"]').first().fill('Durable crash recovery text');
        else {
            const handle = ws.locator('.brainReferenceHandle').first(); await handle.hover(); const box = await handle.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, {steps: 12}); await page.mouse.up();
        }
        await expect.poll(async () => (await records(page, 'workspaceDrafts')).filter(r => r.target.kind === kind &&
            r.operations.some(op => kind === 'entity' || op.command?.type === 'move-resize' && op.command.placements.some(p => p.id === placement.id && p.x !== placement.x))).length).toBe(1);
        const draft = (await records(page, 'workspaceDrafts')).find(r => r.target.kind === kind && r.operations.length);
        console.log(kind + ': local journal acknowledged');
        expect(draft.generation).toBeGreaterThan(draft.appliedThrough);
        await runtime.crashPage(page); console.log(kind + ': renderer crashed'); await runtime.context.close();
        console.log(kind + ': crashed browser closed');
        runtime = await launchRestartableExtension(profile);
        const reopened = await open(runtime, false);
        console.log(kind + ': same profile reopened');
        reopened.on('pageerror', e => errors.push(e.message));
        reopened.on('request', r => {if (/^https?:/.test(r.url())) requests.push(r.url());});
        expect((await records(reopened, 'workspaceDrafts')).find(r => r.id === draft.id)).toBeTruthy();
        await reopened.getByRole('button', {name: 'Recovery', exact: true}).click();
        await reopened.getByRole('button', {name: 'Preview draft', exact: true}).first().click();
        reopened.on('dialog', d => d.accept());
        await reopened.getByRole('button', {name: 'Use draft', exact: true}).click();
        await expect(reopened.getByRole('region', {name: 'Workspace recovery'})).toContainText('No unresolved drafts');
        if (kind === 'entity') expect((await records(reopened, 'entities')).find(e => e.id === draft.target.id).metadata.body).toBe('Durable crash recovery text');
        else expect((await records(reopened, 'placements')).find(p => p.id === placement.id).x).not.toBe(placement.x);
        if (kind === 'page') {
            await reopened.getByRole('button', {name: 'Close recovery', exact: true}).click();
            await reopened.getByRole('button', {name: 'Workspace', exact: true}).click();
            await expect(reopened.locator('workspace-reference-block').first()).toBeVisible();
            await reopened.getByRole('button', {name: 'Save now', exact: true}).click();
            await reopened.getByRole('button', {name: 'Page history', exact: true}).click();
            await reopened.getByRole('button', {name: 'Preview revision', exact: true}).last().click();
            await reopened.getByRole('button', {name: 'Restore revision', exact: true}).click();
            await expect(reopened.getByRole('region', {name: 'Version history'})).toContainText('Restored');
            expect((await records(reopened, 'placements')).find(p => p.id === placement.id).x).toBe(placement.x);
        }
        expect(errors).toEqual([]); expect(requests).toEqual([]);
    } finally {await runtime?.context.close(); await removeProfile(profile);}
});

test('acknowledged connector recovery is not replayed after crash and restart', async () => {
    test.setTimeout(180000);
    const profile = await ownedProfile(); let runtime;
    try {
        runtime = await launchRestartableExtension(profile);
        const page = await open(runtime);
        const ws = page.getByRole('region', {name: 'AFFiNE workspace'});
        await ws.getByLabel('New note title', {exact: true}).fill('Connection target');
        await ws.getByRole('button', {name: 'New note', exact: true}).click();
        await expect.poll(async () => (await records(page, 'placements')).length).toBe(2);
        // Feed one pending command through the real recovery/journal acknowledgement path.
        await page.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result, tx = db.transaction(['workspaceRevisions', 'workspaceDrafts'], 'readwrite');
                const get = tx.objectStore('workspaceRevisions').getAll();
                get.onsuccess = () => {
                    const revision = get.result.filter(r => r.target.kind === 'page').sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0];
                    const base = revision.snapshot;
                    const operations = [{id: 'connect-op', sequence: 1, kind: 'page', command: {type: 'connect',
                        fromPlacementId: base.placements[0].id, toPlacementId: base.placements[1].id, relationType: 'related'}}];
                    tx.objectStore('workspaceDrafts').put({id: 'connector-crash-draft', version: 1, sessionId: 'closed-connector-session',
                        target: revision.target, targetKey: revision.targetKey, generation: 1, appliedThrough: 0,
                        base, baseVersion: revision.canonicalVersion, operations, updatedAt: Date.now(), leaseUntil: 0,
                        payloadBytes: new TextEncoder().encode(JSON.stringify({base, operations})).length});
                };
                tx.oncomplete = () => {db.close(); resolve();}; tx.onerror = tx.onabort = () => reject(tx.error || new Error('Test fixture transaction aborted'));
            };
        }));
        await page.getByRole('button', {name: 'Recovery', exact: true}).click();
        await page.getByRole('button', {name: 'Preview draft', exact: true}).click();
        await page.getByRole('button', {name: 'Use draft', exact: true}).click();
        await expect(page.getByRole('region', {name: 'Workspace recovery'})).toContainText('No unresolved drafts');
        const before = await records(page, 'relationships'); expect(before.length).toBeGreaterThan(0);
        await runtime.crashPage(page); await runtime.context.close();
        runtime = await launchRestartableExtension(profile); const reopened = await open(runtime, false);
        expect(await records(reopened, 'relationships')).toEqual(before);
        await reopened.getByRole('button', {name: 'Recovery', exact: true}).click();
        await expect(reopened.getByRole('region', {name: 'Workspace recovery'})).toContainText('No unresolved drafts');
    } finally {await runtime?.context.close(); await removeProfile(profile);}
});
