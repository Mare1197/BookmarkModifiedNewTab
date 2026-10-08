const {performance} = require('node:perf_hooks');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {expect, test} = require('../e2e/fixtures');
const {makeSearchIndexFixture, seedLargeLibrary, readSearchIndexState, waitForSearchIndex} = require('../helpers/largeLibraryFixture');

const sizes = (process.env.PERF_SIZES || '1000,10000,50000').split(',').map(Number);
const shapes = (process.env.PERF_SHAPES || 'small-board,large-board').split(',');
const samples = Number(process.env.PERF_SAMPLES || 5), label = process.env.PERF_LABEL || 'local-search';
const harnessRevision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const revision = process.env.PERF_REVISION || harnessRevision;
const workingTreeDirty = Boolean(execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim());
const artifactRoot = path.resolve(process.env.WORKSPACE_EXTENSION_PATH || 'dist');
function digest(root) {
    const hash = createHash('sha256');
    const walk = directory => {for (const entry of fs.readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) {hash.update(path.relative(root, file).replaceAll('\\', '/')); hash.update(fs.readFileSync(file));}
    }};
    walk(root); return hash.digest('hex');
}
const artifactDigest = digest(artifactRoot);
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20) throw new Error('Invalid sample count');

for (const size of sizes) for (const shape of shapes) for (let sample = 0; sample < samples; sample++) {
    test(`${label} search ${shape} ${size} sample ${sample + 1}`, async ({context, extensionId}, info) => {
        test.setTimeout(900000);
        const page = await context.newPage(), metrics = {}, errors = [], requested = new Set();
        const fixture = makeSearchIndexFixture(size, shape), url = `chrome-extension://${extensionId}/newtab.html`;
        page.on('pageerror', error => errors.push(error.message));
        context.on('request', request => {const parsed = new URL(request.url()); if (parsed.protocol === 'chrome-extension:' && parsed.host === extensionId) requested.add(parsed.pathname.slice(1));});
        page.on('worker', worker => requested.add(new URL(worker.url()).pathname.slice(1)));
        await page.setViewportSize({width: 1584, height: 1024});
        await page.addInitScript(() => {
            if (location.protocol !== 'chrome-extension:') return;
            localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';
            window.perfWorkerPages = [];
            const NativeWorker = window.Worker;
            window.Worker = class extends NativeWorker {
                constructor(...args) {
                    super(...args); const queries = new Map();
                    const post = this.postMessage.bind(this);
                    this.postMessage = (message, ...rest) => {if (message.type === 'query') queries.set(message.requestId, message.query.text); post(message, ...rest);};
                    this.addEventListener('message', ({data}) => {
                        if (data.type === 'page') window.perfWorkerPages.push({text: queries.get(data.requestId), ids: data.page.items.map(item => item.id),
                            scanned: data.page.scanned, indexed: data.page.searchGeneration !== undefined, hasMore: data.page.hasMore});
                        if (['page', 'error', 'cancelled'].includes(data.type)) queries.delete(data.requestId);
                    });
                }
            };
        });
        const measure = async (name, action) => {
            const start = performance.now();
            try {const value = await action(); metrics[name] = {ms: performance.now() - start, ok: true, value}; return value;}
            catch (error) {metrics[name] = {ms: performance.now() - start, ok: false, error: error.message}; throw error;}
        };
        const open = async () => {
            await page.goto(url);
            await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
            await expect(page.locator('.workspaceTitlebar')).toBeVisible();
        };
        const panel = () => page.getByRole('complementary', {name: 'Local search indexing'});
        const searchPanel = async () => {await page.getByRole('button', {name: 'Search', exact: true}).click(); await expect(panel()).toBeVisible();};
        const brain = () => page.getByRole('region', {name: 'Unified Brain', exact: true});
        const brainOpen = async () => {await page.getByRole('button', {name: 'Brain', exact: true}).click(); await expect(brain().locator('tbody tr')).toHaveCount(50);};
        const query = async (text, expectedCount, expectedId, expectedIndexed) => {
            await page.evaluate(() => {window.perfWorkerPages = [];});
            await brain().getByLabel('Find objects', {exact: true}).fill(text);
            await expect(brain().getByRole('navigation', {name: 'Object pages'}).getByRole('status')).toHaveCount(0);
            await expect(brain().locator('tbody tr')).toHaveCount(expectedCount);
            if (expectedId) await expect(brain().locator('tbody tr')).toHaveAttribute('data-entity-id', expectedId);
            const response = await page.waitForFunction(({text, expectedIndexed}) => window.perfWorkerPages.findLast(item => item.text === text && item.indexed === expectedIndexed),
                {text, expectedIndexed}, {timeout: 60000});
            const result = await response.jsonValue(); await response.dispose();
            if (expectedId) expect(result.ids).toEqual([expectedId]);
            return result;
        };
        try {
            await measure('initialSetup', async () => {await open(); await searchPanel(); await panel().getByRole('button', {name: 'Pause', exact: true}).click();
                await expect(panel().getByRole('status')).toContainText('Paused'); await page.reload();});
            await measure('fixtureSetup', () => seedLargeLibrary(page, fixture.data, (table, count) => console.log(`SEARCH_SETUP ${size} ${shape} ${sample + 1} ${table} ${count}`)));
            await measure('freshDocumentStartup', async () => {await page.goto('about:blank'); await open(); await expect(page.locator('.workspaceTitlebar')).toContainText('Performance board');});
            metrics.incomplete = await readSearchIndexState(page);
            expect(metrics.incomplete.status).toBe('paused'); expect(metrics.incomplete.scanComplete).toBe(false);
            metrics.storageBefore = await page.evaluate(() => navigator.storage.estimate());
            await brainOpen();
            await measure('incompleteScannerSelective', () => query(fixture.selectiveText, 1, fixture.selectiveEntityId, false));
            await searchPanel();
            await page.evaluate(() => {
                const stats = {frames: 0, totalMs: 0, maxMs: 0, over50ms: 0, longTasks: 0, longTaskMs: 0}; let last, stopped = false;
                const frame = now => {if (stopped) return; if (last !== undefined) {const ms = now - last; stats.frames++; stats.totalMs += ms;
                    stats.maxMs = Math.max(stats.maxMs, ms); if (ms > 50) stats.over50ms++;} last = now; requestAnimationFrame(frame);};
                requestAnimationFrame(frame);
                const observer = new PerformanceObserver(entries => {for (const entry of entries.getEntries()) {stats.longTasks++; stats.longTaskMs += entry.duration;}});
                observer.observe({type: 'longtask'});
                window.stopPerfFrames = () => {stopped = true; observer.disconnect(); return stats;};
            });
            await measure('coldRebuild', async () => {
                await panel().getByRole('button', {name: 'Rebuild', exact: true}).click();
                await measure('inputWhileBuilding', async () => {
                    const box = page.getByRole('region', {name: 'Unified local search'}).getByRole('textbox');
                    await box.fill('zz'); await expect(box).toHaveValue('zz');
                    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                });
                return waitForSearchIndex(page, {afterEpoch: metrics.incomplete.epoch, timeoutMs: 600000});
            });
            metrics.rebuildResponsiveness = await page.evaluate(() => window.stopPerfFrames());
            await brainOpen(); await measure('readySelective', () => query(fixture.selectiveText, 1, fixture.selectiveEntityId, true));
            const beforeEdit = await readSearchIndexState(page);
            await brain().getByRole('button', {name: fixture.data.entities[51].title, exact: true}).click();
            const inspector = page.getByRole('complementary', {name: 'Inspector'});
            await inspector.getByLabel('Title', {exact: true}).fill('Edited performance object 000051');
            await measure('singleEditCatchUp', async () => {
                await inspector.getByRole('button', {name: 'Save', exact: true}).click();
                return waitForSearchIndex(page, {minGeneration: beforeEdit.generation + 1, timeoutMs: 120000});
            });
            await measure('readyBroad', () => query('research', 50, undefined, size <= 5000));
            await measure('readyShortFallback', () => query('qq', 0, undefined, false));
            metrics.storageAfter = await page.evaluate(() => navigator.storage.estimate());
            metrics.derivedSerialization = await measure('derivedStorageDiagnostic', () => page.evaluate(() => new Promise((resolve, reject) => {
                const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result, tx = db.transaction('searchDocuments'), cursor = tx.objectStore('searchDocuments').openCursor();
                    const encoder = new TextEncoder(); let records = 0, jsonBytes = 0;
                    cursor.onsuccess = () => {if (cursor.result) {records++; jsonBytes += encoder.encode(JSON.stringify(cursor.result.value)).length; cursor.result.continue();}};
                    tx.oncomplete = () => {db.close(); resolve({records, jsonBytes, excludesIdbIndexes: true});};
                    tx.onabort = () => {db.close(); reject(tx.error);};
                };
            })));
            metrics.final = await page.evaluate(() => ({nodes: document.getElementsByTagName('*').length,
                mainHeapBytes: performance.memory?.usedJSHeapSize ?? null, excludesWorkerHeap: true}));
            metrics.requestedFiles = [...requested].filter(file => /\.(js|css|wasm)$/.test(file)).map(file => {
                const absolute = path.resolve(artifactRoot, file);
                return {file, sourceBytes: absolute.startsWith(artifactRoot + path.sep) && fs.existsSync(absolute) ? fs.statSync(absolute).size : null};
            });
            metrics.resourceScope = 'Observed workspace/worker requests; extension background startup can precede observation. Source bytes are not transfer or heap bytes.';
            expect(errors).toEqual([]); expect(digest(artifactRoot)).toBe(artifactDigest);
        } finally {
            const result = {label, revision, harnessRevision, workingTreeDirty, artifactDigest, size, shape, sample,
                browser: context.browser()?.version(), viewport: {width: 1584, height: 1024}, metrics, errors};
            console.log('SEARCH_RESULT ' + JSON.stringify(result));
            await info.attach('metrics', {body: JSON.stringify(result, null, 2), contentType: 'application/json'});
        }
    });
}
