const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {chromium, expect} = require('@playwright/test');
const {makeNativeBoardFixture} = require('./nativeBoardFixture');
const {seedLargeLibrary, makeLargeLibraryFixture} = require('./largeLibraryFixture');

process.once('message', async options => {
    const metrics = {}, errors = []; let context;
    const measure = async (name, action) => {
        const start = performance.now();
        try {const value = await action(); metrics[name] = {ms: performance.now() - start, ok: true, value};
            process.send({type: 'progress', metrics}); return value;}
        catch (error) {metrics[name] = {ms: performance.now() - start, ok: false, error: error.message}; throw error;}
    };
    let ok = false;
    try {
        context = await chromium.launchPersistentContext(options.profilePath, {channel: 'chromium', headless: true,
            viewport: {width: 1584, height: 1024}, args: [`--disable-extensions-except=${path.resolve(options.extensionPath)}`,
                `--load-extension=${path.resolve(options.extensionPath)}`]});
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        const page = await context.newPage(), url = `chrome-extension://${worker.url().split('/')[2]}/newtab.html`;
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
            if (location.protocol !== 'chrome-extension:') return;
            localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';
            window.nativeProbeStats = {longTasks: 0, longTaskMs: 0, reads: {}, firstReferenceAt: null, firstPaneAt: null};
            const observer = new PerformanceObserver(list => {for (const item of list.getEntries()) {
                window.nativeProbeStats.longTasks++; window.nativeProbeStats.longTaskMs += item.duration;
            }}); observer.observe({type: 'longtask'});
            for (const method of ['get', 'getAll', 'openCursor']) {
                const original = IDBObjectStore.prototype[method];
                IDBObjectStore.prototype[method] = function (...args) {
                    const key = this.name + ':' + method;
                    window.nativeProbeStats.reads[key] = (window.nativeProbeStats.reads[key] || 0) + 1;
                    return original.apply(this, args);
                };
            }
            document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
                const stats = window.nativeProbeStats;
                if (stats.firstReferenceAt === null && document.querySelector('workspace-reference-block')) stats.firstReferenceAt = performance.now();
                if (stats.firstPaneAt === null && document.querySelector('.brainNativePane')) stats.firstPaneAt = performance.now();
            }).observe(document.body, {childList: true, subtree: true}));
        });
        const open = async () => {await page.goto(url); await page.frameLocator('iframe[title="Browser OS desktop"]')
            .getByRole('button', {name: 'Boards', exact: true}).click(); await expect(page.locator('.workspaceTitlebar')).toBeVisible();};
        await open();
        await page.getByRole('button', {name: 'Search', exact: true}).click();
        const panel = page.getByRole('complementary', {name: 'Local search indexing'});
        await panel.getByRole('button', {name: 'Pause', exact: true}).click();
        await expect(panel.getByRole('status')).toContainText('Paused');
        await page.goto('about:blank'); await page.goto(url);
        const fixture = makeNativeBoardFixture(options.referenceCount, options.mode);
        if (options.librarySize) {
            const unrelated = makeLargeLibraryFixture(options.librarySize, 'small-board');
            for (const name of Object.keys(unrelated)) fixture.data[name] = [...(fixture.data[name] || []), ...unrelated[name]];
        }
        // Assets must cross the automation boundary as bytes, then become real Blobs.
        const assets = fixture.data.assets; delete fixture.data.assets;
        await measure('fixtureSetup', async () => {
            await seedLargeLibrary(page, fixture.data);
            await page.evaluate(assets => new Promise((resolve, reject) => {
                const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
                request.onsuccess = () => {const db = request.result, tx = db.transaction('assets', 'readwrite');
                    for (const {bytes, ...asset} of assets) tx.objectStore('assets').put({...asset, blob: new Blob([new Uint8Array(bytes)], {type: asset.mimeType})});
                    tx.oncomplete = () => {db.close(); resolve();}; tx.onabort = () => {db.close(); reject(tx.error);};};
            }), assets);
        });
        await measure('freshDocumentStartup', open);
        await page.getByRole('navigation', {name: 'Boards', exact: true}).getByRole('button').filter({hasText: 'Native performance board'}).click();
        await expect(page.locator('.workspaceTitlebar')).toContainText('Native performance board');
        metrics.browser = context.browser()?.version(); metrics.viewport = page.viewportSize();
        const ws = page.getByRole('region', {name: 'AFFiNE workspace'});
        await page.evaluate(() => {window.nativeProbeStart = performance.now(); window.nativeProbeStats.longTasks = 0; window.nativeProbeStats.longTaskMs = 0; window.nativeProbeStats.reads = {};});
        await measure('workspaceReady', async () => {
            await page.getByRole('button', {name: 'Workspace', exact: true}).click();
            await expect(ws.getByRole('status').first()).toHaveText('saved', {timeout: 120000});
            await expect(ws.locator('workspace-reference-block').first()).toBeVisible();
        });
        const editable = ws.locator('[data-placement-id="native:placement:0"] [contenteditable="true"]').first();
        await measure('initialVisibleContentReady', async () => {
            await expect(editable).toBeVisible({timeout: 30000});
            await expect.poll(() => ws.locator('.affineNativeHost').evaluate(host => Number(host.dataset.nativeContentLoading))).toBe(0);
        });
        metrics.render = await page.evaluate(expected => {
            const editors = [...document.querySelectorAll('page-editor,edgeless-editor')];
            const doc = editors[0]?.doc;
            const blocks = doc ? [...doc.getBlocks()] : [];
            const references = blocks.filter(block => block.flavour === 'affine:embed-workspace-object');
            const surface = blocks.find(block => block.flavour === 'affine:surface');
            const byPlacement = new Map(references.map(block => [block.placementId, block]));
            const host = document.querySelector('.affineNativeHost');
            return {stats: window.nativeProbeStats, startedAt: window.nativeProbeStart,
                modelReferences: references.length, distinctNativeDocs: new Set(editors.map(editor => editor.doc.id)).size,
                completeIdentityAndGeometry: expected.every(p => {
                    const ref = byPlacement.get(p.id), note = ref && doc.getParent(ref);
                    return ref?.entityId === p.entityId && note?.xywh === JSON.stringify([p.x, p.y, p.width, p.height]);
                }),
                nativeSurfaceConnectors: surface?.getElementsByType('connector').length ?? null,
                nativeGroups: surface?.getElementsByType('group').length ?? null,
                contentLoading: Number(host?.dataset.nativeContentLoading), hydratedResources: Number(host?.dataset.nativeContentHydrated),
                peakContentLoading: Number(host?.dataset.nativeContentPeak),
                projectionMeasures: performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('native-workspace:'))
                    .map(entry => ({phase: entry.name, ms: entry.duration})),
                renderedReferences: document.querySelectorAll('workspace-reference-block').length,
                richEditors: document.querySelectorAll('.brainReferenceContent [contenteditable="true"]').length,
                images: document.querySelectorAll('.brainReferenceContent img').length,
                rawLayerConnectorEntries: document.querySelector('affine-edgeless-root')?.service.elements.filter(e => e.type === 'connector').length ?? null,
                modelConnectors: document.querySelector('affine-edgeless-root') ? new Set(document.querySelector('affine-edgeless-root').service.elements.filter(e => e.type === 'connector').map(e => e.id)).size : null,
                connectorIds: document.querySelector('affine-edgeless-root')?.service.elements.filter(e => e.type === 'connector').map(e => e.id) ?? [],
                mainHeapBytes: performance.memory?.usedJSHeapSize ?? null, excludesWorkerHeap: true};
        }, fixture.data.placements.filter(placement => placement.boardId === fixture.boardId));
        expect(metrics.render.modelReferences).toBe(options.referenceCount);
        expect(metrics.render.completeIdentityAndGeometry).toBe(true); expect(metrics.render.distinctNativeDocs).toBe(1);
        expect(metrics.render.nativeSurfaceConnectors).toBe(Math.ceil((options.referenceCount - 1) / 10));
        expect(metrics.render.nativeGroups).toBe(2); expect(metrics.render.peakContentLoading).toBeGreaterThan(0);
        expect(metrics.render.peakContentLoading).toBeLessThanOrEqual(4);
        expect(metrics.render.hydratedResources).toBeLessThan(options.referenceCount * (options.mode === 'mixed' ? 2 : 1));
        if (options.mode !== 'document') expect(metrics.render.modelConnectors).toBe(Math.ceil((options.referenceCount - 1) / 10));
        await measure('firstUsableEdit', async () => {await editable.fill('Native probe saved edit');});
        await measure('save', async () => {await ws.getByRole('button', {name: 'Save now', exact: true}).click();
            await expect(ws.getByRole('status').first()).toHaveText('saved');});
        await measure('canonicalEditVerified', async () => {const handle = await page.waitForFunction(() => new Promise((resolve, reject) => {
            const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
            request.onsuccess = () => {const db = request.result, tx = db.transaction('entities');
                const read = tx.objectStore('entities').get('native:object:00000');
                read.onsuccess = () => {db.close(); resolve(JSON.stringify(read.result?.richContent).includes('Native probe saved edit'));};};
        })); await handle.dispose(); return true;});
        // Explicit reveal is a separate phase; deferred offscreen content is
        // intentionally absent at initial readiness, unlike the frozen baseline.
        await measure('revealMixedContentKinds', async () => {
            const scope = ws.locator(options.mode === 'canvas' ? 'edgeless-editor' : 'page-editor');
            for (const index of [1, 2, 3]) {
                const card = scope.locator(`[data-placement-id="native:placement:${index}"]`);
                if (options.mode === 'canvas') await page.locator('affine-edgeless-root').evaluate((root, i) =>
                    root.service.viewport.setViewport(1, [i * 400 + 170, 110]), index);
                else await card.scrollIntoViewIfNeeded();
                if (index === 1) await expect(card).toContainText('Message 2 for 1');
                if (index === 2) await expect(card.getByLabel('Task status')).toBeAttached();
                if (index === 3) {
                    try {await expect(card.locator('img')).toBeAttached();}
                    catch (error) {
                        metrics.revealFailure = await page.evaluate(() => {
                            const root = document.querySelector('affine-edgeless-root'), viewport = root?.service.viewport;
                            const cards = [...document.querySelectorAll('[data-placement-id="native:placement:3"]')];
                            const block = root?.doc.getBlocks().find(b => b.flavour === 'affine:embed-workspace-object' && b.placementId === 'native:placement:3');
                            return {camera: viewport && {center: {...viewport.center}, width: viewport.width, height: viewport.height, zoom: viewport.zoom},
                                geometry: block && root.doc.getParent(block)?.xywh,
                                cards: cards.map(node => ({hydrated: node.dataset.hydrated, hidden: node.querySelector('.brainReferenceBody')?.hidden,
                                    text: node.textContent, html: node.querySelector('.brainReferenceBody')?.innerHTML.slice(0, 1000), rect: node.getBoundingClientRect().toJSON()})),
                                host: {...document.querySelector('.affineNativeHost')?.dataset}, stats: window.nativeProbeStats};
                        });
                        throw error;
                    }
                }
            }
            return true;
        });
        if (options.mode !== 'document') {
            await page.locator('affine-edgeless-root').evaluate(root => root.service.viewport.setViewport(1, [400, 200]));
            await expect.poll(() => ws.locator('.affineNativeHost').evaluate(host => Number(host.dataset.nativeContentLoading))).toBe(0);
            await ws.getByRole('button', {name: 'Save now', exact: true}).click();
            await expect(ws.getByRole('status').first()).toHaveText('saved');
        }
        if (options.mode !== 'document') await measure('nativeCameraPan', () => page.locator('affine-edgeless-root').evaluate(async root => {
            const viewport = root.service.viewport, {x, y} = viewport.center;
            viewport.setCenter(x + 100, y + 100);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return {x: viewport.center.x, y: viewport.center.y};
        }));
        await measure('offscreenResourceRelease', async () => {
            const canvas = options.mode !== 'document';
            if (canvas) await page.locator('affine-edgeless-root').evaluate((root, count) =>
                root.service.viewport.setViewport(1, [3600, (Math.ceil(count / 10) - 1) * 300 + 110]), options.referenceCount);
            else await ws.locator(`[data-placement-id="native:placement:${options.referenceCount - 1}"]`).scrollIntoViewIfNeeded();
            const editor = ws.locator(canvas ? 'edgeless-editor' : 'page-editor');
            await expect(editor.locator('[data-placement-id="native:placement:1"]')).toHaveAttribute('data-hydrated', 'false');
            await expect.poll(() => ws.locator('.affineNativeHost').evaluate(host => Number(host.dataset.nativeContentLoading))).toBe(0);
            return ws.locator('.affineNativeHost').evaluate(host => ({loading: Number(host.dataset.nativeContentLoading),
                hydrated: Number(host.dataset.nativeContentHydrated), peak: Number(host.dataset.nativeContentPeak)}));
        });
        expect(metrics.offscreenResourceRelease.value.peak).toBeLessThanOrEqual(4);
        await measure('postPanSave', async () => {
            await ws.getByRole('button', {name: 'Save now', exact: true}).click();
            await expect(ws.getByRole('status').first()).toHaveText('saved'); return true;
        });
        metrics.completeAfterReveal = await ws.locator('page-editor,edgeless-editor').first().evaluate(editor => ({
            references: editor.doc.getBlocks().filter(block => block.flavour === 'affine:embed-workspace-object').length,
            connectors: editor.doc.getBlocks().find(block => block.flavour === 'affine:surface').getElementsByType('connector').length
        }));
        expect(metrics.completeAfterReveal).toEqual({references: options.referenceCount, connectors: Math.ceil((options.referenceCount - 1) / 10)});
        metrics.requestedReferences = options.referenceCount; metrics.librarySize = options.librarySize || 0;
        metrics.measurementScope = 'workspaceReady retains the baseline definition: canonical loading, import, projection and native shell/controller readiness. Initial visible content is measured separately before initial resource capture/edit/save. Mixed content kinds are explicitly revealed later; this replaces the old eager firstMixedContentReady phase and is not a directly comparable latency. Projection measures are elapsed wall time, not CPU. Read counts count requests, not returned rows. Heap excludes worker. Pan starts from restored initial camera.';
        ok = errors.length === 0;
    } catch (error) {errors.push(error.stack || error.message);}
    process.send({type: 'result', result: {ok, metrics, errors}});
    try {await context?.close();} catch (error) {process.exitCode = 1; console.error(error.message);}
    process.disconnect();
});
