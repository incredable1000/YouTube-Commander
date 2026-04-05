/**
 * Sync state management for background script.
 */

import { storageLocalGet } from './storage-utils.js';
import {
    CLOUD_SYNC_STORAGE_KEYS,
    CLOUD_SYNC_DEFAULTS,
    SUBSCRIPTION_SYNC_STORAGE_KEYS,
    SUBSCRIPTION_SYNC_DEFAULTS,
    normalizeAccountKey,
} from './sync-constants.js';
import { normalizeSyncInterval, normalizePendingByAccount } from './endpoint-utils.js';

export async function readCloudSyncState() {
    const result = await storageLocalGet([
        CLOUD_SYNC_STORAGE_KEYS.ENDPOINT,
        CLOUD_SYNC_STORAGE_KEYS.API_TOKEN,
        CLOUD_SYNC_STORAGE_KEYS.AUTO_ENABLED,
        CLOUD_SYNC_STORAGE_KEYS.INTERVAL_MINUTES,
        CLOUD_SYNC_STORAGE_KEYS.LAST_AT,
        CLOUD_SYNC_STORAGE_KEYS.STATUS,
        CLOUD_SYNC_STORAGE_KEYS.ERROR,
        CLOUD_SYNC_STORAGE_KEYS.COUNT,
        CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT,
        CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT,
        CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY,
        CLOUD_SYNC_STORAGE_KEYS.FAILURE_COUNT,
        CLOUD_SYNC_STORAGE_KEYS.BACKOFF_UNTIL,
        CLOUD_SYNC_STORAGE_KEYS.QUEUE_SEEDED,
    ]);

    return {
        endpointUrl:
            typeof result[CLOUD_SYNC_STORAGE_KEYS.ENDPOINT] === 'string'
                ? result[CLOUD_SYNC_STORAGE_KEYS.ENDPOINT].trim()
                : '',
        apiToken:
            typeof result[CLOUD_SYNC_STORAGE_KEYS.API_TOKEN] === 'string'
                ? result[CLOUD_SYNC_STORAGE_KEYS.API_TOKEN]
                : '',
        autoEnabled: result[CLOUD_SYNC_STORAGE_KEYS.AUTO_ENABLED] === true,
        intervalMinutes: normalizeSyncInterval(result[CLOUD_SYNC_STORAGE_KEYS.INTERVAL_MINUTES]),
        lastAt: Number(result[CLOUD_SYNC_STORAGE_KEYS.LAST_AT]) || 0,
        status:
            typeof result[CLOUD_SYNC_STORAGE_KEYS.STATUS] === 'string'
                ? result[CLOUD_SYNC_STORAGE_KEYS.STATUS]
                : '',
        error:
            typeof result[CLOUD_SYNC_STORAGE_KEYS.ERROR] === 'string'
                ? result[CLOUD_SYNC_STORAGE_KEYS.ERROR]
                : '',
        count: Number(result[CLOUD_SYNC_STORAGE_KEYS.COUNT]) || 0,
        pendingCount:
            Number(result[CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]) ||
            CLOUD_SYNC_DEFAULTS.pendingCount,
        pendingByAccount: normalizePendingByAccount(
            result[CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT]
        ),
        primaryAccountKey: normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]),
        failureCount:
            Number(result[CLOUD_SYNC_STORAGE_KEYS.FAILURE_COUNT]) ||
            CLOUD_SYNC_DEFAULTS.failureCount,
        backoffUntil:
            Number(result[CLOUD_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]) ||
            CLOUD_SYNC_DEFAULTS.backoffUntil,
        queueSeeded: result[CLOUD_SYNC_STORAGE_KEYS.QUEUE_SEEDED] === true,
    };
}

export async function readSubscriptionSyncState() {
    const result = await storageLocalGet([
        SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.AUTO_ENABLED,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.INTERVAL_MINUTES,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.LAST_AT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.FAILURE_COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.BACKOFF_UNTIL,
    ]);

    return {
        endpointUrl:
            typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT] === 'string'
                ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT].trim()
                : '',
        apiToken:
            typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN] === 'string'
                ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN]
                : '',
        autoEnabled: result[SUBSCRIPTION_SYNC_STORAGE_KEYS.AUTO_ENABLED] === true,
        intervalMinutes: normalizeSyncInterval(
            result[SUBSCRIPTION_SYNC_STORAGE_KEYS.INTERVAL_MINUTES]
        ),
        lastAt: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.LAST_AT]) || 0,
        status:
            typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS] === 'string'
                ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS]
                : '',
        error:
            typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR] === 'string'
                ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR]
                : '',
        count: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.COUNT]) || 0,
        pendingCount: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]) || 0,
        pendingKeys: Array.isArray(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS])
            ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]
            : [],
        primaryAccountKey: normalizeAccountKey(
            result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]
        ),
        failureCount:
            Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.FAILURE_COUNT]) ||
            SUBSCRIPTION_SYNC_DEFAULTS.failureCount,
        backoffUntil:
            Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]) ||
            SUBSCRIPTION_SYNC_DEFAULTS.backoffUntil,
    };
}

export async function readSubscriptionPendingKeys() {
    const result = await storageLocalGet([SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]);
    const pending = Array.isArray(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS])
        ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]
        : [];
    return pending.filter((key) => typeof key === 'string' && key.trim());
}

export async function runPendingQueueMutation(mutator) {
    const { getPendingQueueMutationChain, setPendingQueueMutationChain } =
        await import('./sync-constants.js');

    let chain = getPendingQueueMutationChain();
    if (!chain || chain === Promise.resolve()) {
        chain = Promise.resolve();
    }

    const next = chain.then(mutator);
    setPendingQueueMutationChain(next);
    return next;
}
