/**
 * Watched History
 * Tracks watched videos in IndexedDB and decorates YouTube thumbnails efficiently.
 */

import { getCurrentVideoId } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('WatchedHistory');

const DB_NAME = 'YouTubeCommanderDB';
const DB_VERSION = 1;
const STORE_NAME = 'watchedVideos';

const FEED_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytm-shorts-lockup-view-model'
].join(', ');

const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href*="/shorts/"]';
const MARKER_CLASS = 'yt-commander-watched-marker';
const HIDDEN_CLASS = 'yt-commander-hidden-video';
const WATCHED_ATTR = 'data-yt-commander-watched';

const RENDER_DEBOUNCE_MS = 120;
const PLAYBACK_BIND_DELAY_MS = 250;
const PLAYBACK_BIND_MAX_RETRIES = 12;
const CACHE_REFRESH_DEBOUNCE_MS = 300;
const MAX_PENDING_NODES = 2000;

let db = null;
let initialized = false;
let initializingPromise = null;

let isEnabled = true;
let deleteVideosEnabled = false;
let watchedIds = new Set();

let mutationObserver = null;
let renderTimer = null;
let playbackTimer = null;
let cacheRefreshTimer = null;
let fullScanRequested = false;
let flushing = false;
let flushAgain = false;
let lastUrl = location.href;

const pendingContainers = new Set();
const playbackBindings = new Map();

let runtimeMessageListener = null;
let storageListener = null;

const teardownCallbacks = [];

/**
 * Initialize IndexedDB for watched history.
 * @returns {Promise<void>}
 */
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const upgradedDb = event.target.result;
            if (!upgradedDb.objectStoreNames.contains(STORE_NAME)) {
                upgradedDb.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
            }
        };

        request.onsuccess = () => {
            db = request.result;

            db.onclose = () => {
                logger.warn('IndexedDB connection closed');
                db = null;
                initialized = false;
            };

            db.onerror = (event) => {
                logger.error('IndexedDB runtime error', event.target?.error || event);
            };

            resolve();
        };

        request.onerror = () => {
            reject(request.error || new Error('Failed to open watched history database'));
        };
    });
}

/**
 * Ensure initialization only runs once and is safe to call repeatedly.
 * @returns {Promise<void>}
 */
async function ensureInitialized() {
    if (initialized) {
        return;
    }

    if (initializingPromise) {
        return initializingPromise;
    }

    initializingPromise = (async () => {
        logger.info('Initializing watched history');
        await initDB();
        await loadDeleteModeSetting();
        await hydrateWatchedIdCache();
        injectStyles();
        attachListeners();
        startMutationObserver();

        initialized = true;
        fullScanRequested = true;

        scheduleRender('init', true);
        schedulePlaybackBinding();

        logger.info('Watched history initialized', { watchedCount: watchedIds.size });
    })();

    try {
        await initializingPromise;
    } catch (error) {
        logger.error('Initialization failed', error);
        initializingPromise = null;
        initialized = false;
        throw error;
    }
}

/**
 * Load delete-videos mode from sync storage.
 * @returns {Promise<void>}
 */
async function loadDeleteModeSetting() {
    try {
        const result = await chrome.storage.sync.get(['deleteVideosEnabled']);
        deleteVideosEnabled = result.deleteVideosEnabled === true;
    } catch (error) {
        logger.warn('Failed to load delete mode setting, using default', error);
        deleteVideosEnabled = false;
    }
}

/**
 * Pull all watched IDs into in-memory cache for O(1) checks during rendering.
 * @returns {Promise<void>}
 */
async function hydrateWatchedIdCache() {
    if (!db) {
        throw new Error('Database not initialized');
    }

    const ids = await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const request = typeof store.getAllKeys === 'function' ? store.getAllKeys() : store.getAll();

        request.onsuccess = () => {
            const raw = request.result || [];
            if (typeof store.getAllKeys === 'function') {
                resolve(raw);
                return;
            }

            const mapped = raw
                .map((entry) => entry?.videoId)
                .filter((videoId) => typeof videoId === 'string');
            resolve(mapped);
        };

        request.onerror = () => {
            reject(request.error || new Error('Failed to read watched IDs'));
        };
    });

    watchedIds = new Set(ids.filter((videoId) => isValidVideoId(videoId)));
}

