/**
 * Shorts Upload Age
 * Renders "x ago" labels on Shorts thumbnails across feed surfaces.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver, addEventListenerWithCleanup } from './utils/events.js';
import {
    FEED_RENDERER_SELECTOR,
    LABEL_CLASS,
    LABEL_ATTR,
    RENDER_DEBOUNCE_MS,
    PROCESS_CHUNK_SIZE,
    RELATIVE_REFRESH_MS
} from './shorts-upload-age/constants.js';
import {
    collectShortCards,
    findLabelHost,
    resolveShortCardData
} from './shorts-upload-age/pageContext.js';
import { formatRelativeAge, extractRelativeFromText } from './shorts-upload-age/time.js';
import { createShortsUploadAgeResolver } from './shorts-upload-age/resolver.js';

const logger = createLogger('ShortsUploadAge');
const resolver = createShortsUploadAgeResolver({ logger });
const INLINE_HOST_CLASS = 'yt-commander-short-upload-age-inline-host';

let initialized = false;
let enabled = true;

let observer = null;
let pageListenerCleanups = [];

let renderTimer = null;
let refreshTimer = null;
let renderInProgress = false;
let rerenderPending = false;
let burstTimers = [];

/**
 * Wait for next animation frame.
 * @returns {Promise<void>}
 */
function waitForNextFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

/**
 * Remove one existing render timer.
 */
function clearRenderTimer() {
    if (!renderTimer) {
        return;
    }

    window.clearTimeout(renderTimer);
    renderTimer = null;
}

/**
 * Remove one existing relative-refresh timer.
 */
function clearRefreshTimer() {
    if (!refreshTimer) {
        return;
    }

    window.clearInterval(refreshTimer);
    refreshTimer = null;
}

/**
 * Clear pending burst timers used for delayed rerenders.
 */
function clearBurstTimers() {
    if (burstTimers.length === 0) {
        return;
    }

    burstTimers.forEach((timerId) => window.clearTimeout(timerId));
    burstTimers = [];
}

/**
 * Remove all rendered labels from DOM.
 */
function removeAllLabels() {
    const labels = document.querySelectorAll(`.${LABEL_CLASS}`);
    labels.forEach((label) => label.remove());
    const inlineHosts = document.querySelectorAll(`.${INLINE_HOST_CLASS}`);
    inlineHosts.forEach((host) => host.classList.remove(INLINE_HOST_CLASS));
}

/**
 * Remove labels that no longer map to a Shorts card.
 */
function cleanupStaleLabels() {
    const labels = document.querySelectorAll(`.${LABEL_CLASS}`);

    for (const label of labels) {
        const host = label.parentElement;
        if (!host || !host.isConnected) {
            label.remove();
            continue;
        }

        const container = host.closest(FEED_RENDERER_SELECTOR);
        if (!container) {
            label.remove();
            continue;
        }

        const resolved = resolveShortCardData(container);
        const shortId = resolved?.shortId || '';
        const labelShortId = label.getAttribute(LABEL_ATTR) || '';
        const expectedHost = resolved ? findLabelHost(container).host : null;

        if (!shortId || shortId !== labelShortId || !expectedHost || expectedHost !== host) {
            label.remove();
            host.classList.remove(INLINE_HOST_CLASS);
        }
    }
}

/**
 * Create or update label node for one card host.
 * @param {{host: Element, shortId: string, mode: 'inline'|'block'}} card
 * @returns {HTMLElement|null}
 */
function ensureCardLabel(card) {
    const { host, shortId, mode } = card;
    if (!host || !host.isConnected) {
        return null;
    }

    let label = host.querySelector(`.${LABEL_CLASS}`);
    if (label && label.getAttribute(LABEL_ATTR) !== shortId) {
        label.remove();
        label = null;
    }

    if (!label) {
        label = document.createElement('span');
        label.className = LABEL_CLASS;
        label.textContent = '';
        host.appendChild(label);
    }

    label.setAttribute(LABEL_ATTR, shortId);
    label.setAttribute('data-layout', mode);
    label.setAttribute('title', 'Short upload age');

    if (mode === 'inline') {
        host.classList.add(INLINE_HOST_CLASS);
    } else {
        host.classList.remove(INLINE_HOST_CLASS);
    }

    return label;
}

