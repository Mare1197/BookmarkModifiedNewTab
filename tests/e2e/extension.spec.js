const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const AxeBuilder = require('@axe-core/playwright').default;
const profile = require('../fixtures/extension-profile.json');
const {expect, test} = require('./fixtures.js');

let fixtureServer;
let fixtureUrl;
const visualDirectory = process.env.CAPTURE_VISUALS_DIR;
const visualPath = name => {
    if (!visualDirectory) {
        return undefined;
    }
    fs.mkdirSync(visualDirectory, {recursive: true});
    return path.join(visualDirectory, name);
};

test.beforeAll(async () => {
    fixtureServer = http.createServer((request, response) => {
        response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        response.end('<!doctype html><title>Fixture History Page</title><main>Local history fixture</main>');
    });
    await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
    const address = fixtureServer.address();
    fixtureUrl = `http://127.0.0.1:${address.port}/history`;
});

test.afterAll(async () => {
    if (fixtureServer) {
        await new Promise(resolve => fixtureServer.close(resolve));
    }
});

test('loads the unpacked extension and preserves legacy plus resource workflows', async ({
    context, extensionId, serviceWorker
}) => {
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.chrome_url_overrides.newtab).toBe('newtab.html');
    expect(manifest.action.default_popup).toBe('popup.html');
    expect([...manifest.permissions].sort()).toEqual([
        'activeTab', 'alarms', 'bookmarks', 'favicon', 'history', 'notifications', 'storage', 'tabs'
    ]);
    expect(manifest.optional_permissions).toEqual(['scripting']);
    expect(manifest.optional_host_permissions).toEqual([
        '<all_urls>', 'https://generativelanguage.googleapis.com/*'
    ]);
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popupPage.getByRole('button', {name: 'Capture visible tab'})).toBeVisible();
    await popupPage.close();

    await serviceWorker.evaluate(async fixture => {
        const tree = await chrome.bookmarks.getTree();
        const root = tree[0];
        const parent = root.children.find(node => node.id === '1') || root.children[0];
        const folder = await chrome.bookmarks.create({parentId: parent.id, title: 'Fixture Folder'});
        await chrome.bookmarks.create({parentId: folder.id, title: 'Nested Fixture', url: 'https://example.test/nested'});
        await chrome.bookmarks.create({parentId: parent.id, title: 'Fixture Bookmark', url: 'https://example.test/article'});
        const documentFixture = fixture.bookmarksTree[0].children[0].children.find(node => node.title === 'Fixture Document');
        await chrome.bookmarks.create({parentId: parent.id, title: documentFixture.title, url: documentFixture.url});
    }, profile);

    const historyPage = await context.newPage();
    await historyPage.goto(fixtureUrl);
    await expect(historyPage).toHaveTitle('Fixture History Page');

    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.madeHelp = '1';
        localStorage.showedHelp = '1';
        localStorage.version = '1.5.2';
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/${manifest.chrome_url_overrides.newtab}`);

    await expect(page).toHaveTitle('New Tab');
    const compatibilityFrame = page.locator('iframe[title="Browser OS desktop"]');
    await expect(compatibilityFrame).toBeVisible();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards'}).click();
    await expect(page.locator('.workspaceWindow')).toBeVisible();
    await expect(page.getByRole('navigation', {name: 'Workspace views'})).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();

    const boardNavigation = page.getByRole('navigation', {name: 'Boards'});
    await expect(boardNavigation.getByRole('button')).toHaveCount(1);
    await page.getByRole('button', {name: '＋ New board'}).click();
    await expect(boardNavigation.getByRole('button')).toHaveCount(2);
    await page.getByRole('complementary', {name: 'Workspace Explorer'})
        .getByRole('button', {name: 'Duplicate', exact: true}).click();
    await expect(boardNavigation.getByRole('button')).toHaveCount(3);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('complementary', {name: 'Workspace Explorer'})
        .getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(boardNavigation.getByRole('button')).toHaveCount(2);
    await boardNavigation.getByRole('button', {name: /Research Board/}).click();

    await page.getByRole('button', {name: '＋ Note'}).click();
    await expect(page.locator('.workspaceCard--note')).not.toHaveCount(0);
    await page.getByRole('button', {name: '＋ Recent web tab'}).click();
    await page.getByRole('button', {name: '＋ Quick Add'}).click();
    const quickAdd = page.getByRole('dialog', {name: 'Quick Add or run a command'});
    if (visualDirectory) {
        await page.setViewportSize({width: 1584, height: 1024});
        await page.screenshot({path: visualPath('workspace-workflows-desktop.png')});
    }
    await quickAdd.getByRole('button', {name: 'Task'}).click();
    await quickAdd.getByRole('textbox', {name: 'Title'}).fill('Review captured research');
    await quickAdd.getByRole('button', {name: /Add to 2 destinations/}).click();
    await expect(page.locator('.workspaceCard--task')).not.toHaveCount(0);
    await page.getByRole('button', {name: 'Tasks', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Workspace tasks'})).toContainText('Review captured research');
    await page.getByRole('button', {name: 'Activity', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Activity timeline'})).toContainText('Review captured research');
    await page.getByRole('complementary', {name: 'Workspace Explorer'})
        .getByRole('button', {name: /Quick Inbox/}).click();
    await expect(page.getByRole('region', {name: 'Quick Inbox'})).toContainText('Review captured research');
    await page.getByRole('complementary', {name: 'Workspace Explorer'})
        .getByRole('button', {name: /Saved sessions/}).click();
    await page.getByRole('button', {name: 'Capture current window'}).click();
    await expect(page.getByRole('region', {name: 'Workspace sessions'})).toContainText('tabs');
    await page.getByRole('complementary', {name: 'Workspace Explorer'})
        .getByRole('button', {name: 'Board templates'}).click();
    await expect(page.getByRole('region', {name: 'Board templates'})).toBeVisible();
    const canonicalIdentity = await page.evaluate(async () => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('browserOsWorkspace');
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error));
        });
        const entities = await new Promise((resolve, reject) => {
            const request = database.transaction('entities').objectStore('entities').getAll();
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error));
        });
        const webEntities = entities.filter(entity => entity.canonicalUrl);
        return {
            count: webEntities.length,
            uniqueCanonicalUrls: new Set(webEntities.map(entity => entity.canonicalUrl)).size
        };
    });
    expect(canonicalIdentity.uniqueCanonicalUrls).toBe(canonicalIdentity.count);
    await page.getByRole('treeitem').first().click();
    await expect(page.getByRole('complementary', {name: 'Inspector'})).toBeVisible();
    await page.getByRole('button', {name: 'Mind Map'}).click();
    await expect(page.getByRole('application', {name: 'Mind map'})).toBeVisible();
    await page.getByRole('button', {name: 'Graph', exact: true}).click();
    await expect(page.getByRole('application', {name: 'Relationship graph'})).toBeVisible();
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Unified local search'})).toBeVisible();
    await page.getByRole('button', {name: 'Assets'}).click();
    await expect(page.getByRole('region', {name: 'Local assets'})).toBeVisible();
    await expect(page.getByText(/use the Browser OS toolbar button/i)).toBeVisible();
    await page.getByRole('button', {name: 'AI', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Optional AI analysis'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Save as analysis card'})).toBeDisabled();
    await page.getByRole('button', {name: 'Workspace settings'}).click();
    await expect(page.getByRole('region', {name: 'Workspace settings'})).toBeVisible();
    const workspaceAccessibility = await new AxeBuilder({page})
        .include('.workspaceWindow')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    expect(workspaceAccessibility.violations).toEqual([]);
    await page.getByRole('button', {name: 'Canvas', exact: true}).click();
    await page.setViewportSize({width: 390, height: 844});
    const mobileNavigation = page.getByRole('navigation', {name: 'Mobile workspace navigation'});
    await mobileNavigation.getByRole('button', {name: 'Browse'}).click();
    await expect(page.getByRole('complementary', {name: 'Workspace Explorer'})).toBeVisible();
    await page.getByRole('button', {name: 'Close Explorer'}).click();
    await mobileNavigation.getByRole('button', {name: 'Inspect'}).click();
    await expect(page.getByRole('complementary', {name: 'Inspector'})).toBeVisible();
    await page.getByRole('button', {name: 'Close Inspector'}).click();
    if (visualDirectory) {
        await page.keyboard.press('Control+K');
        await expect(quickAdd).toBeVisible();
        await page.screenshot({path: visualPath('workspace-workflows-mobile.png')});
        await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width: 1280, height: 800});
    await page.getByRole('button', {name: 'Return to desktop'}).click();
    await expect(page.locator('iframe[title="Browser OS desktop"]')).toBeVisible();
    await expect(compatibilityFrame).toHaveAttribute('src', `chrome-extension://${extensionId}/legacy/index.html`);

    await page.goto(`chrome-extension://${extensionId}/legacy/index.html`);

    await expect(page).toHaveTitle('New Tab');
    await expect(page.locator('.resourceLauncher')).toHaveCount(6);
    await expect(page.locator('.bookmark[data-type="folder"]')).not.toHaveCount(0);
    await expect(page.locator('.bookmark[data-type="document"]')).not.toHaveCount(0);
    const workspaceState = await page.evaluate(async () => {
        const repository = await app.workspaceReady;
        return {
            databaseVersion: repository.db.verno,
            entityCount: await repository.db.entities.count(),
            sourceRefCount: await repository.db.sourceRefs.count(),
            migrationErrors: app.workspaceMigrationReport.errors.length
        };
    });
    expect(workspaceState.databaseVersion).toBe(4);
    expect(workspaceState.entityCount).toBeGreaterThanOrEqual(3);
    expect(workspaceState.sourceRefCount).toBeGreaterThanOrEqual(3);
    expect(workspaceState.migrationErrors).toBe(0);

    await page.locator('.bookmark[data-type="folder"]').first().click();
    await expect(page.locator('.window[data-type="folder"]')).toBeVisible();

    await page.locator('.bookmark[data-type="document"]').first().click();
    await expect(page.locator('.window[data-type="document"]')).toBeVisible();

    await page.getByRole('button', {name: 'Open Tabs'}).click();
    const resourceWindow = page.locator('.resourceWindow[data-id="tabs"]');
    await expect(resourceWindow).toBeVisible();
    await expect(resourceWindow.locator('.resourceRow').first()).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
        const repository = await app.workspaceReady;
        return repository.db.tabSessions.count();
    })).toBeGreaterThan(0);

    await resourceWindow.locator('.resourceRowSelect').first().press(' ');
    await resourceWindow.getByRole('button', {name: 'Inspector'}).click();
    await expect(resourceWindow.locator('.resourceInspector')).toBeVisible();
    await expect(resourceWindow.getByText('Opened From')).toBeVisible();
    await expect(resourceWindow.getByRole('button', {name: 'Inspector'})).toHaveAttribute('aria-expanded', 'true');

    const accessibility = await new AxeBuilder({page})
        .include('.resourceDock')
        .include('.resourceWindow[data-id="tabs"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    expect(accessibility.violations).toEqual([]);

    await page.evaluate(() => {
        document.querySelectorAll('.window:not(.resourceWindow)').forEach(windowElement => windowElement.remove());
    });
    await page.setViewportSize({width: 390, height: 844});
    const dimensions = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        dockRight: Math.round(document.querySelector('.resourceDock').getBoundingClientRect().right),
        resourceRight: Math.round(document.querySelector('.resourceWindow[data-id="tabs"]').getBoundingClientRect().right)
    }));
    expect(dimensions.documentWidth).toBe(dimensions.viewport);
    expect(dimensions.dockRight).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.resourceRight).toBeLessThanOrEqual(dimensions.viewport);
    expect(pageErrors).toEqual([]);
});
