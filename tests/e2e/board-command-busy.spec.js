const {expect, test} = require('./fixtures');

test('board commands wait for the newly created board to become the active target', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    const explorer = page.getByRole('complementary', {name: 'Workspace Explorer'});
    const navigation = page.getByRole('navigation', {name: 'Boards', exact: true});
    await expect(page.locator('.workspaceTitlebar')).toContainText('Research Board');
    await page.evaluate(() => new Promise((resolve, reject) => {
        window.holdBoardCommit = true; window.boardCommitHeld = false;
        // An independently owned write transaction really blocks the command's
        // writer. Dexie's implicit add transaction may call commit explicitly.
        const open = indexedDB.open('browserOsWorkspace'); open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result, tx = db.transaction('boards', 'readwrite'), store = tx.objectStore('boards');
            const read = store.openCursor();
            read.onsuccess = () => {
                const key = read.result.key;
                const keepAlive = () => {const request = store.get(key); request.onsuccess = () => {if (window.holdBoardCommit) keepAlive();};};
                keepAlive(); window.boardCommitHeld = true; resolve();
            };
            tx.oncomplete = () => {window.boardCommitHeld = false; db.close();};
            tx.onabort = () => {db.close(); reject(tx.error);};
        };
    }));
    try {
        await explorer.getByRole('button', {name: '＋ New board', exact: true}).click();
        await expect.poll(() => page.evaluate(() => window.boardCommitHeld)).toBe(true);
        for (const name of ['＋ New board', 'Rename', 'Duplicate', 'Delete']) {
            await expect(explorer.getByRole('button', {name, exact: true})).toBeDisabled();
        }
        await expect(navigation.getByRole('button').first()).toBeDisabled();
    } finally {await page.evaluate(() => {window.holdBoardCommit = false;});}
    await expect(explorer.getByRole('button', {name: 'Duplicate', exact: true})).toBeEnabled();
    await expect(navigation.locator('[aria-current="page"]')).toHaveText('▣Untitled board');
    await explorer.getByRole('button', {name: 'Duplicate', exact: true}).click();
    await expect(navigation.locator('[aria-current="page"]')).toHaveText('▣Untitled board copy');
    page.once('dialog', dialog => dialog.accept());
    await explorer.getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(navigation.getByRole('button')).toHaveCount(2);
    await expect(navigation.getByRole('button', {name: '▣ Research Board', exact: true})).toHaveCount(1);
    await expect(navigation.getByRole('button', {name: '▣ Untitled board', exact: true})).toHaveCount(1);
    await expect(navigation.getByRole('button', {name: '▣ Untitled board copy', exact: true})).toHaveCount(0);
});