/**
 * Derive an "x ago" value from visible card text when present.
 * @param {{container: Element, host: Element}} card
 * @returns {string}
 */
function extractRelativeFromCard(card) {
    const hostText = extractRelativeFromText(card.host?.textContent || '');
    if (hostText) {
        return hostText;
    }

    return extractRelativeFromText(card.container?.textContent || '');
}

/**
 * Apply cached relative value to all rendered labels.
 */
function refreshRenderedLabels() {
    if (!enabled) {
        return;
    }

    const labels = document.querySelectorAll(`.${LABEL_CLASS}`);
    if (labels.length === 0) {
        return;
    }

    const nowMs = Date.now();
    for (const label of labels) {
        const shortId = label.getAttribute(LABEL_ATTR) || '';
        const timestampMs = resolver.getCachedTimestamp(shortId);
        if (!Number.isFinite(timestampMs)) {
            continue;
        }

        const text = formatRelativeAge(timestampMs, nowMs);
        if (text) {
            label.textContent = text;
            label.classList.remove('is-loading');
        }
    }
}

/**
 * Render one card label.
 * @param {{container: Element, host: Element, shortId: string, mode: 'inline'|'block'}} card
 * @param {number} nowMs
 */
async function renderCard(card, nowMs) {
    const label = ensureCardLabel(card);
    if (!label) {
        return;
    }

    const visibleRelative = extractRelativeFromCard(card);
    if (visibleRelative) {
        label.textContent = visibleRelative;
        label.classList.remove('is-loading');
        return;
    }

    const cachedTimestampMs = resolver.getCachedTimestamp(card.shortId);
    if (Number.isFinite(cachedTimestampMs)) {
        const cachedText = formatRelativeAge(cachedTimestampMs, nowMs);
        if (cachedText) {
            label.textContent = cachedText;
            label.classList.remove('is-loading');
            return;
        }
    }

    label.classList.add('is-loading');
    const timestampMs = await resolver.resolveUploadTimestamp(card.shortId);

    if (!enabled || !label.isConnected) {
        return;
    }

    const attachedShortId = label.getAttribute(LABEL_ATTR) || '';
    if (attachedShortId !== card.shortId) {
        return;
    }

    if (!Number.isFinite(timestampMs)) {
        label.remove();
        card.host.classList.remove(INLINE_HOST_CLASS);
        return;
    }

    const text = formatRelativeAge(timestampMs, Date.now());
    if (!text) {
        label.remove();
        card.host.classList.remove(INLINE_HOST_CLASS);
        return;
    }

    label.textContent = text;
    label.classList.remove('is-loading');
}

/**
 * Run full render pass with chunking.
 */
async function runRenderPass() {
    if (!enabled || !document.body) {
        return;
    }

    if (renderInProgress) {
        rerenderPending = true;
        return;
    }

    renderInProgress = true;

    try {
        cleanupStaleLabels();
        const cards = collectShortCards(document);
        if (cards.length === 0) {
            return;
        }

        const nowMs = Date.now();
        for (let index = 0; index < cards.length; index += PROCESS_CHUNK_SIZE) {
            if (!enabled) {
                break;
            }

            const chunk = cards.slice(index, index + PROCESS_CHUNK_SIZE);
            await Promise.all(chunk.map((card) => renderCard(card, nowMs)));

            if (index + PROCESS_CHUNK_SIZE < cards.length) {
                await waitForNextFrame();
            }
        }

        refreshRenderedLabels();
    } catch (error) {
        logger.error('Failed to render Shorts upload labels', error);
    } finally {
        renderInProgress = false;
        if (rerenderPending) {
            rerenderPending = false;
            scheduleRender();
        }
    }
}

/**
 * Schedule one debounced render pass.
 */
function scheduleRender() {
    if (!enabled) {
        return;
    }

    clearRenderTimer();
    renderTimer = window.setTimeout(() => {
        renderTimer = null;
        void runRenderPass();
    }, RENDER_DEBOUNCE_MS);
}

/**
 * Trigger multiple scheduled renders to catch delayed feed hydration.
 */
