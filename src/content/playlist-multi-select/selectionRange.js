/**
 * Selection-range helpers for playlist multi-select.
 */

import { HOST_CLASS, VIDEO_ID_PATTERN } from './constants.js';

const VIDEO_ID_ATTRIBUTE = 'data-yt-commander-video-id';

/**
 * Read video id from a decorated host.
 * @param {Element|null} host
 * @returns {string}
 */
function readHostVideoId(host) {
    if (!(host instanceof Element)) {
        return '';
    }

    const videoId = host.getAttribute(VIDEO_ID_ATTRIBUTE) || '';
    return VIDEO_ID_PATTERN.test(videoId) ? videoId : '';
}

/**
 * Collect selectable hosts in current DOM order.
 * @returns {Element[]}
 */
function getSelectableHosts() {
    return Array.from(document.querySelectorAll(`.${HOST_CLASS}`))
        .filter((host) => host.isConnected && Boolean(readHostVideoId(host)));
}

/**
 * Resolve index of a video id in an ordered host list.
 * @param {Element[]} hosts
 * @param {string} videoId
 * @param {Element|null} preferredHost
 * @returns {number}
 */
function resolveIndex(hosts, videoId, preferredHost) {
    if (!VIDEO_ID_PATTERN.test(videoId) || !Array.isArray(hosts) || hosts.length === 0) {
        return -1;
    }

    if (
        preferredHost instanceof Element
        && preferredHost.isConnected
        && readHostVideoId(preferredHost) === videoId
    ) {
        const preferredIndex = hosts.indexOf(preferredHost);
        if (preferredIndex >= 0) {
            return preferredIndex;
        }
    }

    return hosts.findIndex((host) => readHostVideoId(host) === videoId);
}

/**
 * Deduplicate video ids while preserving first-seen order.
 * @param {Element[]} hosts
 * @returns {string[]}
 */
function collectUniqueVideoIds(hosts) {
    const result = [];
    const seen = new Set();

    hosts.forEach((host) => {
        const videoId = readHostVideoId(host);
        if (!videoId || seen.has(videoId)) {
            return;
        }

        seen.add(videoId);
        result.push(videoId);
    });

    return result;
}

/**
 * Create stateful range resolver used by Shift+click behavior.
 * @returns {{
 *   hasAnchor: () => boolean,
 *   setAnchor: (videoId: string, host?: Element|null) => void,
 *   reset: () => void,
 *   resolveRange: (videoId: string, host?: Element|null) => string[]
 * }}
 */
function createSelectionRangeController() {
    let anchorVideoId = '';
    let anchorHost = null;

    function hasAnchor() {
        return VIDEO_ID_PATTERN.test(anchorVideoId);
    }

    function reset() {
        anchorVideoId = '';
        anchorHost = null;
    }

    function setAnchor(videoId, host = null) {
        if (!VIDEO_ID_PATTERN.test(videoId)) {
            reset();
            return;
        }

        anchorVideoId = videoId;
        anchorHost = host instanceof Element ? host : null;
    }

    function resolveRange(videoId, host = null) {
        if (!VIDEO_ID_PATTERN.test(videoId)) {
            return [];
        }

        if (!hasAnchor()) {
            return [];
        }

        const hosts = getSelectableHosts();
        if (hosts.length === 0) {
            return [videoId];
        }

        const targetIndex = resolveIndex(hosts, videoId, host);
        const anchorIndex = resolveIndex(hosts, anchorVideoId, anchorHost);

        if (targetIndex < 0 || anchorIndex < 0) {
            return [videoId];
        }

        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        return collectUniqueVideoIds(hosts.slice(start, end + 1));
    }

    return {
        hasAnchor,
        setAnchor,
        reset,
        resolveRange
    };
}

export { createSelectionRangeController };
