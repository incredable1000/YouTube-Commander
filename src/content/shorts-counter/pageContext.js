/**
 * Page and video-id helpers for Shorts counter.
 */

import { getCurrentVideoId } from '../utils/youtube.js';

/**
 * Parse short ID from a URL/href.
 * @param {string} href
 * @returns {string|null}
 */
function extractShortIdFromHref(href) {
    if (!href || typeof href !== 'string') {
        return null;
    }

    try {
        const url = new URL(href, window.location.origin);
        const pathMatch = url.pathname.match(/\/shorts\/([^/?#]+)/);
        if (pathMatch?.[1]) {
            return pathMatch[1];
        }

        const queryId = url.searchParams.get('v');
        return queryId || null;
    } catch (_error) {
        return null;
    }
}

/**
 * True only on Shorts watch-view pages (/shorts/<id>), not channel Shorts tabs.
 * @returns {boolean}
 */
function isShortsWatchPage() {
    const path = window.location.pathname || '';
    if (!path.startsWith('/shorts/')) {
        return false;
    }

    return Boolean(extractShortIdFromHref(window.location.href));
}

/**
 * Derive the current active Shorts video ID.
 * @returns {string|null}
 */
function getCurrentShortsId() {
    if (!isShortsWatchPage()) {
        return null;
    }

    const fromUrl = extractShortIdFromHref(window.location.href);
    if (fromUrl) {
        return fromUrl;
    }

    const activeRenderer = document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
    if (activeRenderer) {
        const rendererId = activeRenderer.getAttribute('video-id') || activeRenderer.dataset?.videoId;
        if (rendererId) {
            return rendererId;
        }

        const activeLink = activeRenderer.querySelector('a[href*="/shorts/"]');
        const fromRendererLink = extractShortIdFromHref(activeLink?.href || '');
        if (fromRendererLink) {
            return fromRendererLink;
        }
    }

    const fromQuery = getCurrentVideoId();
    return fromQuery || null;
}

export {
    extractShortIdFromHref,
    isShortsWatchPage,
    getCurrentShortsId
};
