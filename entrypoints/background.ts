import {browser, type Browser} from 'wxt/browser';

const TAB_SESSIONS_KEY = 'browserOsTabSessionsV1';
const TASK_REMINDERS_KEY = 'browserOsTaskRemindersV1';

interface OpenedFrom {
    tabId: number;
    title?: string;
    url?: string;
}

interface SearchSource {
    known: boolean;
    value?: boolean;
    engine?: string;
    query?: string;
    sourceUrl?: string;
}

interface StoredTabSession {
    tabId: number;
    windowId: number;
    openedAt: number;
    openedAtSource: 'created-event' | 'first-observed';
    openerTabId?: number;
    openedFrom?: OpenedFrom;
    openedBySearch: SearchSource;
    url?: string;
    title?: string;
    updatedAt: number;
}

type StoredTabSessions = Record<string, StoredTabSession>;
let mutationQueue: Promise<void> = Promise.resolve();

function parseSearchSource(rawUrl?: string): SearchSource {
    if (!rawUrl) {
        return {known: false};
    }
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return {known: false};
    }
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const engines: Record<string, {name: string; parameter: string}> = {
        'bing.com': {name: 'Bing', parameter: 'q'},
        'brave.com': {name: 'Brave Search', parameter: 'q'},
        'duckduckgo.com': {name: 'DuckDuckGo', parameter: 'q'},
        'ecosia.org': {name: 'Ecosia', parameter: 'q'},
        'google.com': {name: 'Google', parameter: 'q'},
        'search.brave.com': {name: 'Brave Search', parameter: 'q'},
        'search.yahoo.com': {name: 'Yahoo', parameter: 'p'}
    };
    const engine = engines[host];
    if (!engine) {
        return {known: true, value: false};
    }
    const query = url.searchParams.get(engine.parameter);
    return query ?
        {known: true, value: true, engine: engine.name, query, sourceUrl: rawUrl} :
        {known: true, value: false};
}

async function readSessions(): Promise<StoredTabSessions> {
    const stored = await browser.storage.local.get(TAB_SESSIONS_KEY);
    return (stored[TAB_SESSIONS_KEY] as StoredTabSessions | undefined) || {};
}

function mutateSessions(mutator: (sessions: StoredTabSessions) => void | Promise<void>): Promise<void> {
    mutationQueue = mutationQueue
        .then(async () => {
            const sessions = await readSessions();
            await mutator(sessions);
            await browser.storage.local.set({[TAB_SESSIONS_KEY]: sessions});
        })
        .catch(() => {
            // A later observation can rebuild missing first-observed state.
        });
    return mutationQueue;
}

async function getOpener(tab: Browser.tabs.Tab): Promise<OpenedFrom | undefined> {
    if (tab.openerTabId === undefined) {
        return undefined;
    }
    try {
        const opener = await browser.tabs.get(tab.openerTabId);
        if (opener.incognito) {
            return {tabId: tab.openerTabId};
        }
        return {tabId: tab.openerTabId, title: opener.title, url: opener.url};
    } catch {
        return {tabId: tab.openerTabId};
    }
}

async function captureTab(
    tab: Browser.tabs.Tab,
    openedAtSource: StoredTabSession['openedAtSource']
): Promise<void> {
    if (tab.id === undefined || tab.windowId === undefined || tab.incognito) {
        return;
    }
    const opener = await getOpener(tab);
    const observedAt = Date.now();
    await mutateSessions(sessions => {
        const key = String(tab.id);
        const existing = sessions[key];
        sessions[key] = {
            tabId: tab.id as number,
            windowId: tab.windowId,
            openedAt: existing?.openedAt || observedAt,
            openedAtSource: existing?.openedAtSource || openedAtSource,
            openerTabId: tab.openerTabId ?? existing?.openerTabId,
            openedFrom: existing?.openedFrom || opener,
            openedBySearch: existing?.openedBySearch ||
                (opener ? parseSearchSource(opener.url) : {known: false}),
            url: tab.url || existing?.url,
            title: tab.title || existing?.title,
            updatedAt: observedAt
        };
    });
}

async function seedOpenTabs(): Promise<void> {
    const tabs = (await browser.tabs.query({})).filter(tab => !tab.incognito);
    const liveIds = new Set(tabs.flatMap(tab => tab.id === undefined ? [] : [String(tab.id)]));
    await mutateSessions(sessions => {
        Object.keys(sessions).forEach(tabId => {
            if (!liveIds.has(tabId)) {
                delete sessions[tabId];
            }
        });
    });
    for (const tab of tabs) {
        await captureTab(tab, 'first-observed');
    }
}

async function resetAndSeed(): Promise<void> {
    await mutateSessions(sessions => {
        Object.keys(sessions).forEach(tabId => delete sessions[tabId]);
    });
    await seedOpenTabs();
}

export default defineBackground(() => {
    browser.alarms.onAlarm.addListener(alarm => {
        if (!alarm.name.startsWith('workspace-task:')) {
            return;
        }
        const taskId = alarm.name.slice('workspace-task:'.length);
        void browser.storage.local.get(TASK_REMINDERS_KEY).then(stored => {
            const reminders = stored[TASK_REMINDERS_KEY] as Record<string, {title?: string}> | undefined;
            const reminder = reminders?.[taskId];
            if (!reminder) {
                return;
            }
            return browser.notifications.create({
                type: 'basic',
                iconUrl: browser.runtime.getURL('/legacy/index.html').replace('/index.html', '/icons/icon128.png'),
                title: 'Browser OS task',
                message: reminder.title || 'A workspace task is ready.'
            });
        });
    });
    browser.tabs.onCreated.addListener(tab => {
        void captureTab(tab, 'created-event');
    });
    browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
        if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
            void captureTab(tab, 'first-observed');
        }
    });
    browser.tabs.onRemoved.addListener(tabId => {
        void mutateSessions(sessions => {
            delete sessions[String(tabId)];
        });
    });
    browser.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
        void mutateSessions(sessions => {
            delete sessions[String(removedTabId)];
        }).then(async () => {
            try {
                await captureTab(await browser.tabs.get(addedTabId), 'first-observed');
            } catch {
                // Replacement may disappear before it can be observed.
            }
        });
    });
    browser.runtime.onInstalled.addListener(() => {
        void resetAndSeed();
    });
    browser.runtime.onStartup.addListener(() => {
        void resetAndSeed();
    });
    void seedOpenTabs();
});
