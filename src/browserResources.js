/* global app */
{
    const {getUiElements, debounce} = app.util;
    const browserData = app.browserData;

    const resourceConfig = {
        bookmarks: {title: 'Bookmarks', placeholder: 'Search bookmarks'},
        tabs: {title: 'Open Tabs', placeholder: 'Search open tabs'},
        history: {title: 'History', placeholder: 'Search history'}
    };

    const icons = {
        bookmarks: '<path d="M7 4.8A1.8 1.8 0 0 1 8.8 3h6.4A1.8 1.8 0 0 1 17 4.8V21l-5-3-5 3Z"/>',
        tabs: '<rect x="4" y="5" width="14" height="12" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v9M8 20h8"/>',
        history: '<path d="M4 5v5h5"/><path d="M5.4 15.2A8 8 0 1 0 6 7"/><path d="M12 7v5l3 2"/>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
        boards: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
        inspector: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/><circle cx="10" cy="12" r="2"/>',
        refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
        window: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/>',
        globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/>',
        close: '<path d="m7 7 10 10M17 7 7 17"/>'
    };

    const svgIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || ''}</svg>`;

    const getDefaultBounds = () => {
        const availableWidth = Math.max(window.innerWidth - 24, 320);
        const availableHeight = Math.max(window.innerHeight - 92, 360);
        const width = Math.min(Math.max(Math.floor(window.innerWidth * 0.74), 340), 1060, availableWidth);
        const height = Math.min(Math.max(Math.floor(window.innerHeight * 0.72), 420), 700, availableHeight);
        return {
            width,
            height,
            x: Math.max(Math.floor((window.innerWidth - width) * 0.58), 16),
            y: Math.max(Math.floor((window.innerHeight - height) * 0.42), 16)
        };
    };

    const setActiveWindow = win => {
        const active = document.querySelector('.window.active');
        if (active && active !== win) {
            active.classList.remove('active');
        }
        win.classList.add('active');
    };

    const createStateMessage = (container, message, tone = '') => {
        container.innerHTML = '';
        const state = document.createElement('div');
        state.className = `resourceState ${tone}`;
        state.textContent = message;
        container.appendChild(state);
    };

    const createFavicon = item => {
        const frame = document.createElement('span');
        frame.className = 'resourceFavicon';
        frame.innerHTML = svgIcon('globe');
        if (item.faviconUrl) {
            const img = document.createElement('img');
            img.src = item.faviconUrl;
            img.alt = '';
            img.addEventListener('load', () => frame.classList.add('hasImage'));
            img.addEventListener('error', () => img.remove());
            frame.appendChild(img);
        } else if (item.url && item.type !== 'document') {
            const img = document.createElement('img');
            img.src = `/_favicon/?pageUrl=${encodeURIComponent(item.url)}&size=32`;
            img.alt = '';
            img.addEventListener('load', () => frame.classList.add('hasImage'));
            img.addEventListener('error', () => img.remove());
            frame.appendChild(img);
        }
        return frame;
    };

    const createResourceRow = (item, controller, options = {}) => {
        const row = document.createElement('div');
        row.className = 'resourceRow';
        row.dataset.itemId = item.id;
        if (item.active) {
            row.classList.add('current');
        }
        const selectSurface = document.createElement('button');
        selectSurface.type = 'button';
        selectSurface.className = 'resourceRowSelect';
        selectSurface.setAttribute('aria-pressed', 'false');
        selectSurface.setAttribute('aria-label', item.title || 'Untitled');
        selectSurface.appendChild(createFavicon(item));

        const copy = document.createElement('span');
        copy.className = 'resourceRowCopy';
        const title = document.createElement('span');
        title.className = 'resourceRowTitle';
        title.textContent = item.title || 'Untitled';
        const secondary = document.createElement('span');
        secondary.className = 'resourceRowSecondary';
        secondary.textContent = item.path || item.displayHost || 'Not available';
        copy.appendChild(title);
        copy.appendChild(secondary);
        selectSurface.appendChild(copy);

        if (options.trailing) {
            const trailing = document.createElement('span');
            trailing.className = 'resourceRowTrailing';
            trailing.textContent = options.trailing;
            selectSurface.appendChild(trailing);
        }
        row.appendChild(selectSurface);

        if (item.type === 'tab') {
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'resourceRowClose';
            close.title = 'Close Tab';
            close.setAttribute('aria-label', `Close ${item.title || 'tab'}`);
            close.innerHTML = svgIcon('close');
            close.addEventListener('click', async e => {
                e.stopPropagation();
                try {
                    await browserData.closeTab(item.tabId);
                    if (controller.selectedId === item.id) {
                        controller.selectedId = undefined;
                        controller.inspector.setItem(null);
                    }
                    controller.refresh();
                } catch (error) {
                    controller.showError('The tab could not be closed.');
                }
            });
            row.appendChild(close);
        }

        const select = () => controller.selectItem(item, row);
        selectSurface.addEventListener('click', select);
        selectSurface.addEventListener('dblclick', () => controller.openItem(item));
        selectSurface.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                controller.openItem(item);
            } else if (e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                select();
            }
        });
        return row;
    };

    const createGroup = (label, meta, current) => {
        const group = document.createElement('section');
        group.className = 'resourceGroup';
        const heading = document.createElement('div');
        heading.className = 'resourceGroupHeading';
        heading.innerHTML = svgIcon('window');
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        heading.appendChild(labelEl);
        if (current) {
            const currentEl = document.createElement('span');
            currentEl.className = 'resourceCurrentLabel';
            currentEl.textContent = 'Current';
            heading.appendChild(currentEl);
        }
        if (meta) {
            const metaEl = document.createElement('span');
            metaEl.className = 'resourceGroupMeta';
            metaEl.textContent = meta;
            heading.appendChild(metaEl);
        }
        const rows = document.createElement('div');
        rows.className = 'resourceGroupRows';
        rows.setAttribute('role', 'group');
        rows.setAttribute('aria-label', label);
        group.appendChild(heading);
        group.appendChild(rows);
        return {group, rows};
    };

    const renderTabs = (controller, groups) => {
        controller.list.innerHTML = '';
        let totalTabs = 0;
        groups.forEach(groupInfo => {
            const group = createGroup(groupInfo.label, `${groupInfo.tabs.length} tabs`, groupInfo.focused);
            const filter = controller.filter.toLowerCase();
            groupInfo.tabs.filter(item => !filter || `${item.title} ${item.url}`.toLowerCase().includes(filter))
                .forEach(item => {
                    totalTabs++;
                    group.rows.appendChild(createResourceRow(item, controller));
                });
            if (group.rows.children.length) {
                controller.list.appendChild(group.group);
            }
        });
        if (!controller.list.children.length) {
            createStateMessage(controller.list, controller.filter ? 'No matching open tabs.' : 'No open tabs available.');
        }
        controller.summary.textContent = `${groups.length} windows  •  ${groups.reduce((sum, group) => sum + group.tabs.length, 0)} tabs`;
        controller.status.textContent = 'Tabs update automatically';
        controller.status.className = 'resourceLiveStatus live';
        return totalTabs;
    };

    const renderHistory = (controller, items) => {
        controller.list.innerHTML = '';
        const filter = controller.filter.toLowerCase();
        const visible = items.filter(item => !filter || `${item.title} ${item.url}`.toLowerCase().includes(filter));
        const group = createGroup('Recent history', `${visible.length} results`);
        visible.forEach(item => {
            group.rows.appendChild(createResourceRow(item, controller, {
                trailing: browserData.formatTimestamp(item.lastVisitTime, 'Unknown')
            }));
        });
        if (visible.length) {
            controller.list.appendChild(group.group);
        } else {
            createStateMessage(controller.list, controller.filter ? 'No matching history.' : 'No history available.');
        }
        controller.summary.textContent = `${items.length} recent pages`;
        controller.status.textContent = 'Local browser history';
        controller.status.className = 'resourceLiveStatus';
    };

    const renderBookmarks = (controller, groups) => {
        controller.list.innerHTML = '';
        let total = 0;
        const filter = controller.filter.toLowerCase();
        groups.forEach(groupInfo => {
            const visible = groupInfo.bookmarks.filter(item =>
                !filter || `${item.title} ${item.url} ${item.path}`.toLowerCase().includes(filter));
            if (!visible.length) {
                return;
            }
            const group = createGroup(groupInfo.label, `${visible.length} bookmarks`);
            visible.forEach(item => {
                total++;
                group.rows.appendChild(createResourceRow(item, controller));
            });
            controller.list.appendChild(group.group);
        });
        if (!total) {
            createStateMessage(controller.list, controller.filter ? 'No matching bookmarks.' : 'No bookmarks available.');
        }
        const all = groups.reduce((sum, group) => sum + group.bookmarks.length, 0);
        controller.summary.textContent = `${all} bookmarks`;
        controller.status.textContent = 'Chrome bookmarks';
        controller.status.className = 'resourceLiveStatus';
    };

    const createResourceWindow = (type, windowOptions = {}) => {
        const config = resourceConfig[type];
        if (!config) {
            return null;
        }
        const defaults = getDefaultBounds();
        const bounds = {
            x: Number.isFinite(windowOptions.x) ? windowOptions.x : defaults.x,
            y: Number.isFinite(windowOptions.y) ? windowOptions.y : defaults.y,
            width: Number.isFinite(windowOptions.width) ? windowOptions.width : defaults.width,
            height: Number.isFinite(windowOptions.height) ? windowOptions.height : defaults.height
        };
        const cleanupCallbacks = [];
        let launcherButton;
        const win = app.makeWindow(config.title, bounds.x, bounds.y, bounds.width, bounds.height, {
            beforeClose(close) {
                cleanupCallbacks.forEach(cleanup => cleanup());
                if (launcherButton) {
                    launcherButton.classList.remove('active');
                    launcherButton.setAttribute('aria-pressed', 'false');
                }
                close();
            }
        });
        win.classList.add('systemWindow', 'resourceWindow');
        win.setAttribute('aria-label', config.title);
        win.dataset.type = 'resource';
        win.dataset.id = type;
        const winUi = getUiElements(win);
        winUi.navContainer.style.display = 'none';
        winUi.content.classList.add('resourceWindowContent');

        const appShell = document.createElement('div');
        appShell.className = 'resourceApp';
        appShell.innerHTML = `
            <div class="resourceToolbar">
                <label class="resourceSearch">
                    ${svgIcon('search')}
                    <span class="srOnly">${config.placeholder}</span>
                    <input type="search" placeholder="${config.placeholder}" autocomplete="off">
                </label>
                <button class="resourceIconButton" type="button" data-id="refresh" title="Refresh" aria-label="Refresh">
                    ${svgIcon('refresh')}
                </button>
                <span class="resourceToolbarSpacer"></span>
                <button class="inspectorButton" type="button" data-id="inspector" aria-pressed="false">
                    ${svgIcon('inspector')}<span>Inspector</span>
                </button>
            </div>
            <div class="resourceBody">
                <div class="resourceListPane">
                    <div class="resourceList" data-id="list" role="region" aria-label="${config.title}"></div>
                    <div class="resourceFooter">
                        <span data-id="summary"></span>
                        <span class="resourceLiveStatus" data-id="status"></span>
                    </div>
                </div>
            </div>
        `;
        winUi.content.appendChild(appShell);
        const ui = getUiElements(appShell);
        const inspector = app.createInspector({
            async onAction(action, item) {
                try {
                    if (action === 'focus') {
                        await browserData.focusTab(item.tabId, item.windowId);
                    } else if (action === 'close') {
                        await browserData.closeTab(item.tabId);
                        controller.selectedId = undefined;
                        inspector.setItem(null);
                        controller.refresh();
                    } else if (action === 'open') {
                        controller.openItem(item);
                    } else if (action === 'open-new') {
                        await browserData.openUrl(item.url, false);
                    }
                } catch (error) {
                    controller.showError('The requested browser action was not available.');
                }
            }
        });
        ui.list.parentElement.parentElement.appendChild(inspector.element);
        inspector.element.id = `resource-inspector-${type}`;
        ui.inspector.setAttribute('aria-controls', inspector.element.id);
        ui.inspector.setAttribute('aria-expanded', 'false');
        inspector.setToggleButton(ui.inspector);

        const controller = {
            type,
            win,
            list: ui.list,
            summary: ui.summary,
            status: ui.status,
            inspector,
            filter: '',
            selectedId: undefined,
            items: [],
            groups: [],
            selectItem(item, row) {
                this.selectedId = item.id;
                this.list.querySelectorAll('.resourceRow.selected').forEach(el => {
                    el.classList.remove('selected');
                    el.querySelector('.resourceRowSelect').setAttribute('aria-pressed', 'false');
                });
                row.classList.add('selected');
                row.querySelector('.resourceRowSelect').setAttribute('aria-pressed', 'true');
                inspector.setItem(item);
            },
            async openItem(item) {
                if (item.type === 'tab') {
                    await browserData.focusTab(item.tabId, item.windowId);
                } else if (item.type === 'document') {
                    app.openDocument(item.bookmarkId, {userOpened: true});
                } else if (item.url) {
                    await browserData.openUrl(item.url, true);
                }
            },
            showError(message) {
                createStateMessage(this.list, message, 'error');
                this.status.textContent = 'Not available';
                this.status.className = 'resourceLiveStatus error';
            },
            render() {
                if (this.type === 'tabs') {
                    renderTabs(this, this.groups);
                } else if (this.type === 'history') {
                    renderHistory(this, this.items);
                } else {
                    renderBookmarks(this, this.groups);
                }
                if (this.selectedId) {
                    const selected = this.list.querySelector(`[data-item-id="${CSS.escape(this.selectedId)}"]`);
                    if (selected) {
                        selected.classList.add('selected');
                        selected.querySelector('.resourceRowSelect').setAttribute('aria-pressed', 'true');
                    }
                }
            },
            async refresh() {
                this.status.textContent = '';
                this.list.setAttribute('aria-busy', 'true');
                createStateMessage(this.list, 'Loading…');
                try {
                    if (this.type === 'tabs') {
                        this.groups = await browserData.getBrowserWindows();
                    } else if (this.type === 'history') {
                        this.items = await browserData.getHistory();
                    } else {
                        this.groups = await browserData.getBookmarkGroups();
                    }
                    this.render();
                } catch (error) {
                    this.showError(this.type === 'history' ?
                        'History permission is unavailable.' : 'Browser data is unavailable.');
                } finally {
                    this.list.setAttribute('aria-busy', 'false');
                }
            }
        };
        win.resourceController = controller;

        ui.inspector.addEventListener('click', () => inspector.toggle());
        ui.refresh.addEventListener('click', () => controller.refresh());
        const searchInput = appShell.querySelector('.resourceSearch input');
        searchInput.addEventListener('input', () => {
            controller.filter = searchInput.value.trim();
            controller.render();
        });

        const autoRefresh = debounce(() => controller.refresh(), 180);
        if (type === 'tabs') {
            cleanupCallbacks.push(browserData.subscribeTabs(autoRefresh));
        } else if (type === 'history') {
            cleanupCallbacks.push(browserData.subscribeHistory(autoRefresh));
        }

        launcherButton = document.querySelector(`.resourceLauncher[data-resource="${type}"]`);
        if (launcherButton) {
            launcherButton.classList.add('active');
            launcherButton.setAttribute('aria-pressed', 'true');
        }
        controller.refresh();
        return win;
    };

    const openBrowserResource = (type, options = {}) => {
        const existing = document.querySelector(`.window.resourceWindow[data-id="${type}"]`);
        if (existing) {
            setActiveWindow(existing);
            if (existing.resourceController) {
                existing.resourceController.refresh();
            }
            return existing;
        }
        const win = createResourceWindow(type, options);
        if (win && app.rememberOpenWindows && options.userOpened !== false) {
            app.rememberOpenWindows();
        }
        return win;
    };
    app.openBrowserResource = openBrowserResource;

    const dock = document.createElement('nav');
    dock.className = 'resourceDock';
    dock.setAttribute('aria-label', 'Browser resources');
    const launchers = [
        {id: 'bookmarks', label: 'Bookmarks'},
        {id: 'tabs', label: 'Open Tabs'},
        {id: 'history', label: 'History'},
        {id: 'search', label: 'Search'},
        {id: 'boards', label: 'Boards'},
        {id: 'settings', label: 'Settings'}
    ];
    launchers.forEach(launcher => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'resourceLauncher';
        button.dataset.resource = launcher.id;
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = svgIcon(launcher.id);
        const label = document.createElement('span');
        label.textContent = launcher.label;
        button.appendChild(label);
        button.addEventListener('click', () => {
            if (resourceConfig[launcher.id]) {
                openBrowserResource(launcher.id, {userOpened: true});
            } else if (launcher.id === 'search' && app.openSearchModal) {
                app.openSearchModal();
            } else if (launcher.id === 'boards') {
                window.parent.postMessage({type: 'browser-os:open-workspace'}, window.location.origin);
            } else if (launcher.id === 'settings' && app.openOptions) {
                app.openOptions();
            }
        });
        dock.appendChild(button);
    });
    document.body.appendChild(dock);
}
