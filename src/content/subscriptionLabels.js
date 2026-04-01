// Subscription labels for Home/Feed (Isolated World)
import { createLogger } from './utils/logger.js';

const logger = createLogger('SubscriptionLabels');

const LOCAL_STORAGE_KEY = 'ytCommanderSubscribedChannelsCache';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const recentlyHoveredCards = new WeakSet();
let hoverCleanupTimer = null;
let globalHoverPause = false;
let hoverPauseTimeout = null;

function markCardHovered(card) {
    recentlyHoveredCards.add(card);
    
    if (hoverCleanupTimer) {
        clearTimeout(hoverCleanupTimer);
    }
    
    hoverCleanupTimer = setTimeout(() => {
        recentlyHoveredCards.delete(card);
        hoverCleanupTimer = null;
    }, 2000);
}

function pauseDecorationDuringHover() {
    globalHoverPause = true;
    if (hoverPauseTimeout) {
        clearTimeout(hoverPauseTimeout);
    }
    hoverPauseTimeout = setTimeout(() => {
        globalHoverPause = false;
        hoverPauseTimeout = null;
    }, 2000);
}
const LABEL_CLASS = 'yt-commander-subscription-label';
const LABEL_KIND_ATTR = 'data-yt-commander-subscription-kind';
const LABEL_KIND_SUBSCRIBED = 'subscribed';
const HOST_CLASS = 'yt-commander-subscription-host';
const CARD_SELECTOR = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer';
const ROW_CLASS = 'yt-content-metadata-view-model__metadata-row';
const METADATA_ROW_SELECTORS = [
    `.${ROW_CLASS}`,
    '.yt-content-metadata-view-model__metadata-row',
    '.yt-lockup-metadata-view-model__metadata-row',
    '.yt-lockup-metadata-view-model__metadata',
    '.shortsLockupViewModelHostOutsideMetadataSubhead',
    '.shortsLockupViewModelHostMetadataSubhead',
    '.shortsLockupViewModelHostInlineMetadata',
    '.shortsLockupViewModelHostOutsideMetadata'
];
const SUBSCRIBE_PAGE_URL = 'https://www.youtube.com/feed/channels';
const HOME_BROWSE_SELECTOR = 'ytd-browse[page-subtype="home"], ytd-browse[browse-id="FEwhat_to_watch"]';
const MAX_CONTINUATION_PAGES = 500;
const CONTINUATION_FETCH_DELAY_MS = 120;
const CONTINUATION_RETRY_DELAY_MS = 4000;
const BROWSE_SOURCE = 'browse';
const SHORTS_CHANNEL_CACHE_KEY = 'ytCommanderShortsChannelCache';
const SHORTS_CHANNEL_CACHE_LIMIT = 3000;
const SHORTS_LOOKUP_CONCURRENCY = 3;
const SHORTS_LOOKUP_FAIL_TTL_MS = 10 * 60 * 1000;

let subscribedChannelIds = new Set();
let subscribedChannelPaths = new Set();
let dataReady = false;
let dataInitialized = false;
let mutationObserver = null;
let renderScheduled = false;
let pendingCards = new Set();
let debugState = null;
let ytcfgFallback = null;
let renderedCount = 0;
let continuationRetryScheduled = false;
let shortsChannelCache = new Map();
let shortsLookupPending = new Set();
let shortsLookupInFlight = new Set();
let shortsLookupFailures = new Map();
let shortsLookupCards = new Map();
let homeBootstrapped = false;
let scanIntervalId = null;

function setDebugState(key, value) {
    try {
        if (!debugState) {
            debugState = { loadedAt: Date.now() };
        }
        debugState[key] = value;
        window.__YT_COMMANDER_SUBS_LABELS__ = debugState;
    } catch (_error) {
        // Ignore debug state errors.
    }
}

function setDebugAttribute(value) {
    try {
        document.documentElement.setAttribute('data-yt-commander-subs-labels', value);
    } catch (_error) {
        // Ignore DOM errors.
    }
}

function setDebugMeta(key, value) {
    try {
        const safeValue = typeof value === 'string' ? value.slice(0, 180) : String(value);
        document.documentElement.setAttribute(`data-yt-commander-subs-${key}`, safeValue);
    } catch (_error) {
        // Ignore DOM errors.
    }
}

function isElementHidden(element) {
    if (!element) {
        return true;
    }
    if (element.hasAttribute('hidden')) {
        return true;
    }
    if (element.getAttribute('aria-hidden') === 'true') {
        return true;
    }
    return false;
}

function getHomeBrowseRoot() {
    const roots = document.querySelectorAll(HOME_BROWSE_SELECTOR);
    for (const root of roots) {
        if (!root || !root.isConnected) {
            continue;
        }
        if (isElementHidden(root)) {
            continue;
        }
        return root;
    }
    return null;
}

function isHomeCard(card) {
    const root = card?.closest?.(HOME_BROWSE_SELECTOR);
    if (!root) {
        return false;
    }
    if (!root.isConnected) {
        return false;
    }
    return !isElementHidden(root);
}

