const {expect, test} = require('./fixtures');
const {makeLargeLibraryFixture, seedLargeLibrary} = require('../helpers/largeLibraryFixture');

test('library pages stay bounded and Inspector resolves an object outside the board', async ({context, extensionId}) => {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    const url = `chrome-extension://${extensionId}/newtab.html`;
    await page.goto(url);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toBeVisible();
    const fixture = makeLargeLibraryFixture(123, 'small-board');
    fixture.entities.forEach(entity => {entity.inboxAt = 1700000000000;});
    fixture.activities = fixture.entities.map((entity, i) => ({id: 'perf:activity:' + i, entityId: entity.id,
        type: 'created', summary: 'Created ' + entity.title, createdAt: entity.updatedAt}));
    await seedLargeLibrary(page, fixture);
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toContainText('Performance board');
    await expect(page.locator('.workspaceNotice')).not.toContainText('Loading');
    expect(await page.locator('.workspaceExplorer__tree [role="treeitem"]').count()).toBeLessThanOrEqual(50);
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    const brain = page.getByRole('region', {name: 'Unified Brain', exact: true});
    await expect(brain.locator('tbody tr')).toHaveCount(50);
    await brain.getByRole('navigation', {name: 'Object pages', exact: true}).getByRole('button', {name: 'Next page', exact: true}).click();
    await expect(brain.getByRole('navigation', {name: 'Object pages'})).toContainText('Page 2');
    for (const mode of ['Kanban', 'Tiles', 'Timeline', 'AI Inbox']) {
        await brain.getByRole('button', {name: mode, exact: true}).click();
        const pager = brain.getByRole('navigation', {name: 'Object pages', exact: true});
        if (await pager.getByRole('button', {name: 'Previous page'}).isEnabled()) await pager.getByRole('button', {name: 'Previous page'}).click();
        await expect(pager).toContainText('Page 1');
        const rows = mode === 'Timeline' ? brain.locator('.brainTimeline li') : mode === 'AI Inbox' ?
            brain.getByRole('region', {name: 'Brain inbox'}).locator('article') : brain.locator('[data-entity-id]');
        if (mode === 'Timeline') {
            await expect(rows.first()).toBeVisible();
            expect(await rows.count()).toBeLessThanOrEqual(50);
        } else await expect(rows).toHaveCount(50);
        await pager.getByRole('button', {name: 'Next page', exact: true}).click();
        await expect(pager).toContainText('Page 2');
        if (mode === 'Timeline') {
            await expect(rows.first()).toBeVisible();
            expect(await rows.count()).toBeLessThanOrEqual(50);
        } else await expect(rows).toHaveCount(50);
    }
    await brain.getByRole('button', {name: 'Table', exact: true}).click();
    await brain.getByLabel('Find objects', {exact: true}).fill('000122');
    await expect(brain.locator('tbody tr')).toHaveCount(1);
    await brain.getByRole('button', {name: 'Performance object 000122', exact: true}).click();
    const inspector = page.getByRole('complementary', {name: 'Inspector'});
    await expect(inspector.getByLabel('Title', {exact: true})).toHaveValue('Performance object 000122');
    await inspector.getByText('Connect to…', {exact: true}).click();
    await inspector.getByRole('textbox', {name: 'Search Target object', exact: true}).fill('000099');
    await inspector.getByRole('combobox', {name: 'Target object', exact: true}).selectOption('perf:object:000099');
    await inspector.getByRole('button', {name: 'Connect objects', exact: true}).click();
    await expect(inspector.getByText('Related to (3)', {exact: true})).toBeVisible();
    await expect(brain.getByRole('navigation', {name: 'Object pages'})).toContainText('Page 1');
    await brain.getByLabel('Find objects', {exact: true}).fill('');
    await expect(brain.getByRole('navigation', {name: 'Object pages', exact: true})).toContainText('Page 1');
    expect(errors).toEqual([]);
});
