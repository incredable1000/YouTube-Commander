/**
 * Shorts Upload Age
 * Renders "x ago" labels on Shorts thumbnails across feed surfaces.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver, addEventListenerWithCleanup } from './utils/events.js';
import {
    RENDER_DEBOUNCE_MS,
    PROCESS_CHUNK_SIZE,
    RELATIVE_REFRESH_MS,
    BRIDGE_SOURCE,
    BRIDGE_REQUEST_TYPE,
    BRIDGE_RESPONSE_TYPE,
    BRIDGE_ACTION_GET_SHORTS_UPLOAD_TIMESTAMPS,
    BRIDGE_TIMEOUT_MS
} from './shorts-upload-age/constants.js';
import { collectShortCards } from './shorts-upload-age/pageContext.js';
import { formatRelativeAge } from './shorts-upload-age/time.js';
import { createShortsUploadAgeResolver } from './shorts-upload-age/resolver.js';
import { createBridgeClient } from './playlist-multi-select/bridge.js';
import {
    removeAllRenderedLabels,
    cleanupStaleLabels,
    refreshRenderedLabels,
    renderCard
} from './shorts-upload-age/render.js';

const logger = createLogger('ShortsUploadAge');
const bridgeClient = createBridgeClient({
    source: BRIDGE_SOURCE,
    requestType: BRIDGE_REQUEST_TYPE,
    responseType: BRIDGE_RESPONSE_TYPE,
    timeoutMs: BRIDGE_TIMEOUT_MS,
    requestPrefix: 'ytc-shorts-age'
});
const resolver = createShortsUploadAgeResolver({
    logger,
    batchResolveImpl: resolveBatchTimestampsViaBridge
});

let initialized = false;
let enabled = true;
let observer = null;
let pageListenerCleanups = [];
let bridgeListenerCleanup = null;
let renderTimer = null;
let refreshTimer = null;
let renderInProgress = false;
let rerenderPending = false;
let burstTimers = [];

function waitForNextFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

async function resolveBatchTimestampsViaBridge(shortIds) {
    const uniqueIds = Array.from(
        new Set(
            (Array.isArray(shortIds) ? shortIds : [])
                .filter((value) => typeof value === 'string')
                .map((value) => value.trim())
                .filter((value) => value.length > 0)
        )
    );
    if (uniqueIds.length === 0) {
        return new Map();
    }
    try {
        const response = await bridgeClient.sendRequest(BRIDGE_ACTION_GET_SHORTS_UPLOAD_TIMESTAMPS, {
            videoIds: uniqueIds
        });
        const payload = response?.timestampsById;
        if (!payload || typeof payload !== 'object') {
            return new Map();
        }
        const map = new Map();
        uniqueIds.forEach((shortId) => {
            const value = payload[shortId];
            map.set(shortId, Number.isFinite(value) ? Number(value) : null);
        });
        return map;
    } catch (error) {
        logger.warn('Shorts upload-age bridge batch request failed', {
            shortCount: uniqueIds.length,
            error
        });
        return new Map();
    }
}

function clearRenderTimer() {
    if (renderTimer) {
        window.clearTimeout(renderTimer);
        renderTimer = null;
    }
}

function clearRefreshTimer() {
    if (refreshTimer) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

function clearBurstTimers() {
    if (burstTimers.length > 0) {
        burstTimers.forEach((timerId) => window.clearTimeout(timerId));
        burstTimers = [];
    }
}

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
        const pendingCards = [];
        for (let index = 0; index < cards.length; index += PROCESS_CHUNK_SIZE) {
            if (!enabled) {
                break;
            }
            const chunk = cards.slice(index, index + PROCESS_CHUNK_SIZE);
            chunk.forEach((card) => {
                const pending = renderCard(card, resolver, nowMs);
                if (pending) {
                    pendingCards.push(pending);
                }
            });
            if (index + PROCESS_CHUNK_SIZE < cards.length) {
                await waitForNextFrame();
            }
        }
        if (enabled && pendingCards.length > 0) {
            const timestampsById = await resolver.resolveUploadTimestamps(
                pendingCards.map((entry) => entry.shortId)
            );
            const renderNowMs = Date.now();
            pendingCards.forEach((entry) => {
                if (!enabled || !entry.label.isConnected) {
                    return;
                }
                const attachedShortId = entry.label.getAttribute('data-yt-commander-short-upload-age') || '';
                if (attachedShortId !== entry.shortId) {
                    return;
                }
                const timestampMs = timestampsById.get(entry.shortId);
                if (!Number.isFinite(timestampMs)) {
                    return;
                }
                const text = formatRelativeAge(timestampMs, renderNowMs);
                if (text) {
                    entry.label.textContent = text;
                    entry.label.classList.remove('is-loading');
                }
            });
        }
        refreshRenderedLabels(resolver);
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

function startRelativeRefreshLoop() {
    if (refreshTimer) {
        return;
    }
    refreshTimer = window.setInterval(() => {
        refreshRenderedLabels(resolver);
    }, RELATIVE_REFRESH_MS);
}

function setupObserver() {
    if (observer || !document.body) {
        return;
    }
    observer = createThrottledObserver(
        () => {
            scheduleRender();
        },
        RENDER_DEBOUNCE_MS,
        { childList: true, subtree: true }
    );
    observer.observe(document.body, { childList: true, subtree: true });
}

function teardownObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

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
        removeAllRenderedLabels();
        scheduleRenderBurst();
    };
    const onNavigateFinish = () => {
        scheduleRenderBurst();
    };
    const onLogoClick = (event) => {
        const target = event.target instanceof Element
            ? event.target.closest('a#logo, ytd-topbar-logo-renderer a, a[aria-label*="YouTube Home"]')
            : null;
        if (target) {
            scheduleRenderBurst();
        }
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

function detachPageListeners() {
    pageListenerCleanups.forEach((cleanupFn) => cleanupFn());
    pageListenerCleanups = [];
}

function attachBridgeListener() {
    if (bridgeListenerCleanup) {
        return;
    }
    bridgeListenerCleanup = addEventListenerWithCleanup(window, 'message', (event) => {
        bridgeClient.handleResponse(event);
    });
}

function detachBridgeListener() {
    if (bridgeListenerCleanup) {
        bridgeListenerCleanup();
        bridgeListenerCleanup = null;
        bridgeClient.rejectAll('Shorts upload-age bridge stopped.');
    }
}

function startRuntime() {
    attachBridgeListener();
    setupObserver();
    attachPageListeners();
    startRelativeRefreshLoop();
    scheduleRenderBurst();
}

function stopRuntime() {
    detachBridgeListener();
    teardownObserver();
    detachPageListeners();
    clearRenderTimer();
    clearRefreshTimer();
    clearBurstTimers();
}

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

function disable() {
    enabled = false;
    stopRuntime();
    removeAllRenderedLabels();
    logger.info('Shorts upload age disabled');
}

function cleanup() {
    enabled = false;
    stopRuntime();
    removeAllRenderedLabels();
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

export { initShortsUploadAge, enable, disable, cleanup, initShortsUploadAge as init };
