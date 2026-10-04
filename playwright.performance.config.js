const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/performance',
    timeout: 180000,
    expect: {timeout: 20000},
    workers: 1,
    retries: 0,
    reporter: 'list',
    outputDir: 'test-results/performance',
    use: {screenshot: 'only-on-failure', trace: 'retain-on-failure'}
});
