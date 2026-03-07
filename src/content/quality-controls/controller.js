/**
 * One-shot-per-video quality auto-apply controller.
 */

import { createThrottledObserver, addEventListenerWithCleanup } from '../utils/events.js';
import { chooseBestAvailableQuality, normalizeQualityId } from '../../shared/quality.js';
import {
    getPlayer,
    getVideoElement,
    isQualityApiReady,
    getAvailableQualities,
    getCurrentPlaybackQuality,
    getCurrentVideoId,
    applyPlaybackQuality
} from './playerApi.js';

const APPLY_RETRY_DELAYS_MS = [0, 120, 280, 520, 900, 1400, 2200];
const NAVIGATION_SCHEDULE_DELAY_MS = 120;
const PLAYER_OBSERVER_THROTTLE_MS = 450;

/**
 * Create quality controller.
 * @param {{
 *   logger?: {debug?: Function, info?: Function, warn?: Function, error?: Function},
 *   initialQuality?: string
 * }} [options]
 */
function createQualityController(options = {}) {
    const logger = options.logger || null;

    let preferredQuality = normalizeQualityId(options.initialQuality, 'hd1080');
    let started = false;
    let lastAppliedVideoId = '';
    let lastAppliedSetting = '';
    let lastAppliedTarget = '';
    let applyScheduleToken = 0;

    let activeVideoElement = null;
    let videoListenerCleanup = null;
    let domObserver = null;
    const cleanupCallbacks = [];

    /**
     * Try applying preferred quality once for current player/video.
     * @param {{force?: boolean, reason?: string}} options
     * @returns {boolean}
     */
    function applyOnce(options = {}) {
        const force = options.force === true;
        const reason = typeof options.reason === 'string' ? options.reason : 'unknown';

        const player = getPlayer();
        if (!isQualityApiReady(player)) {
            return false;
        }

        const availableQualities = getAvailableQualities(player);
        if (availableQualities.length === 0) {
            return false;
        }

        const videoId = getCurrentVideoId(player) || '';
        if (!force && videoId && lastAppliedVideoId === videoId && lastAppliedSetting === preferredQuality) {
            return true;
        }

        const targetQuality = chooseBestAvailableQuality(preferredQuality, availableQualities);
        if (!targetQuality) {
            return false;
        }

        const currentQuality = getCurrentPlaybackQuality(player);
        if (!force && currentQuality === targetQuality && videoId) {
            lastAppliedVideoId = videoId;
            lastAppliedSetting = preferredQuality;
            lastAppliedTarget = targetQuality;
            return true;
        }

        const applied = applyPlaybackQuality(player, targetQuality);
        if (!applied) {
            return false;
        }

        lastAppliedVideoId = videoId;
        lastAppliedSetting = preferredQuality;
        lastAppliedTarget = targetQuality;

        logger?.info?.('Applied preferred quality for video load', {
            videoId,
            targetQuality,
            preferredQuality,
            currentQuality,
            reason
        });

        return true;
    }

    /**
     * Invalidate pending retries.
     */
    function cancelPendingApply() {
        applyScheduleToken += 1;
    }

    /**
     * Schedule apply attempts with bounded retries while player initializes.
     * @param {{force?: boolean, reason?: string}} options
     */
    function scheduleApply(options = {}) {
        if (!started) {
            return;
        }

        const force = options.force === true;
        const reason = typeof options.reason === 'string' ? options.reason : 'unknown';
        const token = ++applyScheduleToken;

        APPLY_RETRY_DELAYS_MS.forEach((delayMs) => {
            window.setTimeout(() => {
                if (!started || token !== applyScheduleToken) {
                    return;
                }

                const applied = applyOnce({ force, reason });
                if (applied && token === applyScheduleToken) {
                    cancelPendingApply();
                }
            }, delayMs);
        });
    }

    /**
     * Attach loadedmetadata listener to active video element.
     */
    function bindVideoElementListener() {
        const nextVideoElement = getVideoElement();
        if (nextVideoElement === activeVideoElement) {
            return;
        }

        if (videoListenerCleanup) {
            videoListenerCleanup();
            videoListenerCleanup = null;
        }

        activeVideoElement = nextVideoElement;
        if (!activeVideoElement) {
            return;
        }

        const onLoadedMetadata = () => {
            scheduleApply({ force: false, reason: 'loadedmetadata' });
        };

        const boundVideoElement = activeVideoElement;
        boundVideoElement.addEventListener('loadedmetadata', onLoadedMetadata, { passive: true });
        videoListenerCleanup = () => {
            boundVideoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }

    /**
     * Handle potential player/video context change.
     * @param {string} reason
     */
    function handleContextChange(reason) {
        bindVideoElementListener();
        window.setTimeout(() => {
            scheduleApply({ force: false, reason });
        }, NAVIGATION_SCHEDULE_DELAY_MS);
    }

    /**
     * Start runtime listeners.
     */
    function start() {
        if (started) {
            return;
        }

        started = true;

        cleanupCallbacks.push(
            addEventListenerWithCleanup(document, 'yt-navigate-finish', () => {
                handleContextChange('yt-navigate-finish');
            })
        );
        cleanupCallbacks.push(
            addEventListenerWithCleanup(document, 'yt-page-data-updated', () => {
                handleContextChange('yt-page-data-updated');
            })
        );
        cleanupCallbacks.push(
            addEventListenerWithCleanup(window, 'popstate', () => {
                handleContextChange('popstate');
            })
        );

        domObserver = createThrottledObserver(() => {
            bindVideoElementListener();
        }, PLAYER_OBSERVER_THROTTLE_MS);

        if (document.body) {
            domObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        bindVideoElementListener();
        scheduleApply({ force: false, reason: 'startup' });
    }

    /**
     * Stop runtime listeners and observers.
     */
    function stop() {
        if (!started) {
            return;
        }

        started = false;
        cancelPendingApply();

        while (cleanupCallbacks.length > 0) {
            const teardown = cleanupCallbacks.pop();
            teardown();
        }

        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }

        if (videoListenerCleanup) {
            videoListenerCleanup();
            videoListenerCleanup = null;
        }
        activeVideoElement = null;
    }

    /**
     * Update preferred quality and optionally apply immediately.
     * @param {string} nextQuality
     * @param {{applyNow?: boolean, forceApply?: boolean}} [options]
     * @returns {string}
     */
    function updatePreferredQuality(nextQuality, options = {}) {
        const normalized = normalizeQualityId(nextQuality, preferredQuality);
        const changed = normalized !== preferredQuality;

        preferredQuality = normalized;
        if (changed) {
            lastAppliedSetting = '';
        }

        if (options.applyNow !== false) {
            scheduleApply({
                force: options.forceApply === true,
                reason: changed ? 'quality-setting-changed' : 'quality-setting-refresh'
            });
        }

        return preferredQuality;
    }

    /**
     * Read current preferred quality value.
     * @returns {string}
     */
    function getPreferredQuality() {
        return preferredQuality;
    }

    /**
     * Read last applied state (for debugging).
     * @returns {{videoId: string, setting: string, target: string}}
     */
    function getLastAppliedState() {
        return {
            videoId: lastAppliedVideoId,
            setting: lastAppliedSetting,
            target: lastAppliedTarget
        };
    }

    return {
        start,
        stop,
        scheduleApply,
        updatePreferredQuality,
        getPreferredQuality,
        getLastAppliedState
    };
}

export {
    createQualityController
};
