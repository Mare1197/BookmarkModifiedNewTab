(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.browserDataCore = api;
    }
})(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const pad = value => String(value).padStart(2, '0');

    const formatTimestamp = (value, fallback = 'Unknown') => {
        if (value === undefined || value === null || value === '') {
            return fallback;
        }
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return fallback;
        }
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const getUrlInfo = (url) => {
        if (!url) {
            return {
                url: '',
                host: '',
                displayHost: 'Not available',
                isWebUrl: false
            };
        }
        try {
            const parsed = new URL(url);
            const isWebUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
            return {
                url: parsed.href,
                host: isWebUrl ? parsed.hostname.toLowerCase() : '',
                displayHost: isWebUrl ? parsed.hostname.replace(/^www\./, '') : parsed.protocol.replace(':', ''),
                isWebUrl
            };
        } catch (e) {
            return {
                url,
                host: '',
                displayHost: 'Not available',
                isWebUrl: false
            };
        }
    };

    const searchProviders = [
        {name: 'Google', hosts: ['google.com', 'www.google.com'], queryParam: 'q'},
        {name: 'Bing', hosts: ['bing.com', 'www.bing.com'], queryParam: 'q'},
        {name: 'DuckDuckGo', hosts: ['duckduckgo.com', 'www.duckduckgo.com'], queryParam: 'q'},
        {name: 'Brave Search', hosts: ['search.brave.com'], queryParam: 'q'},
        {name: 'Yahoo', hosts: ['search.yahoo.com'], queryParam: 'p'},
        {name: 'Ecosia', hosts: ['ecosia.org', 'www.ecosia.org'], queryParam: 'q'}
    ];

    const parseSearchSource = (url) => {
        const info = getUrlInfo(url);
        if (!info.isWebUrl) {
            return null;
        }
        const parsed = new URL(info.url);
        const provider = searchProviders.find(candidate => candidate.hosts.includes(info.host));
        if (!provider) {
            return null;
        }
        return {
            engine: provider.name,
            query: parsed.searchParams.get(provider.queryParam) || undefined
        };
    };

    const getOpenedBySearchLabel = (openedBySearch) => {
        if (!openedBySearch || !openedBySearch.known) {
            return 'Unknown';
        }
        if (!openedBySearch.value) {
            return 'No';
        }
        if (openedBySearch.engine && openedBySearch.query) {
            return `Yes — ${openedBySearch.engine}: ${openedBySearch.query}`;
        }
        if (openedBySearch.engine) {
            return `Yes — ${openedBySearch.engine}`;
        }
        return 'Yes';
    };

    const normalizeTab = (tab, windowInfo, sessions, observedAt) => {
        const session = sessions[String(tab.id)] || {
            openedAt: observedAt,
            openedAtSource: 'first-observed',
            openedBySearch: {known: false}
        };
        const rawUrl = tab.url || tab.pendingUrl || '';
        const urlInfo = getUrlInfo(rawUrl);
        return {
            type: 'tab',
            id: `tab:${tab.id}`,
            tabId: tab.id,
            windowId: tab.windowId,
            windowLabel: `Window ${windowInfo.order}`,
            title: tab.title || session.title || 'Untitled tab',
            url: rawUrl,
            host: urlInfo.host,
            displayHost: urlInfo.displayHost,
            faviconUrl: tab.favIconUrl || '',
            active: Boolean(tab.active),
            highlighted: Boolean(tab.highlighted),
            pinned: Boolean(tab.pinned),
            audible: Boolean(tab.audible),
            discarded: Boolean(tab.discarded),
            currentWindow: Boolean(windowInfo.focused),
            openedAt: session.openedAt,
            openedAtSource: session.openedAtSource || 'first-observed',
            openedFrom: session.openedFrom || null,
            openedBySearch: session.openedBySearch || {known: false}
        };
    };

    const groupTabsByWindow = (windows, sessions = {}, observedAt = Date.now()) => {
        return (windows || []).map((browserWindow, index) => {
            const windowInfo = {
                id: browserWindow.id,
                order: index + 1,
                focused: Boolean(browserWindow.focused),
                incognito: Boolean(browserWindow.incognito),
                state: browserWindow.state || 'normal',
                type: browserWindow.type || 'normal'
            };
            const tabs = (browserWindow.tabs || [])
                .slice()
                .sort((a, b) => (a.index || 0) - (b.index || 0))
                .map(tab => normalizeTab(tab, windowInfo, sessions, observedAt));
            return Object.assign(windowInfo, {
                label: `Window ${windowInfo.order}`,
                tabs
            });
        });
    };

    return {
        formatTimestamp,
        getUrlInfo,
        parseSearchSource,
        getOpenedBySearchLabel,
        groupTabsByWindow
    };
});
