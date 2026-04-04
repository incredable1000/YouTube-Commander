// Subscription Labels - Channel Utilities

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

export function getShortsVideoIdFromCard(card) {
    if (!card) {
        return '';
    }
    const anchor =
        card.querySelector('a[href*="/shorts/"]') || card.querySelector('a[href*="shorts/"]');
    const href = anchor?.getAttribute?.('href') || '';
    return extractVideoIdFromHref(href) || '';
}

export function getChannelPathFromNode(node) {
    return (
        node?.browseEndpoint?.canonicalBaseUrl ||
        node?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
        node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ||
        ''
    );
}
