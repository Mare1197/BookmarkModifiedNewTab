const path = require('node:path');
const base = require('@playwright/test');

const extensionPath = process.env.WORKSPACE_EXTENSION_PATH ?
    path.resolve(process.env.WORKSPACE_EXTENSION_PATH) : path.resolve(__dirname, '..', '..', 'dist');

const test = base.test.extend({
    context: async ({timezoneId}, use) => {
        const context = await base.chromium.launchPersistentContext('', {
            channel: 'chromium',
            headless: true,
            timezoneId,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`
            ]
        });
        await use(context);
        await context.close();
    },
    extensionId: async ({context}, use) => {
        let [serviceWorker] = context.serviceWorkers();
        if (!serviceWorker) {
            serviceWorker = await context.waitForEvent('serviceworker');
        }
        await use(serviceWorker.url().split('/')[2]);
    },
    serviceWorker: async ({context}, use) => {
        let [serviceWorker] = context.serviceWorkers();
        if (!serviceWorker) {
            serviceWorker = await context.waitForEvent('serviceworker');
        }
        await use(serviceWorker);
    }
});

module.exports = {expect: base.expect, test};
