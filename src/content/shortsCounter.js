/**
 * Shorts Counter
 * Tracks unique Shorts views and displays a themed floating counter.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver, addEventListenerWithCleanup } from './utils/events.js';
import {
    SESSION_STORAGE_KEY,
    LABEL_ID,
    SAVE_DEBOUNCE_MS,
    OBSERVER_THROTTLE_MS,
    END_BIND_DELAY_MS,
    AUTO_SCROLL_END_THRESHOLD_S,
    AUTO_SCROLL_LOOP_RESTART_THRESHOLD_S,
    AUTO_SCROLL_RETRY_MS,
    AUTO_SCROLL_MAX_RETRIES
} from './shorts-counter/constants.js';
import {
    isShortsWatchPage,
    getCurrentShortsId,
    getActiveShortsVideoElement,
    advanceToNextShort
} from './shorts-counter/pageContext.js';
import { loadCounterState, saveCounterState } from './shorts-counter/sessionStore.js';
import { createShortsCounterUi } from './shorts-counter/ui.js';

const logger = createLogger('ShortsCounter');

let countedVideos = new Set();
let counter = 0;

let observer = null;
let pageListenerCleanups = [];

let saveTimer = null;
let endBindTimer = null;
let contextCheckScheduled = false;

let lastShortId = null;
let initialized = false;
let enabled = true;
let autoAdvanceBinding = null;
let autoAdvanceAttempt = null;

const counterUi = createShortsCounterUi({
    labelId: LABEL_ID,
    onReset: () => {
        void resetCounter();
    }
});

/**
 * Load counter data from tab-session storage.
 */
async function loadCounterData() {
    try {
        const state = loadCounterState(SESSION_STORAGE_KEY);
        countedVideos = state.countedVideos;
        counter = state.counter;
        logger.debug('Counter data loaded', { counter, uniqueVideos: countedVideos.size });
    } catch (error) {
        logger.error('Failed to load counter data', error);
        countedVideos = new Set();
        counter = 0;
    }
}

/**
 * Persist counter data to tab-session storage.
 */
async function saveCounterData() {
    try {
        saveCounterState(SESSION_STORAGE_KEY, { countedVideos, counter });
    } catch (error) {
        logger.error('Failed to save counter data', error);
    }
}

/**
 * Debounce storage writes during rapid shorts scrolling.
 */
function scheduleSaveCounterData() {
    if (saveTimer) {
        window.clearTimeout(saveTimer);
    }

    saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void saveCounterData();
    }, SAVE_DEBOUNCE_MS);
}

/**
 * Flush pending save immediately.
 */
