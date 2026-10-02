const path = require('node:path');
const {chromium} = require('@playwright/test');

async function launchRestartableExtension(profilePath) {
    const extensionPath = path.resolve(__dirname, '../../../dist');
    const context = await chromium.launchPersistentContext(profilePath, {
        channel: 'chromium', headless: true,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    return {context, extensionId: worker.url().split('/')[2], async crashPage(page) {
        const cdp = await context.newCDPSession(page);
        const crashed = page.waitForEvent('crash');
        void cdp.send('Page.crash').catch(() => {});
        await crashed;
    }};
}
module.exports = {launchRestartableExtension};
