/**
 * Subscription Labels subscription cache utilities.
 */

import { LOCAL_STORAGE_KEY, CACHE_TTL_MS, CONTINUATION_RETRY_DELAY_MS } from './constants.js';
import { parseJsonSafe } from './html-parse.js';
import { normalizeChannelPath } from './channel-utils.js';

let subscribedChannelIds = new Set();
let subscribedChannelPaths = new Set();
let dataReady = false;
let dataInitialized = false;
let continuationRetryScheduled = false;

export function getSubscribedChannelIds() {
    return subscribedChannelIds;
}

export function getSubscribedChannelPaths() {
    return subscribedChannelPaths;
}

export function setSubscribedChannelIds(ids) {
    subscribedChannelIds = ids;
}

export function setSubscribedChannelPaths(paths) {
    subscribedChannelPaths = paths;
}

export function isDataReady() {
    return dataReady;
}

export function setDataReady(ready) {
    dataReady = ready;
}

export function isDataInitialized() {
    return dataInitialized;
}

export function setDataInitialized(initialized) {
    dataInitialized = initialized;
}

export function loadSubscriptionCache(
    setSubscribedChannelIds,
    setSubscribedChannelPaths,
    setDataReady
) {
    const now = Date.now();
    let cached = null;

    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        cached = parseJsonSafe(raw);
    } catch (_error) {
        cached = null;
    }

    if (!cached) {
        return { fresh: false, hasData: false };
    }

    const fetchedAt = Number(cached?.fetchedAt) || 0;
    const ids = Array.isArray(cached?.channelIds) ? cached.channelIds : [];
    const paths = Array.isArray(cached?.channelPaths) ? cached.channelPaths : [];
    const continuations = Array.isArray(cached?.continuations) ? cached.continuations : [];
    const complete = cached?.complete === true;
    const source = typeof cached?.source === 'string' ? cached.source : null;

    const idSet = new Set(ids);
    const pathSet = new Set(paths.map(normalizeChannelPath));

    setSubscribedChannelIds(idSet);
    setSubscribedChannelPaths(pathSet);
    setDataReady(idSet.size > 0 || pathSet.size > 0);

    const fresh = fetchedAt > 0 && now - fetchedAt < CACHE_TTL_MS;
    return { fresh, hasData: idSet.size > 0 || pathSet.size > 0, continuations, complete, source };
}

export function saveSubscriptionCache(
    channelIds,
    channelPaths,
    continuations = [],
    complete = false,
    source = null
) {
    const payload = {
        channelIds: Array.from(channelIds),
        channelPaths: Array.from(channelPaths),
        continuations: Array.isArray(continuations) ? continuations : [],
        complete: complete === true,
        source: typeof source === 'string' ? source : null,
        fetchedAt: Date.now(),
    };

    try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
        // Ignore local storage failures.
    }
}

export function resetSubscriptionCache() {
    try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (_error) {
        // Ignore local storage errors.
    }
}

export function isContinuationRetryScheduled() {
    return continuationRetryScheduled;
}

export function setContinuationRetryScheduled(scheduled) {
    continuationRetryScheduled = scheduled;
}
