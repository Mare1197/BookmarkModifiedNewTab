const {expect, test} = require('./fixtures');

test('initialization failure is visible and can be retried without reloading', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';
        const add = IDBObjectStore.prototype.add;
        window.failWorkspaceInit = true;
        IDBObjectStore.prototype.add = function (...args) {
            if (this.name === 'boards' && window.failWorkspaceInit) throw new Error('Injected workspace initialization failure');
            return add.apply(this, args);
        };
    });
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.getByRole('alert').filter({hasText: 'Injected workspace initialization failure'})).toBeVisible();
    await page.evaluate(() => {window.failWorkspaceInit = false;});
    await page.getByRole('button', {name: 'Retry workspace', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toContainText('Research Board');
    await expect(page.getByRole('treeitem', {name: /Start collecting ideas/})).toBeVisible();
});
