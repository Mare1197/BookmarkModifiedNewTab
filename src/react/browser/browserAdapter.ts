import {browser} from 'wxt/browser';

export interface BrowserTabSummary {
    id: number;
    windowId: number;
    active: boolean;
    title: string;
    url: string;
    favIconUrl?: string;
}

export async function listOpenTabs(): Promise<BrowserTabSummary[]> {
    const tabs = await browser.tabs.query({});
    return tabs.flatMap(tab => tab.id === undefined || tab.windowId === undefined ? [] : [{
        id: tab.id,
        windowId: tab.windowId,
        active: Boolean(tab.active),
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl
    }]);
}

export function subscribeToTabChanges(listener: () => void): () => void {
    const updateListener = () => listener();
    browser.tabs.onCreated.addListener(updateListener);
    browser.tabs.onUpdated.addListener(updateListener);
    browser.tabs.onRemoved.addListener(updateListener);
    return () => {
        browser.tabs.onCreated.removeListener(updateListener);
        browser.tabs.onUpdated.removeListener(updateListener);
        browser.tabs.onRemoved.removeListener(updateListener);
    };
}
