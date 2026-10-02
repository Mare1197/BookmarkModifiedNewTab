const os = require('node:os');
const path = require('node:path');
const {expect, test} = require('./fixtures.js');

async function openBrain(context, extensionId) {
    const page = await context.newPage();
    await page.setViewportSize({width: 1584, height: 1024});
    page.on('pageerror', error => console.error('BRAIN PAGE ERROR:', error.stack));
    page.on('console', message => { if (message.type() === 'error') console.error('BRAIN CONSOLE ERROR:', message.text()); });
    await page.addInitScript(() => { localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2'; });
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Unified Brain', exact: true})).toBeVisible();
    return page;
}

test('conversation cards follow provider sequence after reimport and reload', async ({context, extensionId}) => {
    const page = await openBrain(context, extensionId), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const brain = page.getByRole('region', {name: 'Unified Brain', exact: true});
    await brain.getByText('Create an object or import a conversation', {exact: true}).click();
    const panel = page.getByRole('region', {name: 'Conversation export import'});
    const first = {id: 'first', role: 'user', text: 'First question'}, last = {id: 'last', role: 'assistant', text: 'Last answer'};
    for (const messages of [[first, last], [first, {id: 'middle', role: 'user', text: 'Middle clarification'}, last]]) {
        await panel.getByLabel('Paste conversation export JSON').fill(JSON.stringify({provider: 'chatgpt', sourceId: 'ordered-chat', title: 'Ordered conversation', messages}));
        await panel.getByRole('button', {name: 'Preview import', exact: true}).click();
        await panel.getByRole('button', {name: 'Import conversations', exact: true}).click();
        await expect(page.getByText('Imported 1 conversation.', {exact: true})).toBeVisible();
    }
    const block = page.locator('workspace-reference-block').filter({hasText: 'Ordered conversation'});
    for (const reload of [false, true]) {
        if (reload) {
            await page.reload();
            await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
            await page.getByRole('button', {name: 'Brain', exact: true}).click();
        }
        await brain.getByRole('button', {name: 'Ordered conversation', exact: true}).click();
        await page.getByRole('complementary', {name: 'Inspector'}).getByRole('button', {name: 'Open in workspace', exact: true}).click();
        await expect(block).toContainText(/First question[\s\S]*Middle clarification[\s\S]*Last answer/);
    }
    expect(errors).toEqual([]);
});

test('provider import, memory controls, project resume and cross-tab changes share canonical objects', async ({context, extensionId}) => {
    const page = await openBrain(context, extensionId);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const brain = page.getByRole('region', {name: 'Unified Brain', exact: true});
    await brain.getByText('Create an object or import a conversation', {exact: true}).click();
    await brain.getByLabel('Object title', {exact: true}).fill('Shared project');
    await brain.getByRole('button', {name: 'Create object', exact: true}).click();
    await expect(brain.getByRole('button', {name: 'Shared project', exact: true})).toBeVisible();
    const panel = page.getByRole('region', {name: 'Conversation export import'});
    await panel.getByLabel('Paste conversation export JSON').fill(JSON.stringify({provider: 'chatgpt', sourceId: 'fixture-1', title: 'Imported research',
        url: 'https://example.com/research', messages: [{id: 'm1', role: 'user', text: 'Research evidence'}]}));
    await panel.getByRole('button', {name: 'Preview import', exact: true}).click();
    await expect(brain.locator('tbody')).not.toContainText('Imported research');
    await panel.getByRole('button', {name: 'Import conversations', exact: true}).click();
    await brain.getByRole('button', {name: 'Imported research', exact: true}).click();
    const inspector = page.getByRole('complementary', {name: 'Inspector'});
    await inspector.getByRole('combobox', {name: 'Add to Project', exact: true}).selectOption({label: 'Shared project'});
    await inspector.getByRole('button', {name: 'Add to project', exact: true}).click();
    await inspector.getByText('Save sourced memory', {exact: true}).click();
    await inspector.getByLabel('Memory title').fill('Reviewed decision');
    await inspector.getByLabel('Reviewed memory').fill('Keep this sourced statement');
    await inspector.getByRole('button', {name: 'Save memory', exact: true}).click();
    await brain.getByRole('button', {name: 'Reviewed decision', exact: true}).click();
    await inspector.getByLabel('Exclude from AI', {exact: true}).click();
    await expect(inspector.getByLabel('Exclude from AI', {exact: true})).toBeChecked();
    await inspector.getByRole('button', {name: 'Ask AI', exact: true}).click();
    await page.getByText(/Review exact context/).click();
    await expect(page.getByRole('region', {name: 'Optional AI analysis'})).toContainText('Excluded from AI');
    await expect(page.locator('.workspaceUtility pre')).not.toContainText('Keep this sourced statement');
    await inspector.getByRole('button', {name: 'Show in Tiles', exact: true}).click();
    await expect(brain.locator('.brainTiles')).toBeVisible();
    await brain.getByRole('button', {name: 'Kanban', exact: true}).click();
    await inspector.getByRole('button', {name: 'Show in Tiles', exact: true}).click();
    await expect(brain.locator('.brainTiles')).toBeVisible();
    await brain.getByRole('combobox', {name: 'Project', exact: true}).selectOption({label: 'Shared project'});
    const home = page.getByRole('region', {name: 'Project homepage'});
    const count = context.pages().length;
    await home.getByRole('button', {name: 'Preview resume work'}).click();
    await expect(home).toContainText('https://example.com/research');
    expect(context.pages()).toHaveLength(count);
    await home.getByRole('button', {name: 'Cancel', exact: true}).click();
    await page.screenshot({path: path.join(os.tmpdir(), 'brain-project-home.png')});
    const other = await openBrain(context, extensionId);
    await other.getByText('Create an object or import a conversation', {exact: true}).click();
    await other.getByRole('combobox', {name: 'Create type', exact: true}).selectOption('note');
    await other.getByLabel('Object title', {exact: true}).fill('Cross-tab note');
    await other.getByRole('button', {name: 'Create object', exact: true}).click();
    await brain.getByRole('combobox', {name: 'Project', exact: true}).selectOption('');
    await brain.getByRole('button', {name: 'Table', exact: true}).click();
    await expect(brain.locator('tbody')).toContainText('Cross-tab note');
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    await brain.getByRole('button', {name: 'Reviewed decision', exact: true}).click();
    await expect(inspector.getByLabel('Exclude from AI', {exact: true})).toBeChecked();
    expect(errors).toEqual([]);
});

test('BlockSuite workspace edits the canonical reference without storing content in its document', async ({context, extensionId}) => {
    const page = await openBrain(context, extensionId);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.getByRole('region', {name: 'Unified Brain', exact: true}).getByRole('button', {name: 'Start collecting ideas', exact: true}).click();
    await page.getByRole('complementary', {name: 'Inspector'}).getByRole('button', {name: 'Open in workspace', exact: true}).click();
    const prototype = page.getByRole('region', {name: 'AFFiNE workspace'});
    const block = prototype.locator('workspace-reference-block').filter({hasText: 'Start collecting ideas'});
    await expect(block).toContainText('Start collecting ideas');
    // Formatting is owned by canonical notes, not the native selection toolbar.
    await expect(prototype.locator('affine-format-bar-widget')).toHaveCount(0);
    const referenceProps = await block.evaluate(element =>
        Object.fromEntries(Object.entries(element.doc.spaceDoc.getMap('blocks').get(element.model.id).toJSON())
            .filter(([key]) => key.startsWith('prop:'))));
    expect(Object.keys(referenceProps).sort()).toEqual(['prop:entityId', 'prop:placementId']);
    expect(referenceProps['prop:entityId']).toBeTruthy();
    await block.locator('rich-text [contenteditable="true"]').first().fill('Canonical editor change');
    await prototype.getByRole('button', {name: 'Save now'}).click();
    await expect(prototype.getByRole('status').first()).toContainText('saved');
    expect(await block.evaluate(element => JSON.stringify(element.doc.spaceDoc.toJSON())))
        .not.toContain('Canonical editor change');
    await prototype.getByRole('button', {name: 'Canvas', exact: true}).click();
    await expect(block).toContainText('Canonical editor change');
    await prototype.getByRole('button', {name: 'Fit cards', exact: true}).click();
    await expect(block).toContainText('Canonical editor change');
    await page.screenshot({path: path.join(os.tmpdir(), 'brain-blocksuite.png')});
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    await expect(page.locator('.brainTable tbody')).toContainText('Start collecting ideas');
    await page.reload();
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    await page.locator('.brainTable').getByRole('button', {name: 'Start collecting ideas', exact: true}).click();
    await page.getByRole('complementary', {name: 'Inspector'}).getByRole('button', {name: 'Open in workspace', exact: true}).click();
    await expect(block).toContainText('Canonical editor change');
    expect(errors).toEqual([]);
});
