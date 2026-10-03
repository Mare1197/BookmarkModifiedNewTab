const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../src/browserDataCore');

test('formats timestamps as DD/MM/YYYY HH:mm in local time', () => {
    const localDate = new Date(2026, 7, 19, 9, 5);
    assert.equal(core.formatTimestamp(localDate), '19/08/2026 09:05');
});

test('uses a neutral fallback for unavailable timestamps', () => {
    assert.equal(core.formatTimestamp(undefined), 'Unknown');
    assert.equal(core.formatTimestamp('not-a-date', 'Not available'), 'Not available');
});

test('normalizes web URLs without inventing a host for browser URLs', () => {
    assert.deepEqual(core.getUrlInfo('https://www.example.com/path'), {
        url: 'https://www.example.com/path',
        host: 'www.example.com',
        displayHost: 'example.com',
        isWebUrl: true
    });
    assert.equal(core.getUrlInfo('chrome://settings').host, '');
    assert.equal(core.getUrlInfo('chrome://settings').displayHost, 'chrome');
});

test('recognizes search provenance only from known search URLs', () => {
    assert.deepEqual(core.parseSearchSource('https://www.google.com/search?q=browser+os'), {
        engine: 'Google',
        query: 'browser os'
    });
    assert.equal(core.parseSearchSource('https://example.com/?q=browser+os'), null);
});

test('renders unknown, negative, and evidenced search states', () => {
    assert.equal(core.getOpenedBySearchLabel(), 'Unknown');
    assert.equal(core.getOpenedBySearchLabel({known: true, value: false}), 'No');
    assert.equal(core.getOpenedBySearchLabel({
        known: true,
        value: true,
        engine: 'Google',
        query: 'browser os'
    }), 'Yes — Google: browser os');
});

test('groups normalized tabs by browser window and preserves tracked metadata', () => {
    const observedAt = 1111;
    const groups = core.groupTabsByWindow([
        {
            id: 7,
            focused: true,
            state: 'normal',
            tabs: [
                {id: 3, windowId: 7, index: 1, title: 'Second', url: 'https://two.example/'},
                {id: 2, windowId: 7, index: 0, title: 'First', url: 'https://one.example/', active: true}
            ]
        }
    ], {
        2: {
            openedAt: 500,
            openedAtSource: 'created-event',
            openedFrom: {tabId: 1, title: 'Search'},
            openedBySearch: {known: true, value: false}
        }
    }, observedAt);

    assert.equal(groups[0].label, 'Window 1');
    assert.equal(groups[0].tabs[0].tabId, 2);
    assert.equal(groups[0].tabs[0].openedAt, 500);
    assert.equal(groups[0].tabs[0].openedAtSource, 'created-event');
    assert.equal(groups[0].tabs[1].openedAt, observedAt);
    assert.equal(groups[0].tabs[1].openedAtSource, 'first-observed');
});