async function flushPendingSave() {
    if (!saveTimer) {
        return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = null;
    await saveCounterData();
}

/**
 * Ensure label is mounted and synchronized.
 */
function ensureCounterLabel() {
    if (!counterUi.isMounted()) {
        counterUi.mount();
    }
}

/**
 * Remove counter element.
 */
function removeCounterLabel() {
    counterUi.unmount();
}

/**
 * Animate reset feedback.
 */
function animateCounterReset() {
    counterUi.animateReset();
}

/**
 * Update displayed count.
 * @param {object} options
 * @param {boolean} options.animate
 * @param {number} options.delta
 */
function updateCounterDisplay({ animate = false, delta = 1 } = {}) {
    counterUi.setCount(counter, { animate, delta });
}

/**
 * Remove currently bound auto-advance listeners.
 */
function clearAutoAdvanceBinding() {
    if (!autoAdvanceBinding) {
        return;
    }

    autoAdvanceBinding.video.removeEventListener('ended', autoAdvanceBinding.onEnded);
    autoAdvanceBinding.video.removeEventListener('timeupdate', autoAdvanceBinding.onTimeUpdate);
    autoAdvanceBinding.video.removeEventListener('seeking', autoAdvanceBinding.onSeeking);
    autoAdvanceBinding.video.removeEventListener('seeked', autoAdvanceBinding.onSeeked);
    autoAdvanceBinding = null;
}

/**
 * Clear pending auto-advance attempt.
 */
function clearAutoAdvanceAttempt() {
    if (!autoAdvanceAttempt) {
        return;
    }

    if (autoAdvanceAttempt.timerId) {
        window.clearTimeout(autoAdvanceAttempt.timerId);
    }
    autoAdvanceAttempt = null;
}

/**
 * Try to auto-advance to the next short.
 * @param {string} reason
 * @param {{expectedShortId?: string|null, sourceVideo?: HTMLVideoElement|null}} [options]
 * @returns {boolean}
 */
function triggerAutoAdvance(reason, options = {}) {
    if (!enabled || !isShortsWatchPage()) {
        return false;
    }

    const currentShortId = getCurrentShortsId();
    if (!currentShortId) {
        return false;
    }

    const expectedShortId = options.expectedShortId || currentShortId;
    if (expectedShortId !== currentShortId) {
        return false;
    }

    if (autoAdvanceAttempt && autoAdvanceAttempt.shortId === currentShortId) {
        return false;
    }

    if (options.sourceVideo instanceof HTMLVideoElement) {
        const activeVideo = getActiveShortsVideoElement();
        if (activeVideo && activeVideo !== options.sourceVideo) {
            return false;
        }
    }

    const attempt = {
        shortId: currentShortId,
        expectedShortId,
        sourceVideo: options.sourceVideo || null,
        retries: 0,
        timerId: null,
        reason
    };
    autoAdvanceAttempt = attempt;

    const scheduleRetry = () => {
        if (!autoAdvanceAttempt || autoAdvanceAttempt.shortId !== attempt.shortId) {
            return;
        }
        if (attempt.retries >= AUTO_SCROLL_MAX_RETRIES) {
            clearAutoAdvanceAttempt();
            return;
        }
        attempt.timerId = window.setTimeout(() => {
            if (!enabled || !isShortsWatchPage()) {
                clearAutoAdvanceAttempt();
                return;
            }
            if (getCurrentShortsId() !== attempt.shortId) {
                clearAutoAdvanceAttempt();
                return;
            }
            attempt.retries += 1;
            runAttempt(true);
        }, AUTO_SCROLL_RETRY_MS);
    };

    const runAttempt = (isRetry = false) => {
        if (!enabled || !isShortsWatchPage()) {
            clearAutoAdvanceAttempt();
            return;
        }
        const activeShortId = getCurrentShortsId();
        if (!activeShortId || activeShortId !== attempt.shortId) {
            clearAutoAdvanceAttempt();
            return;
        }
        if (attempt.expectedShortId && attempt.expectedShortId !== activeShortId) {
            clearAutoAdvanceAttempt();
            return;
        }
        if (attempt.sourceVideo instanceof HTMLVideoElement) {
            const activeVideo = getActiveShortsVideoElement();
            if (activeVideo && activeVideo !== attempt.sourceVideo) {
                clearAutoAdvanceAttempt();
                return;
            }
        }

        const advanced = advanceToNextShort();
        if (advanced) {
            logger.debug('Auto-advanced to next short', {
                shortId: attempt.shortId,
                reason,
                retry: isRetry
            });
            scheduleContextCheck();
        }
        scheduleRetry();
    };

    runAttempt(false);
    return true;
}

/**
 * Attach end/loop handlers to the active Shorts video only.
 * @param {HTMLVideoElement} video
 * @param {string} shortId
 */
function bindAutoAdvanceHandler(video, shortId) {
    if (!(video instanceof HTMLVideoElement) || !shortId) {
        return;
    }

    if (
        autoAdvanceBinding
        && autoAdvanceBinding.video === video
        && autoAdvanceBinding.shortId === shortId
    ) {
        return;
    }

    clearAutoAdvanceBinding();
    let lastPlaybackTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    let pendingSeekToEnd = false;

    const onEnded = () => {
        triggerAutoAdvance('ended', { expectedShortId: shortId, sourceVideo: video });
    };

    const onTimeUpdate = () => {
        const currentTime = video.currentTime;

        if (!enabled || !isShortsWatchPage()) {
            lastPlaybackTime = currentTime;
            return;
        }

        const activeVideo = getActiveShortsVideoElement();
        if (activeVideo && activeVideo !== video) {
            lastPlaybackTime = currentTime;
            return;
        }

        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            lastPlaybackTime = currentTime;
            return;
        }

        if (video.seeking) {
            lastPlaybackTime = currentTime;
            return;
        }

        const endThreshold = Math.min(1, Math.max(AUTO_SCROLL_END_THRESHOLD_S, video.duration * 0.04));
        const loopThreshold = Math.min(0.8, Math.max(AUTO_SCROLL_LOOP_RESTART_THRESHOLD_S, video.duration * 0.04));
        const endWindow = Math.min(1.5, endThreshold * 1.6);
        const remaining = video.duration - currentTime;
        const isNearEnd = !video.paused && remaining <= endThreshold;
        const jumpedBack = lastPlaybackTime > (currentTime + 0.15);
        const wasNearEnd = lastPlaybackTime >= (video.duration - endWindow);
        const loopRestarted = jumpedBack && wasNearEnd && currentTime <= loopThreshold;

        if (isNearEnd || loopRestarted) {
            triggerAutoAdvance(isNearEnd ? 'near-end' : 'loop-restart', {
                expectedShortId: shortId,
                sourceVideo: video
            });
        }

        lastPlaybackTime = currentTime;
    };

    const onSeeking = () => {
        pendingSeekToEnd = false;
        if (!enabled || !isShortsWatchPage()) {
            return;
        }
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
            return;
        }
        const endThreshold = Math.min(1, Math.max(AUTO_SCROLL_END_THRESHOLD_S, video.duration * 0.04));
        const remaining = video.duration - video.currentTime;
        if (remaining <= endThreshold) {
            pendingSeekToEnd = true;
        }
    };

    const onSeeked = () => {
        if (!pendingSeekToEnd) {
            return;
        }
        pendingSeekToEnd = false;
        if (!enabled || !isShortsWatchPage()) {
            return;
        }
        const activeVideo = getActiveShortsVideoElement();
        if (activeVideo && activeVideo !== video) {
            return;
        }
        triggerAutoAdvance('seek-end', { expectedShortId: shortId, sourceVideo: video });
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    autoAdvanceBinding = {
        video,
        shortId,
        onEnded,
        onTimeUpdate,
        onSeeking,
        onSeeked
    };
}

