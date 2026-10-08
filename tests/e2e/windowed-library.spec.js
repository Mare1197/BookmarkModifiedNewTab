const {expect, test} = require('./fixtures');
const {makeLargeLibraryFixture, seedLargeLibrary} = require('../helpers/largeLibraryFixture');

test('canvas visibility culling retains offscreen connections and Fit view restores saved cards', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    const open = () => page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await open(); await expect(page.locator('.workspaceTitlebar')).toContainText('Research Board');
    await page.reload();
    const fixture = makeLargeLibraryFixture(3, 'large-board');
    fixture.placements.forEach((placement, index) => {placement.x = index * 1000; placement.y = 0;});
    await seedLargeLibrary(page, fixture);
    await page.reload(); await open();
    await expect(page.locator('.workspaceTitlebar')).toContainText('Performance board');
    await expect(page.locator('.workspaceCard')).toHaveCount(3);
    for (let i = 0; i < 3; i++) await page.locator('.react-flow__controls-zoomin').click();
    await expect.poll(() => page.locator('.workspaceCard').count()).toBeLessThan(3);
    // A horizontal SVG path has a zero-height bounding box, so Playwright's
    // visibility predicate is false even when the line is drawn.
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /^M.+L/);
    await page.locator('.react-flow__controls-fitview').click();
    await expect(page.locator('.workspaceCard')).toHaveCount(3);
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(3);
});

test('Explorer keyboard and drag interactions survive windowing and page changes', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    const open = () => page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await open(); await expect(page.locator('.workspaceTitlebar')).toBeVisible();
    await page.reload(); await seedLargeLibrary(page, makeLargeLibraryFixture(123, 'small-board'));
    await page.reload(); await open();
    const tree = page.getByRole('tree', {name: 'Board objects'});
    await expect(tree.getByRole('treeitem').first()).toBeVisible();
    expect(await tree.getByRole('treeitem').count()).toBeLessThanOrEqual(22);
    await tree.getByRole('treeitem').first().focus();
    await page.keyboard.press('End');
    await expect(tree.locator('[aria-posinset="50"]')).toBeFocused();
    await page.keyboard.press('Enter');
    const title = await tree.locator('[aria-posinset="50"]').innerText();
    await expect(page.getByRole('complementary', {name: 'Inspector'}).getByLabel('Title', {exact: true})).toHaveValue(title.replace(/^[^\p{L}]+/u, '').trim());
    const pinned = tree.locator('[aria-posinset="50"]');
    await pinned.dispatchEvent('dragstart', {dataTransfer: await page.evaluateHandle(() => new DataTransfer())});
    await page.getByLabel('Filter objects', {exact: true}).focus();
    await tree.evaluate(element => {element.scrollTop = 0; element.dispatchEvent(new Event('scroll'));});
    await expect(pinned).toHaveCount(1);
    await pinned.evaluate(element => {
        window.removedPinnedRows = 0;
        const tree = element.closest('[role="tree"]');
        const observer = new MutationObserver(records => {
            for (const record of records) for (const removed of record.removedNodes) {
                if (removed === element || removed.contains(element)) window.removedPinnedRows++;
            }
        });
        observer.observe(tree, {childList: true, subtree: true});
        window.stopPinnedObserver = () => observer.disconnect();
    });
    const other = await context.newPage();
    await other.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await other.goto(page.url());
    await other.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await other.getByRole('tree', {name: 'Board objects'}).getByRole('treeitem', {name: /Performance object 000001/}).click();
    const otherInspector = other.getByRole('complementary', {name: 'Inspector'});
    await otherInspector.getByLabel('Title', {exact: true}).fill('Same-count background edit');
    await otherInspector.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(otherInspector.locator('footer [role="status"]')).toHaveText('Saved');
    await expect(tree.getByRole('treeitem', {name: /Same-count background edit/})).toBeVisible();
    await expect(pinned).toHaveCount(1);
    expect(await page.evaluate(() => {window.stopPinnedObserver(); return window.removedPinnedRows;})).toBe(0);
    await other.close();
    await pinned.dispatchEvent('dragend');
    await expect(pinned).toHaveCount(0);
    await page.getByRole('navigation', {name: 'Explorer pages', exact: true}).getByRole('button', {name: 'Next page'}).click();
    await expect(page.getByRole('navigation', {name: 'Explorer pages', exact: true})).toContainText('Page 2');
    await expect(tree.getByRole('treeitem').first()).toBeVisible();
    expect(await tree.getByRole('treeitem').count()).toBeLessThanOrEqual(22);
    await page.setViewportSize({width: 800, height: 700});
    expect(await tree.getByRole('treeitem').count()).toBeLessThanOrEqual(22);
});

test('expanded folders share one bounded viewport and destinations stay searchable', async ({context, extensionId}) => {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    const open = () => page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await open(); await expect(page.locator('.workspaceTitlebar')).toBeVisible();
    await page.reload();
    const fixture = makeLargeLibraryFixture(123, 'small-board');
    fixture.folders = Array.from({length: 123}, (_, i) => ({id: 'folder:' + i, title: 'Folder ' + String(i).padStart(3, '0'), sourceKind: 'workspace', createdAt: 1, updatedAt: 1}));
    fixture.folderMemberships = fixture.folders.slice(0, 2).flatMap(folder => fixture.entities.slice(0, 50).map((entity, i) =>
        ({id: folder.id + ':member:' + i, folderId: folder.id, entityId: entity.id, sourceKind: 'user', position: i, createdAt: 1, updatedAt: 1})));
    await seedLargeLibrary(page, fixture); await page.reload(); await open();
    const folders = page.getByRole('region', {name: 'Folder organization'}), tree = folders.getByRole('tree', {name: 'Folder tree'});
    await tree.getByRole('treeitem', {name: 'Folder 000 Workspace', exact: true}).click();
    await expect(tree.getByRole('treeitem', {name: 'Performance object 000001', exact: true})).toBeVisible();
    await tree.evaluate(element => {element.scrollTop = 53 * 36; element.dispatchEvent(new Event('scroll'));});
    await tree.getByRole('treeitem', {name: 'Folder 001 Workspace', exact: true}).click();
    await expect(tree.getByRole('treeitem', {name: 'Performance object 000001', exact: true})).toBeVisible();
    expect(await tree.locator('[data-window-row]').count()).toBeLessThanOrEqual(22);
    expect(await folders.getByRole('combobox', {name: 'Destination folder', exact: true}).locator('option').count()).toBeLessThanOrEqual(52);
    await folders.getByLabel('Search destination folders', {exact: true}).fill('122');
    await folders.getByRole('combobox', {name: 'Destination folder', exact: true}).selectOption('folder:122');
    await tree.getByRole('treeitem').first().focus(); await page.keyboard.press('End');
    await expect(tree.getByRole('treeitem', {name: 'Other bookmarks Native read-only', exact: true})).toBeFocused();
    expect(await tree.locator('[data-window-row]').count()).toBeLessThanOrEqual(22);
});