/**
 * Inject watched-marker and hidden-video styles once.
 */
function injectStyles() {
    if (document.getElementById('yt-commander-watched-history-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'yt-commander-watched-history-styles';
    style.textContent = `
        .${HIDDEN_CLASS} {
            display: none !important;
        }

        [${WATCHED_ATTR}='true'] {
            position: relative !important;
        }

        .${MARKER_CLASS} {
            position: absolute !important;
            inset: 0 !important;
            pointer-events: none !important;
            z-index: 5 !important;
            background: rgba(0, 0, 0, 0.45) !important;
            border-radius: 12px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }

        .${MARKER_CLASS}::after {
            content: '\\2713' !important;
            font-size: 20px !important;
            font-weight: 700 !important;
            letter-spacing: 0.3px !important;
            color: #ffffff !important;
            background: rgba(31, 165, 68, 0.95) !important;
            border-radius: 999px !important;
            width: 30px !important;
            height: 30px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
        }
    `;

    document.head.appendChild(style);
}

/**
 * Attach runtime/storage/navigation listeners once.
 */
function attachListeners() {
    if (!runtimeMessageListener) {
        runtimeMessageListener = (message, sender, sendResponse) => {
            if (!message || !message.type) {
                return undefined;
            }

            if (message.type === 'REFRESH_BADGE') {
                scheduleRender('refresh-badge', true);
                return undefined;
            }

            if (message.type === 'GET_WATCHED_COUNT') {
                sendResponse({ count: watchedIds.size });
                return undefined;
            }

            if (message.type === 'SHOW_EXPORT_REMINDER') {
                showExportReminder();
                return undefined;
            }

            if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
                getAllWatchedVideos()
                    .then((videos) => sendResponse({ success: true, videos }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;
            }

            if (message.type === 'HISTORY_UPDATED') {
                scheduleCacheRefresh('history-updated');
                return undefined;
            }

            if (message.type === 'SETTINGS_UPDATED') {
                if (message.settings) {
                    updateSettings(message.settings);
                }
                sendResponse({ success: true });
                return undefined;
            }

            return undefined;
        };

        chrome.runtime.onMessage.addListener(runtimeMessageListener);
    }

    if (!storageListener) {
        storageListener = (changes, areaName) => {
            if (areaName !== 'sync') {
                return;
            }

            if (changes.deleteVideosEnabled) {
                deleteVideosEnabled = changes.deleteVideosEnabled.newValue === true;
                scheduleRender('storage-change', true);
            }
        };

        chrome.storage.onChanged.addListener(storageListener);
    }

    const onNavigate = () => {
        if (location.href === lastUrl) {
            return;
        }

        lastUrl = location.href;
        scheduleRender('navigate', true);
        schedulePlaybackBinding();
    };

    const onVisibilityOrFocus = () => {
        if (document.hidden) {
            return;
        }

        scheduleRender('foreground-refresh', true);
        schedulePlaybackBinding();
    };

    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', onNavigate);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    teardownCallbacks.push(() => document.removeEventListener('yt-navigate-finish', onNavigate));
    teardownCallbacks.push(() => window.removeEventListener('popstate', onNavigate));
    teardownCallbacks.push(() => document.removeEventListener('visibilitychange', onVisibilityOrFocus));
    teardownCallbacks.push(() => window.removeEventListener('focus', onVisibilityOrFocus));
}

/**
 * Start a single mutation observer for new feed nodes and URL changes.
 */
function startMutationObserver() {
    if (mutationObserver || !document.body) {
        return;
    }

    mutationObserver = new MutationObserver((mutations) => {
        if (!isEnabled) {
            return;
        }

        if (location.href !== lastUrl) {
            lastUrl = location.href;
            fullScanRequested = true;
            schedulePlaybackBinding();
        }

        let foundCandidate = false;

        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
                continue;
            }

            for (const node of mutation.addedNodes) {
                foundCandidate = collectCandidateContainers(node) || foundCandidate;
            }
        }

        if (foundCandidate || fullScanRequested) {
            scheduleRender('mutation');
        }
    });

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Collect renderer containers from an added node.
 * @param {Node} node
 * @returns {boolean}
 */
function collectCandidateContainers(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }

    const element = /** @type {Element} */ (node);
    let found = false;

    if (element.matches(FEED_RENDERER_SELECTOR)) {
        pendingContainers.add(element);
        found = true;
    }

    if (typeof element.querySelectorAll === 'function') {
        const matches = element.querySelectorAll(FEED_RENDERER_SELECTOR);
        if (matches.length > 0) {
            found = true;
            for (const match of matches) {
                pendingContainers.add(match);
            }
        }
    }

    if (pendingContainers.size > MAX_PENDING_NODES) {
        pendingContainers.clear();
        fullScanRequested = true;
        found = true;
    }

    return found;
}

/**
 * Debounced render scheduler.
 * @param {string} reason
 * @param {boolean} [forceFullScan]
 */
function scheduleRender(reason, forceFullScan = false) {
    if (!isEnabled) {
        return;
    }

    if (forceFullScan) {
        fullScanRequested = true;
    }

    if (renderTimer) {
        return;
    }

    renderTimer = setTimeout(() => {
        renderTimer = null;
        flushRenderQueue().catch((error) => {
            logger.error(`Render flush failed (${reason})`, error);
        });
    }, RENDER_DEBOUNCE_MS);
}

/**
 * Flush pending/full render queue in chunks to avoid long main-thread blocks.
 * @returns {Promise<void>}
 */
async function flushRenderQueue() {
    if (!isEnabled) {
        return;
    }

    if (flushing) {
        flushAgain = true;
        return;
    }

    flushing = true;

    try {
        const toProcess = new Set();

        if (fullScanRequested) {
            fullScanRequested = false;
            const allContainers = document.querySelectorAll(FEED_RENDERER_SELECTOR);
            for (const container of allContainers) {
                toProcess.add(container);
            }
        }

        if (pendingContainers.size > 0) {
            for (const container of pendingContainers) {
                toProcess.add(container);
            }
            pendingContainers.clear();
        }

        if (toProcess.size === 0) {
            return;
        }

        const batch = Array.from(toProcess);
        const chunkSize = 120;

        for (let i = 0; i < batch.length; i += chunkSize) {
            const slice = batch.slice(i, i + chunkSize);
            for (const container of slice) {
                decorateContainer(container);
            }
            await nextAnimationFrame();
        }
    } finally {
        flushing = false;

        if (flushAgain) {
            flushAgain = false;
            scheduleRender('flush-again');
        }
    }
}

/**
 * Decorate a renderer with marker/hide state based on cache and settings.
 * @param {Element} container
 */
function decorateContainer(container) {
    if (!container || !container.isConnected) {
        return;
    }

    const link = container.querySelector(VIDEO_LINK_SELECTOR);
    if (!link || !link.href) {
        return;
    }

    const videoId = extractVideoId(link.href);
    if (!isValidVideoId(videoId)) {
        return;
    }

    const isWatched = watchedIds.has(videoId);

    if (isWatched && deleteVideosEnabled) {
        container.classList.add(HIDDEN_CLASS);
    } else {
        container.classList.remove(HIDDEN_CLASS);
    }

    const thumbnail = findThumbnailAnchor(container, link);
    if (!thumbnail) {
        return;
    }

    if (isWatched && !deleteVideosEnabled) {
        thumbnail.setAttribute(WATCHED_ATTR, 'true');

        if (!thumbnail.querySelector(`.${MARKER_CLASS}`)) {
            const marker = document.createElement('div');
            marker.className = MARKER_CLASS;
            thumbnail.appendChild(marker);
        }
    } else {
        thumbnail.removeAttribute(WATCHED_ATTR);
        const marker = thumbnail.querySelector(`.${MARKER_CLASS}`);
        if (marker) {
            marker.remove();
        }
    }
}

/**
 * Find a thumbnail element where marker should be attached.
 * @param {Element} container
 * @param {HTMLAnchorElement} fallbackLink
 * @returns {Element|null}
 */
function findThumbnailAnchor(container, fallbackLink) {
    return container.querySelector('a#thumbnail') || fallbackLink || null;
}

/**
 * Parse video ID from watch/shorts URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    try {
        const parsed = new URL(url, location.origin);

        if (parsed.pathname === '/watch') {
            return parsed.searchParams.get('v');
        }

        if (parsed.pathname.startsWith('/shorts/')) {
            const shortsId = parsed.pathname.split('/shorts/')[1];
            return shortsId ? shortsId.split('/')[0] : null;
        }

        return null;
    } catch (_error) {
        const fallback = url.match(/(?:v=|\/shorts\/)([A-Za-z0-9_-]{10,15})/);
        return fallback ? fallback[1] : null;
    }
}

/**
 * Validate YouTube-like ID length and charset.
 * @param {string|null} videoId
 * @returns {boolean}
 */
function isValidVideoId(videoId) {
    return typeof videoId === 'string' && /^[A-Za-z0-9_-]{10,15}$/.test(videoId);
}

/**
 * Yield to the browser between render chunks.
 * @returns {Promise<void>}
 */
function nextAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Schedule retries to bind play handlers for current watch/shorts video.
 */
function schedulePlaybackBinding() {
    if (!isEnabled) {
        return;
    }

    if (playbackTimer) {
        clearTimeout(playbackTimer);
    }

    let attempt = 0;

    const bind = () => {
        if (!isEnabled) {
            return;
        }

        const pageVideoId = getCurrentPageVideoId();
        if (!pageVideoId) {
            return;
        }

        const activeVideo = getActiveVideoElement();
        if (!activeVideo) {
            attempt += 1;
            if (attempt < PLAYBACK_BIND_MAX_RETRIES) {
                playbackTimer = setTimeout(bind, PLAYBACK_BIND_DELAY_MS);
            }
            return;
        }

        pruneDisconnectedPlaybackBindings();
        bindPlayHandler(activeVideo, pageVideoId);
    };

    playbackTimer = setTimeout(bind, PLAYBACK_BIND_DELAY_MS);
}

/**
 * Remove listener bindings from disconnected video elements.
 */
function pruneDisconnectedPlaybackBindings() {
    for (const [video, binding] of playbackBindings.entries()) {
        if (video.isConnected) {
            continue;
        }

        video.removeEventListener('play', binding.onPlay);
        video.removeEventListener('loadeddata', binding.onLoadedData);
        playbackBindings.delete(video);
    }
}

/**
 * Resolve the most accurate currently playing video id.
 * @param {HTMLVideoElement} video
 * @param {string|null} [fallbackVideoId]
 * @returns {string|null}
 */
function resolvePlaybackVideoId(video, fallbackVideoId = null) {
    if (isValidVideoId(fallbackVideoId)) {
        return fallbackVideoId;
    }

    if (location.pathname.startsWith('/shorts/')) {
        const renderer = video?.closest?.('ytd-reel-video-renderer');
        if (renderer) {
            const rendererLink = renderer.querySelector('a[href*="/shorts/"], a[href*="/watch?v="]');
            if (rendererLink?.href) {
                const rendererVideoId = extractVideoId(rendererLink.href);
                if (isValidVideoId(rendererVideoId)) {
                    return rendererVideoId;
                }
            }
        }

        const activeRenderer = getActiveShortsRenderer();
        if (activeRenderer) {
            const activeLink = activeRenderer.querySelector('a[href*="/shorts/"], a[href*="/watch?v="]');
            if (activeLink?.href) {
                const activeVideoId = extractVideoId(activeLink.href);
                if (isValidVideoId(activeVideoId)) {
                    return activeVideoId;
                }
            }
        }
    }

    return getCurrentPageVideoId();
}

/**
 * Attach one play handler per video element.
 * @param {HTMLVideoElement} video
 * @param {string|null} currentVideoId
 */
function bindPlayHandler(video, currentVideoId = null) {
    const existing = playbackBindings.get(video);
    if (existing) {
        existing.markCurrent(currentVideoId);
        return;
    }

    const binding = {
        lastMarkedId: '',
        onPlay: null,
        onLoadedData: null,
        markCurrent: (_seedVideoId) => {}
    };

    const markCurrent = (seedVideoId = null) => {
        if (!isEnabled) {
            return;
        }

        const resolvedVideoId = resolvePlaybackVideoId(video, seedVideoId);
        if (!isValidVideoId(resolvedVideoId)) {
            return;
        }

        if (binding.lastMarkedId === resolvedVideoId && watchedIds.has(resolvedVideoId)) {
            return;
        }

        binding.lastMarkedId = resolvedVideoId;
        addToWatchedHistory(resolvedVideoId).catch((error) => {
            logger.error('Failed to mark video on play event', error);
        });
    };

    const onPlay = () => markCurrent();
    const onLoadedData = () => {
        if (!video.paused) {
            markCurrent();
        }
    };

    binding.onPlay = onPlay;
    binding.onLoadedData = onLoadedData;
    binding.markCurrent = markCurrent;

    video.addEventListener('play', onPlay);
    video.addEventListener('loadeddata', onLoadedData);
    playbackBindings.set(video, binding);

    if (!video.paused || isValidVideoId(currentVideoId)) {
        markCurrent(currentVideoId);
    }
}

/**
 * Resolve the current page video ID for /watch and /shorts pages.
 * @returns {string|null}
 */
function getCurrentPageVideoId() {
    if (location.pathname === '/watch') {
        const watchId = getCurrentVideoId();
        return isValidVideoId(watchId) ? watchId : null;
    }

    if (location.pathname.startsWith('/shorts/')) {
        const parts = location.pathname.split('/shorts/');
        const shortsId = parts[1] ? parts[1].split('/')[0] : null;
        return isValidVideoId(shortsId) ? shortsId : null;
    }

    return null;
}

/**
 * Get the active HTML video element for watch/shorts pages.
 * @returns {HTMLVideoElement|null}
 */
function getActiveVideoElement() {
    if (location.pathname.startsWith('/shorts/')) {
        const activeRenderer = getActiveShortsRenderer();
        if (activeRenderer) {
            const insideRenderer = activeRenderer.querySelector('video.html5-main-video');
            if (insideRenderer) {
                return insideRenderer;
            }
        }

        return document.querySelector('ytd-shorts video.html5-main-video');
    }

    return document.querySelector('video.html5-main-video');
}

/**
 * Get the currently visible Shorts renderer.
 * @returns {Element|null}
 */
function getActiveShortsRenderer() {
    const explicitActive = document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
    if (explicitActive) {
        return explicitActive;
    }

    const renderers = document.querySelectorAll('ytd-shorts ytd-reel-video-renderer');
    const midY = window.innerHeight / 2;

    for (const renderer of renderers) {
        const rect = renderer.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) {
            return renderer;
        }
    }

    return null;
}