/**
 * Debounced binding for the active Shorts video.
 */
function scheduleEndedBinding() {
    if (!enabled) {
        return;
    }

    if (endBindTimer) {
        window.clearTimeout(endBindTimer);
    }

    endBindTimer = window.setTimeout(() => {
        endBindTimer = null;

        if (!enabled || !isShortsWatchPage()) {
            clearAutoAdvanceBinding();
            return;
        }

        const shortId = getCurrentShortsId();
        const activeVideo = getActiveShortsVideoElement();
        if (!shortId || !(activeVideo instanceof HTMLVideoElement)) {
            clearAutoAdvanceBinding();
            return;
        }

        bindAutoAdvanceHandler(activeVideo, shortId);
    }, END_BIND_DELAY_MS);
}

/**
 * Synchronize counter with currently active short.
 */
async function syncCounterWithCurrentShort() {
    if (!enabled) {
        return;
    }

    if (!isShortsWatchPage()) {
        lastShortId = null;
        clearAutoAdvanceAttempt();
        removeCounterLabel();
        clearAutoAdvanceBinding();
        return;
    }

    if (!document.body) {
        return;
    }

    ensureCounterLabel();
    updateCounterDisplay();
    scheduleEndedBinding();

    const shortId = getCurrentShortsId();
    if (!shortId) {
        return;
    }

    if (shortId !== lastShortId) {
        clearAutoAdvanceAttempt();
    }

    if (shortId === lastShortId) {
        return;
    }

    lastShortId = shortId;

    if (countedVideos.has(shortId)) {
        return;
    }

    countedVideos.add(shortId);
    counter += 1;

    updateCounterDisplay({ animate: true, delta: 1 });
    scheduleSaveCounterData();
    logger.debug('Counted new short', { shortId, counter });
}

/**
 * Coalesce repeated mutation/navigation signals into one frame update.
 */