function clearLabelsFromCard(card) {
    if (!card) {
        return;
    }
    card.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => label.remove());
    card.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => host.classList.remove(HOST_CLASS));
}

function loadShortsChannelCache() {
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
            if (typeof videoId === 'string' && typeof channelId === 'string' && channelId.startsWith('UC')) {
                shortsChannelCache.set(videoId, channelId);
            }
        });
    } catch (_error) {
        // Ignore cache load errors.
    }
}

function saveShortsChannelCache() {
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
        // Ignore and fallback below.
    }

    if (ytcfgFallback && typeof ytcfgFallback === 'object') {
        return ytcfgFallback[key];
    }

    return undefined;
}

/**
 * Get cookie by name.
 * @param {string} name
 * @returns {string}
 */
function getCookieValue(name) {
    try {
        const encoded = encodeURIComponent(name);
        const match = document.cookie.match(new RegExp(`(?:^|; )${encoded}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    } catch (_error) {
        return '';
    }
}

/**
 * SHA-1 digest as hex.
 * @param {string} input
 * @returns {Promise<string>}
 */
async function sha1Hex(input) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const bytes = Array.from(new Uint8Array(hashBuffer));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Build SAPISIDHASH Authorization header.
 * @returns {Promise<string|null>}
 */
async function buildSapisidAuthorization() {
    const sapisid = getCookieValue('SAPISID') || getCookieValue('__Secure-3PAPISID');
    if (!sapisid) {
        return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const hash = await sha1Hex(`${timestamp} ${sapisid} ${location.origin}`);
    return `SAPISIDHASH ${timestamp}_${hash}`;
}

/**
 * Wait until ytcfg has enough client metadata.
 * @returns {Promise<void>}
 */
async function waitForYtCfgReady() {
    const maxAttempts = 20;
    const delayMs = 120;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
        const context = getYtCfgValue('INNERTUBE_CONTEXT');
        if (apiKey && context) {
            return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
}

/**
 * Build innertube config and headers.
 * @returns {Promise<{apiKey: string, context: object, headers: Record<string, string>}>}
 */
async function getInnertubeConfig() {
    await waitForYtCfgReady();

    const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('YouTube API key is unavailable on this page.');
    }

    const rawContext = getYtCfgValue('INNERTUBE_CONTEXT');
    const context = rawContext && typeof rawContext === 'object'
        ? JSON.parse(JSON.stringify(rawContext))
        : {
            client: {
                hl: getYtCfgValue('HL') || 'en',
                gl: getYtCfgValue('GL') || 'US',
                clientName: getYtCfgValue('INNERTUBE_CLIENT_NAME') || 'WEB',
                clientVersion: getYtCfgValue('INNERTUBE_CLIENT_VERSION') || ''
            }
        };

    const clientName = getYtCfgValue('INNERTUBE_CONTEXT_CLIENT_NAME')
        || context?.client?.clientName
        || getYtCfgValue('INNERTUBE_CLIENT_NAME')
        || '1';
    const clientVersion = getYtCfgValue('INNERTUBE_CONTEXT_CLIENT_VERSION')
        || context?.client?.clientVersion
        || getYtCfgValue('INNERTUBE_CLIENT_VERSION')
        || '';
    const visitorData = getYtCfgValue('VISITOR_DATA') || context?.client?.visitorData;
    const sessionIndex = getYtCfgValue('SESSION_INDEX') ?? 0;
    const identityToken = getYtCfgValue('ID_TOKEN') || getYtCfgValue('DELEGATED_SESSION_ID');
    const authorizationHeader = await buildSapisidAuthorization();

    const headers = {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': String(clientName),
        'X-Youtube-Client-Version': String(clientVersion),
        'X-Origin': location.origin
    };

    if (sessionIndex !== null && sessionIndex !== undefined) {
        headers['X-Goog-AuthUser'] = String(sessionIndex);
    }

    if (visitorData) {
        headers['X-Goog-Visitor-Id'] = String(visitorData);
    }

    if (identityToken) {
        headers['X-Youtube-Identity-Token'] = String(identityToken);
    }

    if (authorizationHeader) {
        headers.Authorization = authorizationHeader;
    }

    return { apiKey, context, headers };
}

/**
 * Parse JSON safely.
 * @param {string} text
 * @returns {any|null}
 */
function parseJsonSafe(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

/**
 * Read readable API error from response payload.
 * @param {string} responseText
 * @returns {string}
 */
function readApiError(responseText) {
    if (!responseText) {
        return 'Unknown YouTube API error.';
    }

    const payload = parseJsonSafe(responseText);
    const parsedError = payload?.error?.message
        || payload?.error?.errors?.[0]?.message
        || payload?.alerts?.[0]?.alertRenderer?.text?.simpleText;
    if (parsedError) {
        return String(parsedError);
    }

    return String(responseText).slice(0, 240);
}

/**
 * Call innertube endpoint.
 * @param {string} path
 * @param {object} payload
 * @returns {Promise<any>}
 */
async function postInnertube(path, payload) {
    const config = await getInnertubeConfig();
    const endpoint = `https://www.youtube.com/youtubei/v1/${path}?key=${encodeURIComponent(config.apiKey)}`;
    const body = JSON.stringify({ context: config.context, ...payload });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: config.headers,
        body
    });

    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
        setDebugState('lastInnertubeError', readApiError(responseText));
        throw new Error(readApiError(responseText));
    }

    return parseJsonSafe(responseText) || {};
}

