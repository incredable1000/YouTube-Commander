/**
 * Watched History identity bridge utilities.
 */

import { createLogger } from '../utils/logger.js';
import {
    DEFAULT_SYNC_ACCOUNT_KEY,
    SUBSCRIPTION_IDENTITY_BRIDGE_SOURCE,
    SUBSCRIPTION_IDENTITY_REQUEST_TYPE,
    SUBSCRIPTION_IDENTITY_RESPONSE_TYPE,
    SUBSCRIPTION_IDENTITY_ACTION,
    SUBSCRIPTION_IDENTITY_TIMEOUT_MS,
    isChannelAccountKey,
} from './cloudSync.js';

const logger = createLogger('WatchedHistory');

let subscriptionIdentityRequestCounter = 0;
const pendingSubscriptionIdentityRequests = new Map();
let subscriptionIdentityResponseListenerAttached = false;
let syncAccountKey = DEFAULT_SYNC_ACCOUNT_KEY;
let syncAccountSource = 'fallback';
let syncAccountIsPrimaryCandidate = false;
let syncAccountIdentityPromise = null;

export function getSyncAccountIdentityState() {
    return {
        accountKey: syncAccountKey,
        source: syncAccountSource,
        isPrimaryCandidate: syncAccountIsPrimaryCandidate,
    };
}

export function setSyncAccountIdentityState(key, source, isPrimary) {
    syncAccountKey = key;
    syncAccountSource = source;
    syncAccountIsPrimaryCandidate = isPrimary;
}

export function handleSubscriptionIdentityBridgeResponse(event) {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
        return;
    }

    const message = event.data;
    if (
        message.source !== SUBSCRIPTION_IDENTITY_BRIDGE_SOURCE ||
        message.type !== SUBSCRIPTION_IDENTITY_RESPONSE_TYPE
    ) {
        return;
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : '';
    if (!requestId || !pendingSubscriptionIdentityRequests.has(requestId)) {
        return;
    }

    const pending = pendingSubscriptionIdentityRequests.get(requestId);
    pendingSubscriptionIdentityRequests.delete(requestId);
    window.clearTimeout(pending.timeoutId);

    if (message.success === true) {
        pending.resolve(message.data || {});
        return;
    }

    pending.reject(new Error(message.error || 'Failed to resolve YouTube channel identity'));
}

export function ensureSubscriptionIdentityBridgeListener() {
    if (subscriptionIdentityResponseListenerAttached) {
        return;
    }

    window.addEventListener('message', handleSubscriptionIdentityBridgeResponse);
    subscriptionIdentityResponseListenerAttached = true;
}

export function requestSubscriptionSyncIdentity() {
    ensureSubscriptionIdentityBridgeListener();

    return new Promise((resolve, reject) => {
        subscriptionIdentityRequestCounter += 1;
        const requestId = `watched-identity-${Date.now()}-${subscriptionIdentityRequestCounter}`;
        const timeoutId = window.setTimeout(() => {
            pendingSubscriptionIdentityRequests.delete(requestId);
            reject(new Error('Timed out while resolving YouTube channel identity'));
        }, SUBSCRIPTION_IDENTITY_TIMEOUT_MS);

        pendingSubscriptionIdentityRequests.set(requestId, {
            resolve,
            reject,
            timeoutId,
        });

        window.postMessage(
            {
                source: SUBSCRIPTION_IDENTITY_BRIDGE_SOURCE,
                type: SUBSCRIPTION_IDENTITY_REQUEST_TYPE,
                action: SUBSCRIPTION_IDENTITY_ACTION,
                requestId,
            },
            '*'
        );
    });
}

export async function resolveSyncAccountIdentity(logger) {
    if (syncAccountKey && syncAccountKey !== DEFAULT_SYNC_ACCOUNT_KEY) {
        return {
            accountKey: syncAccountKey,
            source: syncAccountSource,
            isPrimaryCandidate: syncAccountIsPrimaryCandidate,
        };
    }

    if (syncAccountIdentityPromise) {
        return syncAccountIdentityPromise;
    }

    syncAccountIdentityPromise = (async () => {
        try {
            const identity = await requestSubscriptionSyncIdentity();
            const accountKey =
                typeof identity.accountKey === 'string' ? identity.accountKey.trim() : '';
            if (isChannelAccountKey(accountKey)) {
                syncAccountKey = accountKey;
                syncAccountSource =
                    typeof identity.source === 'string' ? identity.source : 'youtube-channel';
                syncAccountIsPrimaryCandidate = identity.isPrimaryCandidate !== false;
                return {
                    accountKey: syncAccountKey,
                    source: syncAccountSource,
                    isPrimaryCandidate: syncAccountIsPrimaryCandidate,
                };
            }
            logger.warn('Invalid channel identity response for watched history sync', identity);
        } catch (error) {
            logger.warn(
                'Failed to resolve YouTube channel identity for watched history sync',
                error
            );
        }

        syncAccountKey = DEFAULT_SYNC_ACCOUNT_KEY;
        syncAccountSource = 'fallback';
        syncAccountIsPrimaryCandidate = false;
        return {
            accountKey: syncAccountKey,
            source: syncAccountSource,
            isPrimaryCandidate: syncAccountIsPrimaryCandidate,
        };
    })();

    try {
        return await syncAccountIdentityPromise;
    } finally {
        syncAccountIdentityPromise = null;
    }
}
