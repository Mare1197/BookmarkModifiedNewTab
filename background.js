/* global chrome */

const TAB_SESSIONS_KEY = 'browserOsTabSessionsV1';
let sessionWriteQueue = Promise.resolve();

const searchProviders = [
    {name: 'Google', hosts: ['google.com', 'www.google.com'], queryParam: 'q'},
    {name: 'Bing', hosts: ['bing.com', 'www.bing.com'], queryParam: 'q'},
    {name: 'DuckDuckGo', hosts: ['duckduckgo.com', 'www.duckduckgo.com'], queryParam: 'q'},
    {name: 'Brave Search', hosts: ['search.brave.com'], queryParam: 'q'},
    {name: 'Yahoo', hosts: ['search.yahoo.com'], queryParam: 'p'},
    {name: 'Ecosia', hosts: ['ecosia.org', 'www.ecosia.org'], queryParam: 'q'}
];

const parseSearchSource = (url) => {
    if (!url) {
        return null;
    }
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const provider = searchProviders.find((candidate) => candidate.hosts.includes(host));
        if (!provider) {
            return null;
        }
        const query = parsed.searchParams.get(provider.queryParam);
        return {
            engine: provider.name,
            query: query || undefined
        };
    } catch (e) {
        return null;
    }
};

const updateSessions = (mutate) => {
    sessionWriteQueue = sessionWriteQueue.then(async () => {
        const stored = await chrome.storage.local.get(TAB_SESSIONS_KEY);
        const sessions = stored[TAB_SESSIONS_KEY] || {};
        await mutate(sessions);
        await chrome.storage.local.set({[TAB_SESSIONS_KEY]: sessions});
    }).catch(() => {
        // A service-worker restart or browser shutdown can interrupt a write.
        // The next observation safely recreates missing records.
    });
    return sessionWriteQueue;
};

const getOpener = async (tab) => {
    if (!Number.isInteger(tab.openerTabId)) {
        return null;
    }
    try {
        const opener = await chrome.tabs.get(tab.openerTabId);
        return {
            tabId: opener.id,
            title: opener.title || 'Untitled tab',
            url: opener.url || opener.pendingUrl || undefined
        };
    } catch (e) {
        return {
            tabId: tab.openerTabId,
            title: 'Not available',
            url: undefined
        };
    }
};

const observeTab = async (tab, openedAtSource = 'first-observed') => {
    if (!tab || !Number.isInteger(tab.id)) {
        return;
    }
    const opener = await getOpener(tab);
    const searchSource = opener && opener.url ? parseSearchSource(opener.url) : null;
    const observedAt = Date.now();

    await updateSessions((sessions) => {
        const key = String(tab.id);
        const existing = sessions[key] || {
            tabId: tab.id,
            openedAt: observedAt,
            openedAtSource
        };
        existing.windowId = tab.windowId;
        existing.title = tab.title || existing.title || 'Untitled tab';
        existing.url = tab.url || tab.pendingUrl || existing.url;
        existing.updatedAt = observedAt;

        if (opener && !existing.openedFrom) {
            existing.openerTabId = opener.tabId;
            existing.openedFrom = opener;
            existing.openedBySearch = searchSource ? {
                known: true,
                value: true,
                engine: searchSource.engine,
                query: searchSource.query
            } : {
                known: true,
                value: false
            };
        } else if (!existing.openedBySearch) {
            existing.openedBySearch = {
                known: false
            };
        }

        sessions[key] = existing;
    });
};

const seedOpenTabs = async () => {
    let tabs = [];
    try {
        tabs = await chrome.tabs.query({});
    } catch (e) {
        return;
    }
    const liveTabIds = new Set(tabs.filter((tab) => Number.isInteger(tab.id)).map((tab) => String(tab.id)));
    await updateSessions((sessions) => {
        Object.keys(sessions).forEach((tabId) => {
            if (!liveTabIds.has(tabId)) {
                delete sessions[tabId];
            }
        });
    });
    await Promise.all(tabs.map((tab) => observeTab(tab, 'first-observed')));
};

chrome.tabs.onCreated.addListener((tab) => {
    observeTab(tab, 'created-event');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
        observeTab(tab, 'first-observed');
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    updateSessions((sessions) => {
        delete sessions[String(tabId)];
    });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    updateSessions((sessions) => {
        delete sessions[String(removedTabId)];
    }).then(async () => {
        try {
            await observeTab(await chrome.tabs.get(addedTabId), 'first-observed');
        } catch (e) {}
    });
});

chrome.runtime.onInstalled.addListener(seedOpenTabs);
chrome.runtime.onStartup.addListener(seedOpenTabs);

seedOpenTabs();
