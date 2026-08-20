/* global chrome, app, browserDataCore */
{
    const TAB_SESSIONS_KEY = 'browserOsTabSessionsV1';
    const DOMAIN_HISTORY_LIMIT = 300;
    const HISTORY_RESULT_LIMIT = 250;
    const domainMetadataCache = new Map();

    const readTabSessions = async () => {
        try {
            const stored = await chrome.storage.local.get(TAB_SESSIONS_KEY);
            return stored[TAB_SESSIONS_KEY] || {};
        } catch (e) {
            return {};
        }
    };

    const persistFirstObservedSessions = async (groups, sessions) => {
        let changed = false;
        groups.forEach(group => {
            group.tabs.forEach(tab => {
                const key = String(tab.tabId);
                if (!sessions[key]) {
                    sessions[key] = {
                        tabId: tab.tabId,
                        windowId: tab.windowId,
                        title: tab.title,
                        url: tab.url,
                        openedAt: tab.openedAt,
                        openedAtSource: 'first-observed',
                        openedBySearch: {known: false},
                        updatedAt: Date.now()
                    };
                    changed = true;
                }
            });
        });
        if (changed) {
            try {
                await chrome.storage.local.set({[TAB_SESSIONS_KEY]: sessions});
            } catch (e) {}
        }
    };

    const getBrowserWindows = async () => {
        const [windows, sessions] = await Promise.all([
            chrome.windows.getAll({populate: true, windowTypes: ['normal']}),
            readTabSessions()
        ]);
        const observedAt = Date.now();
        const groups = browserDataCore.groupTabsByWindow(windows, sessions, observedAt);
        await persistFirstObservedSessions(groups, sessions);
        return groups;
    };

    const getHistory = async (text = '') => {
        const results = await chrome.history.search({
            text,
            startTime: 0,
            maxResults: HISTORY_RESULT_LIMIT
        });
        return results.map(item => {
            const urlInfo = browserDataCore.getUrlInfo(item.url || '');
            return {
                type: 'history',
                id: `history:${item.id || item.url}`,
                historyId: item.id,
                title: item.title || urlInfo.displayHost || 'Untitled page',
                url: item.url || '',
                host: urlInfo.host,
                displayHost: urlInfo.displayHost,
                lastVisitTime: item.lastVisitTime,
                visitCount: item.visitCount,
                typedCount: item.typedCount
            };
        });
    };

    const getBookmarkGroups = async () => {
        const tree = await app.getBookmarkTree();
        const groups = [];
        const root = tree[0] || {children: []};

        (root.children || []).forEach((topLevelFolder) => {
            const bookmarks = [];
            const visit = (node, path) => {
                const nextPath = node.url ? path : path.concat(node.title || 'Untitled folder');
                if (node.url) {
                    const urlInfo = browserDataCore.getUrlInfo(node.url);
                    bookmarks.push({
                        type: app.isValidDocument(node.url) ? 'document' : 'bookmark',
                        id: `bookmark:${node.id}`,
                        bookmarkId: node.id,
                        title: node.title || 'Untitled bookmark',
                        url: node.url,
                        host: urlInfo.host,
                        displayHost: urlInfo.displayHost,
                        path: path.join(' / '),
                        dateAdded: node.dateAdded
                    });
                    return;
                }
                (node.children || []).forEach(child => visit(child, nextPath));
            };
            (topLevelFolder.children || []).forEach(child => visit(child, []));
            groups.push({
                id: topLevelFolder.id,
                label: topLevelFolder.title || 'Bookmarks',
                bookmarks
            });
        });
        return groups;
    };

    const getDomainMetadataUncached = async (host) => {
        if (!host) {
            return {
                host: '',
                firstOpenedAt: undefined,
                lastOpenedAt: undefined,
                source: 'unknown',
                truncated: false
            };
        }

        let historyItems;
        try {
            historyItems = await chrome.history.search({
                text: host,
                startTime: 0,
                maxResults: DOMAIN_HISTORY_LIMIT
            });
        } catch (e) {
            return {
                host,
                firstOpenedAt: undefined,
                lastOpenedAt: undefined,
                source: 'not-available',
                truncated: false
            };
        }

        const matchingItems = historyItems.filter(item => browserDataCore.getUrlInfo(item.url || '').host === host);
        let firstOpenedAt;
        let lastOpenedAt;
        matchingItems.forEach(item => {
            if (item.lastVisitTime && (!lastOpenedAt || item.lastVisitTime > lastOpenedAt)) {
                lastOpenedAt = item.lastVisitTime;
            }
        });

        const visitGroups = [];
        const visitBatchSize = 20;
        for (let index = 0; index < matchingItems.length; index += visitBatchSize) {
            const batch = matchingItems.slice(index, index + visitBatchSize);
            const batchVisits = await Promise.all(batch.map(async item => {
                try {
                    return await chrome.history.getVisits({url: item.url});
                } catch (e) {
                    return [];
                }
            }));
            visitGroups.push(...batchVisits);
        }
        visitGroups.forEach(visits => {
            visits.forEach(visit => {
                if (!visit.visitTime) {
                    return;
                }
                if (!firstOpenedAt || visit.visitTime < firstOpenedAt) {
                    firstOpenedAt = visit.visitTime;
                }
                if (!lastOpenedAt || visit.visitTime > lastOpenedAt) {
                    lastOpenedAt = visit.visitTime;
                }
            });
        });

        const truncated = historyItems.length === DOMAIN_HISTORY_LIMIT;
        return {
            host,
            firstOpenedAt: truncated ? undefined : firstOpenedAt,
            lastOpenedAt,
            source: matchingItems.length ? 'history' : 'unknown',
            truncated
        };
    };

    const getDomainMetadata = (host, refresh = false) => {
        if (refresh || !domainMetadataCache.has(host)) {
            domainMetadataCache.set(host, getDomainMetadataUncached(host));
        }
        return domainMetadataCache.get(host);
    };

    const focusTab = async (tabId, windowId) => {
        if (Number.isInteger(windowId)) {
            await chrome.windows.update(windowId, {focused: true});
        }
        return chrome.tabs.update(tabId, {active: true});
    };

    const closeTab = tabId => chrome.tabs.remove(tabId);
    const openUrl = (url, active = true) => chrome.tabs.create({url, active});

    const addListener = (event, callback) => {
        if (event && event.addListener) {
            event.addListener(callback);
            return () => {
                if (event.removeListener) {
                    event.removeListener(callback);
                }
            };
        }
        return () => {};
    };

    const subscribeTabs = (callback) => {
        const cleanups = [
            addListener(chrome.tabs.onCreated, callback),
            addListener(chrome.tabs.onUpdated, callback),
            addListener(chrome.tabs.onRemoved, callback),
            addListener(chrome.tabs.onMoved, callback),
            addListener(chrome.tabs.onActivated, callback),
            addListener(chrome.tabs.onAttached, callback),
            addListener(chrome.tabs.onDetached, callback),
            addListener(chrome.windows.onCreated, callback),
            addListener(chrome.windows.onRemoved, callback),
            addListener(chrome.windows.onFocusChanged, callback)
        ];
        return () => cleanups.forEach(cleanup => cleanup());
    };

    const subscribeHistory = (callback) => {
        const cleanups = [
            addListener(chrome.history.onVisited, callback),
            addListener(chrome.history.onVisitRemoved, callback)
        ];
        return () => cleanups.forEach(cleanup => cleanup());
    };

    app.browserData = {
        getBrowserWindows,
        getHistory,
        getBookmarkGroups,
        getDomainMetadata,
        focusTab,
        closeTab,
        openUrl,
        subscribeTabs,
        subscribeHistory,
        formatTimestamp: browserDataCore.formatTimestamp,
        getOpenedBySearchLabel: browserDataCore.getOpenedBySearchLabel,
        getUrlInfo: browserDataCore.getUrlInfo
    };
}
