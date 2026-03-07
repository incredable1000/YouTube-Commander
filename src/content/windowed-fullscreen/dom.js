/**
 * Windowed fullscreen DOM helpers.
 */

import { FALLBACK_PLAYER_MOUNT_SELECTORS } from './constants.js';

/**
 * Check whether a mount parent can safely host #movie_player.
 * @param {Node|null} node
 * @returns {boolean}
 */
export function isUsableMountParent(node) {
    if (!(node instanceof Element) || !node.isConnected) {
        return false;
    }

    if (node.closest('ytd-miniplayer')) {
        return false;
    }

    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
    }

    return true;
}

/**
 * Resolve fallback watch-page container for #movie_player when original mount is stale.
 * @returns {Element|null}
 */
export function findFallbackPlayerMount() {
    for (const selector of FALLBACK_PLAYER_MOUNT_SELECTORS) {
        const candidate = document.querySelector(selector);
        if (isUsableMountParent(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * Resolve root player host that should be moved into the windowed overlay.
 * @param {Element|null} player
 * @returns {Element|null}
 */
export function getRootPlayerHost(player) {
    if (!(player instanceof Element)) {
        return null;
    }

    return player.closest('#movie_player') || player;
}

/**
 * Ensure overlay host exists in document body.
 * @param {string} overlayClass
 * @returns {HTMLDivElement|null}
 */
export function ensureOverlayHost(overlayClass) {
    if (!document.body) {
        return null;
    }

    const host = document.createElement('div');
    host.className = overlayClass;
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    return host;
}

/**
 * Trigger a few resize ticks so YouTube recalculates stream geometry.
 * @param {Element|null} player
 * @param {number[]} relayoutDelaysMs
 */
export function forcePlayerRelayout(player, relayoutDelaysMs) {
    const target = player instanceof Element ? player : null;

    relayoutDelaysMs.forEach((delay) => {
        setTimeout(() => {
            try {
                window.dispatchEvent(new Event('resize'));
            } catch (_error) {
                // no-op
            }

            if (target && typeof target.dispatchEvent === 'function') {
                try {
                    target.dispatchEvent(new Event('resize'));
                } catch (_error) {
                    // no-op
                }
            }
        }, delay);
    });
}

/**
 * Get current watch video id from URL.
 * @returns {string|null}
 */
export function getCurrentWatchVideoId() {
    try {
        const url = new URL(location.href);
        const value = url.searchParams.get('v');
        return value && value.trim() ? value.trim() : null;
    } catch (_error) {
        return null;
    }
}
