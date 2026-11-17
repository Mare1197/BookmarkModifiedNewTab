const {test, expect} = require('./fixtures');
const {makeNativeBoardFixture, seedNativeBoardFixture} = require('../helpers/nativeBoardFixture');

async function openFixture(context, extensionId, mode, measureIndexes = false) {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    await page.addInitScript(measure => {
        localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';
        if (!measure) return;
        window.nativeMountedIndexUpdates = 0; const observed = new WeakSet();
        new MutationObserver(() => {
            for (const editor of document.querySelectorAll('page-editor,edgeless-editor')) {
                const doc = editor.doc; if (!doc || observed.has(doc)) continue; observed.add(doc);
                doc.slots.blockUpdated.on(event => {
                    if (event.type === 'update' && event.props.key === 'index' && doc.getBlockById(event.id)?.flavour === 'affine:note') window.nativeMountedIndexUpdates++;
                });
            }
        }).observe(document, {childList: true, subtree: true});
    }, measureIndexes);
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    const boards = () => page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await boards(); await expect(page.locator('.workspaceTitlebar')).toBeVisible(); await page.reload();
    await seedNativeBoardFixture(page, makeNativeBoardFixture(50, mode)); await page.reload(); await boards();
    await page.getByRole('navigation', {name: 'Boards', exact: true}).getByRole('button').filter({hasText: 'Native performance board'}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    const ws = page.getByRole('region', {name: 'AFFiNE workspace'});
    await expect(ws.getByRole('status').first()).toHaveText('saved', {timeout: 30000});
    return {page, ws};
}
for (const mode of ['document', 'canvas', 'mixed']) test(`native ${mode} keeps complete models but defers offscreen content`, async ({context, extensionId}) => {
    const {page, ws} = await openFixture(context, extensionId, mode);
    const first = ws.locator('[data-placement-id="native:placement:0"] .brainRichBlock').first();
    await expect(first).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const model = await ws.locator('page-editor,edgeless-editor').first().evaluate(editor => ({
        references: editor.doc.getBlocks().filter(block => block.flavour === 'affine:embed-workspace-object').length,
        notes: editor.doc.getBlocks().filter(block => block.flavour === 'affine:note').length
    }));
    expect(model).toEqual({references: 50, notes: 50});
    await expect(ws.locator('[data-placement-id="native:placement:49"] .brainRichBlock')).toHaveCount(0);
    expect(await ws.locator('.brainRichBlock').count()).toBeLessThan(mode === 'mixed' ? 40 : 20);
    const host = ws.locator('.affineNativeHost');
    await expect.poll(async () => Number(await host.getAttribute('data-native-content-loading'))).toBe(0);
    const peak = Number(await host.getAttribute('data-native-content-peak'));
    expect(peak).toBeGreaterThan(0); expect(peak).toBeLessThanOrEqual(4);
    expect(Number(await host.getAttribute('data-native-content-hydrated'))).toBeLessThan(mode === 'mixed' ? 100 : 50);
});

test('dirty rich-text resource survives actual native disconnect and reconnect', async ({context, extensionId}) => {
    const {page, ws} = await openFixture(context, extensionId, 'document');
    const card = ws.locator('[data-placement-id="native:placement:0"]');
    await card.locator('[contenteditable="true"]').first().fill('Draft retained across native disconnect');
    const retained = await card.evaluate(element => {
        const block = element.closest('workspace-reference-block'), parent = block.parentElement;
        const editor = element.querySelector('rich-text'); block.remove(); parent.append(block);
        return new Promise(resolve => queueMicrotask(() => resolve(editor === block.querySelector('rich-text'))));
    });
    expect(retained).toBe(true);
    await expect(card.locator('[contenteditable="true"]').first()).toContainText('Draft retained across native disconnect');
    await ws.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect(ws.getByRole('status').first()).toHaveText('saved');
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Workspace', exact: true}).click();
    await expect(ws.locator('[data-placement-id="native:placement:0"]')).toContainText('Draft retained across native disconnect');
});

test('pan hydrates new cards and same-count cross-tab metadata preserves native camera and all connectors', async ({context, extensionId}) => {
    const {page, ws} = await openFixture(context, extensionId, 'canvas');
    await expect(ws.locator('[data-placement-id="native:placement:0"] .brainRichBlock')).toBeVisible();
    const editor = ws.locator('edgeless-editor'), root = ws.locator('affine-edgeless-root');
    await editor.evaluate(node => {window.beforeWindowingFit = node;});
    await ws.getByRole('button', {name: 'Fit cards', exact: true}).click();
    await expect.poll(() => editor.evaluate(node => node !== window.beforeWindowingFit)).toBe(true);
    await expect(ws.getByRole('status').first()).toHaveText('saved');
    await editor.evaluate(node => {window.windowingEditor = node; window.windowingDoc = node.doc;});
    await root.evaluate(node => node.service.viewport.setViewport(1, [3600, 1200]));
    await expect(ws.locator('[data-placement-id="native:placement:49"] .brainRichBlock')).toBeVisible();
    await expect(ws.locator('[data-placement-id="native:placement:0"] .brainRichBlock')).toHaveCount(0);
    await ws.getByRole('button', {name: 'Save now', exact: true}).click();
    await expect(ws.getByRole('status').first()).toHaveText('saved');
    expect(await editor.evaluate(node => node === window.windowingEditor && node.doc === window.windowingDoc)).toBe(true);
    const camera = await root.evaluate(node => ({...node.service.viewport.center, zoom: node.service.viewport.zoom}));
    const other = await context.newPage(); await other.goto(`chrome-extension://${extensionId}/newtab.html`);
    // Use a real app writer so the canonical Dexie change notification is sent.
    await other.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await other.getByRole('navigation', {name: 'Boards', exact: true}).getByRole('button').filter({hasText: 'Native performance board'}).click();
    await other.getByRole('button', {name: 'Workspace', exact: true}).click();
    const otherWs = other.getByRole('region', {name: 'AFFiNE workspace'});
    await expect(otherWs.getByRole('status').first()).toHaveText('saved');
    await otherWs.locator('[data-placement-id="native:placement:49"] strong').click();
    const inspector = other.getByRole('complementary', {name: 'Inspector'});
    await inspector.getByLabel('Title', {exact: true}).fill('External unchanged-count title');
    await inspector.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(ws.locator('[data-placement-id="native:placement:49"] strong')).toHaveText('External unchanged-count title');
    expect(await editor.evaluate(node => node === window.windowingEditor && node.doc === window.windowingDoc)).toBe(true);
    expect(await root.evaluate(node => ({...node.service.viewport.center, zoom: node.service.viewport.zoom}))).toEqual(camera);
    const ids = await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {const db = request.result, tx = db.transaction('settings'), get = tx.objectStore('settings').get('workspace-page:native:board');
            get.onsuccess = () => resolve(get.result.value.connectors.map(connector => connector.id)); tx.oncomplete = () => db.close();};
    }));
    expect(ids).toEqual(['native:connector:0', 'native:connector:10', 'native:connector:20', 'native:connector:30', 'native:connector:40']);
    await other.getByRole('button', {name: 'Return to desktop', exact: true}).click();
    await expect(otherWs).not.toBeVisible(); await other.close();
});

