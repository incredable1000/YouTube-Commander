/**
 * Subscription Labels shorts lookup utilities.
 */

import { SHORTS_LOOKUP_CONCURRENCY, SHORTS_LOOKUP_FAIL_TTL_MS } from './constants.js';
import { getInnertubeConfig, readApiError } from './ytcfg-utils.js';
import { parseJsonSafe } from './html-parse.js';

let shortsLookupPending = new Set();
let shortsLookupInFlight = new Set();
let shortsLookupFailures = new Map();
let shortsLookupCards = new Map();
let decorateCardFn = null;

export function setDecorateCardFn(fn) {
    decorateCardFn = fn;
}

export async function fetchChannelIdForVideo(videoId, logger) {
    if (!videoId) {
        return '';
    }
    try {
        const config = await getInnertubeConfig();
        const endpoint = `https://www.youtube.com/youtubei/v1/${'player'}?key=${encodeURIComponent(config.apiKey)}`;
        const body = JSON.stringify({ context: config.context, videoId });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: config.headers,
            body,
        });

        const responseText = await response.text().catch(() => '');
        if (!response.ok) {
            throw new Error(readApiError(responseText));
        }

        const parsed = parseJsonSafe(responseText);
        const channelId =
            parsed?.videoDetails?.channelId ||
            parsed?.microformat?.playerMicroformatRenderer?.ownerChannelId ||
            '';
        return typeof channelId === 'string' ? channelId : '';
    } catch (error) {
        if (logger) {
            logger.debug('Failed to resolve video channel id', { videoId, error });
        }
        return '';
    }
}

export function enqueueShortsLookup(videoId, card, shortsCache, shortsFailures) {
    if (!videoId) {
        return;
    }
    if (shortsCache.has(videoId)) {
        return;
    }
    const lastFailure = shortsFailures.get(videoId);
    if (lastFailure && Date.now() - lastFailure < SHORTS_LOOKUP_FAIL_TTL_MS) {
        return;
    }
    if (!shortsLookupCards.has(videoId)) {
        shortsLookupCards.set(videoId, new Set());
    }
    shortsLookupCards.get(videoId).add(card);
    if (shortsLookupPending.has(videoId) || shortsLookupInFlight.has(videoId)) {
        return;
    }
    shortsLookupPending.add(videoId);
}

export function processShortsLookupQueue(shortsCache, saveCache, logger) {
    if (shortsLookupInFlight.size >= SHORTS_LOOKUP_CONCURRENCY) {
        return;
    }
    const availableSlots = SHORTS_LOOKUP_CONCURRENCY - shortsLookupInFlight.size;
    const pending = Array.from(shortsLookupPending);
    pending.slice(0, availableSlots).forEach((videoId) => {
        shortsLookupPending.delete(videoId);
        shortsLookupInFlight.add(videoId);
        fetchChannelIdForVideo(videoId, logger)
            .then((channelId) => {
                if (channelId && channelId.startsWith('UC')) {
                    shortsCache.set(videoId, channelId);
                    saveCache();
                    const cards = shortsLookupCards.get(videoId);
                    if (cards && decorateCardFn) {
                        cards.forEach((card) => decorateCardFn(card));
                    }
                } else {
                    shortsLookupFailures.set(videoId, Date.now());
                }
            })
            .finally(() => {
                shortsLookupInFlight.delete(videoId);
                processShortsLookupQueue(shortsCache, saveCache, logger);
            });
    });
}

export function getShortsLookupState() {
    return {
        pending: shortsLookupPending,
        inFlight: shortsLookupInFlight,
        failures: shortsLookupFailures,
        cards: shortsLookupCards,
    };
}
