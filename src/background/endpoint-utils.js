/**
 * Endpoint parsing utilities for sync.
 */

export function parseCloudflareEndpoint(rawEndpoint) {
    const value = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
    if (!value) {
        throw new Error('Cloudflare sync endpoint is required');
    }

    let url = null;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new Error('Cloudflare sync endpoint URL is invalid');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Cloudflare sync endpoint must use https/http');
    }

    if (!url.hostname) {
        throw new Error('Cloudflare sync endpoint must have a hostname');
    }

    return url;
}

export function parseSubscriptionEndpoint(rawEndpoint) {
    const value = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
    if (!value) {
        throw new Error('Subscription sync endpoint is required');
    }

    let url = null;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new Error('Subscription sync endpoint URL is invalid');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Subscription sync endpoint must use http/https');
    }

    return url;
}

export function buildSubscriptionEndpoint(rawEndpoint) {
    const endpoint = parseSubscriptionEndpoint(rawEndpoint);
    const pathname = endpoint.pathname || '/';

    if (pathname.endsWith('/subscriptions')) {
        return endpoint;
    }

    if (pathname.endsWith('/subscriptions/')) {
        endpoint.pathname = pathname.slice(0, -1);
        return endpoint;
    }

    if (pathname.endsWith('/sync')) {
        endpoint.pathname = `${pathname.slice(0, -5)}/subscriptions`;
        return endpoint;
    }

    if (pathname.endsWith('/sync/')) {
        endpoint.pathname = `${pathname.slice(0, -6)}/subscriptions`;
        return endpoint;
    }

    if (pathname === '/' || pathname === '') {
        endpoint.pathname = '/subscriptions';
        return endpoint;
    }

    endpoint.pathname = pathname.endsWith('/')
        ? `${pathname}subscriptions`
        : `${pathname}/subscriptions`;
    return endpoint;
}

export function buildCloudflarePullEndpoint(syncEndpoint) {
    const pullUrl = new URL(syncEndpoint.toString());
    if (pullUrl.pathname.endsWith('/sync')) {
        pullUrl.pathname = `${pullUrl.pathname.slice(0, -5)}/pull`;
    } else if (pullUrl.pathname.endsWith('/sync/')) {
        pullUrl.pathname = `${pullUrl.pathname.slice(0, -6)}/pull`;
    } else if (pullUrl.pathname.endsWith('/')) {
        pullUrl.pathname = `${pullUrl.pathname}pull`;
    } else {
        pullUrl.pathname = `${pullUrl.pathname}/pull`;
    }
    return pullUrl;
}

export function parseJsonSafe(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

export function normalizeSyncInterval(raw) {
    const value = Number(raw) || 0;
    if (value < 5) {
        return 5;
    }
    if (value > 1440) {
        return 1440;
    }
    return value;
}

export function normalizeSubscriptionInterval(raw) {
    const value = Number(raw) || 0;
    if (value < 15) {
        return 15;
    }
    if (value > 10080) {
        return 10080;
    }
    return value;
}

export function normalizeVideoIds(ids) {
    if (!Array.isArray(ids)) {
        return [];
    }
    return ids.map((id) => String(id).trim()).filter((id) => /^[A-Za-z0-9_-]{5,20}$/.test(id));
}

export function normalizeAccountKey(rawAccountKey) {
    const value = typeof rawAccountKey === 'string' ? rawAccountKey.trim() : '';
    if (!value) {
        return 'default';
    }
    return value;
}

export function normalizePendingByAccount(rawValue) {
    if (!rawValue || typeof rawValue !== 'object') {
        return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(rawValue)) {
        if (typeof key === 'string' && Array.isArray(value)) {
            result[key] = value.filter((id) => typeof id === 'string' && id.trim());
        }
    }
    return result;
}
