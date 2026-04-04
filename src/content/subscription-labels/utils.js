// Subscription Labels Utilities

export function isCardElement(target) {
    if (!target) return false;
    return target.matches?.('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer')
        || target.closest?.('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-section-renderer');
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

export function isChannelPath(path) {
    if (typeof path !== 'string') {
        return false;
    }
    return /^\/(channel|user|@|\/c\/)/.test(path);
}

export function extractChannelIdFromPath(path) {
    if (typeof path !== 'string') {
        return null;
    }
    const match = path.match(/^\/(channel|user)\/([^\/?]+)/);
    return match ? match[2] : null;
}

export function normalizeChannelPath(path) {
    if (typeof path !== 'string') {
        return '';
    }
    if (path.startsWith('/@')) {
        return path;
    }
    if (path.startsWith('/channel/') || path.startsWith('/user/') || path.startsWith('/c/')) {
        return path;
    }
    return '';
}

export function extractVideoIdFromHref(href) {
    if (typeof href !== 'string') {
        return null;
    }
    const watchMatch = href.match(/[?&]v=([^&]+)/);
    if (watchMatch) {
        return watchMatch[1];
    }
    const shortsMatch = href.match(/\/shorts\/([^/?]+)/);
    if (shortsMatch) {
        return shortsMatch[1];
    }
    return null;
}
