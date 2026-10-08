const {expect, test} = require('./fixtures');
const {makeLargeLibraryFixture, seedLargeLibrary} = require('../helpers/largeLibraryFixture');
test('bundled MV3 worker answers scoped search requests and survives a terminated worker', async ({context, extensionId}) => {
    test.setTimeout(60000);
    const page = await context.newPage(), errors = [], workers = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('worker', worker => workers.push(worker));
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toBeVisible(); await page.reload();
    await seedLargeLibrary(page, makeLargeLibraryFixture(123, 'small-board')); workers.length = 0; await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toContainText('Performance board');
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    const brain = page.getByRole('region', {name: 'Unified Brain', exact: true});
    await brain.getByLabel('Find objects', {exact: true}).fill('000122');
    await expect(brain.locator('tbody tr')).toHaveCount(1);
    expect(workers.some(worker => /searchWorker/.test(worker.url()))).toBe(true);
    const searchWorker = workers.find(worker => /searchWorker/.test(worker.url()));
    expect(searchWorker.url()).toMatch(/^chrome-extension:\/\//);
    const closed = new Promise(resolve => searchWorker.once('close', resolve));
    await searchWorker.evaluate(() => globalThis.close()).catch(error => {
        if (!/Target page, context or browser has been closed/.test(error.message)) throw error;
    });
    await closed; expect(page.isClosed()).toBe(false);
    await brain.getByLabel('Find objects', {exact: true}).fill('000099');
    // Silent worker exit has no standard Worker error event; wait for the
    // bounded 15-second request watchdog and exact scanner fallback.
    await expect(brain.locator('tbody tr')).toHaveCount(1, {timeout: 20000});
    await expect(brain.getByRole('button', {name: 'Performance object 000099', exact: true})).toBeVisible({timeout: 20000});
    expect(errors).toEqual([]);
});
