const TRACKING_PARAMETER = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i;

export function stableId(kind: string, seed: string): string {
    const input = String(seed || 'unknown');
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return kind + '_' + (hash >>> 0).toString(36) + '_' + input.length.toString(36);
}

export function canonicalizeUrl(rawUrl?: string): string {
    if (!rawUrl) {
        return '';
    }
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
    }
    parsed.protocol = parsed.protocol.toLocaleLowerCase();
    parsed.hostname = parsed.hostname.toLocaleLowerCase();
    if ((parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')) {
        parsed.port = '';
    }
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');
    if (parsed.pathname.length > 1) {
        parsed.pathname = parsed.pathname.replace(/\/$/, '');
    }
    const parameters: Array<[string, string]> = [];
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
}

export function pageEntityId(rawUrl: string): string {
    const canonicalUrl = canonicalizeUrl(rawUrl);
    return canonicalUrl ? stableId('page', canonicalUrl) : '';
}