async function fetchChannelIdForVideo(videoId) {
    if (!videoId) {
        return '';
    }
    try {
        const response = await postInnertube('player', { videoId });
        const channelId = response?.videoDetails?.channelId
            || response?.microformat?.playerMicroformatRenderer?.ownerChannelId
            || '';
        return typeof channelId === 'string' ? channelId : '';
    } catch (error) {
        logger.debug('Failed to resolve video channel id', { videoId, error });
        return '';
    }
}

function enqueueShortsLookup(videoId, card) {
    if (!videoId) {
        return;
    }
    if (shortsChannelCache.has(videoId)) {
        return;
    }
    const lastFailure = shortsLookupFailures.get(videoId);
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
    processShortsLookupQueue();
}

function processShortsLookupQueue() {
    if (shortsLookupInFlight.size >= SHORTS_LOOKUP_CONCURRENCY) {
        return;
    }
    const availableSlots = SHORTS_LOOKUP_CONCURRENCY - shortsLookupInFlight.size;
    const pending = Array.from(shortsLookupPending);
    pending.slice(0, availableSlots).forEach((videoId) => {
        shortsLookupPending.delete(videoId);
        shortsLookupInFlight.add(videoId);
        fetchChannelIdForVideo(videoId)
            .then((channelId) => {
                if (channelId && channelId.startsWith('UC')) {
                    shortsChannelCache.set(videoId, channelId);
                    saveShortsChannelCache();
                    const cards = shortsLookupCards.get(videoId);
                    if (cards) {
                        cards.forEach((card) => decorateCard(card));
                    }
                } else {
                    shortsLookupFailures.set(videoId, Date.now());
                }
            })
            .finally(() => {
                shortsLookupInFlight.delete(videoId);
                processShortsLookupQueue();
            });
    });
}

/**
 * Return true if path indicates a channel path.
 * @param {string} path
 * @returns {boolean}
 */
function isChannelPath(path) {
    return path.startsWith('/channel/') || path.startsWith('/@') || path.startsWith('/c/') || path.startsWith('/user/');
}

/**
 * Extract channel ID from a raw path (preserve case).
 * @param {string} path
 * @returns {string|null}
 */
function extractChannelIdFromPath(path) {
    if (!path) {
        return null;
    }
    const match = path.match(/\/channel\/([^/?#]+)/i);
    if (!match) {
        return null;
    }
    return match[1] || null;
}

/**
 * Normalize channel path.
 * @param {string} path
 * @returns {string}
 */
function normalizeChannelPath(path) {
    if (!path) {
        return '';
    }
    let trimmed = path;
    try {
        if (trimmed.startsWith('http')) {
            const url = new URL(trimmed);
            trimmed = url.pathname;
        }
    } catch (_error) {
        // Ignore URL parsing errors.
    }
    trimmed = trimmed.split('?')[0].split('#')[0];
    return trimmed.trim().toLowerCase();
}

function extractVideoIdFromHref(href) {
    if (!href) {
        return '';
    }
    const shortsMatch = href.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
    if (shortsMatch) {
        return shortsMatch[1];
    }
    const queryMatch = href.match(/[?&]v=([A-Za-z0-9_-]{8,})/);
    if (queryMatch) {
        return queryMatch[1];
    }
    return '';
}

function getShortsVideoId(card) {
    const anchor = card.querySelector('a[href*="/shorts/"]') || card.querySelector('a[href*="shorts/"]');
    const href = anchor?.getAttribute?.('href') || '';
    return extractVideoIdFromHref(href);
}

/**
 * Extract ytInitialData JSON from HTML page.
 * @param {string} html
 * @returns {any|null}
 */
function extractInitialDataFromHtml(html) {
    if (!html || typeof html !== 'string') {
        return null;
    }

    const markers = [
        'var ytInitialData =',
        'window["ytInitialData"] =',
        'ytInitialData ='
    ];

    for (const marker of markers) {
        const index = html.indexOf(marker);
        if (index === -1) {
            continue;
        }

        const start = html.indexOf('{', index);
        if (start === -1) {
            continue;
        }

        let depth = 0;
        for (let i = start; i < html.length; i += 1) {
            const char = html[i];
            if (char === '{') {
                depth += 1;
            } else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    const jsonText = html.slice(start, i + 1);
                    const parsed = parseJsonSafe(jsonText);
                    if (parsed) {
                        return parsed;
                    }
                    break;
                }
            }
        }
    }

    return null;
}

/**
 * Parse a CSV line into columns (handles basic quoted values).
 * @param {string} line
 * @returns {string[]}
 */
// CSV export approach removed for simplicity.

/**
 * Extract ytcfg.set JSON from HTML page.
 * @param {string} html
 * @returns {any|null}
 */
function extractYtCfgFromHtml(html) {
    if (!html || typeof html !== 'string') {
        return null;
    }

    const marker = 'ytcfg.set(';
    const index = html.indexOf(marker);
    if (index === -1) {
        return null;
    }

    const start = html.indexOf('{', index);
    if (start === -1) {
        return null;
    }

    let depth = 0;
    for (let i = start; i < html.length; i += 1) {
        const char = html[i];
        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                const jsonText = html.slice(start, i + 1);
                const parsed = parseJsonSafe(jsonText);
                if (parsed) {
                    return parsed;
                }
                break;
            }
        }
    }

    return null;
}

