// Watched History - Cloud Sync Constants
export const CLOUD_PENDING_QUEUE_KEY = 'cloudflareSyncPendingVideoIds';
export const CLOUD_PENDING_COUNT_KEY = 'cloudflareSyncPendingCount';
export const CLOUD_PENDING_BY_ACCOUNT_KEY = 'cloudflareSyncPendingByAccount';
export const DEFAULT_SYNC_ACCOUNT_KEY = 'default';
export const SUBSCRIPTION_IDENTITY_BRIDGE_SOURCE = 'yt-commander';
export const SUBSCRIPTION_IDENTITY_REQUEST_TYPE = 'YT_COMMANDER_SUBSCRIPTION_ACCOUNT_REQUEST';
export const SUBSCRIPTION_IDENTITY_RESPONSE_TYPE = 'YT_COMMANDER_SUBSCRIPTION_ACCOUNT_RESPONSE';
export const SUBSCRIPTION_IDENTITY_ACTION = 'GET_ACTIVE_CHANNEL_IDENTITY';
export const SUBSCRIPTION_IDENTITY_TIMEOUT_MS = 20000;
export const CHANNEL_ACCOUNT_KEY_PATTERN = /^ytch:UC[A-Za-z0-9_-]{20,}$/;
export function isChannelAccountKey(rawAccountKey) {
    const value = typeof rawAccountKey === 'string' ? rawAccountKey.trim() : '';
    return CHANNEL_ACCOUNT_KEY_PATTERN.test(value);
}