test('an offscreen dirty note keeps its editor and supports reviewed conflict recovery', async ({context, extensionId}) => {
    test.setTimeout(90000);
    const {page, ws} = await openFixture(context, extensionId, 'canvas');
    const card = ws.locator('[data-placement-id="native:placement:0"]'), editable = card.locator('[contenteditable="true"]').first();
    await expect(editable).toBeVisible();
    await card.evaluate(node => {window.offscreenDraftEditor = node.querySelector('rich-text');});
    await page.evaluate(() => new Promise((resolve, reject) => {
        window.holdOffscreenWriter = true; window.offscreenWriterCommitted = false;
        const request = indexedDB.open('browserOsWorkspace'); request.onerror = () => reject(request.error);
        request.onsuccess = () => {const db = request.result, tx = db.transaction('entities', 'readwrite'), store = tx.objectStore('entities');
            const get = store.get('native:object:00000'); get.onsuccess = () => {
                const write = store.put({...get.result, contentRevision: (get.result.contentRevision || 0) + 1});
                const hold = () => {const read = store.get('native:object:00000'); read.onsuccess = () => {if (window.holdOffscreenWriter) hold();};};
                write.onsuccess = () => {hold(); resolve();};
            };
            tx.oncomplete = () => {window.offscreenWriterCommitted = true; db.close();};
            tx.onabort = () => {db.close(); reject(tx.error);};
        };
    }));
    try {await editable.fill('Offscreen conflict draft survives');}
    finally {await page.evaluate(() => {window.holdOffscreenWriter = false;});}
    await expect.poll(() => page.evaluate(() => window.offscreenWriterCommitted)).toBe(true);
    await expect(ws.getByRole('status').first()).toContainText('conflict');
    await ws.locator('affine-edgeless-root').evaluate(node => node.service.viewport.setViewport(1, [3600, 1200]));
    await expect(card).not.toBeInViewport();
    expect(await card.evaluate(node => node.querySelector('rich-text') === window.offscreenDraftEditor)).toBe(true);
    await expect(card).toContainText('Offscreen conflict draft survives');
    await page.getByRole('button', {name: 'Recovery', exact: true}).click();
    await page.locator('.recoveryRow').filter({hasText: 'entity · native:object:00000'}).getByRole('button', {name: 'Preview draft', exact: true}).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: 'Use draft', exact: true}).click();
    await page.getByRole('button', {name: 'Close recovery', exact: true}).click();
    await expect(ws.getByRole('status').first()).toHaveText('saved');
    await ws.locator('affine-edgeless-root').evaluate(node => node.service.viewport.setViewport(1, [400, 200]));
    await expect(card.locator('[contenteditable="true"]').first()).toContainText('Offscreen conflict draft survives');
});

