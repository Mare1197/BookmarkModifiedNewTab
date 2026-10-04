const {performance} = require('node:perf_hooks');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {expect, test} = require('../e2e/fixtures');
const {makeLargeLibraryFixture, seedLargeLibrary} = require('../helpers/largeLibraryFixture');

const sizes = (process.env.PERF_SIZES || '1000,10000,50000').split(',').map(Number);
const samples = Number(process.env.PERF_SAMPLES || 5);
const shapes = (process.env.PERF_SHAPES || 'small-board,large-board').split(',');
const label = process.env.PERF_LABEL || 'diagnostic';
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();

for (const size of sizes) for (const shape of shapes) {
    for (let sample = 0; sample < samples; sample++) test(`${label} ${shape} ${size} sample ${sample + 1}`, async ({context, extensionId}, info) => {
        const page = await context.newPage(), errors = [], metrics = {};
        const requested = new Set();
        page.on('request', request => {
            const url = new URL(request.url());
            if (url.protocol === 'chrome-extension:') requested.add(url.pathname.slice(1));
        });
        const resourceFiles = () => [...requested].filter(file => /\.(js|css|wasm)$/.test(file)).map(file => {
            const root = path.resolve(process.env.WORKSPACE_EXTENSION_PATH || 'dist');
            const filename = path.resolve(root, file);
            return {file, sourceBytes: filename.startsWith(root + path.sep) && fs.existsSync(filename) ? fs.statSync(filename).size : null};
        });
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({width: 1584, height: 1024});
        await page.addInitScript(() => {
            if (location.protocol !== 'chrome-extension:') return;
            localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';
        });
        const url = `chrome-extension://${extensionId}/newtab.html`;
        await page.goto(url);
        await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
        await expect(page.getByRole('region', {name: 'Browser OS boards', exact: true})).toBeVisible();
        // Unmount the workspace while seeding so its subscriptions do not render
        // a growing library after each setup-only batch.
        await page.reload();
        await seedLargeLibrary(page, makeLargeLibraryFixture(size, shape));
        // Fresh renderer after seeding; browser/OS disk caches may already be warm.
        await page.goto('about:blank');
        requested.clear();
        const measure = async (name, action) => {
            const start = performance.now();
            try {await action(); metrics[name] = {ms: performance.now() - start, ok: true};}
            catch (error) {metrics[name] = {ms: performance.now() - start, ok: false, error: error.message}; throw error;}
        };
        try {
            await measure('startup', async () => {
                await page.goto(url);
                await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
                await expect(page.locator('.workspaceTitlebar')).toContainText('Performance board');
                await expect(page.locator('.workspaceNotice')).not.toContainText('Loading');
            });
            metrics.initial = await page.evaluate(() => ({nodes: document.getElementsByTagName('*').length,
                rows: document.querySelectorAll('.workspaceExplorer__tree [role="treeitem"]').length,
                heapBytes: performance.memory?.usedJSHeapSize ?? null,
                resources: performance.getEntriesByType('resource').map(r => ({name: r.name.split('/').pop(), bytes: r.decodedBodySize}))}));
            metrics.initial.requestedFiles = resourceFiles();
            await measure('brainOpen', async () => {
                await page.getByRole('button', {name: 'Brain', exact: true}).click();
                await expect(page.locator('.brainTable tbody tr')).toHaveCount(50);
            });
            const brain = page.getByRole('region', {name: 'Unified Brain', exact: true});
            const firstId = await brain.locator('tbody tr').first().getAttribute('data-entity-id');
            await measure('nextPage', async () => {
                await brain.getByRole('navigation', {name: 'Object pages', exact: true}).getByRole('button', {name: 'Next page', exact: true}).click();
                await expect(brain.locator('tbody tr').first()).not.toHaveAttribute('data-entity-id', firstId);
            });
            await measure('search', async () => {
                await brain.getByLabel('Find objects', {exact: true}).fill('000051');
                await expect(brain.locator('tbody tr')).toHaveCount(1);
                await expect(brain.locator('tbody tr')).toHaveAttribute('data-entity-id', 'perf:object:000051');
            });
            await measure('scroll', async () => {
                await page.locator('.workspaceExplorer').hover();
                await page.mouse.wheel(0, 1200);
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            });
            if (shape === 'small-board' || process.env.PERF_LARGE_EDITOR === '1') await measure('editorOpen', async () => {
                await page.getByRole('button', {name: 'Workspace', exact: true}).click();
                await expect(page.getByRole('region', {name: 'AFFiNE workspace', exact: true})).toBeVisible();
                await expect(page.locator('workspace-reference-block').first()).toBeVisible();
            });
            else metrics.editorOpen = {ok: null, reason: 'Separate opt-in stress probe: baseline 1000-card editor stalled, including browser teardown.'};
            metrics.final = await page.evaluate(() => ({nodes: document.getElementsByTagName('*').length,
                heapBytes: performance.memory?.usedJSHeapSize ?? null,
                resources: performance.getEntriesByType('resource').map(r => ({name: r.name.split('/').pop(), bytes: r.decodedBodySize}))}));
            metrics.final.requestedFiles = resourceFiles();
            await page.screenshot({path: info.outputPath('workspace.png')});
            expect(errors).toEqual([]);
        } finally {
            const result = {label, revision, size, shape, sample, browser: context.browser()?.version(),
                viewport: {width: 1584, height: 1024}, metrics, errors};
            console.log('PERF_RESULT ' + JSON.stringify(result));
            await info.attach('metrics', {body: JSON.stringify(result, null, 2), contentType: 'application/json'});
        }
    });
}
