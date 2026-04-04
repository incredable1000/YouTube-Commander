/**
 * Watched History
 * Tracks watched videos in IndexedDB and decorates YouTube thumbnails efficiently.
 */

import { getCurrentVideoId } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';
import {
    DEFAULT_SYNC_ACCOUNT_KEY,
    CLOUD_PENDING_QUEUE_KEY,
    CLOUD_PENDING_COUNT_KEY,
    CLOUD_PENDING_BY_ACCOUNT_KEY,
} from './watched-history/cloudSync.js';
import {
    CACHE_REFRESH_DEBOUNCE_MS,
    DB_NAME,
    DB_VERSION,
    FEED_RENDERER_SELECTOR,
    HIDDEN_CLASS,
    MARKER_CLASS,
    PLAYBACK_BIND_DELAY_MS,
    RENDER_DEBOUNCE_MS,
    STORE_NAME,
    SYNC_QUEUE_STORE_NAME,
    VIDEO_LINK_SELECTOR,
    WATCHED_ATTR,
} from './watched-history/constants.js';
import { extractVideoId, isValidVideoId } from './watched-history/videoId.js';
import {
    resolveSyncAccountIdentity,
    getSyncAccountIdentityState,
    setSyncAccountIdentityState,
} from './watched-history/identity-bridge.js';
import {
    initDatabase,
    getDb,
    setDb,
    getAllWatchedVideos,
    getPendingSyncVideoIds,
    ackSyncedVideoIds as dbAckSyncedVideoIds,
    getPendingSyncCount,
} from './watched-history/db-utils.js';
import { injectStyles } from './watched-history/styles.js';
import {
    setWatchedIds,
    setDeleteVideosEnabled,
    setIsEnabled,
    getPendingContainers,
    setFullScanRequested,
    decorateContainer,
    scheduleRender,
    startMutationObserver,
} from './watched-history/render-utils.js';
import {
    getPlaybackBindings,
    schedulePlaybackBinding,
    bindPlayHandler,
    pruneDisconnectedPlaybackBindings,
} from './watched-history/playback-utils.js';

const logger = createLogger('WatchedHistory');

let initialized = false;
let initializingPromise = null;
let isEnabled = true;
let deleteVideosEnabled = false;
let watchedIds = new Set();
let mutationObserver = null;
let playbackTimer = null;
let cacheRefreshTimer = null;
let lastUrl = location.href;
const pendingContainers = new Set();
const playbackBindings = new Map();
let runtimeMessageListener = null;
let storageListener = null;
const teardownCallbacks = [];
let syncAccountKey = DEFAULT_SYNC_ACCOUNT_KEY;
let renderTimer = null;

