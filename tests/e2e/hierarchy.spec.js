const {expect, test} = require('./fixtures.js');

async function openWorkspace(context, extensionId) {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(() => {
        localStorage.madeHelp = '1';
        localStorage.showedHelp = '1';
        localStorage.version = '1.5.2';
    });
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await showBoards(page);
    return page;
}

async function showBoards(page) {
    await page.frameLocator('iframe[title="Browser OS desktop"]')
        .getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Folder organization'})).toBeVisible();
}

test('keyboard folder moves update Inspector, undo and persist after reload', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const folders = page.getByRole('region', {name: 'Folder organization'});
    const inspector = page.getByRole('complementary', {name: 'Inspector'});
    await folders.getByRole('textbox', {name: 'New folder name'}).fill('Keyboard research');
    await folders.getByRole('button', {name: 'Create folder', exact: true}).press('Enter');
    await expect(folders.getByRole('status')).toHaveText('Folder created.');
    await page.getByRole('treeitem', {name: /Start collecting ideas/}).press('Enter');
    await folders.getByRole('combobox', {name: 'Destination folder'}).selectOption({label: 'Keyboard research'});
    await folders.getByRole('button', {name: 'Move selected', exact: true}).press('Enter');
    await expect(folders.getByRole('status')).toHaveText('Moved. Undo move is available.');
    await expect(inspector.getByRole('listitem').filter({hasText: 'Keyboard research'})).toBeVisible();
    await folders.getByRole('button', {name: 'Undo move', exact: true}).press('Enter');
    await expect(folders.getByRole('status')).toHaveText('Move undone.');
    await expect(inspector.getByRole('listitem').filter({hasText: 'Keyboard research'})).toHaveCount(0);
    await folders.getByRole('button', {name: 'Move selected', exact: true}).press('Enter');
    await expect(folders.getByRole('status')).toHaveText('Moved. Undo move is available.');
    await page.reload();
    await showBoards(page);
    await page.getByRole('treeitem', {name: /Start collecting ideas/}).press('Enter');
    await expect(inspector.getByRole('listitem').filter({hasText: 'Keyboard research'})).toBeVisible();
    await folders.getByRole('button', {name: 'Undo move', exact: true}).press('Enter');
    await expect(inspector.getByRole('listitem').filter({hasText: 'Keyboard research'})).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('a folder cannot be moved into a descendant and drag uses the same safe move path', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId);
    const folders = page.getByRole('region', {name: 'Folder organization'});
    const name = folders.getByRole('textbox', {name: 'New folder name'});
    const destination = folders.getByRole('combobox', {name: 'Destination folder'});
    await name.fill('Parent research');
    await folders.getByRole('button', {name: 'Create folder', exact: true}).click();
    await expect(folders.getByRole('status')).toHaveText('Folder created.');
    await destination.selectOption({label: 'Parent research'});
    await name.fill('Child research');
    await folders.getByRole('button', {name: 'Create folder', exact: true}).click();
    await expect(folders.getByRole('button', {name: 'Move folder Child research', exact: true})).toBeVisible();
    await folders.getByRole('button', {name: 'Move folder Parent research', exact: true}).click();
    await destination.selectOption({label: 'Child research'});
    await expect(folders.getByText('Selected: Parent research', {exact: true})).toBeVisible();
    await folders.getByRole('button', {name: 'Move selected', exact: true}).click();
    await expect(folders.getByRole('status')).toHaveText('A folder cannot be moved into itself or its descendants.');
    await folders.getByRole('button', {name: 'Use selected object', exact: true}).click();
    await page.getByRole('treeitem', {name: /Start collecting ideas/}).click();
    await expect(folders.getByText('Selected: Start collecting ideas', {exact: true})).toBeVisible();
    const dragSource = folders.getByRole('button', {name: 'Drag selected item', exact: true});
    const dragTarget = folders.getByRole('treeitem', {name: 'Child research Workspace', exact: true});
    // Keep both hit targets in the same scroll position before mouse-down.
    // Locator dragTo can scroll this shared ancestor between press and movement.
    await dragSource.hover();
    await expect(dragTarget).toBeInViewport({ratio: 1});
    const sourceBox = await dragSource.boundingBox(), targetBox = await dragTarget.boundingBox();
    expect(sourceBox).not.toBeNull(); expect(targetBox).not.toBeNull();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {steps: 10});
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.mouse.up();
    await expect(folders.getByRole('status')).toHaveText('Moved. Undo move is available.');
    await expect(page.getByRole('complementary', {name: 'Inspector'})
        .getByRole('listitem').filter({hasText: 'Child research'})).toBeVisible();
});

test('selecting another object then returning clears a previously picked folder', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId);
    const folders = page.getByRole('region', {name: 'Folder organization'});
    const inspector = page.getByRole('complementary', {name: 'Inspector'});
    await page.getByRole('button', {name: '＋ Note', exact: true}).click();
    await expect(page.getByRole('treeitem', {name: /New note/})).toBeVisible();
    for (const title of ['Previously picked folder', 'Selection destination']) {
        await folders.getByRole('textbox', {name: 'New folder name'}).fill(title);
        await folders.getByRole('button', {name: 'Create folder', exact: true}).click();
        await expect(folders.getByRole('button', {name: 'Move folder ' + title, exact: true})).toBeVisible();
    }
    const first = page.getByRole('treeitem', {name: /Start collecting ideas/});
    await first.click();
    await folders.getByRole('button', {name: 'Move folder Previously picked folder', exact: true}).click();
    await expect(folders.getByText('Selected: Previously picked folder', {exact: true})).toBeVisible();
    await page.getByRole('treeitem', {name: /New note/}).click();
    await expect(folders.getByText('Selected: New note', {exact: true})).toBeVisible();
    await first.click();
    await expect(folders.getByText('Selected: Start collecting ideas', {exact: true})).toBeVisible();
    await folders.getByRole('combobox', {name: 'Destination folder'}).selectOption({label: 'Selection destination'});
    await folders.getByRole('button', {name: 'Move selected', exact: true}).click();
    await expect(folders.getByRole('status')).toHaveText('Moved. Undo move is available.');
    await expect(inspector.getByRole('listitem').filter({hasText: 'Selection destination'})).toBeVisible();
    const destinationTree = folders.getByRole('tree', {name: 'Folder tree'});
    await expect(destinationTree.getByRole('treeitem', {name: 'Start collecting ideas', exact: true})).toBeVisible();
    await expect(destinationTree.getByRole('treeitem', {name: 'Previously picked folder Workspace', exact: true})).toHaveAttribute('aria-level', '1');
    await page.screenshot({path: test.info().outputPath('hierarchy-desktop.png'), fullPage: true});
    await page.setViewportSize({width: 390, height: 844});
    await page.getByRole('navigation', {name: 'Mobile workspace navigation'})
        .getByRole('button', {name: 'Browse', exact: true}).click();
    await expect(folders.getByRole('button', {name: 'Move selected', exact: true})).toBeVisible();
    await folders.getByRole('button', {name: 'Move selected', exact: true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: test.info().outputPath('hierarchy-mobile.png'), fullPage: true});
});
