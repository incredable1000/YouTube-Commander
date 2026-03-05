/**
 * Shorts Counter
 * Tracks unique Shorts views and displays a themed floating counter.
 */

import { isShortsPage, getCurrentVideoId } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';
import { createThrottledObserver, addEventListenerWithCleanup } from './utils/events.js';
import { getLocalStorageData, setLocalStorageData } from './utils/storage.js';

const logger = createLogger('ShortsCounter');

const STORAGE_KEY = 'shortsCounterData';
const LABEL_ID = 'shorts-counter-label';
const SAVE_DEBOUNCE_MS = 700;

let countedVideos = new Set();
let counter = 0;

let counterLabel = null;
let counterValue = null;

let observer = null;
let pageListenerCleanups = [];
let counterClickCleanup = null;

let saveTimer = null;
let animationTimer = null;
let contextCheckScheduled = false;

let lastShortId = null;
let initialized = false;
let enabled = true;

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
    } catch (error) {
        return null;
    }
}

/**
 * Ensure loaded storage data is valid.
 * @param {object|null} rawData
 */
function hydrateCounterData(rawData) {
    const safeData = rawData && typeof rawData === 'object' ? rawData : {};
    const storedIds = Array.isArray(safeData.countedVideos)
        ? safeData.countedVideos.filter((id) => typeof id === 'string' && id.length > 0)
        : [];

    countedVideos = new Set(storedIds);

    const parsedCounter = Number.isFinite(safeData.counter) && safeData.counter >= 0
        ? Math.floor(safeData.counter)
        : countedVideos.size;

    counter = Math.max(parsedCounter, countedVideos.size);
}

/**
 * Load counter data from local storage.
 */
async function loadCounterData() {
    try {
        const data = await getLocalStorageData({ [STORAGE_KEY]: null }, {});
        hydrateCounterData(data[STORAGE_KEY]);
        logger.debug('Counter data loaded', { counter, uniqueVideos: countedVideos.size });
    } catch (error) {
        logger.error('Failed to load counter data', error);
        countedVideos = new Set();
        counter = 0;
    }
}

/**
 * Persist counter data to local storage.
 */
async function saveCounterData() {
    try {
        await setLocalStorageData({
            [STORAGE_KEY]: {
                countedVideos: Array.from(countedVideos),
                counter
            }
        });
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
 * Create or recreate the floating counter element.
 */
function createCounterLabel() {
    const existing = document.getElementById(LABEL_ID);
    if (existing) {
        existing.remove();
    }

    counterLabel = document.createElement('button');
    counterLabel.id = LABEL_ID;
    counterLabel.type = 'button';
    counterLabel.className = 'yt-commander-shorts-counter';
    counterLabel.setAttribute('aria-label', 'Shorts watched counter. Click to reset.');
    counterLabel.title = 'Shorts watched (click to reset)';
    counterLabel.innerHTML = `
        <span class="yt-commander-shorts-counter__badge" aria-hidden="true"></span>
        <span class="yt-commander-shorts-counter__text">Shorts</span>
        <span class="yt-commander-shorts-counter__count">0</span>
    `;

    counterValue = counterLabel.querySelector('.yt-commander-shorts-counter__count');

    if (counterClickCleanup) {
        counterClickCleanup();
        counterClickCleanup = null;
    }
    counterClickCleanup = addEventListenerWithCleanup(counterLabel, 'click', () => {
        void resetCounter();
    });

    document.body.appendChild(counterLabel);
}

/**
 * Remove counter element and related handlers.
 */
function removeCounterLabel() {
    if (counterClickCleanup) {
        counterClickCleanup();
        counterClickCleanup = null;
    }

    if (counterLabel) {
        counterLabel.remove();
    }

    counterLabel = null;
    counterValue = null;
}

/**
 * Show animated +N chip for count increments.
 * @param {number} delta
 */
function showCounterDelta(delta) {
    if (!counterLabel || delta <= 0) {
        return;
    }

    const deltaChip = document.createElement('span');
    deltaChip.className = 'yt-commander-shorts-counter__delta';
    deltaChip.textContent = `+${delta}`;
    counterLabel.appendChild(deltaChip);

    window.requestAnimationFrame(() => {
        deltaChip.classList.add('yt-commander-shorts-counter__delta--visible');
    });

    window.setTimeout(() => {
        deltaChip.remove();
    }, 760);
}

/**
 * Trigger count increase animation.
 * @param {number} delta
 */
function animateCounterIncrease(delta) {
    if (!counterLabel || !counterValue) {
        return;
    }

    counterLabel.classList.remove('yt-commander-shorts-counter--bump');
    counterValue.classList.remove('yt-commander-shorts-counter__count--jump');
    void counterLabel.offsetWidth;

    counterLabel.classList.add('yt-commander-shorts-counter--bump');
    counterValue.classList.add('yt-commander-shorts-counter__count--jump');
    showCounterDelta(delta);

    if (animationTimer) {
        window.clearTimeout(animationTimer);
    }
    animationTimer = window.setTimeout(() => {
        if (counterLabel) {
            counterLabel.classList.remove('yt-commander-shorts-counter--bump');
        }
        if (counterValue) {
            counterValue.classList.remove('yt-commander-shorts-counter__count--jump');
        }
        animationTimer = null;
    }, 460);
}

/**
 * Animate reset feedback.
 */
function animateCounterReset() {
    if (!counterLabel) {
        return;
    }

    counterLabel.classList.remove('yt-commander-shorts-counter--reset');
    void counterLabel.offsetWidth;
    counterLabel.classList.add('yt-commander-shorts-counter--reset');

    window.setTimeout(() => {
        if (counterLabel) {
            counterLabel.classList.remove('yt-commander-shorts-counter--reset');
        }
    }, 380);
}

/**
 * Update displayed count.
 * @param {object} options
 * @param {boolean} options.animate
 * @param {number} options.delta
 */
function updateCounterDisplay({ animate = false, delta = 1 } = {}) {
    if (!counterLabel || !counterValue) {
        return;
    }

    counterValue.textContent = counter.toLocaleString();

    if (animate) {
        animateCounterIncrease(delta);
    }
}

/**
 * Derive the current active Shorts video ID.
 * @returns {string|null}
 */
function getCurrentShortsId() {
    if (!isShortsPage()) {
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

/**
 * Synchronize counter with currently active short.
 */
async function syncCounterWithCurrentShort() {
    if (!enabled) {
        return;
    }

    if (!isShortsPage()) {
        lastShortId = null;
        removeCounterLabel();
        return;
    }

    if (!document.body) {
        return;
    }

    if (!counterLabel) {
        createCounterLabel();
        updateCounterDisplay();
    }

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
        260,
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

    pageListenerCleanups.push(addEventListenerWithCleanup(document, 'yt-navigate-finish', scheduleContextCheck));
    pageListenerCleanups.push(addEventListenerWithCleanup(document, 'yt-page-data-updated', scheduleContextCheck));
    pageListenerCleanups.push(addEventListenerWithCleanup(window, 'popstate', scheduleContextCheck));
    pageListenerCleanups.push(addEventListenerWithCleanup(window, 'focus', scheduleContextCheck));
    pageListenerCleanups.push(addEventListenerWithCleanup(document, 'visibilitychange', () => {
        if (!document.hidden) {
            scheduleContextCheck();
        }
    }));
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

    if (animationTimer) {
        window.clearTimeout(animationTimer);
        animationTimer = null;
    }

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
