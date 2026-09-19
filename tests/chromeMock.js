const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const createEvent = () => {
    const listeners = new Set();
    return {
        addListener(listener) {
            listeners.add(listener);
        },
        removeListener(listener) {
            listeners.delete(listener);
        },
        dispatch(...args) {
            listeners.forEach(listener => listener(...clone(args)));
        },
        listenerCount() {
            return listeners.size;
        }
    };
};

const respond = (value, callback) => {
    const result = clone(value);
    if (typeof callback === 'function') {
        callback(result);
    }
    return Promise.resolve(result);
};

const flattenBookmarks = nodes => nodes.flatMap(node => [node].concat(flattenBookmarks(node.children || [])));

const createChromeMock = fixtureInput => {
    const fixture = clone(fixtureInput);
    const windows = fixture.windows || [];
    const historyItems = fixture.history || [];
    const visits = fixture.visits || {};
    const bookmarkTree = fixture.bookmarksTree || [];
    const storageData = fixture.storage || {};
    const events = {
        tabsCreated: createEvent(),
        tabsUpdated: createEvent(),
        tabsRemoved: createEvent(),
        windowsFocusChanged: createEvent(),
        historyVisited: createEvent(),
        historyRemoved: createEvent(),
        storageChanged: createEvent()
    };
    const allTabs = () => windows.flatMap(browserWindow => browserWindow.tabs || []);

    const chrome = {
        bookmarks: {
            getTree: callback => respond(bookmarkTree, callback),
            get: (id, callback) => respond(flattenBookmarks(bookmarkTree).filter(node => String(node.id) === String(id)), callback),
            getChildren: (id, callback) => {
                const node = flattenBookmarks(bookmarkTree).find(item => String(item.id) === String(id));
                return respond(node ? node.children || [] : [], callback);
            },
            search: (query, callback) => {
                const text = typeof query === 'string' ? query : query.title || query.query || '';
                return respond(flattenBookmarks(bookmarkTree).filter(node =>
                    `${node.title || ''} ${node.url || ''}`.toLowerCase().includes(text.toLowerCase())), callback);
            },
            onCreated: createEvent(),
            onImportEnded: createEvent(),
            onMoved: createEvent(),
            onRemoved: createEvent(),
            onChanged: createEvent()
        },
        history: {
            search: async query => historyItems
                .filter(item => !query.text || `${item.title} ${item.url}`.toLowerCase().includes(query.text.toLowerCase()))
                .filter(item => !query.startTime || item.lastVisitTime >= query.startTime)
                .slice(0, query.maxResults || historyItems.length)
                .map(clone),
            getVisits: async ({url}) => clone(visits[url] || []),
            onVisited: events.historyVisited,
            onVisitRemoved: events.historyRemoved
        },
        runtime: {
            getManifest: () => ({name: 'Browser OS New Tab', version: '1.5.2'}),
            onMessage: createEvent(),
            sendMessage: async () => undefined
        },
        storage: {
            local: {
                async get(keys) {
                    if (keys === undefined || keys === null) {
                        return clone(storageData);
                    }
                    const requested = Array.isArray(keys) ? keys : [keys];
                    return requested.reduce((result, key) => {
                        if (Object.prototype.hasOwnProperty.call(storageData, key)) {
                            result[key] = clone(storageData[key]);
                        }
                        return result;
                    }, {});
                },
                async set(values) {
                    const changes = {};
                    Object.entries(values).forEach(([key, value]) => {
                        changes[key] = {oldValue: clone(storageData[key]), newValue: clone(value)};
                        storageData[key] = clone(value);
                    });
                    events.storageChanged.dispatch(changes, 'local');
                }
            },
            onChanged: events.storageChanged
        },
        tabs: {
            async query() {
                return allTabs().map(clone);
            },
            async get(tabId) {
                return clone(allTabs().find(tab => tab.id === tabId));
            },
            async update(tabId, changes) {
                const tab = allTabs().find(item => item.id === tabId);
                if (!tab) {
                    throw new Error(`Unknown tab ${tabId}`);
                }
                Object.assign(tab, changes);
                events.tabsUpdated.dispatch(tabId, changes, tab);
                return clone(tab);
            },
            async remove(tabId) {
                windows.forEach(browserWindow => {
                    const index = (browserWindow.tabs || []).findIndex(tab => tab.id === tabId);
                    if (index >= 0) {
                        browserWindow.tabs.splice(index, 1);
                    }
                });
                events.tabsRemoved.dispatch(tabId, {windowId: 1, isWindowClosing: false});
            },
            async create(properties) {
                const browserWindow = windows.find(item => item.focused) || windows[0];
                const nextId = Math.max(0, ...allTabs().map(tab => tab.id)) + 1;
                const tab = {id: nextId, windowId: browserWindow.id, index: browserWindow.tabs.length,
                    active: properties.active !== false, title: properties.url, url: properties.url};
                browserWindow.tabs.push(tab);
                events.tabsCreated.dispatch(tab);
                return clone(tab);
            },
            onCreated: events.tabsCreated,
            onUpdated: events.tabsUpdated,
            onRemoved: events.tabsRemoved,
            onReplaced: createEvent()
        },
        windows: {
            async getAll() {
                return windows.map(clone);
            },
            async update(windowId, changes) {
                windows.forEach(browserWindow => {
                    browserWindow.focused = browserWindow.id === windowId && changes.focused !== false;
                });
                events.windowsFocusChanged.dispatch(windowId);
                return clone(windows.find(item => item.id === windowId));
            },
            onCreated: createEvent(),
            onRemoved: createEvent(),
            onFocusChanged: events.windowsFocusChanged
        }
    };

    return {chrome, events, fixture, storageData};
};

module.exports = {createChromeMock, createEvent};