function scheduleRenderBurst() {
    if (!enabled) {
        return;
    }

    scheduleRender();
    clearBurstTimers();
    const delays = [240, 720, 1600];
    burstTimers = delays.map((delay) => window.setTimeout(() => {
        if (enabled) {
            scheduleRender();
        }
    }, delay));
}

/**
 * Start relative-time text refresh loop.
 */
function startRelativeRefreshLoop() {
    if (refreshTimer) {
        return;
    }

    refreshTimer = window.setInterval(() => {
        refreshRenderedLabels();
    }, RELATIVE_REFRESH_MS);
}

/**
 * Set up mutation observer.
 */
function setupObserver() {
    if (observer || !document.body) {
        return;
    }

    observer = createThrottledObserver(
        () => {
            scheduleRender();
        },
        RENDER_DEBOUNCE_MS,
        {
            childList: true,
            subtree: true
        }
    );

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Tear down mutation observer.
 */
function teardownObserver() {
    if (!observer) {
        return;
    }

    observer.disconnect();
    observer = null;
}

/**
 * Attach page-level listeners for SPA navigation and visibility.
 */
function attachPageListeners() {
    if (pageListenerCleanups.length > 0) {
        return;
    }

    const onVisibilityChange = () => {
        if (!document.hidden) {
            scheduleRenderBurst();
        }
    };

    const onNavigateStart = () => {
        removeAllLabels();
        scheduleRenderBurst();
    };

    const onNavigateFinish = () => {
        scheduleRenderBurst();
    };

    const onLogoClick = (event) => {
        const target = event.target instanceof Element
            ? event.target.closest('a#logo, ytd-topbar-logo-renderer a, a[aria-label*="YouTube Home"]')
            : null;

        if (!target) {
            return;
        }

        scheduleRenderBurst();
    };

    const listenerSpecs = [
        [document, 'yt-navigate-start', onNavigateStart],
        [document, 'yt-navigate-finish', onNavigateFinish],
        [document, 'yt-page-data-updated', scheduleRenderBurst],
        [document, 'yt-service-request-completed', scheduleRenderBurst],
        [window, 'popstate', scheduleRenderBurst],
        [window, 'focus', scheduleRenderBurst],
        [window, 'pageshow', scheduleRenderBurst],
        [document, 'visibilitychange', onVisibilityChange],
        [document, 'click', onLogoClick, { capture: true }]
    ];

    listenerSpecs.forEach(([target, eventName, handler, options]) => {
        pageListenerCleanups.push(addEventListenerWithCleanup(target, eventName, handler, options || {}));
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
    setupObserver();
    attachPageListeners();
    startRelativeRefreshLoop();
    scheduleRenderBurst();
}

/**
 * Stop runtime hooks.
 */
function stopRuntime() {
    teardownObserver();
    detachPageListeners();
    clearRenderTimer();
    clearRefreshTimer();
    clearBurstTimers();
}

/**
 * Initialize Shorts upload age feature.
 */
async function initShortsUploadAge() {
    if (initialized) {
        if (enabled) {
            scheduleRender();
        }
        return;
    }

    initialized = true;
    enabled = true;
    startRuntime();
    scheduleRenderBurst();
    logger.info('Shorts upload age initialized');
}

/**
 * Enable feature.
 */
function enable() {
    enabled = true;

    if (!initialized) {
        void initShortsUploadAge();
        return;
    }

    startRuntime();
    scheduleRenderBurst();
    logger.info('Shorts upload age enabled');
}

/**
 * Disable feature.
 */
function disable() {
    enabled = false;
    stopRuntime();
    removeAllLabels();
    logger.info('Shorts upload age disabled');
}

/**
 * Full teardown.
 */
function cleanup() {
    enabled = false;
    stopRuntime();
    removeAllLabels();
    resolver.clear();
    initialized = false;
    rerenderPending = false;
    renderInProgress = false;
    logger.info('Shorts upload age cleaned up');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void initShortsUploadAge();
    }, { once: true });
} else {
    void initShortsUploadAge();
}

export {
    initShortsUploadAge,
    enable,
    disable,
    cleanup,
    initShortsUploadAge as init
};