/**
 * Recursively collect channel ids and canonical paths from data tree.
 * @param {any} node
 * @param {Set<string>} channelIds
 * @param {Set<string>} channelPaths
 * @param {Set<string>} continuations
 */
function collectChannelData(node, channelIds, channelPaths, continuations) {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (typeof node.channelId === 'string') {
        const channelId = node.channelId.trim();
        if (channelId.startsWith('UC') && channelId.length >= 22) {
            channelIds.add(channelId);
        }
    }

    const browseId = node?.browseEndpoint?.browseId || node?.navigationEndpoint?.browseEndpoint?.browseId;
    if (typeof browseId === 'string' && browseId.startsWith('UC')) {
        channelIds.add(browseId);
    }

    const canonicalBaseUrl = node?.browseEndpoint?.canonicalBaseUrl
        || node?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
        || node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;

    if (typeof canonicalBaseUrl === 'string' && canonicalBaseUrl) {
        const normalized = normalizeChannelPath(canonicalBaseUrl);
        if (normalized && isChannelPath(normalized)) {
            channelPaths.add(normalized);
        }
    }

    const continuationToken = node?.continuationCommand?.token
        || node?.continuationEndpoint?.continuationCommand?.token;
    if (typeof continuationToken === 'string') {
        continuations.add(continuationToken);
    }

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            value.forEach((item) => collectChannelData(item, channelIds, channelPaths, continuations));
        } else if (value && typeof value === 'object') {
            collectChannelData(value, channelIds, channelPaths, continuations);
        }
    }
}

/**
 * Fetch subscriptions list via feed/channels page + continuations.
 * @returns {Promise<{channelIds: Set<string>, channelPaths: Set<string>}>}
 */
async function fetchSubscribedChannels(seed = null) {
    const channelIds = seed?.channelIds instanceof Set
        ? new Set(seed.channelIds)
        : new Set();
    const channelPaths = seed?.channelPaths instanceof Set
        ? new Set(seed.channelPaths)
        : new Set();
    const continuations = new Set(Array.isArray(seed?.continuations) ? seed.continuations : []);
    let hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
    let htmlPayload = '';

    try {
        const response = await fetch(SUBSCRIBE_PAGE_URL, { credentials: 'include' });
        htmlPayload = await response.text();
        setDebugState('subscriptionsHtmlStatus', response.status);
        setDebugState('subscriptionsHtmlLength', htmlPayload.length);
        setDebugMeta('html-status', response.status);
        setDebugMeta('html-length', htmlPayload.length);
        const initialData = extractInitialDataFromHtml(htmlPayload);
        if (initialData) {
            collectChannelData(initialData, channelIds, channelPaths, continuations);
            hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
        }
        setDebugState('subscriptionsInitialDataFound', Boolean(initialData));
        ytcfgFallback = extractYtCfgFromHtml(htmlPayload);
        setDebugState('subscriptionsYtCfgFound', Boolean(ytcfgFallback));
        setDebugMeta('initial-data', Boolean(initialData));
        setDebugMeta('ytcfg-found', Boolean(ytcfgFallback));
    } catch (error) {
        logger.debug('Failed to fetch subscription HTML', error);
        setDebugState('subscriptionsHtmlError', error?.message || String(error));
        setDebugMeta('html-error', error?.message || String(error));
    }

    try {
        const browseData = await postInnertube('browse', { browseId: 'FEchannels' });
        if (browseData && typeof browseData === 'object') {
            collectChannelData(browseData, channelIds, channelPaths, continuations);
            hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
        }
    } catch (error) {
        logger.debug('FEchannels browse failed, falling back to HTML', error);
        setDebugMeta('innertube-error', error?.message || String(error));
    }

    if (!hasSeedData && htmlPayload) {
        const initialData = extractInitialDataFromHtml(htmlPayload);
        if (initialData) {
            collectChannelData(initialData, channelIds, channelPaths, continuations);
            hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
        }
    }

    const continuationQueue = Array.from(continuations);
    const visited = new Set();
    let pagesFetched = 0;
    const startTime = performance.now();

    while (continuationQueue.length > 0 && pagesFetched < MAX_CONTINUATION_PAGES) {
        const token = continuationQueue.shift();
        if (!token || visited.has(token)) {
            continue;
        }

        visited.add(token);
        pagesFetched += 1;

        try {
            const continuationData = await postInnertube('browse', { continuation: token });
            collectChannelData(continuationData, channelIds, channelPaths, continuations);
            continuations.forEach((cont) => {
                if (!visited.has(cont)) {
                    continuationQueue.push(cont);
                }
            });
        } catch (error) {
            logger.debug('Failed to fetch continuation page', error);
        }

        if (CONTINUATION_FETCH_DELAY_MS > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, CONTINUATION_FETCH_DELAY_MS));
        }
    }

    const remaining = continuationQueue.filter((token) => token && !visited.has(token));
    return { channelIds, channelPaths, continuations: remaining, complete: remaining.length === 0, source: BROWSE_SOURCE };
}

