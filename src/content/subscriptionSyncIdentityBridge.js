/**
 * Main-world bridge that resolves the signed-in YouTube channel identity
 * used for subscription sync account keys.
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('SubscriptionSyncIdentityBridge');

const BRIDGE_SOURCE = 'yt-commander';
const REQUEST_TYPE = 'YT_COMMANDER_SUBSCRIPTION_ACCOUNT_REQUEST';
const RESPONSE_TYPE = 'YT_COMMANDER_SUBSCRIPTION_ACCOUNT_RESPONSE';
const ACTION_GET_ACTIVE_CHANNEL_IDENTITY = 'GET_ACTIVE_CHANNEL_IDENTITY';

const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{20,}$/;
const RESOLVED_KEY_PREFIX = 'ytch:';
const IDENTITY_CACHE_TTL_MS = 30_000;

let initialized = false;
let cachedIdentity = null;
let cachedIdentityAt = 0;

/**
 * Read a value from ytcfg safely.
 * @param {string} key
 * @returns {any}
 */
function getYtCfgValue(key) {
    try {
        if (window.ytcfg && typeof window.ytcfg.get === 'function') {
            return window.ytcfg.get(key);
        }
    } catch (_error) {
        // Ignore and fallback below.
    }

    try {
        return window.ytcfg?.data_?.[key];
    } catch (_error) {
        return undefined;
    }
}

/**
 * Normalize a raw candidate into a valid YouTube channel id.
 * @param {any} rawChannelId
 * @returns {string}
 */
function normalizeChannelId(rawChannelId) {
    const value = typeof rawChannelId === 'string' ? rawChannelId.trim() : '';
    return CHANNEL_ID_PATTERN.test(value) ? value : '';
}

/**
 * Add weighted counts from channel-id matches in text.
 * @param {string} text
 * @param {Map<string, number>} counts
 * @param {number} weight
 */
function collectChannelIdCountsFromText(text, counts, weight) {
    if (typeof text !== 'string' || !text) {
        return;
    }

    const patterns = [
        /\/channel\/(UC[A-Za-z0-9_-]{20,})/g,
        /"browseId":"(UC[A-Za-z0-9_-]{20,})"/g,
        /"channelId":"(UC[A-Za-z0-9_-]{20,})"/g,
        /"externalId":"(UC[A-Za-z0-9_-]{20,})"/g
    ];

    patterns.forEach((pattern) => {
        let match = pattern.exec(text);
        while (match) {
            const channelId = normalizeChannelId(match[1]);
            if (channelId) {
                counts.set(channelId, (counts.get(channelId) || 0) + weight);
            }
            match = pattern.exec(text);
        }
    });
}

/**
 * Add weighted counts from channel links in a DOM root.
 * @param {ParentNode|null|undefined} root
 * @param {Map<string, number>} counts
 * @param {number} weight
 */
function collectChannelIdCountsFromAnchors(root, counts, weight) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return;
    }

    const anchors = root.querySelectorAll('a[href*="/channel/"]');
    anchors.forEach((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const match = href.match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/);
        const channelId = normalizeChannelId(match?.[1] || '');
        if (!channelId) {
            return;
        }
        counts.set(channelId, (counts.get(channelId) || 0) + weight);
    });
}

/**
 * Merge weighted counts from one map into another.
 * @param {Map<string, number>} target
 * @param {Map<string, number>} source
 * @param {number} multiplier
 */
function mergeWeightedCounts(target, source, multiplier = 1) {
    source.forEach((count, channelId) => {
        target.set(channelId, (target.get(channelId) || 0) + (count * multiplier));
    });
}

/**
 * Pick the strongest channel id candidate from weighted counts.
 * @param {Map<string, number>} counts
 * @returns {string}
 */
function pickBestChannelId(counts) {
    if (!(counts instanceof Map) || counts.size === 0) {
        return '';
    }

    const ranked = Array.from(counts.entries())
        .filter(([channelId]) => normalizeChannelId(channelId))
        .sort((left, right) => {
            if (right[1] !== left[1]) {
                return right[1] - left[1];
            }
            return left[0].localeCompare(right[0]);
        });

    if (ranked.length === 0) {
        return '';
    }

    const [bestChannelId, bestScore] = ranked[0];
    const secondScore = ranked[1]?.[1] || 0;
    if (bestScore <= 0) {
        return '';
    }

    if (ranked.length === 1 || bestScore > secondScore) {
        return bestChannelId;
    }

    return '';
}

/**
 * Collect current-page guide/sidebar channel ids to help disambiguate account links.
 * @returns {Map<string, number>}
 */
function collectGuideChannelIdCounts() {
    const counts = new Map();
    const guideRoots = document.querySelectorAll(
        'ytd-guide-renderer, ytd-mini-guide-renderer, tp-yt-app-drawer'
    );

    guideRoots.forEach((root) => {
        collectChannelIdCountsFromAnchors(root, counts, 1);
    });

    return counts;
}

/**
 * Parse the signed-in channel id from account settings HTML.
 * @param {string} html
 * @returns {string}
 */
