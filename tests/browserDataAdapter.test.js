const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const browserDataCore = require('../src/browserDataCore.js');
const fixture = require('./fixtures/extension-profile.json');
const {createChromeMock} = require('./chromeMock.js');

const loadAdapter = () => {
    const {chrome, events, storageData} = createChromeMock(fixture);
    const app = {
        browserDataCore,
        getBookmarkTree: () => chrome.bookmarks.getTree(),
        isValidDocument: url => typeof url === 'string' && url.startsWith('data:text/html;charset=UTF-8;base64,'),
        util: {
            debounce(callback) {
                return callback;
            }
        }
    };
    const context = vm.createContext({app, browserDataCore, chrome, console, URL});
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'browserData.js'), 'utf8');
    vm.runInContext(source, context, {filename: 'browserData.js'});
    return {adapter: app.browserData, chrome, events, storageData};
};

test('normalizes fixture tabs with deterministic session provenance', async () => {
    const {adapter} = loadAdapter();
    const groups = await adapter.getBrowserWindows();

    assert.equal(groups.length, 2);
    assert.equal(groups[0].tabs.length, 2);
    assert.equal(groups[0].tabs[1].openedFrom.title, 'Fixture Search');
    assert.equal(groups[0].tabs[1].openedBySearch.engine, 'Google');
});

test('projects history and native bookmark hierarchy without shadow copies', async () => {
    const {adapter} = loadAdapter();
    const history = await adapter.getHistory();
    const bookmarkGroups = await adapter.getBookmarkGroups();

    assert.equal(history[0].host, 'example.test');
    assert.equal(bookmarkGroups[0].bookmarks.find(item => item.title === 'Fixture Document').type, 'document');
    assert.equal(bookmarkGroups[0].bookmarks.find(item => item.title === 'Nested Fixture').path,
        'Fixture Folder');
});

test('derives bounded domain metadata and executes tab actions', async () => {
    const {adapter, chrome} = loadAdapter();
    const metadata = await adapter.getDomainMetadata('example.test', true);

    assert.equal(metadata.source, 'history');
    assert.equal(metadata.firstOpenedAt, 1787067000000);
    assert.equal(metadata.lastOpenedAt, 1787153400000);

    await adapter.focusTab(12, 1);
    assert.equal((await chrome.tabs.get(12)).active, true);
    await adapter.closeTab(12);
    assert.equal(await chrome.tabs.get(12), undefined);
});
