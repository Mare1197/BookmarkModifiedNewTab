(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.workspaceSchemaCore = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const CURRENT_SCHEMA_VERSION = 4;
    const DOCUMENT_PREFIX = 'data:text/html;charset=UTF-8;base64,';
    const DOCUMENT_MARKER = '<!--sbd-doc-->';
    const TRACKING_PARAMETER = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;

    const stableId = (kind, seed) => {
        const input = String(seed || 'unknown');
        let hash = 2166136261;
        for (let index = 0; index < input.length; index++) {
            hash ^= input.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `${kind}_${(hash >>> 0).toString(36)}_${input.length.toString(36)}`;
    };

    const canonicalizeUrl = rawUrl => {
        if (!rawUrl || typeof rawUrl !== 'string') {
            return '';
        }
        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch (error) {
            return '';
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return '';
        }
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.hostname = parsed.hostname.toLowerCase();
        if ((parsed.protocol === 'http:' && parsed.port === '80') ||
            (parsed.protocol === 'https:' && parsed.port === '443')) {
            parsed.port = '';
        }
        parsed.hash = '';
        parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');
        if (parsed.pathname.length > 1) {
            parsed.pathname = parsed.pathname.replace(/\/$/, '');
        }
        const parameters = [];
        parsed.searchParams.forEach((value, key) => {
            if (!TRACKING_PARAMETER.test(key)) {
                parameters.push([key, value]);
            }
        });
        parameters.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
            leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
        parsed.search = '';
        parameters.forEach(([key, value]) => parsed.searchParams.append(key, value));
        return parsed.toString();
    };

    const getHost = rawUrl => {
        const canonicalUrl = canonicalizeUrl(rawUrl);
        if (!canonicalUrl) {
            return '';
        }
        return new URL(canonicalUrl).hostname;
    };

    const normalizeSearchTerms = (...values) => {
        const terms = new Set();
        values.filter(value => typeof value === 'string').forEach(value => {
            const normalized = value.toLowerCase().trim();
            if (normalized) {
                terms.add(normalized);
            }
            normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean).forEach(term => terms.add(term));
        });
        return Array.from(terms).slice(0, 64);
    };

    const decodeDocument = rawUrl => {
        if (typeof rawUrl !== 'string' || !rawUrl.startsWith(DOCUMENT_PREFIX)) {
            return null;
        }
        const encoded = rawUrl.slice(DOCUMENT_PREFIX.length);
        try {
            const decoded = typeof Buffer === 'function' ?
                Buffer.from(encoded, 'base64').toString('utf8') :
                decodeURIComponent(escape(atob(encoded)));
            return decoded.startsWith(DOCUMENT_MARKER) ? decoded.slice(DOCUMENT_MARKER.length) : null;
        } catch (error) {
            return null;
        }
    };

    const isLegacyDocument = rawUrl => decodeDocument(rawUrl) !== null;

    const flattenBookmarkTree = bookmarkTree => {
        const records = [];
        const visit = (node, path, position) => {
            const isFolder = !node.url;
            const nextPath = isFolder && node.title ? path.concat(node.title) : path;
            records.push({
                node,
                path,
                position,
                parentPath: path.join(' / '),
                displayPath: nextPath.join(' / ')
            });
            (node.children || []).forEach((child, childIndex) => visit(child, nextPath, childIndex));
        };
        (bookmarkTree || []).forEach((rootNode, index) => visit(rootNode, [], index));
        return records;
    };

    const makePageEntity = (source, now = Date.now()) => {
        const canonicalUrl = canonicalizeUrl(source.url);
        const isDocument = isLegacyDocument(source.url);
        const type = source.type || (isDocument ? 'document' : 'page');
        const identitySeed = canonicalUrl || `${source.sourceKind || 'user'}:${source.sourceId || source.url || source.title}`;
        const host = canonicalUrl ? getHost(canonicalUrl) : '';
        return {
            id: stableId(type === 'document' ? 'document' : 'page', identitySeed),
            type,
            title: source.title || (host || 'Untitled'),
            canonicalUrl: canonicalUrl || undefined,
            domainId: host ? stableId('domain', host) : undefined,
            createdAt: source.createdAt || now,
            updatedAt: source.updatedAt || now,
            searchTerms: normalizeSearchTerms(source.title, canonicalUrl, host),
            metadata: source.metadata || {}
        };
    };

    const makeSourceReference = (source, entityId, now = Date.now()) => {
        const sourceKind = source.sourceKind || 'user';
        const sourceId = String(source.sourceId || stableId('source', source.url || source.title));
        const sourceKey = `${sourceKind}:${sourceId}`;
        return {
            id: stableId('source', sourceKey),
            sourceKey,
            sourceKind,
            sourceId,
            entityId,
            createdAt: source.createdAt || now,
            updatedAt: source.updatedAt || now,
            metadata: source.metadata || {}
        };
    };

    const buildLegacyMigrationPlan = ({legacyData = {}, bookmarkTree = [], now = Date.now()} = {}) => {
        const entities = new Map();
        const sourceRefs = new Map();
        const domains = new Map();
        const folders = new Map();
        const folderMemberships = new Map();
        const errors = [];
        const records = flattenBookmarkTree(bookmarkTree);
        const nodeIds = new Set(records.map(record => String(record.node.id)));

        records.forEach(record => {
            const node = record.node;
            const nodeId = String(node.id);
            if (!node.url) {
                if (!node.title) {
                    return;
                }
                const folder = {
                    id: stableId('folder', `bookmark:${nodeId}`),
                    title: node.title,
                    parentId: node.parentId ? stableId('folder', `bookmark:${node.parentId}`) : undefined,
                    sourceKind: 'bookmark',
                    sourceId: nodeId,
                    createdAt: node.dateAdded || now,
                    updatedAt: now
                };
                folders.set(folder.id, folder);
                return;
            }

            const looksLikeDocument = node.url.startsWith(DOCUMENT_PREFIX);
            const validDocument = isLegacyDocument(node.url);
            if (looksLikeDocument && !validDocument) {
                errors.push({code: 'malformed-document', recordId: nodeId,
                    message: 'Legacy document data could not be decoded and was left untouched.'});
            }
            if (!validDocument && !canonicalizeUrl(node.url)) {
                errors.push({code: 'unsupported-url', recordId: nodeId,
                    message: 'Bookmark URL is not a canonical HTTP(S) page.'});
                return;
            }

            const entity = makePageEntity({
                sourceKind: 'bookmark',
                sourceId: nodeId,
                title: node.title,
                url: node.url,
                type: validDocument ? 'document' : 'page',
                createdAt: node.dateAdded,
                metadata: {legacyDocument: validDocument}
            }, now);
            entities.set(entity.id, Object.assign({}, entities.get(entity.id), entity));
            const sourceRef = makeSourceReference({
                sourceKind: 'bookmark',
                sourceId: nodeId,
                createdAt: node.dateAdded,
                metadata: {parentId: node.parentId, index: record.position, path: record.parentPath}
            }, entity.id, now);
            sourceRefs.set(sourceRef.id, sourceRef);

            if (entity.domainId) {
                const host = getHost(entity.canonicalUrl);
                domains.set(entity.domainId, {
                    id: entity.domainId,
                    host,
                    createdAt: node.dateAdded || now,
                    updatedAt: now
                });
            }
            if (node.parentId) {
                const membership = {
                    id: stableId('membership', `bookmark:${node.parentId}:${entity.id}`),
                    folderId: stableId('folder', `bookmark:${node.parentId}`),
                    entityId: entity.id,
                    sourceKind: 'bookmark',
                    position: record.position,
                    createdAt: node.dateAdded || now,
                    updatedAt: now
                };
                folderMemberships.set(membership.id, membership);
            }
        });

        const iconPositions = legacyData.icons && typeof legacyData.icons === 'object' ? legacyData.icons : {};
        Object.entries(iconPositions).forEach(([recordId, position]) => {
            if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
                errors.push({code: 'malformed-layout', recordId,
                    message: 'Legacy desktop position is not a finite grid coordinate.'});
            } else if (!nodeIds.has(String(recordId))) {
                errors.push({code: 'orphan-layout', recordId,
                    message: 'Legacy desktop position does not match a current bookmark record.'});
            }
        });

        const operations = {
            entities: Array.from(entities.values()),
            sourceRefs: Array.from(sourceRefs.values()),
            domains: Array.from(domains.values()),
            folders: Array.from(folders.values()),
            folderMemberships: Array.from(folderMemberships.values())
        };
        return {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            generatedAt: now,
            counts: Object.fromEntries(Object.entries(operations).map(([key, values]) => [key, values.length])),
            errors,
            layoutSnapshot: {
                icons: iconPositions,
                locations: legacyData.locations || {},
                capturedAt: now
            },
            operations
        };
    };

    return {
        CURRENT_SCHEMA_VERSION,
        DOCUMENT_PREFIX,
        buildLegacyMigrationPlan,
        canonicalizeUrl,
        decodeDocument,
        flattenBookmarkTree,
        getHost,
        isLegacyDocument,
        makePageEntity,
        makeSourceReference,
        normalizeSearchTerms,
        stableId
    };
}));
