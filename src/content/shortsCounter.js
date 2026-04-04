/**
 * Shorts Counter
 * Tracks unique Shorts views and displays a themed floating counter.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver, addEventListenerWithCleanup } from './utils/events.js';
import {
    SESSION_STORAGE_KEY,
    LABEL_ID,
    AUTO_ADVANCE_LABEL_ID,
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
    getActiveShortsVideoElement
} from './shorts-counter/pageContext.js';
import { loadCounterState, saveCounterState } from './shorts-counter/sessionStore.js';
import { createShortsAutoAdvanceToggleUi, createShortsCounterUi } from './shorts-counter/ui.js';
import { createAutoAdvanceController } from './shorts-counter/autoAdvance.js';

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
let autoAdvanceEnabled = true;

const counterUi = createShortsCounterUi({
    labelId: LABEL_ID,
    onReset: () => {
        void resetCounter();
    }
});

const autoAdvanceUi = createShortsAutoAdvanceToggleUi({
    labelId: AUTO_ADVANCE_LABEL_ID,
    counterLabelId: LABEL_ID,
    onToggle: (nextValue) => {
        setAutoAdvanceEnabled(nextValue);
    }
});

const autoAdvance = createAutoAdvanceController({
    getAutoAdvanceEnabled: () => autoAdvanceEnabled,
    setAutoAdvanceEnabled,
    isShortsWatchPage,
    getCurrentShortsId,
    getActiveShortsVideoElement,
    scheduleContextCheck,
    logger,
    AUTO_SCROLL_END_THRESHOLD_S,
    AUTO_SCROLL_LOOP_RESTART_THRESHOLD_S,
    AUTO_SCROLL_RETRY_MS,
    AUTO_SCROLL_MAX_RETRIES
});

async function loadCounterData() {
    try {
        const state = loadCounterState(SESSION_STORAGE_KEY);
        countedVideos = state.countedVideos;
        counter = state.counter;
        autoAdvanceEnabled = state.autoAdvanceEnabled;
        logger.debug('Counter data loaded', { counter, uniqueVideos: countedVideos.size });
    } catch (error) {
        logger.error('Failed to load counter data', error);
        countedVideos = new Set();
        counter = 0;
        autoAdvanceEnabled = true;
    }
}

async function saveCounterData() {
    try {
        saveCounterState(SESSION_STORAGE_KEY, { countedVideos, counter, autoAdvanceEnabled });
    } catch (error) {
        logger.error('Failed to save counter data', error);
    }
}

function scheduleSaveCounterData() {
    if (saveTimer) {
        window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void saveCounterData();
    }, SAVE_DEBOUNCE_MS);
}

async function flushPendingSave() {
    if (!saveTimer) {
        return;
    }
    window.clearTimeout(saveTimer);
    saveTimer = null;
    await saveCounterData();
}

function ensureCounterLabel() {
    if (!counterUi.isMounted()) {
        counterUi.mount();
    }
}

function ensureAutoAdvanceToggle() {
    if (!autoAdvanceUi.isMounted()) {
        autoAdvanceUi.mount();
    }
    autoAdvanceUi.setEnabled(autoAdvanceEnabled);
}

function removeCounterLabel() {
    counterUi.unmount();
}

function removeAutoAdvanceToggle() {
    autoAdvanceUi.unmount();
}

function animateCounterReset() {
    counterUi.animateReset();
}

function updateCounterDisplay({ animate = false, delta = 1 } = {}) {
    counterUi.setCount(counter, { animate, delta });
}

function setAutoAdvanceEnabled(nextValue) {
    const normalized = Boolean(nextValue);
    if (autoAdvanceEnabled === normalized) {
        return;
    }
    autoAdvanceEnabled = normalized;
    autoAdvanceUi.setEnabled(autoAdvanceEnabled);
    void saveCounterData();
    if (!autoAdvanceEnabled) {
        autoAdvance.clearAutoAdvanceAttempt();
        autoAdvance.clearAutoAdvanceBinding();
        return;
    }
    if (enabled && isShortsWatchPage()) {
        scheduleEndedBinding();
    }
}

function scheduleEndedBinding() {
    if (!enabled || !autoAdvanceEnabled) {
        return;
    }
    if (endBindTimer) {
        window.clearTimeout(endBindTimer);
    }
    endBindTimer = window.setTimeout(() => {
        endBindTimer = null;
        if (!enabled || !autoAdvanceEnabled || !isShortsWatchPage()) {
            autoAdvance.clearAutoAdvanceBinding();
            return;
        }
        const shortId = getCurrentShortsId();
        const activeVideo = getActiveShortsVideoElement();
        if (!shortId || !(activeVideo instanceof HTMLVideoElement)) {
            autoAdvance.clearAutoAdvanceBinding();
            return;
        }
        autoAdvance.bindAutoAdvanceHandler(activeVideo, shortId);
    }, END_BIND_DELAY_MS);
}

async function syncCounterWithCurrentShort() {
    if (!enabled) {
        return;
    }
    if (!isShortsWatchPage()) {
        lastShortId = null;
        autoAdvance.clearAutoAdvanceAttempt();
        removeCounterLabel();
        removeAutoAdvanceToggle();
        autoAdvance.clearAutoAdvanceBinding();
        return;
    }
    if (!document.body) {
        return;
    }
    ensureAutoAdvanceToggle();
    ensureCounterLabel();
    updateCounterDisplay();
    scheduleEndedBinding();
    const shortId = getCurrentShortsId();
    if (!shortId) {
        return;
    }
    if (shortId !== lastShortId) {
        autoAdvance.clearAutoAdvanceAttempt();
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

function setupNavigationObserver() {
    if (observer || !document.body) {
        return;
    }
    observer = createThrottledObserver(
        () => {
            scheduleContextCheck();
        },
        OBSERVER_THROTTLE_MS,
        { childList: true, subtree: true, attributes: true, attributeFilter: ['is-active'] }
    );
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['is-active']
    });
}

function teardownNavigationObserver() {
    if (!observer) {
        return;
    }
    observer.disconnect();
    observer = null;
}

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

function detachPageListeners() {
    pageListenerCleanups.forEach((cleanupFn) => cleanupFn());
    pageListenerCleanups = [];
}

function startRuntime() {
    setupNavigationObserver();
    attachPageListeners();
    scheduleEndedBinding();
}

function stopRuntime() {
    teardownNavigationObserver();
    detachPageListeners();
    if (endBindTimer) {
        window.clearTimeout(endBindTimer);
        endBindTimer = null;
    }
    autoAdvance.clearAutoAdvanceAttempt();
    autoAdvance.clearAutoAdvanceBinding();
}

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

function disable() {
    enabled = false;
    stopRuntime();
    removeCounterLabel();
    removeAutoAdvanceToggle();
    logger.info('Shorts counter disabled');
}

function cleanup() {
    enabled = false;
    stopRuntime();
    removeCounterLabel();
    removeAutoAdvanceToggle();
    if (saveTimer) {
        void flushPendingSave();
    }
    contextCheckScheduled = false;
    lastShortId = null;
    autoAdvance.cleanup();
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

export { initShortsCounter, resetCounter, enable, disable, cleanup, initShortsCounter as init };
