import { createBridgeClient } from './playlist-multi-select/bridge.js';

const BRIDGE_SOURCE = 'yt-commander';
const REQUEST_TYPE = 'YT_COMMANDER_SUBSCRIPTION_ACCOUNT_REQUEST';
const RESPONSE_TYPE = 'YT_COMMANDER_SUBSCRIPTION_ACCOUNT_RESPONSE';
const ACTION_GET_ACTIVE_CHANNEL_IDENTITY = 'GET_ACTIVE_CHANNEL_IDENTITY';
const REQUEST_TIMEOUT_MS = 20000;
const ACCOUNT_KEY_PREFIX = 'ytch:';

const bridgeClient = createBridgeClient({
    source: BRIDGE_SOURCE,
    requestType: REQUEST_TYPE,
    responseType: RESPONSE_TYPE,
    timeoutMs: REQUEST_TIMEOUT_MS,
    requestPrefix: 'ytc-sync-identity'
});

let initialized = false;

/**
 * Attach the bridge response listener once.
 */
function initSubscriptionSyncIdentityClient() {
    if (initialized) {
        return;
    }

    window.addEventListener('message', bridgeClient.handleResponse);
    initialized = true;
}

/**
 * Check whether account key is a portable YouTube channel-based sync key.
 * @param {any} rawAccountKey
 * @returns {boolean}
 */
function isSubscriptionChannelAccountKey(rawAccountKey) {
    const value = typeof rawAccountKey === 'string' ? rawAccountKey.trim() : '';
    return /^ytch:UC[A-Za-z0-9_-]{20,}$/.test(value);
}

/**
 * Normalize bridge response identity.
 * @param {any} rawIdentity
 * @returns {{accountKey: string, channelId: string, source: string, isPrimaryCandidate: boolean}}
 */
function normalizeSubscriptionSyncIdentity(rawIdentity) {
    const channelId = typeof rawIdentity?.channelId === 'string'
        ? rawIdentity.channelId.trim()
        : '';
    const accountKey = typeof rawIdentity?.accountKey === 'string'
        ? rawIdentity.accountKey.trim()
        : '';

    if (!isSubscriptionChannelAccountKey(accountKey) || !channelId.startsWith('UC')) {
        throw new Error('Failed to resolve a portable YouTube channel identity');
    }

    return {
        accountKey: `${ACCOUNT_KEY_PREFIX}${channelId}`,
        channelId,
        source: typeof rawIdentity?.source === 'string' ? rawIdentity.source : 'unknown',
        isPrimaryCandidate: rawIdentity?.isPrimaryCandidate !== false
    };
}

/**
 * Resolve current signed-in YouTube channel identity via main-world bridge.
 * @returns {Promise<{accountKey: string, channelId: string, source: string, isPrimaryCandidate: boolean}>}
 */
async function requestSubscriptionSyncIdentity() {
    initSubscriptionSyncIdentityClient();
    const response = await bridgeClient.sendRequest(ACTION_GET_ACTIVE_CHANNEL_IDENTITY, {});
    return normalizeSubscriptionSyncIdentity(response);
}

export {
    initSubscriptionSyncIdentityClient,
    requestSubscriptionSyncIdentity,
    isSubscriptionChannelAccountKey
};