async function ensureInitialized() {
    if (initialized) {
        return;
    }

    if (initializingPromise) {
        return initializingPromise;
    }

    initializingPromise = (async () => {
        logger.info('Initializing watched history');
        const identity = await resolveSyncAccountIdentity(logger);
        syncAccountKey = identity.accountKey;
        setSyncAccountIdentityState(
            identity.accountKey,
            identity.source,
            identity.isPrimaryCandidate
        );
        await initDatabase();
        await loadDeleteModeSetting();
        await hydrateWatchedIdCache();
        injectStyles();
        attachListeners();
        mutationObserver = startMutationObserver();
        scheduleRender('init', true);
        schedulePlaybackBinding(playbackBindings, watchedIds, addToWatchedHistory);
        initialized = true;
        logger.info('Watched history initialized', {
            watchedCount: watchedIds.size,
            syncAccountKey,
            syncAccountSource: identity.source,
        });
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

async function loadDeleteModeSetting() {
    try {
        const result = await chrome.storage.sync.get(['deleteVideosEnabled']);
        deleteVideosEnabled = result.deleteVideosEnabled === true;
        setDeleteVideosEnabled(deleteVideosEnabled);
    } catch (error) {
        logger.warn('Failed to load delete mode setting, using default', error);
        deleteVideosEnabled = false;
        setDeleteVideosEnabled(false);
    }
}

async function hydrateWatchedIdCache() {
    const db = getDb();
    if (!db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request =
            typeof store.getAllKeys === 'function' ? store.getAllKeys() : store.getAll();

        request.onsuccess = () => {
            const raw = request.result || [];
            let ids;
            if (typeof store.getAllKeys === 'function') {
                ids = raw;
            } else {
                ids = raw
                    .map((entry) => entry?.videoId)
                    .filter((videoId) => typeof videoId === 'string');
            }
            watchedIds = new Set(ids.filter((videoId) => isValidVideoId(videoId)));
            setWatchedIds(watchedIds);
            resolve();
        };

        request.onerror = () => {
            reject(request.error || new Error('Failed to read watched IDs'));
        };
    });
}

async function persistPendingCloudSyncIds(videoIds) {
    const incoming = [];
    const seenIncoming = new Set();

    for (const rawId of videoIds || []) {
        const videoId = typeof rawId === 'string' ? rawId.trim() : '';
        if (!isValidVideoId(videoId) || seenIncoming.has(videoId)) {
            continue;
        }
        seenIncoming.add(videoId);
        incoming.push(videoId);
    }

    if (incoming.length === 0) {
        return;
    }

    try {
        const result = await chrome.storage.local.get([
            CLOUD_PENDING_QUEUE_KEY,
            CLOUD_PENDING_BY_ACCOUNT_KEY,
        ]);
        const pendingByAccount =
            result?.[CLOUD_PENDING_BY_ACCOUNT_KEY] &&
            typeof result[CLOUD_PENDING_BY_ACCOUNT_KEY] === 'object'
                ? result[CLOUD_PENDING_BY_ACCOUNT_KEY]
                : {};
        const existingRaw = Array.isArray(pendingByAccount[syncAccountKey])
            ? pendingByAccount[syncAccountKey]
            : [];

        const merged = [];
        const seen = new Set();

        for (const rawId of existingRaw) {
            const videoId = typeof rawId === 'string' ? rawId.trim() : '';
            if (!isValidVideoId(videoId) || seen.has(videoId)) {
                continue;
            }
            seen.add(videoId);
            merged.push(videoId);
        }

        for (const videoId of incoming) {
            if (seen.has(videoId)) {
                continue;
            }
            seen.add(videoId);
            merged.push(videoId);
        }

        pendingByAccount[syncAccountKey] = merged;

        await chrome.storage.local.set({
            [CLOUD_PENDING_BY_ACCOUNT_KEY]: pendingByAccount,
            [CLOUD_PENDING_QUEUE_KEY]: merged,
            [CLOUD_PENDING_COUNT_KEY]: merged.length,
        });
    } catch (error) {
        logger.debug('Failed to persist pending cloud-sync IDs', error);
    }
}

async function notifyBackgroundHistoryUpdated(payload) {
    try {
        const response = await chrome.runtime.sendMessage(payload);
        if (response && response.success === false) {
            return false;
        }
        return true;
    } catch (error) {
        logger.debug('Could not send HISTORY_UPDATED message', error);
        return false;
    }
}

function attachListeners() {
    if (!runtimeMessageListener) {
        runtimeMessageListener = (message, _sender, sendResponse) => {
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

            if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
                getAllWatchedVideos()
                    .then((videos) => sendResponse({ success: true, videos }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;
            }

            if (message.type === 'GET_PENDING_SYNC_VIDEO_IDS') {
                getPendingSyncVideoIds(message.limit)
                    .then((videoIds) => sendResponse({ success: true, videoIds }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;
            }

            if (message.type === 'ACK_SYNCED_VIDEO_IDS') {
                dbAckSyncedVideoIds(message.videoIds)
                    .then((removedCount) => sendResponse({ success: true, removedCount }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;
            }

            if (message.type === 'GET_PENDING_SYNC_COUNT') {
                getPendingSyncCount()
                    .then((count) => sendResponse({ success: true, count }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;
            }

            if (message.type === 'GET_SYNC_ACCOUNT_IDENTITY') {
                resolveSyncAccountIdentity(logger)
                    .then((identity) => sendResponse({ success: true, ...identity }))
                    .catch((error) => sendResponse({ success: false, error: error.message }));
                return true;
            }

            if (message.type === 'SEED_SYNC_QUEUE_FROM_HISTORY') {
                seedSyncQueueFromHistory()
                    .then((seededCount) => sendResponse({ success: true, seededCount }))
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
                setDeleteVideosEnabled(deleteVideosEnabled);
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
        schedulePlaybackBinding(playbackBindings, watchedIds, addToWatchedHistory);
    };

    const onVisibilityOrFocus = () => {
        if (document.hidden) {
            return;
        }

        scheduleRender('foreground-refresh', true);
        schedulePlaybackBinding(playbackBindings, watchedIds, addToWatchedHistory);
    };

    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', onNavigate);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    teardownCallbacks.push(() => document.removeEventListener('yt-navigate-finish', onNavigate));
    teardownCallbacks.push(() => window.removeEventListener('popstate', onNavigate));
    teardownCallbacks.push(() =>
        document.removeEventListener('visibilitychange', onVisibilityOrFocus)
    );
    teardownCallbacks.push(() => window.removeEventListener('focus', onVisibilityOrFocus));
}

async function putWatchedRecordAndQueue(videoId, timestamp) {
    const db = getDb();
    if (!db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SYNC_QUEUE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const queueStore = transaction.objectStore(SYNC_QUEUE_STORE_NAME);

        store.put({ videoId, timestamp });
        queueStore.put({ videoId, queuedAt: Date.now() });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error || new Error('Failed to write watched record'));
        transaction.onabort = () =>
            reject(transaction.error || new Error('Write transaction aborted'));
    });
}

async function addToWatchedHistory(videoId) {
    if (!isValidVideoId(videoId)) {
        return;
    }

    await ensureInitialized();

    if (watchedIds.has(videoId)) {
        return;
    }

    await putWatchedRecordAndQueue(videoId, Date.now());
    watchedIds.add(videoId);
    setWatchedIds(watchedIds);

    const identity = getSyncAccountIdentityState();
    const backgroundQueued = await notifyBackgroundHistoryUpdated({
        type: 'HISTORY_UPDATED',
        videoId,
        accountKey: identity.accountKey || DEFAULT_SYNC_ACCOUNT_KEY,
    });
    if (!backgroundQueued) {
        await persistPendingCloudSyncIds([videoId]);
    }

    decorateMatchingVisibleContainers(videoId);
}

function decorateMatchingVisibleContainers(videoId) {
    const selectors = [`a[href*="v=${videoId}"]`, `a[href*="/shorts/${videoId}"]`];

    const links = document.querySelectorAll(selectors.join(', '));
    for (const link of links) {
        const container = link.closest(FEED_RENDERER_SELECTOR);
        if (container) {
            decorateContainer(container);
        }
    }
}

async function isVideoWatched(videoId) {
    if (!isValidVideoId(videoId)) {
        return false;
    }

    await ensureInitialized();
    return watchedIds.has(videoId);
}

async function ackSyncedVideoIds(videoIds) {
    await ensureInitialized();
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
        return 0;
    }

    const unique = [];
    const seen = new Set();

    for (const rawId of videoIds) {
        const videoId = typeof rawId === 'string' ? rawId.trim() : '';
        if (!isValidVideoId(videoId) || seen.has(videoId)) {
            continue;
        }
        seen.add(videoId);
        unique.push(videoId);
    }

    if (unique.length === 0) {
        return 0;
    }

    return dbAckSyncedVideoIds(unique);
}

async function seedSyncQueueFromHistory() {
    await ensureInitialized();
    const db = getDb();
    if (!db || watchedIds.size === 0) {
        return 0;
    }

    const ids = Array.from(watchedIds);

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SYNC_QUEUE_STORE_NAME], 'readwrite');
        const queueStore = transaction.objectStore(SYNC_QUEUE_STORE_NAME);
        const now = Date.now();

        ids.forEach((videoId, index) => {
            if (isValidVideoId(videoId)) {
                queueStore.put({ videoId, queuedAt: now + index });
            }
        });

        transaction.oncomplete = () => resolve(ids.length);
        transaction.onerror = () =>
            reject(transaction.error || new Error('Failed to seed sync queue'));
        transaction.onabort = () =>
            reject(transaction.error || new Error('Seed queue transaction aborted'));
    });
}

async function getWatchedVideoCount() {
    await ensureInitialized();
    return watchedIds.size;
}

function getWatchedCount() {
    return watchedIds.size;
}

async function clearWatchedHistory() {
    await ensureInitialized();
    const db = getDb();
    if (!db) {
        return;
    }

    await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SYNC_QUEUE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const queueStore = transaction.objectStore(SYNC_QUEUE_STORE_NAME);
        store.clear();
        queueStore.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error || new Error('Failed to clear watched history'));
        transaction.onabort = () =>
            reject(transaction.error || new Error('Clear transaction aborted'));
    });

    watchedIds.clear();
    setWatchedIds(watchedIds);
    resetVisualDecorations();

    const identity = getSyncAccountIdentityState();
    try {
        const result = await chrome.storage.local.get([CLOUD_PENDING_BY_ACCOUNT_KEY]);
        const pendingByAccount =
            result?.[CLOUD_PENDING_BY_ACCOUNT_KEY] &&
            typeof result[CLOUD_PENDING_BY_ACCOUNT_KEY] === 'object'
                ? result[CLOUD_PENDING_BY_ACCOUNT_KEY]
                : {};
        delete pendingByAccount[identity.accountKey];

        await chrome.storage.local.set({
            [CLOUD_PENDING_BY_ACCOUNT_KEY]: pendingByAccount,
            [CLOUD_PENDING_QUEUE_KEY]: [],
            [CLOUD_PENDING_COUNT_KEY]: 0,
        });
    } catch (error) {
        logger.debug('Failed to clear pending cloud-sync queue from local storage', error);
    }
}

async function exportWatchedHistory() {
    const videos = await getAllWatchedVideos();
    return videos
        .map((video) => `${video.videoId}\t${new Date(video.timestamp).toISOString()}`)
        .join('\n');
}

async function importWatchedHistory(videoIds, options = {}) {
    await ensureInitialized();
    const db = getDb();
    if (!Array.isArray(videoIds) || videoIds.length === 0 || !db) {
        return 0;
    }

    const skipSyncQueue = options?.skipSyncQueue === true;
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
        const storeNames = skipSyncQueue ? [STORE_NAME] : [STORE_NAME, SYNC_QUEUE_STORE_NAME];
        const transaction = db.transaction(storeNames, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const queueStore = skipSyncQueue ? null : transaction.objectStore(SYNC_QUEUE_STORE_NAME);

        uniqueToAdd.forEach((videoId, index) => {
            store.put({ videoId, timestamp: startTimestamp + index });
            if (queueStore) {
                queueStore.put({ videoId, queuedAt: startTimestamp + index });
            }
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error || new Error('Import transaction failed'));
        transaction.onabort = () =>
            reject(transaction.error || new Error('Import transaction aborted'));
    });

    uniqueToAdd.forEach((videoId) => watchedIds.add(videoId));
    setWatchedIds(watchedIds);

    const identity = getSyncAccountIdentityState();
    const historyUpdatedPayload = skipSyncQueue
        ? { type: 'HISTORY_UPDATED' }
        : {
              type: 'HISTORY_UPDATED',
              videoIds: uniqueToAdd,
              accountKey: identity.accountKey || DEFAULT_SYNC_ACCOUNT_KEY,
          };
    const backgroundQueued = await notifyBackgroundHistoryUpdated(historyUpdatedPayload);
    if (!skipSyncQueue && !backgroundQueued) {
        await persistPendingCloudSyncIds(uniqueToAdd);
    }

    scheduleRender('import', true);

    return uniqueToAdd.length;
}

async function scheduleCacheRefresh(reason) {
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

function updateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'deleteVideosEnabled')) {
        const nextDeleteMode = settings.deleteVideosEnabled === true;
        if (nextDeleteMode !== deleteVideosEnabled) {
            deleteVideosEnabled = nextDeleteMode;
            setDeleteVideosEnabled(deleteVideosEnabled);
            scheduleRender('settings-update', true);
        }
    }
}