function scheduleContextCheck() {
    if (!enabled || contextCheckScheduled) {
        return;
    }

    contextCheckScheduled = true;
    window.requestAnimationFrame(() => {
        contextCheckScheduled = false;
        void syncCounterWithCurrentShort();
    });
}

/**
 * Set up DOM observer for Shorts feed changes.
 */
function setupNavigationObserver() {
    if (observer || !document.body) {
        return;
    }

    observer = createThrottledObserver(
        () => {
            scheduleContextCheck();
        },
        OBSERVER_THROTTLE_MS,
        {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['is-active']
        }
    );

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['is-active']
    });
}

/**
 * Tear down DOM observer.
 */
function teardownNavigationObserver() {
    if (!observer) {
        return;
    }

    observer.disconnect();
    observer = null;
}

/**
 * Attach page-level listeners.
 */
function attachPageListeners() {
    if (pageListenerCleanups.length > 0) {
        return;
    }

    const onVisibilityChange = () => {
        if (!document.hidden) {
            scheduleContextCheck();
        }
    };

    const listenerSpecs = [
        [document, 'yt-navigate-finish', scheduleContextCheck],
        [document, 'yt-page-data-updated', scheduleContextCheck],
        [window, 'popstate', scheduleContextCheck],
        [window, 'focus', scheduleContextCheck],
        [document, 'visibilitychange', onVisibilityChange]
    ];

    listenerSpecs.forEach(([target, eventName, handler]) => {
        pageListenerCleanups.push(addEventListenerWithCleanup(target, eventName, handler));
    });
}

/**
 * Detach page-level listeners.
 */
function detachPageListeners() {
    pageListenerCleanups.forEach((cleanupFn) => cleanupFn());
    pageListenerCleanups = [];
}

/**
 * Start runtime hooks while feature is enabled.
 */
function startRuntime() {
    setupNavigationObserver();
    attachPageListeners();
    scheduleEndedBinding();
}

/**
 * Stop runtime hooks while feature is disabled.
 */
function stopRuntime() {
    teardownNavigationObserver();
    detachPageListeners();

    if (endBindTimer) {
        window.clearTimeout(endBindTimer);
        endBindTimer = null;
    }

    clearAutoAdvanceAttempt();
    clearAutoAdvanceBinding();
}

/**
 * Reset the counter and persisted IDs.
 */
async function resetCounter() {
    countedVideos.clear();
    counter = 0;
    lastShortId = null;

    updateCounterDisplay();
    animateCounterReset();
    await saveCounterData();
    scheduleContextCheck();
    logger.info('Shorts counter reset');
}

/**
 * Initialize Shorts counter feature.
 */
async function initShortsCounter() {
    if (initialized) {
        if (enabled) {
            scheduleContextCheck();
        }
        return;
    }

    try {
        logger.info('Initializing Shorts counter');
        await loadCounterData();

        initialized = true;
        enabled = true;

        startRuntime();
        scheduleContextCheck();
        logger.info('Shorts counter initialized', { counter });
    } catch (error) {
        logger.error('Failed to initialize Shorts counter', error);
    }
}

/**
 * Enable Shorts counter.
 */
function enable() {
    enabled = true;

    if (!initialized) {
        void initShortsCounter();
        return;
    }

    startRuntime();
    scheduleContextCheck();
    logger.info('Shorts counter enabled');
}

/**
 * Disable Shorts counter and hide its UI.
 */
function disable() {
    enabled = false;
    stopRuntime();
    removeCounterLabel();
    logger.info('Shorts counter disabled');
}

/**
 * Full teardown.
 */
function cleanup() {
    enabled = false;
    stopRuntime();
    removeCounterLabel();

    if (saveTimer) {
        void flushPendingSave();
    }

    contextCheckScheduled = false;
    lastShortId = null;
    clearAutoAdvanceAttempt();
    initialized = false;
    logger.info('Shorts counter cleaned up');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void initShortsCounter();
    }, { once: true });
} else {
    void initShortsCounter();
}

export {
    initShortsCounter,
    resetCounter,
    enable,
    disable,
    cleanup,
    initShortsCounter as init
};
