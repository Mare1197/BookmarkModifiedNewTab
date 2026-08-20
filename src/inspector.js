/* global app */
{
    const {formatTimestamp, getDomainMetadata, getOpenedBySearchLabel} = app.browserData;

    const makeIcon = (name) => {
        const paths = {
            chevron: '<path d="m8 10 4 4 4-4"/>',
            focus: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
            close: '<path d="m6 6 12 12M18 6 6 18"/>',
            open: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>'
        };
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
    };

    const createMetadataRow = (label, value, options = {}) => {
        const row = document.createElement('div');
        row.className = 'inspectorMetadataRow';
        const labelEl = document.createElement('div');
        labelEl.className = 'inspectorMetadataLabel';
        labelEl.textContent = label;
        const valueEl = document.createElement(options.link ? 'a' : 'div');
        valueEl.className = 'inspectorMetadataValue';
        valueEl.textContent = value;
        if (options.link) {
            valueEl.href = options.link;
            valueEl.target = '_blank';
            valueEl.rel = 'noreferrer';
        }
        if (options.title) {
            valueEl.title = options.title;
        }
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        return row;
    };

    const createSection = (title, expanded = true) => {
        const section = document.createElement('section');
        section.className = 'inspectorSection';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inspectorSectionToggle';
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        const titleEl = document.createElement('span');
        titleEl.textContent = title;
        button.appendChild(titleEl);
        button.insertAdjacentHTML('beforeend', makeIcon('chevron'));
        const content = document.createElement('div');
        content.className = 'inspectorSectionContent';
        content.hidden = !expanded;
        button.addEventListener('click', () => {
            const nextExpanded = button.getAttribute('aria-expanded') !== 'true';
            button.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
            content.hidden = !nextExpanded;
        });
        section.appendChild(button);
        section.appendChild(content);
        return {section, button, content};
    };

    const createInspector = (options = {}) => {
        const element = document.createElement('aside');
        element.className = 'resourceInspector';
        element.setAttribute('aria-label', 'Inspector');
        element.hidden = true;

        const detailsSection = createSection('Details');
        const tabSection = createSection('Tab / Session');
        const domainSection = createSection('Domain');
        const actionsSection = createSection('Actions');
        [detailsSection, tabSection, domainSection, actionsSection].forEach(section => {
            element.appendChild(section.section);
        });

        let item = null;
        let requestToken = 0;
        let toggleButton;

        const renderEmpty = () => {
            detailsSection.content.innerHTML = '';
            detailsSection.content.appendChild(createMetadataRow('Title', 'Not available'));
            tabSection.content.innerHTML = '';
            tabSection.content.appendChild(createMetadataRow('Opened', 'Not available'));
            tabSection.content.appendChild(createMetadataRow('Opened From', 'Not available'));
            tabSection.content.appendChild(createMetadataRow('Opened by Search', 'Not available'));
            domainSection.content.innerHTML = '';
            domainSection.content.appendChild(createMetadataRow('Domain', 'Not available'));
            domainSection.content.appendChild(createMetadataRow('First Opened', 'Not available'));
            domainSection.content.appendChild(createMetadataRow('Last Opened / Used', 'Not available'));
            actionsSection.content.innerHTML = '';
        };

        const renderActions = () => {
            actionsSection.content.innerHTML = '';
            if (!item) {
                return;
            }
            const actions = [];
            if (item.type === 'tab') {
                actions.push({id: 'focus', label: 'Focus Tab', icon: 'focus'});
                actions.push({id: 'close', label: 'Close Tab', icon: 'close', danger: true});
            } else if (item.url && item.type !== 'document') {
                actions.push({id: 'open', label: 'Open', icon: 'open'});
                actions.push({id: 'open-new', label: 'Open in new tab', icon: 'open'});
            }
            const actionGrid = document.createElement('div');
            actionGrid.className = 'inspectorActions';
            actions.forEach(action => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'resourceActionButton' + (action.danger ? ' danger' : '');
                button.innerHTML = makeIcon(action.icon);
                const label = document.createElement('span');
                label.textContent = action.label;
                button.appendChild(label);
                button.addEventListener('click', () => {
                    if (options.onAction) {
                        options.onAction(action.id, item);
                    }
                });
                actionGrid.appendChild(button);
            });
            actionsSection.content.appendChild(actionGrid);
        };

        const setItem = async (nextItem) => {
            item = nextItem;
            const token = ++requestToken;
            if (!item) {
                renderEmpty();
                return;
            }

            detailsSection.content.innerHTML = '';
            detailsSection.content.appendChild(createMetadataRow('Title', item.title || 'Untitled'));
            detailsSection.content.appendChild(createMetadataRow('URL', item.url || 'Not available', {
                link: item.url && item.type !== 'document' ? item.url : undefined,
                title: item.url
            }));
            if (item.type === 'history') {
                detailsSection.content.appendChild(createMetadataRow('Visits',
                    Number.isFinite(item.visitCount) ? String(item.visitCount) : 'Not available'));
            }
            if (item.type === 'bookmark' || item.type === 'document') {
                detailsSection.content.appendChild(createMetadataRow('Folder', item.path || 'Bookmarks'));
            }

            tabSection.content.innerHTML = '';
            if (item.type === 'tab') {
                tabSection.content.appendChild(createMetadataRow('Opened', formatTimestamp(item.openedAt)));
                const openedFrom = item.openedFrom ?
                    (item.openedFrom.title || item.openedFrom.url || 'Not available') : 'Unknown';
                tabSection.content.appendChild(createMetadataRow('Opened From', openedFrom, {
                    title: item.openedFrom && item.openedFrom.url
                }));
                tabSection.content.appendChild(createMetadataRow('Opened by Search',
                    getOpenedBySearchLabel(item.openedBySearch)));
                tabSection.content.appendChild(createMetadataRow('Window', item.windowLabel || 'Not available'));
                tabSection.content.appendChild(createMetadataRow('Status', item.active ? 'Active' : 'Open'));
            } else {
                tabSection.content.appendChild(createMetadataRow('Opened', 'Not available'));
                tabSection.content.appendChild(createMetadataRow('Opened From', 'Not available'));
                tabSection.content.appendChild(createMetadataRow('Opened by Search', 'Not available'));
            }

            domainSection.content.innerHTML = '';
            domainSection.content.appendChild(createMetadataRow('Domain', item.displayHost || 'Not available'));
            const firstRow = createMetadataRow('First Opened', item.host ? '…' : 'Not available');
            const lastRow = createMetadataRow('Last Opened / Used', item.host ? '…' : 'Not available');
            domainSection.content.appendChild(firstRow);
            domainSection.content.appendChild(lastRow);
            renderActions();

            if (item.host) {
                const domain = await getDomainMetadata(item.host);
                if (token !== requestToken) {
                    return;
                }
                firstRow.querySelector('.inspectorMetadataValue').textContent =
                    formatTimestamp(domain.firstOpenedAt, domain.source === 'not-available' ? 'Not available' : 'Unknown');
                lastRow.querySelector('.inspectorMetadataValue').textContent =
                    formatTimestamp(domain.lastOpenedAt, domain.source === 'not-available' ? 'Not available' : 'Unknown');
            }
        };

        const toggle = (force) => {
            const shouldOpen = force === undefined ? element.hidden : Boolean(force);
            element.hidden = !shouldOpen;
            if (toggleButton) {
                toggleButton.setAttribute('aria-pressed', shouldOpen ? 'true' : 'false');
                toggleButton.classList.toggle('active', shouldOpen);
            }
            return shouldOpen;
        };

        const setToggleButton = button => {
            toggleButton = button;
            toggleButton.setAttribute('aria-pressed', element.hidden ? 'false' : 'true');
        };

        renderEmpty();
        return {
            element,
            setItem,
            toggle,
            setToggleButton,
            getItem: () => item
        };
    };

    app.createInspector = createInspector;
}