async function getSyncAccountIdentity() {
    return resolveSyncAccountIdentity(logger);
}

function resetVisualDecorations() {
    const markers = document.querySelectorAll(`.${MARKER_CLASS}`);
    markers.forEach((marker) => marker.remove());

    const watchedThumbs = document.querySelectorAll(`[${WATCHED_ATTR}='true']`);
    watchedThumbs.forEach((thumb) => thumb.removeAttribute(WATCHED_ATTR));

    const hiddenContainers = document.querySelectorAll(`.${HIDDEN_CLASS}`);
    hiddenContainers.forEach((container) => container.classList.remove(HIDDEN_CLASS));
}

function clearPlaybackBindings() {
    for (const [video, binding] of playbackBindings.entries()) {
        video.removeEventListener('play', binding.onPlay);
        video.removeEventListener('loadeddata', binding.onLoadedData);
    }
    playbackBindings.clear();
}

async function initWatchedHistory() {
    await ensureInitialized();
}

function enable() {
    if (isEnabled) {
        return;
    }

    isEnabled = true;
    setIsEnabled(true);
    mutationObserver = startMutationObserver();
    scheduleRender('enable', true);
    schedulePlaybackBinding(playbackBindings, watchedIds, addToWatchedHistory);
}

function disable() {
    if (!isEnabled) {
        return;
    }

    isEnabled = false;
    setIsEnabled(false);

    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }

    clearPlaybackBindings();
    resetVisualDecorations();
}

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
    setFullScanRequested(false);
    resetVisualDecorations();

    initialized = false;
    initializingPromise = null;
}

window.ytCommanderWatchedHistory = {
    init: initWatchedHistory,
    add: addToWatchedHistory,
    clear: clearWatchedHistory,
    count: () => watchedIds.size,
    getPendingSyncCount,
    getSyncAccountIdentity,
};

export {
    initWatchedHistory,
    addToWatchedHistory,
    isVideoWatched,
    getAllWatchedVideos,
    getPendingSyncVideoIds,
    ackSyncedVideoIds,
    getPendingSyncCount,
    seedSyncQueueFromHistory,
    getWatchedVideoCount,
    getWatchedCount,
    clearWatchedHistory,
    exportWatchedHistory,
    importWatchedHistory,
    getSyncAccountIdentity,
    updateSettings,
    enable,
    disable,
    cleanup,
};