/**
 * Remove all bound video play handlers.
 */
function clearPlaybackBindings() {
    for (const [video, binding] of playbackBindings.entries()) {
        video.removeEventListener('play', binding.onPlay);
        video.removeEventListener('loadeddata', binding.onLoadedData);
    }
    playbackBindings.clear();
}

/**
 * Store watched ID in DB + cache and update visible markers.
 * @param {string} videoId
 * @returns {Promise<void>}
 */
async function addToWatchedHistory(videoId) {
    if (!isValidVideoId(videoId)) {
        return;
    }

    await ensureInitialized();

    if (watchedIds.has(videoId)) {
        return;
    }

    await putWatchedRecord(videoId, Date.now());
    watchedIds.add(videoId);

    decorateMatchingVisibleContainers(videoId);

    try {
        chrome.runtime.sendMessage({ type: 'HISTORY_UPDATED' });
    } catch (error) {
        logger.debug('Could not send HISTORY_UPDATED message', error);
    }
}

/**
 * Insert/update a watched record.
 * @param {string} videoId
 * @param {number} timestamp
 * @returns {Promise<void>}
 */
async function putWatchedRecord(videoId, timestamp) {
    if (!db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        store.put({ videoId, timestamp });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to write watched record'));
        transaction.onabort = () => reject(transaction.error || new Error('Write transaction aborted'));
    });
}