/**
 * Load subscription cache from local storage.
 * @returns {Promise<boolean>}
 */
async function loadSubscriptionCache() {
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
    subscribedChannelIds = new Set(ids);
    subscribedChannelPaths = new Set(paths.map(normalizeChannelPath));
    dataReady = subscribedChannelIds.size > 0 || subscribedChannelPaths.size > 0;

    const fresh = fetchedAt > 0 && now - fetchedAt < CACHE_TTL_MS;
    setDebugMeta('cache-fresh', fresh);
    setDebugMeta('cache-counts', `ids:${subscribedChannelIds.size};paths:${subscribedChannelPaths.size}`);
    return { fresh, hasData: dataReady, continuations, complete, source };
}

/**
 * Persist subscription cache.
 * @param {Set<string>} channelIds
 * @param {Set<string>} channelPaths
 */
async function saveSubscriptionCache(channelIds, channelPaths, continuations = [], complete = false, source = null) {
    const payload = {
        channelIds: Array.from(channelIds),
        channelPaths: Array.from(channelPaths),
        continuations: Array.isArray(continuations) ? continuations : [],
        complete: complete === true,
        source: typeof source === 'string' ? source : null,
        fetchedAt: Date.now()
    };

    try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
        // Ignore local storage failures.
    }
}

/**
 * Ensure subscription cache is populated.
 */
async function ensureSubscriptionIndex() {
    const cacheState = await loadSubscriptionCache();
    const hasContinuations = Array.isArray(cacheState.continuations) && cacheState.continuations.length > 0;
    if (cacheState.fresh && cacheState.complete && cacheState.source === CSV_SOURCE && !hasContinuations) {
        dataInitialized = true;
        setDebugMeta('data-ready', dataReady);
        scanVisibleCards();
        return;
    }

    try {
        const seed = cacheState.hasData
            ? {
                channelIds: subscribedChannelIds,
                channelPaths: subscribedChannelPaths,
                continuations: cacheState.continuations
            }
            : null;
        const result = await fetchSubscribedChannels(seed);
        subscribedChannelIds = result.channelIds;
        subscribedChannelPaths = result.channelPaths;
        dataReady = subscribedChannelIds.size > 0 || subscribedChannelPaths.size > 0;
        await saveSubscriptionCache(
            subscribedChannelIds,
            subscribedChannelPaths,
            result.continuations || [],
            result.complete === true,
            result.source || null
        );
        dataInitialized = true;
        setDebugMeta('data-ready', dataReady);
        setDebugMeta('data-counts', `ids:${subscribedChannelIds.size};paths:${subscribedChannelPaths.size};remaining:${(result.continuations || []).length}`);
        logger.info('Subscribed channels loaded', { ids: subscribedChannelIds.size, paths: subscribedChannelPaths.size });
        scanVisibleCards();

        if (!continuationRetryScheduled && (result.continuations || []).length > 0) {
            continuationRetryScheduled = true;
            window.setTimeout(() => {
                continuationRetryScheduled = false;
                ensureSubscriptionIndex().catch((error) => {
                    logger.debug('Continuation retry failed', error);
                });
            }, CONTINUATION_RETRY_DELAY_MS);
        }
    } catch (error) {
        if (cacheState.hasData) {
            logger.warn('Using stale subscribed channel cache', error);
        } else {
            logger.warn('Failed to load subscribed channels', error);
        }
        dataInitialized = true;
        setDebugMeta('data-ready', dataReady);
        scanVisibleCards();
    }
}

/**
 * Inject badge styles.
 */