function parseChannelIdFromAccountAdvancedHtml(html) {
    if (typeof html !== 'string' || !html) {
        return '';
    }

    const directPatterns = [
        /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})"/,
        /"externalChannelId"\s*:\s*"(UC[A-Za-z0-9_-]{20,})"/,
        /\/channel\/(UC[A-Za-z0-9_-]{20,})/,
        /value="(UC[A-Za-z0-9_-]{20,})"/
    ];

    for (const pattern of directPatterns) {
        const channelId = normalizeChannelId(html.match(pattern)?.[1] || '');
        if (channelId) {
            return channelId;
        }
    }

    let parsedDocument = null;
    try {
        parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    } catch (_error) {
        parsedDocument = null;
    }

    if (!parsedDocument) {
        return '';
    }

    const inputCandidates = parsedDocument.querySelectorAll('input[value^="UC"], input[readonly][value]');
    for (const input of inputCandidates) {
        const channelId = normalizeChannelId(input.getAttribute('value') || input.value || '');
        if (channelId) {
            return channelId;
        }
    }

    const anchorCandidates = parsedDocument.querySelectorAll('a[href*="/channel/UC"]');
    for (const anchor of anchorCandidates) {
        const href = anchor.getAttribute('href') || '';
        const channelId = normalizeChannelId(href.match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/)?.[1] || '');
        if (channelId) {
            return channelId;
        }
    }

    return '';
}

/**
 * Fetch the signed-in advanced account settings page and read the active channel id.
 * @returns {Promise<{channelId: string, source: string}>}
 */
async function resolveChannelIdFromAccountAdvanced() {
    const response = await fetch('https://www.youtube.com/account_advanced', {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error(`Failed to load YouTube account settings (${response.status})`);
    }

    const html = await response.text();
    const directChannelId = parseChannelIdFromAccountAdvancedHtml(html);
    if (directChannelId) {
        return {
            channelId: directChannelId,
            source: 'account-advanced-page'
        };
    }
    throw new Error('Could not parse the signed-in YouTube channel id from account settings');
}

/**
 * Fetch the signed-in "You" page and infer the active channel id.
 * @returns {Promise<{channelId: string, source: string}>}
 */
async function resolveChannelIdFromFeedYou() {
    const response = await fetch('https://www.youtube.com/feed/you', {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error(`Failed to load YouTube account page (${response.status})`);
    }

    const html = await response.text();
    const counts = new Map();
    collectChannelIdCountsFromText(html, counts, 1);

    let parsedDocument = null;
    try {
        parsedDocument = new DOMParser().parseFromString(html, 'text/html');
    } catch (_error) {
        parsedDocument = null;
    }

    if (parsedDocument) {
        collectChannelIdCountsFromAnchors(parsedDocument, counts, 5);
    }

    const guideCounts = collectGuideChannelIdCounts();
    mergeWeightedCounts(counts, guideCounts, 2);

    const channelId = pickBestChannelId(counts);
    if (!channelId) {
        throw new Error('Could not resolve the signed-in YouTube channel id');
    }

    return {
        channelId,
        source: 'feed-you-page'
    };
}

/**
 * Resolve active subscription sync identity.
 * @returns {Promise<{accountKey: string, channelId: string, source: string, isPrimaryCandidate: boolean}>}
 */
async function resolveActiveChannelIdentity() {
    if (cachedIdentity && Date.now() - cachedIdentityAt < IDENTITY_CACHE_TTL_MS) {
        return cachedIdentity;
    }

    if (getYtCfgValue('LOGGED_IN') === false) {
        throw new Error('Sign in to YouTube first to use subscription sync');
    }

    let resolved = null;
    try {
        resolved = await resolveChannelIdFromAccountAdvanced();
    } catch (accountAdvancedError) {
        logger.debug('Account advanced channel lookup failed, falling back to feed/you', accountAdvancedError);
        resolved = await resolveChannelIdFromFeedYou();
    }
    const identity = {
        accountKey: `${RESOLVED_KEY_PREFIX}${resolved.channelId}`,
        channelId: resolved.channelId,
        source: resolved.source,
        isPrimaryCandidate: true
    };

    cachedIdentity = identity;
    cachedIdentityAt = Date.now();
    return identity;
}

/**
 * Post bridge response back to isolated world.
 * @param {string} requestId
 * @param {boolean} success
 * @param {object|null} data
 * @param {string|null} error
 */
function postBridgeResponse(requestId, success, data = null, error = null) {
    window.postMessage({
        source: BRIDGE_SOURCE,
        type: RESPONSE_TYPE,
        requestId,
        success,
        data,
        error
    }, '*');
}

/**
 * Handle isolated-world bridge request.
 * @param {MessageEvent} event
 */
function handleWindowMessage(event) {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
        return;
    }

    const message = event.data;
    if (message.source !== BRIDGE_SOURCE || message.type !== REQUEST_TYPE) {
        return;
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : '';
    if (!requestId) {
        return;
    }

    if (message.action !== ACTION_GET_ACTIVE_CHANNEL_IDENTITY) {
        postBridgeResponse(requestId, false, null, 'Unsupported subscription identity action');
        return;
    }

    resolveActiveChannelIdentity()
        .then((identity) => {
            postBridgeResponse(requestId, true, identity, null);
        })
        .catch((error) => {
            logger.warn('Failed to resolve active YouTube channel identity', error);
            postBridgeResponse(
                requestId,
                false,
                null,
                error instanceof Error ? error.message : 'Failed to resolve YouTube channel id'
            );
        });
}

/**
 * Initialize the subscription identity bridge.
 */
async function initSubscriptionSyncIdentityBridge() {
    if (initialized) {
        return;
    }

    window.addEventListener('message', handleWindowMessage);
    initialized = true;
    logger.info('Subscription sync identity bridge initialized');
}

export {
    initSubscriptionSyncIdentityBridge
};