/**
 * Re-render only containers currently showing the provided ID.
 * @param {string} videoId
 */
function decorateMatchingVisibleContainers(videoId) {
    const selectors = [
        `a[href*="v=${videoId}"]`,
        `a[href*="/shorts/${videoId}"]`
    ];

    const links = document.querySelectorAll(selectors.join(', '));
    for (const link of links) {
        const container = link.closest(FEED_RENDERER_SELECTOR);
        if (container) {
            decorateContainer(container);
        }
    }
}

/**
 * Check watched status for one ID.
 * @param {string} videoId
 * @returns {Promise<boolean>}
 */
async function isVideoWatched(videoId) {
    if (!isValidVideoId(videoId)) {
        return false;
    }

    await ensureInitialized();
    return watchedIds.has(videoId);
}

/**
 * Read all watched records.
 * @returns {Promise<Array<{videoId: string, timestamp: number}>>}
 */
async function getAllWatchedVideos() {
    await ensureInitialized();

    if (!db) {
        return [];
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const videos = (request.result || []).filter((entry) => isValidVideoId(entry?.videoId));
            resolve(videos);
        };

        request.onerror = () => {
            reject(request.error || new Error('Failed to read watched videos'));
        };
    });
}

/**
 * Count watched records from cache.
 * @returns {Promise<number>}
 */
