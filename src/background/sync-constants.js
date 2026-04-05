/**
 * Cloud sync constants for background script.
 */

export const CLOUD_SYNC_STORAGE_KEYS = {
    ENDPOINT: 'cloudflareSyncEndpoint',
    API_TOKEN: 'cloudflareSyncApiToken',
    AUTO_ENABLED: 'cloudflareSyncAutoEnabled',
    INTERVAL_MINUTES: 'cloudflareSyncIntervalMinutes',
    LAST_AT: 'cloudflareSyncLastAt',
    STATUS: 'cloudflareSyncStatus',
    ERROR: 'cloudflareSyncError',
    COUNT: 'cloudflareSyncCount',
    PENDING_COUNT: 'cloudflareSyncPendingCount',
    PENDING_QUEUE: 'cloudflareSyncPendingVideoIds',
    PENDING_BY_ACCOUNT: 'cloudflareSyncPendingByAccount',
    PRIMARY_ACCOUNT_KEY: 'cloudflareSyncPrimaryAccountKey',
    FAILURE_COUNT: 'cloudflareSyncFailureCount',
    BACKOFF_UNTIL: 'cloudflareSyncBackoffUntil',
    QUEUE_SEEDED: 'cloudflareSyncQueueSeeded',
};

export const CLOUD_SYNC_DEFAULTS = {
    autoEnabled: true,
    intervalMinutes: 30,
    failureCount: 0,
    backoffUntil: 0,
    queueSeeded: false,
    pendingCount: 0,
};

export const AUTO_SYNC_ALARM_NAME = 'ytCommanderCloudflareAutoSync';
export const AUTO_SYNC_CHECK_PERIOD_MINUTES = 1;
export const AUTO_SYNC_CHUNK_SIZE = 300;
export const AUTO_SYNC_MAX_IDS_PER_RUN = 1200;
export const MANUAL_SYNC_MAX_IDS_PER_RUN = 6000;

export const SUBSCRIPTION_SYNC_ALARM_NAME = 'ytCommanderSubscriptionAutoSync';
export const SUBSCRIPTION_SYNC_CHECK_PERIOD_MINUTES = 1;

export const SUBSCRIPTION_SYNC_STORAGE_KEYS = {
    ENDPOINT: 'subscriptionSyncEndpoint',
    API_TOKEN: 'subscriptionSyncApiToken',
    AUTO_ENABLED: 'subscriptionSyncAutoEnabled',
    INTERVAL_MINUTES: 'subscriptionSyncIntervalMinutes',
    LAST_AT: 'subscriptionSyncLastAt',
    STATUS: 'subscriptionSyncStatus',
    ERROR: 'subscriptionSyncError',
    COUNT: 'subscriptionSyncCount',
    PENDING_COUNT: 'subscriptionSyncPendingCount',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PRIMARY_ACCOUNT_KEY: 'subscriptionSyncPrimaryAccountKey',
    FAILURE_COUNT: 'subscriptionSyncFailureCount',
    BACKOFF_UNTIL: 'subscriptionSyncBackoffUntil',
};

export const SUBSCRIPTION_SYNC_DEFAULTS = {
    autoEnabled: true,
    intervalMinutes: 60,
    failureCount: 0,
    backoffUntil: 0,
    pendingCount: 0,
};

export const BADGE_MAX_COUNT = 999;
export const BADGE_BACKGROUND_COLOR = '#ff5b6e';
export const BADGE_TEXT_COLOR = '#ffffff';

export const DEFAULT_ACCOUNT_KEY = 'default';
export const SUBSCRIPTION_ACCOUNT_KEY_PREFIX = 'ytch:';

let _cloudSyncInProgress = false;
let _subscriptionSyncInProgress = false;
let _subscriptionRestoreInProgress = false;
let _pendingQueueMutationChain = Promise.resolve();
let _lastWatchedPendingCount = 0;
let _lastSubscriptionPendingCount = 0;

export function getCloudSyncInProgress() {
    return _cloudSyncInProgress;
}
export function setCloudSyncInProgress(v) {
    _cloudSyncInProgress = v;
}
export function getSubscriptionSyncInProgress() {
    return _subscriptionSyncInProgress;
}
export function setSubscriptionSyncInProgress(v) {
    _subscriptionSyncInProgress = v;
}
export function getSubscriptionRestoreInProgress() {
    return _subscriptionRestoreInProgress;
}
export function setSubscriptionRestoreInProgress(v) {
    _subscriptionRestoreInProgress = v;
}
export function getPendingQueueMutationChain() {
    return _pendingQueueMutationChain;
}
export function setPendingQueueMutationChain(v) {
    _pendingQueueMutationChain = v;
}
export function getLastWatchedPendingCount() {
    return _lastWatchedPendingCount;
}
export function setLastWatchedPendingCount(v) {
    _lastWatchedPendingCount = v;
}
export function getLastSubscriptionPendingCount() {
    return _lastSubscriptionPendingCount;
}
export function setLastSubscriptionPendingCount(v) {
    _lastSubscriptionPendingCount = v;
}