function injectStyles() {
    if (document.getElementById('yt-commander-subscription-label-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'yt-commander-subscription-label-styles';
    style.textContent = `
        .${HOST_CLASS} {
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            overflow: visible;
        }

        .${HOST_CLASS}.${ROW_CLASS} {
            display: flex !important;
        }

        .${HOST_CLASS}.shortsLockupViewModelHostOutsideMetadataSubhead,
        .${HOST_CLASS}.shortsLockupViewModelHostMetadataSubhead {
            display: flex !important;
        }

        .${HOST_CLASS}:not(.${ROW_CLASS}) {
            display: inline-flex;
        }

        .${LABEL_CLASS} {
            display: none;
            align-items: center;
            padding: 4px 10px;
            margin-left: 6px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            background: rgba(255, 255, 255, 0.1);
            color: #e2e8f0;
            white-space: nowrap;
        }

        ytd-browse[page-subtype="home"] .${LABEL_CLASS},
        ytd-browse[browse-id="FEwhat_to_watch"] .${LABEL_CLASS} {
            display: inline-flex;
        }

        .${LABEL_CLASS}[${LABEL_KIND_ATTR}='${LABEL_KIND_SUBSCRIBED}'] {
            background: rgba(46, 204, 113, 0.16);
            color: #b8f2cd;
            border: 1px solid rgba(46, 204, 113, 0.4);
        }
    `;

    document.head.appendChild(style);
}

/**
 * Determine if current page is eligible.
 * @returns {boolean}
 */
function isEligiblePage() {
    return Boolean(getHomeBrowseRoot());
}

/**
 * Return true if href points to a channel page.
 * @param {string} href
 * @returns {boolean}
 */
function isChannelLink(href) {
    if (!href) {
        return false;
    }
    let path = href;
    try {
        if (path.startsWith('http')) {
            path = new URL(path, location.origin).pathname;
        }
    } catch (_error) {
        // Ignore URL parsing errors.
    }
    return path.startsWith('/channel/')
        || path.startsWith('/@')
        || path.startsWith('/c/')
        || path.startsWith('/user/');
}

/**
 * Find the best channel anchor within a card.
 * @param {Element} card
 * @returns {HTMLAnchorElement|null}
 */
function findChannelAnchor(card) {
    const scopedSelectors = [
        '#channel-name a[href]',
        'ytd-channel-name a[href]',
        'ytd-video-owner-renderer a[href]',
        '#metadata #channel-name a[href]',
        'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-row a[href]'
    ];

    for (const selector of scopedSelectors) {
        const anchor = card.querySelector(selector);
        const href = anchor?.getAttribute?.('href') || '';
        if (anchor && isChannelLink(href)) {
            return anchor;
        }
    }

    const fallbackAnchors = card.querySelectorAll('a[href]');
    for (const anchor of fallbackAnchors) {
        const href = anchor.getAttribute('href') || '';
        if (isChannelLink(href)) {
            return anchor;
        }
    }

    return null;
}

/**
 * Try to resolve a channel id/path from card data.
 * @param {Element} card
 * @returns {{channelId: string|null, channelPath: string|null}}
 */
function getDataRoots(card) {
    const roots = [];
    const candidates = [
        card?.data,
        card?.__data,
        card?.__data?.data,
        card?.__data?.item,
        card?.__data?.data?.content,
        card?.__data?.data?.lockup,
        card?.__data?.data?.shortsLockupViewModel,
        card?.__dataHost,
        card?.__dataHost?.__data,
        card?.__dataHost?.data
    ];

    candidates.forEach((candidate) => {
        if (candidate && typeof candidate === 'object') {
            roots.push(candidate);
        }
    });

    return roots;
}

function extractChannelInfoFromData(card) {
    const roots = getDataRoots(card);
    if (roots.length === 0) {
        return { channelId: null, channelPath: null };
    }

    const stack = [...roots];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') {
            continue;
        }

        if (typeof node.channelId === 'string') {
            const channelId = node.channelId.trim();
            if (channelId.startsWith('UC')) {
                return { channelId, channelPath: null };
            }
        }

        const browseId = node?.browseEndpoint?.browseId || node?.navigationEndpoint?.browseEndpoint?.browseId;
        if (typeof browseId === 'string' && browseId.startsWith('UC')) {
            return { channelId: browseId, channelPath: null };
        }

        const possibleRuns = [
            node?.shortBylineText?.runs,
            node?.longBylineText?.runs,
            node?.ownerText?.runs,
            node?.title?.runs
        ];
        for (const runs of possibleRuns) {
            if (!Array.isArray(runs)) {
                continue;
            }
            for (const run of runs) {
                const runBrowseId = run?.navigationEndpoint?.browseEndpoint?.browseId;
                if (typeof runBrowseId === 'string' && runBrowseId.startsWith('UC')) {
                    return { channelId: runBrowseId, channelPath: null };
                }
                const runUrl = run?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
                if (typeof runUrl === 'string') {
                    const normalized = normalizeChannelPath(runUrl);
                    if (normalized && isChannelPath(normalized)) {
                        return { channelId: null, channelPath: normalized };
                    }
                }
            }
        }

        const canonicalBaseUrl = node?.browseEndpoint?.canonicalBaseUrl
            || node?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
            || node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
        if (typeof canonicalBaseUrl === 'string') {
            const normalized = normalizeChannelPath(canonicalBaseUrl);
            if (normalized && isChannelPath(normalized)) {
                return { channelId: null, channelPath: normalized };
            }
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach((item) => stack.push(item));
            } else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }

    return { channelId: null, channelPath: null };
}

