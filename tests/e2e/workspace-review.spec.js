const http = require('node:http');
const {expect, test} = require('./fixtures.js');

test.use({timezoneId: 'Europe/Bratislava'});

async function openWorkspace(context, extensionId) {
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.madeHelp = '1';
        localStorage.showedHelp = '1';
        localStorage.version = '1.5.2';
    });
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]')
        .getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.getByRole('navigation', {name: 'Boards'})
        .getByRole('button', {name: /Research Board/})).toBeVisible();
    return page;
}

test('Inspector drafts stay with their objects and reminders retain local time', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', {name: '＋ Note', exact: true}).click();
    const inspector = page.getByRole('complementary', {name: 'Inspector'});
    const firstNote = page.getByRole('treeitem', {name: /Start collecting ideas/});
    const secondNote = page.getByRole('treeitem', {name: /New note/});
    // Wait for the async capture to enter the live list before clicking a row
    // whose position can change while the new note is inserted.
    await expect(secondNote).toBeVisible();
    await firstNote.click();
    await inspector.getByRole('textbox', {name: 'Title', exact: true}).fill('Draft belongs to first note');
    await secondNote.click();
    await expect(inspector.getByRole('textbox', {name: 'Title', exact: true})).toHaveValue('New note');
    await firstNote.click();
    await expect(inspector.getByRole('textbox', {name: 'Title', exact: true}))
        .toHaveValue('Draft belongs to first note');
    await inspector.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(page.getByRole('treeitem', {name: /Draft belongs to first note/})).toBeVisible();
    await expect(secondNote).toBeVisible();

    const trigger = page.getByRole('button', {name: '＋ Quick Add', exact: true});
    await trigger.click();
    const dialog = page.getByRole('dialog', {name: 'Quick Add or run a command'});
    const search = dialog.getByRole('textbox', {name: 'Quick Add or run a command', exact: true});
    await expect(search).toBeFocused();
    await search.press('Shift+Tab');
    await expect(dialog.getByRole('button', {name: 'Add to 2 destinations', exact: true})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('button', {name: 'Task', exact: true}).click();
    await dialog.getByRole('textbox', {name: 'Title', exact: true}).fill('Local reminder');
    await dialog.getByLabel('Reminder', {exact: true}).fill('2030-07-15T09:30');
    await dialog.getByRole('button', {name: 'Add to 2 destinations', exact: true}).click();
    await expect(inspector.getByLabel('Reminder', {exact: true})).toHaveValue('2030-07-15T09:30');
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]')
        .getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('treeitem', {name: /Local reminder/}).click();
    await expect(inspector.getByLabel('Reminder', {exact: true})).toHaveValue('2030-07-15T09:30');
    expect(errors).toEqual([]);
});

test('search finds inactive-board content and custom filters can be deleted', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId);
    await page.getByRole('button', {name: '＋ New board', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toContainText('Untitled board');
    await expect(page.getByText('This board is empty', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    const search = page.getByRole('region', {name: 'Unified local search'});
    await search.getByRole('textbox').fill('board:"Research Board" type:note');
    await expect(search.locator('.workspaceSearch__results')).toContainText('Start collecting ideas');
    page.once('dialog', dialog => dialog.accept('Research notes review'));
    await search.getByRole('button', {name: 'Save filter', exact: true}).click();
    await expect(search.getByRole('button', {name: 'Research notes review', exact: true})).toBeVisible();
    await search.getByRole('button', {name: 'Delete Research notes review', exact: true}).click();
    await expect(search.getByRole('button', {name: 'Research notes review', exact: true})).toHaveCount(0);
    await expect(search.getByRole('button', {name: 'Delete Notes', exact: true})).toHaveCount(0);
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]')
        .getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    await expect(search.getByRole('button', {name: 'Research notes review', exact: true})).toHaveCount(0);
});

test('session restore keeps the exact URL and pinned state', async ({context, extensionId, serviceWorker}) => {
    const server = http.createServer((_request, response) => {
        response.writeHead(200, {'Content-Type': 'text/html'});
        response.end('<!doctype html><title>Session fixture</title><main id="section">Saved section</main>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const url = `http://127.0.0.1:${server.address().port}/?view=board#section`;
        const source = await context.newPage();
        await source.goto(url);
        await serviceWorker.evaluate(async exactUrl => {
            const tabs = await chrome.tabs.query({});
            await chrome.tabs.update(tabs.find(tab => tab.url === exactUrl).id, {pinned: true});
        }, url);
        const page = await openWorkspace(context, extensionId);
        await page.getByRole('complementary', {name: 'Workspace Explorer'})
            .getByRole('button', {name: /Saved sessions/}).click();
        const sessions = page.getByRole('region', {name: 'Workspace sessions'});
        await sessions.getByRole('button', {name: 'Capture current window', exact: true}).click();
        await sessions.getByRole('button', {name: 'Open', exact: true}).click();
        await expect.poll(() => serviceWorker.evaluate(async exactUrl => {
            const tabs = await chrome.tabs.query({});
            return tabs.filter(tab => tab.url === exactUrl && tab.pinned).length;
        }, url)).toBe(2);
    } finally {
        await new Promise(resolve => {
            server.close(resolve);
            // Chromium can retain speculative sockets until the context is torn down.
            server.closeAllConnections();
        });
    }
});

test('backup import rejects malformed workflows and accepts an empty saved query', async ({context, extensionId}) => {
    const page = await openWorkspace(context, extensionId);
    await page.getByRole('button', {name: 'Workspace settings', exact: true}).click();
    const settings = page.getByRole('region', {name: 'Workspace settings'});
    const upload = async tables => {
        await settings.locator('input[type="file"]').setInputFiles({
            name: 'review-fixture.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({
                format: 'browser-os-workspace', schemaVersion: 3, exportedAt: Date.now(), tables
            }))
        });
    };
    await upload({workspaceSessions: [{
        id: 'invalid-session', boardId: 'missing-board', name: 'Invalid URL',
        tabs: [{entityId: 'missing-entity', url: 'javascript:alert(1)', index: 0, pinned: false}]
    }]});
    await expect(settings.getByRole('status')).toHaveText('Invalid workspace session tab.');
    await upload({tasks: [{id: 'invalid-task', entityId: 'missing', status: 'invalid', dependencyIds: []}]});
    await expect(settings.getByRole('status')).toHaveText('Invalid task status or dependencies.');
    await upload({savedFilters: [{
        id: 'filter:review-empty', name: 'Everything review', query: '', createdAt: Date.now(), updatedAt: Date.now()
    }]});
    await expect(settings.getByRole('status')).toHaveText('Workspace records merged from the export.');
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    const search = page.getByRole('region', {name: 'Unified local search'});
    await search.getByRole('button', {name: 'Everything review', exact: true}).click();
    await expect(search.locator('.workspaceSearch__results')).toContainText('Start collecting ideas');
});
