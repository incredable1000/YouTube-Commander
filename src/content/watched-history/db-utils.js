/**
 * Watched History database utilities.
 */

import { createLogger } from '../utils/logger.js';
import { DB_NAME, DB_VERSION, STORE_NAME, SYNC_QUEUE_STORE_NAME } from './constants.js';
import { isValidVideoId } from './videoId.js';

const logger = createLogger('WatchedHistory');

let db = null;

export function getDb() {
    return db;
}

export function setDb(database) {
    db = database;
}

export async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const upgradedDb = event.target.result;
            if (!upgradedDb.objectStoreNames.contains(STORE_NAME)) {
                upgradedDb.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
            }
            if (!upgradedDb.objectStoreNames.contains(SYNC_QUEUE_STORE_NAME)) {
                upgradedDb.createObjectStore(SYNC_QUEUE_STORE_NAME, { keyPath: 'videoId' });
            }
        };

        request.onsuccess = () => {
            db = request.result;

            db.onclose = () => {
                logger.warn('IndexedDB connection closed');
                db = null;
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

export async function getAllWatchedVideos() {
    if (!db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(request.error || new Error('Failed to get all watched videos'));
        };
    });
}

export async function getPendingSyncVideoIds(limit = 100) {
    if (!db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SYNC_QUEUE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SYNC_QUEUE_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const results = request.result || [];
            const videoIds = results
                .slice(0, limit)
                .map((entry) => entry.videoId)
                .filter(Boolean);
            resolve(videoIds);
        };

        request.onerror = () => {
            reject(request.error || new Error('Failed to get pending sync video IDs'));
        };
    });
}

export async function ackSyncedVideoIds(videoIds) {
    if (!db) {
        throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SYNC_QUEUE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SYNC_QUEUE_STORE_NAME);
        let removedCount = 0;

        const promises = (videoIds || []).map((videoId) => {
            return new Promise((res) => {
                const deleteRequest = store.delete(videoId);
                deleteRequest.onsuccess = () => {
                    removedCount += 1;
                    res();
                };
                deleteRequest.onerror = () => res();
            });
        });

        transaction.oncomplete = () => resolve(removedCount);
        transaction.onerror = () =>
            reject(transaction.error || new Error('Failed to ack synced video IDs'));
    });
}

export async function getPendingSyncCount() {
    if (!db) {
        return 0;
    }

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SYNC_QUEUE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SYNC_QUEUE_STORE_NAME);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function putWatchedRecord(videoId, timestamp) {
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

export async function seedSyncQueue(watchedIds) {
    if (!db || !watchedIds || watchedIds.size === 0) {
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

export async function clearSyncQueue(syncAccountKey) {
    try {
        const CLOUD_PENDING_BY_ACCOUNT_KEY = 'cloudflareSyncPendingByAccount';
        const CLOUD_PENDING_QUEUE_KEY = 'cloudflareSyncPendingVideoIds';
        const CLOUD_PENDING_COUNT_KEY = 'cloudflareSyncPendingCount';

        const result = await chrome.storage.local.get([CLOUD_PENDING_BY_ACCOUNT_KEY]);
        const pendingByAccount =
            result?.[CLOUD_PENDING_BY_ACCOUNT_KEY] &&
            typeof result[CLOUD_PENDING_BY_ACCOUNT_KEY] === 'object'
                ? result[CLOUD_PENDING_BY_ACCOUNT_KEY]
                : {};
        delete pendingByAccount[syncAccountKey];

        await chrome.storage.local.set({
            [CLOUD_PENDING_BY_ACCOUNT_KEY]: pendingByAccount,
            [CLOUD_PENDING_QUEUE_KEY]: [],
            [CLOUD_PENDING_COUNT_KEY]: 0,
        });
    } catch (error) {
        // Ignore errors
    }
}