test('native note editing decoration cannot feed back into canonical card height', async ({context, extensionId}) => {
    const {ws} = await openFixture(context, extensionId, 'canvas');
    const heights = await ws.locator('affine-edgeless-root').evaluate(async root => {
        const note = root.doc.getBlocks().find(block => block.flavour === 'affine:note'), before = JSON.parse(note.xywh)[3];
        root.service.selection.set({elements: [note.id], editing: true});
        const samples = [];
        for (let i = 0; i < 12; i++) {await new Promise(resolve => requestAnimationFrame(resolve)); samples.push(JSON.parse(note.xywh)[3]);}
        root.service.selection.clear();
        return {before, samples};
    });
    expect(heights.samples).toEqual(Array(12).fill(heights.before));
});

test('collapsed clean cards retain quick actions without constructing hidden rich editors', async ({context, extensionId}) => {
    const {ws} = await openFixture(context, extensionId, 'canvas');
    await ws.getByText('Pages and layout controls', {exact: true}).click();
    await ws.getByLabel('Selected cards', {exact: true}).selectOption('native:placement:0');
    await ws.getByRole('button', {name: 'Toggle collapsed', exact: true}).click();
    await expect(ws.getByRole('status').first()).toHaveText('saved');
    const card = ws.locator('[data-placement-id="native:placement:0"]');
    await expect(card.getByRole('button', {name: 'Inspect object', exact: true})).toBeVisible();
    await expect(card.locator('.brainRichBlock')).toHaveCount(0);
});

test('initial note order is complete before native rendering starts', async ({context, extensionId}) => {
    const {page, ws} = await openFixture(context, extensionId, 'document', true);
    expect(await page.evaluate(() => window.nativeMountedIndexUpdates)).toBe(0);
    const order = await ws.locator('page-editor').evaluate(editor => editor.doc.getBlocks()
        .filter(block => block.flavour === 'affine:embed-workspace-object')
        .map(block => ({placement: block.placementId, index: editor.doc.getParent(block).index}))
        .sort((a, b) => a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
    expect(order.map(row => row.placement)).toEqual(Array.from({length: 50}, (_, i) => 'native:placement:' + i));
    expect(new Set(order.map(row => row.index)).size).toBe(50);
});
