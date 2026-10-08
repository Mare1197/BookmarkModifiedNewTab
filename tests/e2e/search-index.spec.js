const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {expect, test} = require('./fixtures');
const {makeLargeLibraryFixture, seedLargeLibrary} = require('../helpers/largeLibraryFixture');
const {launchRestartableExtension} = require('./helpers/restartableExtension');
async function open(page, extensionId) {
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toBeVisible();
}
async function cache(page) {
    return page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, tx = db.transaction(['searchState', 'searchChanges'], 'readonly');
            const state = tx.objectStore('searchState').get('main'), pending = tx.objectStore('searchChanges').count();
            tx.oncomplete = () => {db.close(); resolve({...state.result, pending: pending.result});};
            tx.onabort = () => {db.close(); reject(tx.error);};
        };
    }));
}
async function ready(page) {
    await expect.poll(async () => {
        const state = await cache(page);
        return state.status === 'ready' && state.scanComplete && state.pending === 0 && state.generation === state.indexedGeneration;
    }, {timeout: 30000}).toBe(true);
}
test('index controls preserve exact search and cross-tab same-count edits', async ({context, extensionId}) => {
    test.setTimeout(120000);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); await open(page, extensionId); await page.reload();
    await seedLargeLibrary(page, makeLargeLibraryFixture(123, 'small-board')); await open(page, extensionId);
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    const search = page.getByRole('region', {name: 'Unified local search'}), panel = search.getByRole('complementary', {name: 'Local search indexing'});
    await ready(page); await expect(panel.getByRole('status')).toContainText('Ready');
    await panel.getByRole('button', {name: 'Pause', exact: true}).click(); await expect(panel.getByRole('status')).toContainText('Paused');
    await search.getByRole('textbox').fill('Cross tab needle');
    await expect(search.locator('.workspaceSearch__results')).toContainText('No local results');
    const peer = await context.newPage(); await open(peer, extensionId);
    await peer.getByRole('button', {name: 'Brain', exact: true}).click();
    const brain = peer.getByRole('region', {name: 'Unified Brain'});
    await brain.getByLabel('Find objects', {exact: true}).fill('000122');
    await brain.getByRole('button', {name: 'Performance object 000122', exact: true}).click();
    const inspector = peer.getByRole('complementary', {name: 'Inspector'});
    await inspector.getByLabel('Title', {exact: true}).fill('Cross tab needle');
    await inspector.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(search.locator('.workspaceSearch__results strong')).toHaveText('Cross tab needle');
    expect((await cache(page)).status).toBe('paused');
    await panel.getByRole('button', {name: 'Resume', exact: true}).click(); await ready(page);
    const prior = await cache(page); await panel.getByRole('button', {name: 'Rebuild', exact: true}).click();
    await ready(page); expect((await cache(page)).epoch).not.toBe(prior.epoch);
    await expect(search.locator('.workspaceSearch__results strong')).toHaveText('Cross tab needle');
    await page.screenshot({path: 'test-results/search-index-controls.png'});
    await page.setViewportSize({width: 390, height: 844});
    await panel.getByRole('button', {name: 'Retry', exact: true}).scrollIntoViewIfNeeded();
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({path: 'test-results/search-index-controls-mobile.png'});
    await page.setViewportSize({width: 1584, height: 1024});
    await page.getByRole('button', {name: 'Return to desktop', exact: true}).click();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    await search.getByRole('textbox').fill('Cross tab needle');
    await expect(search.locator('.workspaceSearch__results strong')).toHaveText('Cross tab needle');
    expect(errors).toEqual([]);
});
test('worker creation failure keeps search and an Inspector draft usable', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.addInitScript(() => {window.Worker = class {constructor() {throw new Error('Injected worker creation failure');}};});
    await open(page, extensionId); await page.getByRole('button', {name: 'Brain', exact: true}).click();
    const brain = page.getByRole('region', {name: 'Unified Brain'});
    await brain.getByRole('button', {name: 'Start collecting ideas', exact: true}).click();
    const inspector = page.getByRole('complementary', {name: 'Inspector'});
    await inspector.getByLabel('Title', {exact: true}).fill('Unsaved Inspector draft');
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    const search = page.getByRole('region', {name: 'Unified local search'});
    await search.getByRole('textbox').fill('Start collecting');
    await expect(search.locator('.workspaceSearch__results')).toContainText('Start collecting ideas');
    await expect(search.getByRole('alert')).toContainText('worker unavailable');
    await expect(inspector.getByLabel('Title', {exact: true})).toHaveValue('Unsaved Inspector draft');
});
test('paused partial cache survives a real profile restart and resumes catch-up', async () => {
    test.setTimeout(180000);
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-os-search-')); let runtime;
    try {
        runtime = await launchRestartableExtension(profile); let page = await runtime.context.newPage();
        await open(page, runtime.extensionId); await page.reload();
        await seedLargeLibrary(page, makeLargeLibraryFixture(1000, 'small-board')); await open(page, runtime.extensionId);
        await page.getByRole('button', {name: 'Search', exact: true}).click();
        let panel = page.getByRole('complementary', {name: 'Local search indexing'}); await ready(page);
        await panel.getByRole('button', {name: 'Rebuild', exact: true}).click();
        await panel.getByRole('button', {name: 'Pause', exact: true}).click();
        await expect(panel.getByRole('status')).toContainText('Paused');
        const paused = await cache(page); expect(paused.scanComplete).toBe(false);
        await runtime.context.close(); runtime = await launchRestartableExtension(profile); page = await runtime.context.newPage();
        await open(page, runtime.extensionId); await page.getByRole('button', {name: 'Search', exact: true}).click();
        panel = page.getByRole('complementary', {name: 'Local search indexing'});
        await expect(panel.getByRole('status')).toContainText('Paused'); expect((await cache(page)).epoch).toBe(paused.epoch);
        await page.getByRole('region', {name: 'Unified local search'}).getByRole('textbox').fill('000999');
        await expect(page.locator('.workspaceSearch__results strong')).toHaveText('Performance object 000999');
        await panel.getByRole('button', {name: 'Resume', exact: true}).click(); await ready(page);
        await expect(page.locator('.workspaceSearch__results strong')).toHaveText('Performance object 000999');
    } finally {
        await runtime?.context.close();
        const absolute = path.resolve(profile);
        if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('browser-os-search-')) throw new Error('Unexpected owned profile');
        await fs.rm(absolute, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
    }
});
