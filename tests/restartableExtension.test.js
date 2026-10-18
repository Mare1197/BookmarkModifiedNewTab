const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {chromium} = require('@playwright/test');
const {launchRestartableExtension} = require('./e2e/helpers/restartableExtension');

test('restart verification launches the explicitly selected immutable artifact', async t => {
    const previous = process.env.WORKSPACE_EXTENSION_PATH;
    const launch = chromium.launchPersistentContext;
    t.after(() => {
        chromium.launchPersistentContext = launch;
        if (previous === undefined) delete process.env.WORKSPACE_EXTENSION_PATH;
        else process.env.WORKSPACE_EXTENSION_PATH = previous;
    });
    const artifact = path.resolve('.superpowers', 'synthetic-frozen-artifact');
    process.env.WORKSPACE_EXTENSION_PATH = artifact;
    let captured;
    const context = {serviceWorkers: () => [{url: () => 'chrome-extension://synthetic/background.js'}]};
    chromium.launchPersistentContext = async (profile, options) => {captured = {profile, options}; return context;};
    const runtime = await launchRestartableExtension('synthetic-owned-profile');
    assert.equal(runtime.context, context);
    assert.equal(captured.profile, 'synthetic-owned-profile');
    assert.deepEqual(captured.options.args, [`--disable-extensions-except=${artifact}`, `--load-extension=${artifact}`]);
});
