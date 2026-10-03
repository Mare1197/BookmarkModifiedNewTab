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

test('rich block controls preserve order, heading level and canonical undo across reload', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId), workspace = page.getByRole('region', {name: 'AFFiNE workspace'});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const card = workspace.locator('[data-brain-reference]').filter({hasText: 'Start collecting ideas'});
    const rows = card.locator('.brainRichBlock');
    await rows.first().locator('[contenteditable="true"]').fill('First item');
    await rows.first().getByLabel('Block type', {exact: true}).selectOption('numbered');
    await card.getByRole('button', {name: 'Add paragraph', exact: true}).click();
    await rows.nth(1).locator('[contenteditable="true"]').fill('Second item');
    await rows.nth(1).getByLabel('Block type', {exact: true}).selectOption('numbered');
    await expect(rows.nth(1)).toHaveAttribute('data-list-number', '2');
    expect(await rows.nth(1).locator('rich-text').evaluate(el => getComputedStyle(el, '::before').content)).toContain('2');
    await rows.nth(1).getByRole('button', {name: 'Move block up', exact: true}).click();
    await expect(rows.first()).toContainText('Second item');
    await rows.first().getByLabel('Block type', {exact: true}).selectOption('heading');
    await rows.first().getByLabel('Heading level', {exact: true}).selectOption('1');
    await expect(rows.first()).toHaveAttribute('data-level', '1');
    await workspace.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect(workspace.getByRole('status').first()).toHaveText('saved');
    const beforeDelete = (await records(page, 'entities')).find(e => e.title === 'Start collecting ideas');
    expect(beforeDelete.richContent.blocks.map(b => b.runs.map(r => r.insert).join(''))).toEqual(['Second item', 'First item']);
    expect(beforeDelete.richContent.blocks[0].level).toBe(1);
    page.once('dialog', d => d.dismiss());
    await rows.first().getByRole('button', {name: 'Delete block', exact: true}).click();
    await expect(rows).toHaveCount(2);
    page.once('dialog', d => d.accept());
    await rows.first().getByRole('button', {name: 'Delete block', exact: true}).click();
    await expect(rows).toHaveCount(1);
    await card.getByRole('button', {name: 'Undo text change', exact: true}).click();
    await expect(rows).toHaveCount(2);
    await workspace.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect(workspace.getByRole('status').first()).toHaveText('saved');
    // A restored block must not retain its removed row's Y.Text observer.
    await rows.first().locator('rich-text').evaluate(el => el.yText.insert(el.yText.length, ' edited'));
    await workspace.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect(workspace.getByRole('status').first()).toHaveText('saved');
    await card.getByRole('button', {name: 'Undo text change', exact: true}).click();
    await expect(rows.first().locator('[contenteditable="true"]')).toHaveText('Second item');
    await expect(workspace.getByRole('status').first()).toHaveText('saved');
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await expect(rows.first()).toContainText('Second item');
    await expect(rows.first().getByLabel('Heading level', {exact: true})).toHaveValue('1');
    const after = (await records(page, 'entities')).find(e => e.id === beforeDelete.id);
    expect(after.richContent).toEqual(beforeDelete.richContent);
    expect(after.metadata.body).toBe('Second item\nFirst item');
    await page.screenshot({path: path.join(os.tmpdir(), 'workspace-rich-controls.png')});
    expect(errors).toEqual([]);
});

test('connector controls persist style across reload without changing the shared relationship', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId), workspace = page.getByRole('region', {name: 'AFFiNE workspace'});
    await workspace.getByLabel('New note title', {exact: true}).fill('Connected note');
    await workspace.getByRole('button', {name: 'New note', exact: true}).click();
    await workspace.getByText('Pages and layout controls', {exact: true}).click();
    await workspace.getByLabel('Selected cards', {exact: true}).selectOption({label: 'Start collecting ideas'});
    await workspace.getByLabel(/^Connect to/).selectOption({label: 'Connected note'});
    await workspace.getByRole('button', {name: 'Connect cards', exact: true}).click();
    const controls = workspace.getByRole('group', {name: 'Connector style'});
    await expect(controls).toBeVisible();
    await controls.getByLabel('Line shape').selectOption('curve');
    await controls.getByLabel('Line color').fill('#ff0000');
    await controls.getByLabel('Dashed line').check();
    await controls.getByRole('button', {name: 'Apply connector style'}).click();
    const pageSettings = () => records(page, 'settings').then(all => all.find(s => s.key.startsWith('workspace-page:') && s.value.connectors.length));
    await expect.poll(async () => (await pageSettings()).value.connectors[0].color).toBe('#ff0000');
    const before = (await pageSettings()).value.connectors[0];
    expect(before.mode).toBe('curve'); expect(before.dashed).toBe(true);
    const relationship = (await records(page, 'relationships')).find(r => r.id === before.relationshipId);
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await workspace.getByText('Pages and layout controls', {exact: true}).click();
    await expect(controls.getByLabel('Line shape')).toHaveValue('curve');
    await expect(controls.getByLabel('Dashed line')).toBeChecked();
    expect((await pageSettings()).value.connectors[0]).toEqual(before);
    expect((await records(page, 'relationships')).find(r => r.id === before.relationshipId)).toEqual(relationship);
    await controls.getByRole('button', {name: 'Remove from page', exact: true}).click();
    await expect(controls).toHaveCount(0);
    expect((await records(page, 'relationships')).find(r => r.id === before.relationshipId)).toEqual(relationship);
});

test('page outline searches nested pages and breadcrumb navigation retains canonical hierarchy', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId), workspace = page.getByRole('region', {name: 'AFFiNE workspace'});
    for (const title of ['Child research', 'Deep notes']) {
        await workspace.getByText('Pages and layout controls', {exact: true}).click();
        page.once('dialog', dialog => dialog.accept(title));
        await workspace.getByRole('button', {name: 'New child page', exact: true}).click();
        await expect(workspace.getByRole('heading', {name: title, exact: true})).toBeVisible();
    }
    const crumbs = workspace.getByRole('navigation', {name: 'Page breadcrumbs'});
    await expect(crumbs).toContainText('Research Board');
    await expect(crumbs).toContainText('Child research');
    await expect(crumbs).toContainText('Deep notes');
    const links = (await records(page, 'relationships')).filter(r => r.type === 'page-parent');
    await crumbs.getByRole('button', {name: 'Research Board', exact: true}).click();
    await expect(workspace.getByRole('heading', {name: 'Research Board', exact: true})).toBeVisible();
    await workspace.getByText('Page outline', {exact: true}).click();
    await workspace.getByLabel('Find page', {exact: true}).fill('deep');
    const outline = workspace.getByRole('navigation', {name: 'Workspace pages'});
    await outline.getByRole('button', {name: 'Deep notes', exact: true}).click();
    await expect(workspace.getByRole('heading', {name: 'Deep notes', exact: true})).toBeVisible();
    expect((await records(page, 'relationships')).filter(r => r.type === 'page-parent')).toEqual(links);
    await page.setViewportSize({width: 390, height: 844});
    await page.screenshot({path: path.join(os.tmpdir(), 'workspace-page-outline-narrow.png')});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

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
    await page.getByRole('button', {name: 'Recovery', exact: true}).click();
    await page.getByRole('button', {name: 'Preview draft', exact: true}).first().click();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', {name: 'Use draft', exact: true}).click();
    await page.getByRole('button', {name: 'Close recovery', exact: true}).click();
    await expect(ws.getByRole('status').first()).toContainText('saved');
});
