/**
 * Page and URL helpers for playlist multi-select.
 */

import { PLAYLIST_ID_PATTERN, VIDEO_ID_PATTERN } from './constants.js';

/**
 * Extract YouTube video id from a watch/shorts URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
    if (typeof url !== 'string' || !url) {
        return null;
    }

    try {
        const parsed = new URL(url, location.origin);
        const watchId = parsed.searchParams.get('v');
        if (watchId && VIDEO_ID_PATTERN.test(watchId)) {
            return watchId;
        }

        if (parsed.pathname.startsWith('/shorts/')) {
            const shortsId = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
            if (VIDEO_ID_PATTERN.test(shortsId)) {
                return shortsId;
            }
        }
    } catch (_error) {
        return null;
    }

    return null;
}

/**
 * Whether current page can enter feed-card selection mode.
 * @returns {boolean}
 */
function isEligiblePage() {
    const path = location.pathname || '';
    return path !== '/watch' && !path.startsWith('/shorts/');
}

/**
 * Resolve where to mount the masthead button near search/voice controls.
 * @returns {{parent: Element, anchor: ChildNode|null}|null}
 */
function resolveMastheadMountPoint() {
    const center = document.querySelector('ytd-masthead #center');
    if (!center) {
        return null;
    }

    const voiceRenderer = center.querySelector('ytd-button-renderer#voice-search-button')
        || center.querySelector('#voice-search-button')?.closest('ytd-button-renderer')
        || center.querySelector('#voice-search-button');

    if (voiceRenderer && voiceRenderer.parentElement) {
        return {
            parent: voiceRenderer.parentElement,
            anchor: voiceRenderer.nextSibling
        };
    }

    const searchBox = center.querySelector('ytd-searchbox');
    if (searchBox && searchBox.parentElement) {
        return {
            parent: searchBox.parentElement,
            anchor: searchBox.nextSibling
        };
    }

    return null;
}

/**
 * Resolve current playlist id from URL if present.
 * @returns {string}
 */
function getCurrentPlaylistId() {
    try {
        const parsed = new URL(location.href);
        const listId = parsed.searchParams.get('list') || '';
        if (PLAYLIST_ID_PATTERN.test(listId)) {
            return listId;
        }
    } catch (_error) {
        // Ignore and fallback below.
    }

    return '';
}

/**
 * Whether current route is a playlist page where remove should be offered.
 * @returns {boolean}
 */
function isPlaylistCollectionPage() {
    const path = location.pathname || '';
    if (path !== '/playlist') {
        return false;
    }

    return Boolean(getCurrentPlaylistId());
}

/**
 * Label text for remove action based on current playlist.
 * @returns {string}
 */
function getRemoveActionLabel() {
    return getCurrentPlaylistId() === 'WL' ? 'Remove from Watch later' : 'Remove from playlist';
}

export {
    extractVideoId,
    isEligiblePage,
    resolveMastheadMountPoint,
    getCurrentPlaylistId,
    isPlaylistCollectionPage,
    getRemoveActionLabel
};