/**
 * Find a suitable host for the label when no anchor exists.
 * @param {Element} card
 * @returns {Element|null}
 */
function findLabelHost(card) {
    const selector = METADATA_ROW_SELECTORS.join(',');
    const host = card.querySelector(selector);
    return host || null;
}

/**
 * Find channel anchor in a card.
 * @param {Element} card
 * @returns {{channelId: string|null, channelPath: string|null, anchor: Element|null, host: Element|null}}
 */
function extractChannelInfo(card) {
    const anchor = findChannelAnchor(card);
    let host = null;
    if (anchor) {
        const href = anchor.getAttribute('href') || '';
        if (!href) {
            return { channelId: null, channelPath: null, anchor, host: null };
        }

        let path = href;
        try {
            const url = new URL(href, location.origin);
            path = url.pathname;
        } catch (_error) {
            path = href;
        }

        const normalizedPath = normalizeChannelPath(path);
        let channelId = extractChannelIdFromPath(path);
        host = anchor.closest(`.${ROW_CLASS}`)
            || anchor.closest('ytd-channel-name, #channel-name, ytd-video-owner-renderer')
            || anchor.parentElement
            || anchor;
        return { channelId, channelPath: normalizedPath, anchor, host };
    }

    const fallback = extractChannelInfoFromData(card);
    host = findLabelHost(card);
    return {
        channelId: fallback.channelId,
        channelPath: fallback.channelPath,
        anchor: null,
        host
    };
}

/**
 * Ensure label element exists.
 * @param {Element} anchor
 * @returns {HTMLElement}
 */
function ensureLabel(anchor, hostOverride = null) {
    const host = hostOverride
        || anchor?.closest(`.${ROW_CLASS}`)
        || anchor?.closest('ytd-channel-name, #channel-name, ytd-video-owner-renderer')
        || anchor?.parentElement
        || anchor;
    if (!host) {
        return null;
    }
    host.classList.add(HOST_CLASS);
    const existing = host.querySelector(`.${LABEL_CLASS}`);
    if (existing) {
        return existing;
    }

    const label = document.createElement('span');
    label.className = LABEL_CLASS;
    if (anchor && (host === anchor || host === anchor.parentElement)) {
        anchor.insertAdjacentElement('afterend', label);
    } else {
        host.appendChild(label);
    }
    return label;
}

/**
 * Decorate a card with subscription label.
 * @param {Element} card
 */
function decorateCard(card) {
    if (globalHoverPause) {
        return;
    }
    
    if (!isHomeCard(card)) {
        clearLabelsFromCard(card);
        return;
    }
    if (!dataInitialized) {
        return;
    }

    if (card.matches(':hover') || card.contains(document.activeElement)) {
        markCardHovered(card);
        return;
    }

    if (recentlyHoveredCards.has(card)) {
        return;
    }

    const { channelId, channelPath, anchor, host } = extractChannelInfo(card);
    if ((!anchor && !host) || (!channelId && !channelPath)) {
        const existing = card.querySelector(`.${LABEL_CLASS}`);
        if (existing) {
            existing.remove();
        }
        const shortsVideoId = getShortsVideoId(card);
        if (shortsVideoId) {
            const cachedChannelId = shortsChannelCache.get(shortsVideoId);
            if (cachedChannelId) {
                const subscribed = subscribedChannelIds.has(cachedChannelId);
                if (subscribed) {
                    const label = ensureLabel(anchor, host);
                    if (label) {
                        label.setAttribute(LABEL_KIND_ATTR, LABEL_KIND_SUBSCRIBED);
                        label.textContent = 'Subscribed';
                    }
                }
                return;
            }
            enqueueShortsLookup(shortsVideoId, card);
        }
        return;
    }

    const isSubscribed = (channelId && subscribedChannelIds.has(channelId))
        || (channelPath && subscribedChannelPaths.has(channelPath));

    if (!isSubscribed) {
        const existing = card.querySelector(`.${LABEL_CLASS}`);
        if (existing) {
            existing.remove();
        }
        const shortsVideoId = getShortsVideoId(card);
        if (shortsVideoId && !shortsChannelCache.has(shortsVideoId)) {
            enqueueShortsLookup(shortsVideoId, card);
        }
        return;
    }

    const label = ensureLabel(anchor, host);
    if (!label) {
        return;
    }
    label.setAttribute(LABEL_KIND_ATTR, LABEL_KIND_SUBSCRIBED);
    label.textContent = 'Subscribed';
    renderedCount += 1;
    try {
        document.documentElement.setAttribute('data-yt-commander-subs-rendered', String(renderedCount));
    } catch (_error) {
        // Ignore DOM errors.
    }
}

