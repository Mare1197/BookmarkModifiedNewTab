const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 45_000,
    expect: {timeout: 8_000},
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    }
});
