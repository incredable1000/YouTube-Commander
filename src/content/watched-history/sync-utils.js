/**
 * Watched History sync utilities.
 */

import { SYNC_QUEUE_STORE_NAME } from './constants.js';
import { getDb, getWatchedIds } from './state.js';
import { isValidVideoId } from './videoId.js';

export async function seedSyncQueueFromHistory() {
    const db = getDb();
    const watchedIds = getWatchedIds();

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

export function clearPendingCloudSyncQueue(syncAccountKey, logger) {
    return new Promise(async (resolve) => {
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
            if (logger)
                logger.debug('Failed to clear pending cloud-sync queue from local storage', error);
        }
        resolve();
    });
}