/**
 * Schedule rendering of pending cards.
 */
function scheduleRender() {
    if (renderScheduled) {
        return;
    }
    renderScheduled = true;

    window.requestAnimationFrame(() => {
        renderScheduled = false;
        if (!isEligiblePage()) {
            clearLabels();
            pendingCards.clear();
            return;
        }
        const cards = Array.from(pendingCards);
        pendingCards.clear();
        cards.forEach((card) => decorateCard(card));
    });
}

/**
 * Queue cards for decoration.
 * @param {Iterable<Element>} cards
 */
function queueCards(cards) {
    for (const card of cards) {
        if (!card) {
            continue;
        }
        pendingCards.add(card);
    }
    scheduleRender();
}

/**
 * Scan current page for cards.
 */
function scanVisibleCards() {
    const homeRoot = getHomeBrowseRoot();
    if (!homeRoot) {
        clearLabels();
        return;
    }
    if (!homeBootstrapped) {
        homeBootstrapped = true;
        ensureSubscriptionIndex().then(() => {
            setDebugState('dataReady', dataReady);
            setDebugState('subscriptionCounts', {
                ids: subscribedChannelIds.size,
                paths: subscribedChannelPaths.size
            });
            setDebugMeta('data-counts', `ids:${subscribedChannelIds.size};paths:${subscribedChannelPaths.size}`);
            scanVisibleCards();
        }).catch((error) => {
            logger.warn('Failed to load subscribed channels', error);
        });
    }

    const cards = homeRoot.querySelectorAll(CARD_SELECTOR);
    if (cards.length > 0) {
        try {
            document.documentElement.setAttribute('data-yt-commander-subs-cards', String(cards.length));
        } catch (_error) {
            // Ignore DOM errors.
        }
        queueCards(cards);
    }
}

function clearLabels() {
    document.querySelectorAll(`.${LABEL_CLASS}`).forEach((label) => label.remove());
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => host.classList.remove(HOST_CLASS));
    try {
        document.documentElement.removeAttribute('data-yt-commander-subs-cards');
        document.documentElement.removeAttribute('data-yt-commander-subs-rendered');
    } catch (_error) {
        // Ignore DOM errors.
    }
}

function resetSubscriptionCache() {
    try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
        window.localStorage.removeItem(SHORTS_CHANNEL_CACHE_KEY);
    } catch (_error) {
        // Ignore local storage errors.
    }
}

/**
 * Start mutation observer.
 */
function startObserver() {
    if (mutationObserver) {
        return;
    }

    mutationObserver = new MutationObserver((mutations) => {
        if (!isEligiblePage()) {
            clearLabels();
            return;
        }
        const found = [];
        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) {
                    return;
                }
                if (node.matches && node.matches(CARD_SELECTOR)) {
                    found.push(node);
                } else {
                    node.querySelectorAll?.(CARD_SELECTOR).forEach((card) => found.push(card));
                }
            });
        }
        if (found.length > 0) {
            queueCards(found);
        }
    });

    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function startScanLoop() {
    if (scanIntervalId) {
        return;
    }
    scanIntervalId = window.setInterval(() => {
        scanVisibleCards();
    }, 1000);
}

/**
 * Initialize module.
 */
async function init() {
    injectStyles();
    loadShortsChannelCache();
    dataInitialized = true;
    setDebugState('initializedAt', Date.now());
    setDebugAttribute('initialized');
    startObserver();
    startScanLoop();
    scanVisibleCards();
    window.addEventListener('yt-navigate-finish', scanVisibleCards);
    document.addEventListener('yt-navigate-finish', scanVisibleCards);
    window.addEventListener('yt-page-data-updated', scanVisibleCards);
    document.addEventListener('yt-page-data-updated', scanVisibleCards);

    let mouseOverThrottle = null;
    const onMouseOver = (event) => {
        if (mouseOverThrottle) return;
        
        const target = event.target;
        if (!target) return;
        
        const card = target.closest(CARD_SELECTOR);
        if (card) {
            mouseOverThrottle = setTimeout(() => {
                mouseOverThrottle = null;
            }, 100);
            markCardHovered(card);
            pauseDecorationDuringHover();
        }
    };
    
    document.addEventListener('mouseover', onMouseOver, true);
}

/**
 * Initialize subscription labels module.
 * @returns {Promise<void>}
 */
export async function initSubscriptionLabels() {
    try {
        await init();
    } catch (error) {
        setDebugAttribute('init-error');
        logger.error('Failed to initialize subscription labels', error);
    }
}

window.addEventListener('message', (event) => {
    if (!event || event.source !== window) {
        return;
    }
    if (event.data?.type === 'YT_COMMANDER_SUBS_RESET') {
        resetSubscriptionCache();
        ensureSubscriptionIndex().catch((error) => {
            logger.debug('Reset refresh failed', error);
        });
    }
});
