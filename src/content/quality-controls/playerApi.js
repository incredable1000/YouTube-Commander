/**
 * Player API helpers for quality controls.
 */

import { normalizeAvailableQualities } from '../../shared/quality.js';

/**
 * Resolve active YouTube player object.
 * @returns {any|null}
 */
function getPlayer() {
    return document.getElementById('movie_player')
        || document.querySelector('.html5-video-player')
        || null;
}

/**
 * Resolve active HTML5 video element.
 * @returns {HTMLVideoElement|null}
 */
function getVideoElement() {
    const video = document.querySelector('video.html5-main-video');
    return video instanceof HTMLVideoElement ? video : null;
}

/**
 * Check whether quality APIs are available on player.
 * @param {any} player
 * @returns {boolean}
 */
function isQualityApiReady(player) {
    return Boolean(
        player
        && typeof player.getAvailableQualityLevels === 'function'
        && typeof player.setPlaybackQuality === 'function'
    );
}

/**
 * Read available quality ids from player.
 * @param {any} player
 * @returns {string[]}
 */
function getAvailableQualities(player) {
    if (!isQualityApiReady(player)) {
        return [];
    }

    try {
        const values = player.getAvailableQualityLevels();
        return normalizeAvailableQualities(Array.isArray(values) ? values : []);
    } catch (_error) {
        return [];
    }
}

/**
 * Read currently selected playback quality id.
 * @param {any} player
 * @returns {string}
 */
function getCurrentPlaybackQuality(player) {
    if (!player || typeof player.getPlaybackQuality !== 'function') {
        return '';
    }

    try {
        const value = player.getPlaybackQuality();
        return typeof value === 'string' ? value.trim().toLowerCase() : '';
    } catch (_error) {
        return '';
    }
}

/**
 * Resolve current video id from player API/URL.
 * @param {any} player
 * @returns {string}
 */
function getCurrentVideoId(player) {
    try {
        const playerId = player?.getVideoData?.()?.video_id;
        if (typeof playerId === 'string' && playerId.trim()) {
            return playerId.trim();
        }
    } catch (_error) {
        // Ignore and fallback.
    }

    try {
        const playerUrl = player?.getVideoUrl?.();
        if (typeof playerUrl === 'string' && playerUrl.trim()) {
            const url = new URL(playerUrl, window.location.origin);
            const value = url.searchParams.get('v');
            if (value && value.trim()) {
                return value.trim();
            }
        }
    } catch (_error) {
        // Ignore and fallback.
    }

    try {
        const url = new URL(window.location.href);
        const value = url.searchParams.get('v');
        return value && value.trim() ? value.trim() : '';
    } catch (_error) {
        return '';
    }
}

/**
 * Apply quality selection to player.
 * @param {any} player
 * @param {string} quality
 * @returns {boolean}
 */
function applyPlaybackQuality(player, quality) {
    if (!isQualityApiReady(player) || typeof quality !== 'string' || !quality.trim()) {
        return false;
    }

    try {
        if (typeof player.setPlaybackQualityRange === 'function') {
            player.setPlaybackQualityRange(quality, quality);
        }
        player.setPlaybackQuality(quality);
        return true;
    } catch (_error) {
        return false;
    }
}

export {
    getPlayer,
    getVideoElement,
    isQualityApiReady,
    getAvailableQualities,
    getCurrentPlaybackQuality,
    getCurrentVideoId,
    applyPlaybackQuality
};