async function getWatchedVideoCount() {
    await ensureInitialized();
    return watchedIds.size;
}

/**
 * Alias used by content-isolated message bridge.
 * @returns {number}
 */
function getWatchedCount() {
    return watchedIds.size;
}

/**
 * Clear watched history from DB and UI.
 * @returns {Promise<void>}
 */
async function clearWatchedHistory() {
    await ensureInitialized();

    if (!db) {
        return;
    }

    await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Failed to clear watched history'));
        transaction.onabort = () => reject(transaction.error || new Error('Clear transaction aborted'));
    });

    watchedIds.clear();
    resetVisualDecorations();
}

/**
 * Export watched history as tab-separated lines.
 * @returns {Promise<string>}
 */
async function exportWatchedHistory() {
    const videos = await getAllWatchedVideos();
    return videos
        .map((video) => `${video.videoId}\t${new Date(video.timestamp).toISOString()}`)
        .join('\n');
}

/**
 * Import watched IDs in batches and return newly added count.
 * @param {string[]} videoIds
 * @returns {Promise<number>}
 */
async function importWatchedHistory(videoIds) {
    await ensureInitialized();

    if (!Array.isArray(videoIds) || videoIds.length === 0 || !db) {
        return 0;
    }

    const uniqueToAdd = [];
    const seenInBatch = new Set();

    for (const rawId of videoIds) {
        const trimmed = typeof rawId === 'string' ? rawId.trim() : '';
        if (!isValidVideoId(trimmed)) {
            continue;
        }

        if (watchedIds.has(trimmed) || seenInBatch.has(trimmed)) {
            continue;
        }

        seenInBatch.add(trimmed);
        uniqueToAdd.push(trimmed);
    }

    if (uniqueToAdd.length === 0) {
        return 0;
    }

    const startTimestamp = Date.now();

    await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        uniqueToAdd.forEach((videoId, index) => {
            store.put({ videoId, timestamp: startTimestamp + index });
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Import transaction failed'));
        transaction.onabort = () => reject(transaction.error || new Error('Import transaction aborted'));
    });

    uniqueToAdd.forEach((videoId) => watchedIds.add(videoId));

    scheduleRender('import', true);

    try {
        chrome.runtime.sendMessage({ type: 'HISTORY_UPDATED' });
    } catch (error) {
        logger.debug('Could not send HISTORY_UPDATED after import', error);
    }

    return uniqueToAdd.length;
}

