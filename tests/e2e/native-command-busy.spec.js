const {expect, test} = require('./fixtures');

test('Fit cards cannot silently skip an active canonical workspace command', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    const workspace = page.getByRole('region', {name: 'AFFiNE workspace'});
    await expect(workspace.getByRole('status').first()).toHaveText('saved');
    // Hold the real command transaction open, without suppressing any writes.
    await page.evaluate(() => {
        window.holdNativeCommit = true; window.nativeCommitHeld = false;
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
            const result = original.apply(this, args);
            if (this.name === 'settings' && args[0]?.key?.startsWith('workspace-page:') && !window.nativeCommitHeld) {
                window.nativeCommitHeld = true;
                const store = this, key = args[0].key;
                const keepAlive = () => {const request = store.get(key); request.onsuccess = () => {if (window.holdNativeCommit) keepAlive();};};
                keepAlive();
            }
            return result;
        };
    });
    try {
        await workspace.getByRole('button', {name: 'Canvas', exact: true}).click();
        await expect.poll(() => page.evaluate(() => window.nativeCommitHeld)).toBe(true);
        await expect(workspace.getByRole('button', {name: 'Fit cards', exact: true})).toBeDisabled();
    } finally {await page.evaluate(() => {window.holdNativeCommit = false;});}
    await expect(workspace.getByRole('button', {name: 'Fit cards', exact: true})).toBeEnabled();
    await expect(workspace.locator('edgeless-editor')).toBeVisible();
});
