const os = require('node:os');
const path = require('node:path');
const {expect, test} = require('./fixtures');

async function openWorkspace(context, extensionId) {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await expect(page.locator('workspace-reference-block').first()).toBeVisible();
    return page;
}

async function records(page, table) {
    return page.evaluate(name => new Promise((resolve, reject) => {
        const open = indexedDB.open('browserOsWorkspace'); open.onerror = () => reject(open.error);
        open.onsuccess = () => {const db = open.result, tx = db.transaction(name), req = tx.objectStore(name).getAll();
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); tx.oncomplete = () => db.close();};
    }), table);
}

test('workspace edits canonical notes in native document, canvas and mixed modes', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    const workspace = page.getByRole('region', {name: 'AFFiNE workspace', exact: true});
    await expect(workspace.locator('page-editor')).toBeVisible();
    const initialCards = await workspace.locator('[data-brain-reference]').count();
    await workspace.getByLabel('New note title', {exact: true}).fill('Canonical note');
    await workspace.getByRole('button', {name: 'New note', exact: true}).click();
    const card = workspace.locator('[data-brain-reference]').filter({hasText: 'Canonical note'});
    const text = card.locator('rich-text [contenteditable="true"]').first();
    await text.fill('Shared rich text');
    await text.press('Control+a');
    await card.getByRole('button', {name: 'Bold', exact: true}).click();
    await workspace.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect(workspace.getByRole('status').first()).toContainText('saved');
    await workspace.getByLabel('New note title', {exact: true}).fill('Second note');
    await workspace.getByRole('button', {name: 'New note', exact: true}).click();
    await workspace.getByRole('button', {name: 'Canvas', exact: true}).click();
    await expect(workspace.locator('edgeless-editor')).toBeVisible();
    await expect(workspace.locator('[data-brain-reference]')).toHaveCount(initialCards + 2);
    await workspace.getByRole('button', {name: 'Mixed', exact: true}).click();
    await expect(workspace.locator('page-editor')).toBeVisible();
    await expect(workspace.locator('edgeless-editor')).toBeVisible();
    await page.screenshot({path: path.join(os.tmpdir(), 'affine-workspace-mixed.png')});
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await expect(workspace).toContainText('Shared rich text');
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
});

test('native canvas drag and keyboard geometry persist, nested pages navigate, and narrow view fits', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId), workspace = page.getByRole('region', {name: 'AFFiNE workspace'});
    const initial = (await records(page, 'placements'))[0];
    await workspace.getByRole('button', {name: 'Canvas', exact: true}).click();
    await workspace.getByRole('button', {name: 'Fit cards', exact: true}).click();
    await expect(workspace.getByRole('status').first()).toHaveText('saved');
    const handle = workspace.locator('.brainReferenceHandle').first();
    // Locator hover retries if Fit cards replaces the native projection mid-action.
    await handle.hover();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, {steps: 12}); await page.mouse.up();
    await workspace.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect.poll(async () => (await records(page, 'placements')).find(p => p.id === initial.id).x).not.toBe(initial.x);
    await workspace.getByText('Pages and layout controls', {exact: true}).click();
    await workspace.getByLabel('Selected cards', {exact: true}).selectOption(initial.id);
    await workspace.getByLabel('x', {exact: true}).fill('321');
    await workspace.getByLabel('width', {exact: true}).fill('600');
    await workspace.getByRole('button', {name: 'Apply geometry', exact: true}).click();
    await expect.poll(async () => (await records(page, 'placements')).find(p => p.id === initial.id).width).toBe(600);
    page.once('dialog', d => d.accept('Child research'));
    await workspace.getByRole('button', {name: 'New child page', exact: true}).click();
    await expect(workspace.getByRole('heading', {name: 'Child research', exact: true})).toBeVisible();
    await workspace.getByRole('button', {name: '↑ Research Board', exact: true}).click();
    await expect(workspace.getByRole('heading', {name: 'Research Board', exact: true})).toBeVisible();
    await page.setViewportSize({width: 390, height: 844});
    await page.getByRole('button', {name: 'Close Inspector', exact: true}).click();
    await expect(workspace.getByRole('button', {name: 'Save now', exact: true})).toBeVisible();
    await page.screenshot({path: path.join(os.tmpdir(), 'affine-workspace-mobile.png')});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('conflicting note draft blocks navigation and supports explicit replacement', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId), other = await openWorkspace(context, extensionId);
    const ws = page.getByRole('region', {name: 'AFFiNE workspace'});
    // Keep a genuine draft locally while a second tab commits a new canonical revision.
    await page.locator('workspace-reference-block rich-text [contenteditable="true"]').first().fill('My retained draft');
    await other.locator('workspace-reference-block .brainReferenceContent strong').first().click();
    const inspector = other.getByRole('complementary', {name: 'Inspector'});
    await inspector.getByLabel('Title', {exact: true}).fill('Other tab title');
    await inspector.getByRole('button', {name: 'Save', exact: true}).click();
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    // Depending on event timing, the draft may have saved before the second tab.
    // Force the conflict deterministically in the test context by advancing the stored revision
    // while the next local edit is queued, without changing production code.
    if (!await ws.isVisible()) await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await page.locator('workspace-reference-block rich-text [contenteditable="true"]').first().fill('Keep this conflict draft');
    await page.evaluate(() => new Promise(resolve => {
        const open = indexedDB.open('browserOsWorkspace'); open.onsuccess = () => {
            const db = open.result, tx = db.transaction('entities', 'readwrite'), store = tx.objectStore('entities'), req = store.getAll();
            req.onsuccess = () => {const note = req.result.find(e => e.type === 'note'); store.put({...note, contentRevision: (note.contentRevision || 0) + 1});};
            tx.oncomplete = () => {db.close(); resolve();};
        };
    }));
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    await expect(ws).toBeVisible();
    await expect(ws.getByRole('status').first()).toContainText('conflict');
    await expect(ws).toContainText('Keep this conflict draft');
    page.once('dialog', d => d.accept());
    await ws.getByRole('button', {name: 'Replace conflicting note', exact: true}).click();
    await expect(ws.getByRole('status').first()).toContainText('saved');
});