/**
 * Debounced cache refresh for cross-tab updates.
 * @param {string} reason
 */
function scheduleCacheRefresh(reason) {
    if (cacheRefreshTimer) {
        return;
    }

    cacheRefreshTimer = setTimeout(async () => {
        cacheRefreshTimer = null;

        try {
            await hydrateWatchedIdCache();
            scheduleRender(`cache-refresh:${reason}`, true);
        } catch (error) {
            logger.error('Failed to refresh watched cache', error);
        }
    }, CACHE_REFRESH_DEBOUNCE_MS);
}

/**
 * Update runtime settings relevant to watched-history visuals.
 * @param {object} settings
 */
function updateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'deleteVideosEnabled')) {
        const nextDeleteMode = settings.deleteVideosEnabled === true;
        if (nextDeleteMode !== deleteVideosEnabled) {
            deleteVideosEnabled = nextDeleteMode;
            scheduleRender('settings-update', true);
        }
    }
}

/**
 * Show a lightweight reminder in-page.
 */
function showExportReminder() {
    const existing = document.getElementById('yt-commander-export-reminder');
    if (existing) {
        existing.remove();
    }

    const reminder = document.createElement('div');
    reminder.id = 'yt-commander-export-reminder';
    reminder.style.cssText = [
        'position: fixed',
        'top: 20px',
        'right: 20px',
        'z-index: 100000',
        'background: #1f7a35',
        'color: #ffffff',
        'padding: 12px 14px',
        'border-radius: 8px',
        'font-size: 13px',
        'line-height: 1.4',
        'box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35)'
    ].join(';');

    reminder.textContent = 'Backup reminder: export your watched history from the extension popup.';
    document.body.appendChild(reminder);

    setTimeout(() => {
        if (reminder.parentNode) {
            reminder.remove();
        }
    }, 8000);
}

