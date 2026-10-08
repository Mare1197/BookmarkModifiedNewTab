const fs = require('node:fs');
const path = require('node:path');
const {expect, test} = require('./fixtures');

test('optional Brain module loads only on demand', async ({context, extensionId}) => {
    const root = process.env.WORKSPACE_EXTENSION_PATH || path.resolve(__dirname, '../../dist');
    const chunk = fs.readdirSync(path.join(root, 'chunks')).find(name => /^BrainWorkspace-.*\.js$/.test(name));
    expect(chunk, 'Brain must have a separately loaded module').toBeTruthy();
    const page = await context.newPage(), requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => {localStorage.madeHelp = '1'; localStorage.showedHelp = '1'; localStorage.version = '1.5.2';});
    await page.goto(`chrome-extension://${extensionId}/newtab.html`);
    await page.frameLocator('iframe[title="Browser OS desktop"]').getByRole('button', {name: 'Boards', exact: true}).click();
    await expect(page.locator('.workspaceTitlebar')).toBeVisible();
    expect(requests.some(url => url.endsWith(chunk))).toBe(false);
    await page.getByRole('button', {name: 'Brain', exact: true}).click();
    await expect(page.getByRole('region', {name: 'Unified Brain', exact: true})).toBeVisible();
    expect(requests.some(url => url.endsWith(chunk))).toBe(true);
    await page.getByRole('button', {name: 'Canvas', exact: true}).first().click();
    await expect(page.locator('.react-flow')).toBeVisible();
});

test('module failure boundary keeps navigation usable and supports retry or confirmed reload', async ({context}) => {
    // Extension URLs bypass Playwright request interception. Exercise the actual
    // production boundary in an isolated HTTP bundle instead; no product hooks.
    const {build} = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;
    const entry = path.resolve(__dirname, '../../boundary-test.jsx').replaceAll('\\', '/');
    const source = `
            import React, {useState} from 'react';
            import {createRoot} from 'react-dom/client';
            import {lazyWorkspaceView} from './src/react/workspace/lazyWorkspaceView';
            window.React = React;
            const View = lazyWorkspaceView(() => import('/optional.js'), 'Test view');
            function App() {
                const [open, setOpen] = useState(false);
                return <><button onClick={() => setOpen(false)}>Home</button>
                    <button onClick={() => setOpen(true)}>Open view</button>
                    {open ? <View /> : <p>Home is usable</p>}</>;
            }
            createRoot(document.getElementById('root')).render(<App />);`;
    const result = await build({configFile: false, logLevel: 'silent', publicDir: false,
        define: {'process.env.NODE_ENV': JSON.stringify('production')},
        plugins: [react(), {name: 'isolated-boundary-test', enforce: 'pre', resolveId(id) {if (id.replaceAll('\\', '/').endsWith('boundary-test.jsx')) return entry;},
            load(id) {if (id === entry) return source;}}],
        build: {write: false, lib: {entry, formats: ['es']}, rolldownOptions: {external: ['/optional.js']}}});
    const code = (Array.isArray(result) ? result[0] : result).output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).code;
    const page = await context.newPage(); let failed = false;
    await page.route('https://workspace-test.invalid/**', route => {
        const url = route.request().url();
        if (url.endsWith('/app.js')) return route.fulfill({contentType: 'text/javascript', body: code});
        if (url.endsWith('/optional.js')) {
            if (!failed) {failed = true; return route.abort('failed');}
            return route.fulfill({contentType: 'text/javascript', body: 'export default () => window.React.createElement("p", null, "Recovered view");'});
        }
        return route.fulfill({contentType: 'text/html', body: '<div id="root"></div><script type="module" src="/app.js"></script>'});
    });
    await page.goto('https://workspace-test.invalid/');
    await page.getByRole('button', {name: 'Open view', exact: true}).click();
    await expect(page.getByRole('alert')).toContainText('Unable to load Test view');
    await page.getByRole('button', {name: 'Home', exact: true}).click();
    await expect(page.getByText('Home is usable', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Open view', exact: true}).click();
    await page.getByRole('button', {name: 'Retry Test view', exact: true}).click();
    // Chromium caches failed module imports for the document lifetime.
    await expect(page.getByRole('alert')).toBeVisible();
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', {name: 'Reload app', exact: true}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: 'Reload app', exact: true}).click();
    await expect(page.getByText('Home is usable', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Open view', exact: true}).click();
    await expect(page.getByText('Recovered view', {exact: true})).toBeVisible();
});
