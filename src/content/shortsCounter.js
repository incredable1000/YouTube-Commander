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
    OBSERVER_THROTTLE_MS
} from './shorts-counter/constants.js';
import { isShortsWatchPage, getCurrentShortsId } from './shorts-counter/pageContext.js';
import { loadCounterState, saveCounterState } from './shorts-counter/sessionStore.js';
import { createShortsCounterUi } from './shorts-counter/ui.js';

const logger = createLogger('ShortsCounter');

let countedVideos = new Set();
let counter = 0;

let observer = null;
let pageListenerCleanups = [];

let saveTimer = null;
let contextCheckScheduled = false;

let lastShortId = null;
let initialized = false;
let enabled = true;

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
 * Synchronize counter with currently active short.
 */
async function syncCounterWithCurrentShort() {
    if (!enabled) {
        return;
    }

    if (!isShortsWatchPage()) {
        lastShortId = null;
        removeCounterLabel();
        return;
    }

    if (!document.body) {
        return;
    }

    ensureCounterLabel();
    updateCounterDisplay();

    const shortId = getCurrentShortsId();
    if (!shortId || shortId === lastShortId) {
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
}

/**
 * Stop runtime hooks while feature is disabled.
 */
function stopRuntime() {
    teardownNavigationObserver();
    detachPageListeners();
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