/**
 * Remove all watched decorations from currently rendered items.
 */
function resetVisualDecorations() {
    const markers = document.querySelectorAll(`.${MARKER_CLASS}`);
    markers.forEach((marker) => marker.remove());

    const watchedThumbs = document.querySelectorAll(`[${WATCHED_ATTR}='true']`);
    watchedThumbs.forEach((thumb) => thumb.removeAttribute(WATCHED_ATTR));

    const hiddenContainers = document.querySelectorAll(`.${HIDDEN_CLASS}`);
    hiddenContainers.forEach((container) => container.classList.remove(HIDDEN_CLASS));
}

/**
 * Initialize watched history module.
 * @returns {Promise<void>}
 */
async function initWatchedHistory() {
    await ensureInitialized();
}

/**
 * Enable watched history rendering/tracking.
 */
function enable() {
    if (isEnabled) {
        return;
    }

    isEnabled = true;
    startMutationObserver();
    scheduleRender('enable', true);
    schedulePlaybackBinding();
}

/**
 * Disable watched history rendering/tracking.
 */
function disable() {
    if (!isEnabled) {
        return;
    }

    isEnabled = false;

    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }

    clearPlaybackBindings();
    resetVisualDecorations();
}

/**
 * Cleanup observers/listeners/timers.
 */
function cleanup() {
    if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
    }

    if (playbackTimer) {
        clearTimeout(playbackTimer);
        playbackTimer = null;
    }

    if (cacheRefreshTimer) {
        clearTimeout(cacheRefreshTimer);
        cacheRefreshTimer = null;
    }

    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }

    clearPlaybackBindings();

    while (teardownCallbacks.length > 0) {
        const teardown = teardownCallbacks.pop();
        try {
            teardown();
        } catch (error) {
            logger.debug('Teardown callback failed', error);
        }
    }

    if (runtimeMessageListener) {
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
        runtimeMessageListener = null;
    }

    if (storageListener) {
        chrome.storage.onChanged.removeListener(storageListener);
        storageListener = null;
    }

    pendingContainers.clear();
    flushAgain = false;
    fullScanRequested = false;

    resetVisualDecorations();

    initialized = false;
    initializingPromise = null;
}

window.ytCommanderWatchedHistory = {
    init: initWatchedHistory,
    add: addToWatchedHistory,
    clear: clearWatchedHistory,
    count: () => watchedIds.size
};

export {
    initWatchedHistory,
    addToWatchedHistory,
    isVideoWatched,
    getAllWatchedVideos,
    getWatchedVideoCount,
    getWatchedCount,
    clearWatchedHistory,
    exportWatchedHistory,
    importWatchedHistory,
    updateSettings,
    enable,
    disable,
    cleanup
};
