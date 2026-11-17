const {expect, test} = require('./fixtures');
const {makeNativeBoardFixture, seedNativeBoardFixture} = require('../helpers/nativeBoardFixture');

async function journalCounts(page) {
    return page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, names = ['workspaceDrafts', 'workspaceRevisions', 'activities'];
            const tx = db.transaction(names), counts = names.map(name => tx.objectStore(name).count());
            tx.oncomplete = () => {db.close(); resolve(counts.map(count => count.result));};
            tx.onabort = () => {db.close(); reject(tx.error);};
        };
    }));
}

for (const mode of ['document', 'canvas', 'mixed']) test(`preparing ${mode} can cancel and retry without late mounts or fake journals`, async ({context, extensionId}) => {
    test.setTimeout(90000);
    const page = await context.newPage();
    await page.addInitScript(() => {
        if (location.protocol !== 'chrome-extension:') return;
        localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';
    });
    const url = `chrome-extension://${extensionId}/newtab.html`;
    await page.goto(url);
    const open = () => page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await open(); await expect(page.locator('.workspaceTitlebar')).toBeVisible(); await page.reload();
    const fixture = makeNativeBoardFixture(1000, mode);
    await seedNativeBoardFixture(page, fixture);
    await page.reload(); await open();
    await page.getByRole('navigation', {name: 'Boards', exact: true}).getByRole('button').filter({hasText: 'Native performance board'}).click();
    await expect(page.locator('.workspaceTitlebar')).toContainText('Native performance board');
    const before = await journalCounts(page);
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    const ws = page.getByRole('region', {name: 'AFFiNE workspace'});
    await expect(ws.getByRole('status').first()).toContainText('Preparing workspace:');
    await expect(ws.getByRole('button', {name: 'Save now', exact: true})).toBeDisabled();
    await expect(ws.locator('.affineNativeHost')).toHaveAttribute('inert', '');
    const cancellationStart = await page.evaluate(() => performance.now());
    await ws.getByRole('button', {name: 'Cancel preparation', exact: true}).click();
    await expect(ws.getByRole('status').first()).toContainText('Preparation cancelled');
    await expect(ws.locator('page-editor,edgeless-editor')).toHaveCount(0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const confirmationMs = await page.evaluate(start => performance.now() - start, cancellationStart);
    console.log('NATIVE_CANCEL_RESULT ' + JSON.stringify({mode, referenceCount: 1000, confirmationMs,
        scope: 'Automation click through observed cancelled status, no editor panes and two animation frames; includes automation overhead.'}));
    expect(await journalCounts(page)).toEqual(before);
    // A separate canonical edit while cancelled leaves a smaller complete page.
    // Retry must read this fresh snapshot rather than reuse the abandoned 1000-card one.
    await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {const db = request.result, tx = db.transaction(['placements', 'settings'], 'readwrite');
            for (let i = 50; i < 1000; i++) tx.objectStore('placements').delete('native:placement:' + i);
            const store = tx.objectStore('settings'), get = store.get('workspace-page:native:board');
            get.onsuccess = () => {const row = get.result; row.value.connectors = row.value.connectors.slice(0, 5); row.value.revision++; store.put(row);};
            tx.oncomplete = () => {db.close(); resolve();}; tx.onabort = () => {db.close(); reject(tx.error);};
        };
    }));
    await ws.getByRole('button', {name: 'Retry preparation', exact: true}).click();
    await expect(ws.getByRole('status').first()).toHaveText('saved', {timeout: 30000});
    await expect(ws.getByRole('button', {name: 'Save now', exact: true})).toBeEnabled();
    const geometry = await ws.locator('page-editor,edgeless-editor').first().evaluate(editor =>
        editor.doc.getBlocks().filter(block => block.flavour === 'affine:embed-workspace-object').map(block =>
            ({id: block.placementId, xywh: JSON.parse(editor.doc.getParent(block).xywh)})));
    expect(geometry).toEqual(fixture.data.placements.slice(0, 50).map(p => ({id: p.id, xywh: [p.x, p.y, p.width, p.height]})));
    expect(await journalCounts(page)).toEqual(before);
});
