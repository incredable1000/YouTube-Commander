/**
 * Subscription Labels shorts cache utilities.
 */

import {
    SHORTS_CHANNEL_CACHE_KEY,
    SHORTS_CHANNEL_CACHE_LIMIT,
    SHORTS_LOOKUP_CONCURRENCY,
    SHORTS_LOOKUP_FAIL_TTL_MS,
} from './constants.js';
import { parseJsonSafe } from './html-parse.js';

let shortsChannelCache = new Map();

export function getShortsChannelCache() {
    return shortsChannelCache;
}

export function loadShortsChannelCache() {
    try {
        const raw = window.localStorage.getItem(SHORTS_CHANNEL_CACHE_KEY);
        if (!raw) {
            return;
        }
        const parsed = parseJsonSafe(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        Object.entries(parsed).forEach(([videoId, channelId]) => {
            if (
                typeof videoId === 'string' &&
                typeof channelId === 'string' &&
                channelId.startsWith('UC')
            ) {
                shortsChannelCache.set(videoId, channelId);
            }
        });
    } catch (_error) {
        // Ignore cache load errors.
    }
}

export function saveShortsChannelCache() {
    try {
        if (shortsChannelCache.size > SHORTS_CHANNEL_CACHE_LIMIT) {
            const keys = Array.from(shortsChannelCache.keys());
            const excess = shortsChannelCache.size - SHORTS_CHANNEL_CACHE_LIMIT;
            for (let i = 0; i < excess; i += 1) {
                shortsChannelCache.delete(keys[i]);
            }
        }
        const payload = {};
        shortsChannelCache.forEach((channelId, videoId) => {
            payload[videoId] = channelId;
        });
        window.localStorage.setItem(SHORTS_CHANNEL_CACHE_KEY, JSON.stringify(payload));
    } catch (_error) {
        // Ignore cache save errors.
    }
}

export function hasShortsChannelInCache(videoId) {
    return shortsChannelCache.has(videoId);
}

export function setShortsChannelInCache(videoId, channelId) {
    shortsChannelCache.set(videoId, channelId);
}
