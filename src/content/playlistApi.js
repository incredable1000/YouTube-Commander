/**
 * Playlist API Bridge (Main World)
 * Provides YouTube internal playlist operations for isolated-world UI.
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('PlaylistApi');

const BRIDGE_SOURCE = 'yt-commander';
const REQUEST_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_REQUEST';
const RESPONSE_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_RESPONSE';

const ACTIONS = {
    GET_PLAYLISTS: 'GET_PLAYLISTS',
    GET_PLAYLIST_THUMBNAILS: 'GET_PLAYLIST_THUMBNAILS',
    SHOW_NATIVE_TOAST: 'SHOW_NATIVE_TOAST',
    OPEN_NATIVE_PLAYLIST_DRAWER: 'OPEN_NATIVE_PLAYLIST_DRAWER',
    ADD_TO_PLAYLISTS: 'ADD_TO_PLAYLISTS',
    CREATE_PLAYLIST_AND_ADD: 'CREATE_PLAYLIST_AND_ADD',
    REMOVE_FROM_PLAYLIST: 'REMOVE_FROM_PLAYLIST',
    DELETE_PLAYLISTS: 'DELETE_PLAYLISTS',
    GET_SHORTS_UPLOAD_TIMESTAMPS: 'GET_SHORTS_UPLOAD_TIMESTAMPS',
    GET_SUBSCRIPTIONS: 'GET_SUBSCRIPTIONS',
    UNSUBSCRIBE_CHANNELS: 'UNSUBSCRIBE_CHANNELS'
};

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{10,15}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,120}$/;
const MAX_BATCH_SIZE = 45;
const REMOVE_LOOKUP_CONCURRENCY = 4;
const EDIT_PLAYLIST_RETRY_ATTEMPTS = 2;
const EDIT_PLAYLIST_RETRY_DELAY_MS = 420;
const EDIT_PLAYLIST_BATCH_CONCURRENCY = 2;
const EDIT_PLAYLIST_SINGLE_VIDEO_RETRY_ATTEMPTS = 18;
const DELETE_PLAYLIST_CONCURRENCY = 4;
const SHORTS_TIMESTAMP_RESOLVE_CONCURRENCY = 6;
const SUBSCRIPTION_BROWSE_ID = 'FEchannels';
const SUBSCRIPTION_PAGE_LIMIT = 600;
const SUBSCRIPTION_BATCH_SIZE = 50;
const PLAYLIST_THUMBNAIL_CONCURRENCY = 3;

let isInitialized = false;
let cachedAuthHeader = null;
let cachedAuthHeaderAt = 0;

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
    const now = Date.now();
    if (cachedAuthHeader && now - cachedAuthHeaderAt < 30_000) {
        return cachedAuthHeader;
    }

    const sapisid = getCookieValue('SAPISID') || getCookieValue('__Secure-3PAPISID');
    if (!sapisid) {
        return null;
    }

    const timestamp = Math.floor(now / 1000);
    const hash = await sha1Hex(`${timestamp} ${sapisid} ${location.origin}`);
    cachedAuthHeader = `SAPISIDHASH ${timestamp}_${hash}`;
    cachedAuthHeaderAt = now;
    return cachedAuthHeader;
}

/**
 * Wait until ytcfg has enough client metadata.
 * @returns {Promise<void>}
 */
async function waitForYtCfgReady() {
    const maxAttempts = 20;
    const delayMs = 100;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
        const context = getYtCfgValue('INNERTUBE_CONTEXT');
        if (apiKey && context) {
            return;
        }

        await new Promise((resolve) => {
            window.setTimeout(resolve, delayMs);
        });
    }
}

/**
 * Clone serializable objects to avoid mutating ytcfg references.
 * @param {any} value
 * @returns {any}
 */
function cloneSerializable(value) {
    if (!value || typeof value !== 'object') {
        return value;
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return value;
    }
}

/**
 * Build innertube config and headers.
 * @returns {{apiKey: string, context: object, headers: Record<string, string>}}
 */
async function getInnertubeConfig() {
    await waitForYtCfgReady();

    const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('YouTube API key is unavailable on this page.');
    }

    const isLoggedIn = getYtCfgValue('LOGGED_IN') !== false;

    const rawContext = cloneSerializable(getYtCfgValue('INNERTUBE_CONTEXT'));
    const context = rawContext && typeof rawContext === 'object'
        ? rawContext
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
    const identityToken = getYtCfgValue('ID_TOKEN') || getYtCfgValue('DELEGATED_SESSION_ID');
    const visitorData = getYtCfgValue('VISITOR_DATA') || context?.client?.visitorData;
    const sessionIndex = getYtCfgValue('SESSION_INDEX') ?? 0;
    const pageId = getYtCfgValue('DELEGATED_SESSION_ID') || getYtCfgValue('DATASYNC_ID') || '';
    const authorizationHeader = await buildSapisidAuthorization();

    const headers = {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': String(clientName),
        'X-Youtube-Client-Version': String(clientVersion),
        'X-Origin': location.origin,
        'X-Youtube-Bootstrap-Logged-In': isLoggedIn ? 'true' : 'false'
    };

    if (sessionIndex !== null && sessionIndex !== undefined) {
        headers['X-Goog-AuthUser'] = String(sessionIndex);
    }

    if (visitorData) {
        headers['X-Goog-Visitor-Id'] = String(visitorData);
    }

    if (pageId) {
        headers['X-Goog-PageId'] = String(pageId);
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
 * Extract simple text from renderer text nodes.
 * @param {any} value
 * @returns {string}
 */
function readTextValue(value) {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (!value || typeof value !== 'object') {
        return '';
    }

    if (typeof value.simpleText === 'string') {
        return value.simpleText.trim();
    }

    if (Array.isArray(value.runs)) {
        const text = value.runs
            .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
            .join('')
            .trim();
        if (text) {
            return text;
        }
    }

    return '';
}

/**
 * Parse relative age text to timestamp approximation.
 * @param {string} value
 * @returns {number|null}
 */
function parseRelativeAgeToTimestamp(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized === 'just now') {
        return Date.now();
    }

    const match = normalized.match(/\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/);
    if (!match) {
        return null;
    }

    const amount = Number.parseInt(match[1], 10);
    if (!Number.isFinite(amount) || amount < 0) {
        return null;
    }

    const unit = match[2];
    const unitMs = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000
    }[unit];

    if (!unitMs) {
        return null;
    }

    return Date.now() - (amount * unitMs);
}

/**
 * Parse one date-like value to timestamp.
 * @param {any} value
 * @returns {number|null}
 */
function parseDateLikeValue(value) {
    const text = readTextValue(value);
    if (!text) {
        return null;
    }

    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text;
    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) {
        return parsed;
    }

    return parseRelativeAgeToTimestamp(text);
}

/**
 * Build endpoint URL.
 * @param {string} path
 * @param {string} apiKey
 * @returns {string}
 */
function buildInnertubeEndpoint(path, apiKey) {
    return `/youtubei/v1/${path}?prettyPrint=false&key=${encodeURIComponent(apiKey)}`;
}

/**
 * Execute an innertube POST request with path fallback support.
 * @param {string|string[]} paths
 * @param {object} payload
 * @param {{apiKey: string, headers: Record<string, string>}} config
 * @returns {Promise<{path: string, status: number, body: any, text: string}>}
 */
async function postInnertube(paths, payload, config) {
    const pathList = Array.isArray(paths) ? paths : [paths];
    let lastError = null;

    for (const path of pathList) {
        const endpoint = buildInnertubeEndpoint(path, config.apiKey);
        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: config.headers,
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        const responseBody = parseJsonSafe(responseText);
        if (response.ok) {
            return {
                path,
                status: response.status,
                body: responseBody,
                text: responseText
            };
        }

        lastError = new Error(readApiError(responseText));
        logger.warn(`Innertube request failed on ${path}`, {
            status: response.status,
            message: lastError.message
        });
    }

    throw lastError || new Error('Failed to communicate with YouTube API.');
}

/**
 * Validate and dedupe video IDs.
 * @param {string[]} rawVideoIds
 * @returns {string[]}
 */
function sanitizeVideoIds(rawVideoIds) {
    if (!Array.isArray(rawVideoIds)) {
        return [];
    }

    const unique = new Set();
    rawVideoIds.forEach((value) => {
        if (typeof value !== 'string') {
            return;
        }

        const trimmed = value.trim();
        if (VIDEO_ID_PATTERN.test(trimmed)) {
            unique.add(trimmed);
        }
    });

    return Array.from(unique);
}

/**
 * Validate and dedupe channel IDs.
 * @param {string[]} rawChannelIds
 * @returns {string[]}
 */
function sanitizeChannelIds(rawChannelIds) {
    if (!Array.isArray(rawChannelIds)) {
        return [];
    }

    const unique = new Set();
    rawChannelIds.forEach((value) => {
        if (typeof value !== 'string') {
            return;
        }

        const trimmed = value.trim();
        if (trimmed.startsWith('UC') && trimmed.length >= 22) {
            unique.add(trimmed);
        }
    });

    return Array.from(unique);
}

/**
 * Validate and dedupe playlist IDs.
 * @param {string[]} rawPlaylistIds
 * @returns {string[]}
 */
function sanitizePlaylistIds(rawPlaylistIds) {
    if (!Array.isArray(rawPlaylistIds)) {
        return [];
    }

    const unique = new Set();
    rawPlaylistIds.forEach((value) => {
        if (typeof value !== 'string') {
            return;
        }

        const trimmed = value.trim();
        if (PLAYLIST_ID_PATTERN.test(trimmed)) {
            unique.add(trimmed);
        }
    });

    return Array.from(unique);
}

/**
 * Validate a single playlist id.
 * @param {string} rawPlaylistId
 * @returns {string}
 */
function sanitizePlaylistId(rawPlaylistId) {
    if (typeof rawPlaylistId !== 'string') {
        return '';
    }

    const playlistId = rawPlaylistId.trim();
    return PLAYLIST_ID_PATTERN.test(playlistId) ? playlistId : '';
}

/**
 * Split array into chunks.
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

/**
 * Wait helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    return new Promise((resolve) => {
        window.setTimeout(resolve, safeMs);
    });
}

/**
 * Run async mapper with limited concurrency.
 * @template T,U
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<U>} mapper
 * @returns {Promise<U[]>}
 */
async function mapWithConcurrency(items, concurrency, mapper) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: safeConcurrency }, async () => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;

            if (currentIndex >= items.length) {
                break;
            }

            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Extract text from renderer run structures.
 * @param {any} field
 * @returns {string}
 */
function readText(field) {
    if (!field) {
        return '';
    }

    if (typeof field.simpleText === 'string') {
        return field.simpleText;
    }

    if (Array.isArray(field.runs)) {
        return field.runs.map((run) => run?.text || '').join('').trim();
    }

    if (typeof field === 'string') {
        return field;
    }

    return '';
}

/**
 * Find first playlist id in an arbitrary object tree.
 * @param {any} node
 * @param {WeakSet<object>} visited
 * @returns {string|null}
 */
function findPlaylistIdInNode(node, visited = new WeakSet()) {
    if (!node || typeof node !== 'object') {
        return null;
    }

    if (visited.has(node)) {
        return null;
    }
    visited.add(node);

    if (typeof node.playlistId === 'string' && PLAYLIST_ID_PATTERN.test(node.playlistId)) {
        return node.playlistId;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findPlaylistIdInNode(item, visited);
            if (found) {
                return found;
            }
        }
        return null;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
            const found = findPlaylistIdInNode(value, visited);
            if (found) {
                return found;
            }
        }
    }

    return null;
}

/**
 * Normalize privacy status to API-friendly value.
 * @param {string} raw
 * @returns {'PUBLIC'|'UNLISTED'|'PRIVATE'}
 */
function normalizePrivacyStatus(raw) {
    const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (value === 'PUBLIC' || value === 'UNLISTED') {
        return value;
    }
    return 'PRIVATE';
}

/**
 * Recursively collect playlist options from a get_add_to_playlist payload.
 * @param {any} node
 * @param {Map<string, {id: string, title: string, privacy: string, isSelected: boolean, thumbnailUrl?: string}>} output
 * @param {WeakSet<object>} visited
 */
function collectPlaylistOptions(node, output, visited) {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (visited.has(node)) {
        return;
    }
    visited.add(node);

    const renderer = node.playlistAddToOptionRenderer;
    if (renderer && typeof renderer === 'object') {
        const playlistId = renderer.playlistId
            || renderer.addToPlaylistServiceEndpoint?.playlistEditEndpoint?.playlistId
            || renderer.navigationEndpoint?.watchEndpoint?.playlistId
            || '';

        if (PLAYLIST_ID_PATTERN.test(playlistId)) {
            const title = readText(renderer.title) || readText(renderer.untoggledServiceEndpoint?.commandMetadata) || 'Untitled playlist';
            const privacy = readText(renderer.shortBylineText) || '';
            const containsSelected = renderer.containsSelectedVideos;
            const isSelected = renderer.isSelected === true
                || containsSelected === true
                || containsSelected === 'ALL';
            const thumbnailUrl = readPlaylistThumbnailUrl(renderer);

            if (!output.has(playlistId)) {
                output.set(playlistId, {
                    id: playlistId,
                    title,
                    privacy,
                    isSelected,
                    thumbnailUrl
                });
            } else if (isSelected) {
                output.get(playlistId).isSelected = true;
            }
        }
    }

    if (Array.isArray(node)) {
        node.forEach((item) => collectPlaylistOptions(item, output, visited));
        return;
    }

    Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') {
            collectPlaylistOptions(value, output, visited);
        }
    });
}

/**
 * Read a playlist thumbnail url from the renderer payload.
 * @param {any} renderer
 * @returns {string}
 */
function readPlaylistThumbnailUrl(renderer) {
    const directThumb = normalizeThumbnailUrl(pickThumbnailUrl(renderer?.thumbnail?.thumbnails));
    if (directThumb) {
        return directThumb;
    }

    const playlistThumb = normalizeThumbnailUrl(pickThumbnailUrl(
        renderer?.thumbnailRenderer?.playlistThumbnailRenderer?.thumbnail?.thumbnails
    ));
    if (playlistThumb) {
        return playlistThumb;
    }

    const fallbackThumb = normalizeThumbnailUrl(pickThumbnailUrl(
        renderer?.thumbnailRenderer?.playlistThumbnailRenderer?.defaultThumbnail?.thumbnails
    ));
    if (fallbackThumb) {
        return fallbackThumb;
    }

    return findThumbnailUrlDeep(renderer, new WeakSet(), 0);
}

/**
 * Read a playlist thumbnail from a browse response payload.
 * @param {any} body
 * @returns {string}
 */
function readPlaylistThumbnailFromBrowse(body) {
    const microThumb = normalizeThumbnailUrl(
        pickThumbnailUrl(body?.microformat?.microformatDataRenderer?.thumbnail?.thumbnails)
    );
    if (microThumb) {
        return microThumb;
    }

    const headerThumb = normalizeThumbnailUrl(
        pickThumbnailUrl(body?.header?.playlistHeaderRenderer?.thumbnail?.thumbnails)
    );
    if (headerThumb) {
        return headerThumb;
    }

    const headerAltThumb = normalizeThumbnailUrl(
        pickThumbnailUrl(body?.header?.playlistHeaderRenderer?.playlistHeaderBanner?.thumbnail?.thumbnails)
    );
    if (headerAltThumb) {
        return headerAltThumb;
    }

    const bannerThumb = normalizeThumbnailUrl(
        pickThumbnailUrl(body?.header?.playlistHeaderRenderer?.playlistHeaderBanner?.heroImage?.thumbnails)
    );
    if (bannerThumb) {
        return bannerThumb;
    }

    return findThumbnailUrlDeep(body, new WeakSet(), 0);
}

/**
 * Read the first video thumbnail from a playlist browse response.
 * @param {any} body
 * @returns {string}
 */
function readPlaylistFirstVideoThumbnail(body) {
    if (!body || typeof body !== 'object') {
        return '';
    }

    const nodes = [];
    collectNodesByKey(body, 'playlistVideoRenderer', nodes, new WeakSet(), 0, 8);
    for (const renderer of nodes) {
        const thumb = normalizeThumbnailUrl(pickThumbnailUrl(renderer?.thumbnail?.thumbnails));
        if (thumb) {
            return thumb;
        }
    }

    return '';
}

/**
 * Read the first video id from a playlist payload.
 * @param {any} body
 * @returns {string}
 */
function readPlaylistFirstVideoId(body) {
    if (!body || typeof body !== 'object') {
        return '';
    }

    const rendererKeys = [
        'playlistVideoRenderer',
        'playlistPanelVideoRenderer',
        'videoRenderer',
        'compactVideoRenderer',
        'gridVideoRenderer'
    ];

    for (const key of rendererKeys) {
        const nodes = [];
        collectNodesByKey(body, key, nodes, new WeakSet(), 0, 8);
        for (const renderer of nodes) {
            const videoId = readVideoIdFromRenderer(renderer);
            if (videoId) {
                return videoId;
            }
        }
    }

    return '';
}

/**
 * Extract video id from a renderer.
 * @param {any} renderer
 * @returns {string}
 */
function readVideoIdFromRenderer(renderer) {
    if (!renderer || typeof renderer !== 'object') {
        return '';
    }

    const direct = typeof renderer.videoId === 'string' ? renderer.videoId : '';
    if (VIDEO_ID_PATTERN.test(direct)) {
        return direct;
    }

    const nested = typeof renderer?.navigationEndpoint?.watchEndpoint?.videoId === 'string'
        ? renderer.navigationEndpoint.watchEndpoint.videoId
        : '';
    return VIDEO_ID_PATTERN.test(nested) ? nested : '';
}

/**
 * Build a thumbnail URL from a video id.
 * @param {string} videoId
 * @returns {string}
 */
function buildVideoThumbnailUrl(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return '';
    }
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/**
 * Collect renderer nodes by key.
 * @param {any} node
 * @param {string} key
 * @param {any[]} out
 * @param {WeakSet<object>} visited
 * @param {number} depth
 * @param {number} maxDepth
 */
function collectNodesByKey(node, key, out, visited, depth, maxDepth) {
    if (!node || typeof node !== 'object' || depth > maxDepth) {
        return;
    }
    if (visited.has(node)) {
        return;
    }
    visited.add(node);

    if (Array.isArray(node)) {
        node.forEach((item) => collectNodesByKey(item, key, out, visited, depth + 1, maxDepth));
        return;
    }

    if (node[key]) {
        out.push(node[key]);
    }

    Object.values(node).forEach((value) => {
        if (value && typeof value === 'object') {
            collectNodesByKey(value, key, out, visited, depth + 1, maxDepth);
        }
    });
}

/**
 * Normalize a thumbnail URL.
 * @param {string} url
 * @returns {string}
 */
function normalizeThumbnailUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }
    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    return url;
}

/**
 * @typedef {{
 *   playlistId: string,
 *   appliedVideoIds: Set<string>,
 *   failedEntries: Array<{videoId: string, key: string, action: {action: string, setVideoId?: string, removedVideoId?: string}, error: string}>
 * }}
 */
async function executeRemoveEntriesBatched(playlistId, entries, config, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return {
            appliedVideoIds: new Set(),
            failedEntries: []
        };
    }

    const safeBatchSize = Number.isFinite(options.batchSize)
        ? Math.max(1, Math.floor(options.batchSize))
        : MAX_BATCH_SIZE;
    const retryAttempts = Number.isFinite(options.retryAttempts)
        ? Math.max(1, Math.floor(options.retryAttempts))
        : EDIT_PLAYLIST_RETRY_ATTEMPTS;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    const batches = chunk(entries, safeBatchSize);
    const appliedVideoIds = new Set();
    const failedEntries = [];
    const progress = {
        processed: 0,
        total: entries.length
    };

    const batchResults = await mapWithConcurrency(
        batches,
        Math.min(EDIT_PLAYLIST_BATCH_CONCURRENCY, batches.length),
        async (batch) => {
            let success = false;
            let lastError = null;

            const payload = {
                context: config.context,
                playlistId,
                actions: batch.map((entry) => entry.action)
            };

            for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
                try {
                    await postInnertube(['playlist/edit_playlist', 'browse/edit_playlist'], payload, config);
                    success = true;
                    break;
                } catch (error) {
                    lastError = error;
                    if (attempt < retryAttempts) {
                        await delay(EDIT_PLAYLIST_RETRY_DELAY_MS * attempt);
                    }
                }
            }

            if (success) {
                progress.processed += batch.length;
                if (onProgress) {
                    onProgress({
                        processed: progress.processed,
                        total: progress.total
                    });
                }
                return {
                    success: true,
                    entries: batch,
                    error: ''
                };
            }

            return {
                success: false,
                entries: batch,
                error: lastError instanceof Error ? lastError.message : 'Failed to remove videos batch.'
            };
        }
    );

    batchResults.forEach((result) => {
        if (result?.success) {
            const entriesForBatch = Array.isArray(result.entries) ? result.entries : [];
            entriesForBatch.forEach((entry) => {
                appliedVideoIds.add(entry.videoId);
            });
            return;
        }

        const errorText = result?.error || 'Failed to remove videos batch.';
        const entriesForBatch = Array.isArray(result?.entries) ? result.entries : [];
        entriesForBatch.forEach((entry) => {
            failedEntries.push({
                ...entry,
                error: errorText
            });
        });
    });

    return {
        appliedVideoIds,
        failedEntries
    };
}

/**
 * Recursively find a thumbnail URL inside an object.
 * @param {any} node
 * @param {WeakSet<object>} visited
 * @param {number} depth
 * @returns {string}
 */
function findThumbnailUrlDeep(node, visited, depth) {
    if (!node || typeof node !== 'object' || depth > 6) {
        return '';
    }

    if (visited.has(node)) {
        return '';
    }
    visited.add(node);

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findThumbnailUrlDeep(item, visited, depth + 1);
            if (found) {
                return found;
            }
        }
        return '';
    }

    const directThumb = normalizeThumbnailUrl(pickThumbnailUrl(node?.thumbnails));
    if (directThumb) {
        return directThumb;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
            const found = findThumbnailUrlDeep(value, visited, depth + 1);
            if (found) {
                return found;
            }
        }
    }

    return '';
}

/**
 * Build payload for playlist/get_add_to_playlist endpoint.
 * @param {object} context
 * @param {string} [videoId]
 * @returns {object}
 */
function buildGetAddToPlaylistPayload(context, videoId = '') {
    const payload = {
        context,
        excludeWatchLater: false
    };

    if (VIDEO_ID_PATTERN.test(videoId)) {
        payload.videoId = videoId;
        payload.videoIds = [videoId];
    }

    return payload;
}

/**
 * Read an experiment flag as boolean from ytcfg.
 * @param {string} flagName
 * @returns {boolean}
 */
function readExperimentFlagBoolean(flagName) {
    const groups = [
        getYtCfgValue('EXPERIMENT_FLAGS'),
        getYtCfgValue('EXPERIMENTS_FORCED_FLAGS')
    ];

    for (const flags of groups) {
        if (!flags || typeof flags !== 'object') {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(flags, flagName)) {
            continue;
        }

        const value = flags[flagName];
        if (value === true || value === 1 || value === '1') {
            return true;
        }
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
    }

    return false;
}

/**
 * Resolve popup type used by YouTube for add-to-playlist drawer.
 * @returns {'DIALOG'|'RESPONSIVE_DROPDOWN'}
 */
function resolveAddToPlaylistPopupType() {
    const useDialog = readExperimentFlagBoolean('desktop_add_to_playlist_renderer_dialog_popup');
    return useDialog ? 'DIALOG' : 'RESPONSIVE_DROPDOWN';
}

/**
 * Find first addToPlaylistRenderer in an arbitrary payload.
 * @param {any} node
 * @returns {object|null}
 */
function findAddToPlaylistRenderer(node) {
    const renderers = [];
    collectNodesByKey(node, 'addToPlaylistRenderer', renderers, new WeakSet(), 0, 8);
    for (const renderer of renderers) {
        if (renderer && typeof renderer === 'object') {
            return renderer;
        }
    }
    return null;
}

/**
 * Whether an element is currently visible.
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
function isElementVisible(element) {
    if (!(element instanceof Element) || !element.isConnected || element.hasAttribute('hidden')) {
        return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
    }

    return true;
}

/**
 * Resolve native add-to-playlist drawer root if it is visible.
 * Supports legacy and modernized playlist drawer variants.
 * @returns {Element|null}
 */
function findNativeAddToPlaylistDrawerElement() {
    const selectors = [
        'ytd-popup-container ytd-add-to-playlist-renderer',
        'ytd-popup-container ytd-add-to-playlist-create-renderer',
        'ytd-popup-container ytd-playlist-add-to-option-renderer',
        'ytd-popup-container yt-playlist-add-to-option-view-model'
    ];

    for (const selector of selectors) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
            if (isElementVisible(node)) {
                return node;
            }
        }
    }

    return null;
}

/**
 * Resolve candidate host elements around a target video id.
 * @param {string} videoId
 * @returns {Element[]}
 */
function collectVideoProbeElements(videoId) {
    const elements = [];
    const seen = new Set();

    const addElement = (element) => {
        if (!(element instanceof Element)) {
            return;
        }
        if (seen.has(element)) {
            return;
        }

        seen.add(element);
        elements.push(element);
    };

    document.querySelectorAll(
        `.yt-commander-playlist-host[data-yt-commander-video-id="${videoId}"], `
        + `[data-video-id="${videoId}"], [video-id="${videoId}"]`
    ).forEach((element) => {
        addElement(element);
        addElement(element.closest(
            'ytd-playlist-video-renderer, ytd-video-renderer, ytd-rich-item-renderer, '
            + 'ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytd-watch-flexy'
        ));
    });

    document.querySelectorAll(`a[href*="watch?v=${videoId}"], a[href*="/shorts/${videoId}"]`).forEach((link) => {
        addElement(link);
        addElement(link.closest(
            'ytd-playlist-video-renderer, ytd-video-renderer, ytd-rich-item-renderer, '
            + 'ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytd-watch-flexy'
        ));
    });

    addElement(document.querySelector('ytd-watch-flexy'));
    addElement(document.querySelector('ytd-reel-video-renderer'));
    addElement(document.querySelector('ytd-reel-player-overlay-renderer'));

    return elements;
}

/**
 * Check if element behaves as an actionable save button.
 * @param {Element|null|undefined} element
 * @returns {boolean}
 */
function isActionableSaveButton(element) {
    if (!(element instanceof Element) || !isElementVisible(element)) {
        return false;
    }
    if (element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled')) {
        return false;
    }

    const label = [
        element.getAttribute('aria-label') || '',
        element.getAttribute('title') || '',
        element.getAttribute('data-tooltip') || '',
        element.textContent || ''
    ].join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

    if (!label) {
        return false;
    }

    if (label.includes('save to playlist')) {
        return true;
    }

    return label === 'save' || label.startsWith('save ');
}

/**
 * Dispatch a robust click sequence.
 * @param {Element} element
 */
function triggerElementClick(element) {
    if (!(element instanceof Element)) {
        return;
    }

    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    events.forEach((type) => {
        element.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        }));
    });

    if (typeof element.click === 'function') {
        try {
            element.click();
        } catch (_error) {
            // Ignore and rely on dispatched events.
        }
    }
}

/**
 * Try opening save drawer by clicking YouTube's native Save control.
 * @param {string} videoId
 * @returns {Promise<boolean>}
 */
async function openNativePlaylistDrawerViaNativeButton(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return false;
    }

    const probeElements = collectVideoProbeElements(videoId);
    const buttonSelectors = [
        'button[aria-label*="Save to playlist"]',
        'button[aria-label*="Save"]',
        '[role="button"][aria-label*="Save to playlist"]',
        '[role="button"][aria-label*="Save"]',
        'yt-button-view-model button[aria-label*="Save"]',
        'ytd-menu-renderer button[aria-label*="Save"]',
        'button[title*="Save"]'
    ];

    for (const probe of probeElements) {
        for (const selector of buttonSelectors) {
            const candidates = probe.querySelectorAll(selector);
            for (const candidate of candidates) {
                if (!isActionableSaveButton(candidate)) {
                    continue;
                }

                triggerElementClick(candidate);
                if (await waitForNativeAddToPlaylistDrawerOpen(1300)) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Wait for native add-to-playlist drawer visibility.
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
async function waitForNativeAddToPlaylistDrawerOpen(timeoutMs = 1100) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        if (isNativeAddToPlaylistDrawerOpen()) {
            return true;
        }
        await delay(90);
    }

    return isNativeAddToPlaylistDrawerOpen();
}

/**
 * Ensure command metadata can run through yt-service-request.
 * @param {object} command
 * @returns {object}
 */
function withAddToPlaylistCommandMetadata(command) {
    if (!command || typeof command !== 'object') {
        return {};
    }

    const commandMetadata = command.commandMetadata && typeof command.commandMetadata === 'object'
        ? command.commandMetadata
        : {};
    const webCommandMetadata = commandMetadata.webCommandMetadata
        && typeof commandMetadata.webCommandMetadata === 'object'
        ? commandMetadata.webCommandMetadata
        : {};

    return {
        ...command,
        commandMetadata: {
            ...commandMetadata,
            webCommandMetadata: {
                ...webCommandMetadata,
                sendPost: true,
                apiUrl: typeof webCommandMetadata.apiUrl === 'string' && webCommandMetadata.apiUrl
                    ? webCommandMetadata.apiUrl
                    : '/youtubei/v1/playlist/get_add_to_playlist'
            }
        }
    };
}

/**
 * Normalize any add-to-playlist command shape.
 * @param {any} command
 * @param {string} videoId
 * @returns {object|null}
 */
function normalizeAddToPlaylistServiceCommand(command, videoId) {
    if (!command || typeof command !== 'object' || !VIDEO_ID_PATTERN.test(videoId)) {
        return null;
    }

    const rawEndpoint = command.addToPlaylistServiceEndpoint && typeof command.addToPlaylistServiceEndpoint === 'object'
        ? command.addToPlaylistServiceEndpoint
        : command.addToPlaylistEndpoint && typeof command.addToPlaylistEndpoint === 'object'
            ? command.addToPlaylistEndpoint
            : null;
    if (!rawEndpoint) {
        return null;
    }

    const endpointVideoId = typeof rawEndpoint.videoId === 'string' ? rawEndpoint.videoId.trim() : '';
    const endpointVideoIds = Array.isArray(rawEndpoint.videoIds)
        ? rawEndpoint.videoIds.filter((item) => typeof item === 'string' && VIDEO_ID_PATTERN.test(item))
        : [];
    const commandVideoId = VIDEO_ID_PATTERN.test(endpointVideoId)
        ? endpointVideoId
        : endpointVideoIds[0] || '';

    if (commandVideoId && commandVideoId !== videoId) {
        return null;
    }

    const normalizedVideoId = commandVideoId || videoId;
    const normalizedVideoIds = endpointVideoIds.length > 0 ? endpointVideoIds : [normalizedVideoId];
    const normalizedEndpoint = {
        ...rawEndpoint,
        videoId: normalizedVideoId,
        videoIds: normalizedVideoIds
    };
    if (typeof normalizedEndpoint.excludeWatchLater !== 'boolean') {
        normalizedEndpoint.excludeWatchLater = false;
    }

    return withAddToPlaylistCommandMetadata({
        ...command,
        addToPlaylistServiceEndpoint: normalizedEndpoint
    });
}

/**
 * Build a fallback add-to-playlist service endpoint command.
 * @param {string} videoId
 * @returns {object|null}
 */
function buildAddToPlaylistServiceCommand(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return null;
    }

    return normalizeAddToPlaylistServiceCommand({
        addToPlaylistServiceEndpoint: {
            videoId,
            videoIds: [videoId],
            excludeWatchLater: false
        }
    }, videoId);
}

/**
 * Collect likely data-bearing values from a Polymer/custom element.
 * @param {Element} element
 * @returns {object[]}
 */
function collectCommandProbeValues(element) {
    if (!(element instanceof Element)) {
        return [];
    }

    const values = [];
    const seen = new WeakSet();
    const addValue = (value) => {
        if (!value || typeof value !== 'object' || seen.has(value)) {
            return;
        }
        seen.add(value);
        values.push(value);
    };
    const readValue = (reader) => {
        try {
            addValue(reader());
        } catch (_error) {
            // Ignore private getter failures.
        }
    };

    readValue(() => element.data);
    readValue(() => element.__data);
    readValue(() => element.__dataHost);
    readValue(() => element.__dataHost?.data);
    readValue(() => element.__dataHost?.__data);
    readValue(() => element.polymerController);
    readValue(() => element.polymerController?.data);
    readValue(() => element.polymerController?.__data);
    readValue(() => element.inst);
    readValue(() => element.inst?.data);
    readValue(() => element.inst?.__data);
    readValue(() => element.__ytRenderer);

    return values;
}

/**
 * Find first add-to-playlist service command within arbitrary data.
 * @param {any} node
 * @param {string} videoId
 * @param {WeakSet<object>} visited
 * @param {number} depth
 * @param {number} maxDepth
 * @returns {object|null}
 */
function findAddToPlaylistServiceCommandDeep(node, videoId, visited, depth = 0, maxDepth = 8) {
    if (!node || typeof node !== 'object' || depth > maxDepth) {
        return null;
    }
    if (visited.has(node)) {
        return null;
    }
    visited.add(node);

    const direct = normalizeAddToPlaylistServiceCommand(node, videoId);
    if (direct) {
        return direct;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findAddToPlaylistServiceCommandDeep(item, videoId, visited, depth + 1, maxDepth);
            if (found) {
                return found;
            }
        }
        return null;
    }

    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') {
            continue;
        }
        const found = findAddToPlaylistServiceCommandDeep(value, videoId, visited, depth + 1, maxDepth);
        if (found) {
            return found;
        }
    }

    return null;
}

/**
 * Resolve add-to-playlist service command from live page data for a video.
 * @param {string} videoId
 * @returns {object|null}
 */
function findAddToPlaylistServiceCommandForVideo(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return null;
    }

    const probeElements = collectVideoProbeElements(videoId);

    const descendantSelector = [
        'ytd-menu-service-item-renderer',
        'ytd-toggle-menu-service-item-renderer',
        'ytd-menu-renderer',
        'ytd-menu-popup-renderer'
    ].join(', ');

    const visitedObjects = new WeakSet();
    for (const element of probeElements) {
        const directValues = collectCommandProbeValues(element);
        for (const value of directValues) {
            const found = findAddToPlaylistServiceCommandDeep(value, videoId, visitedObjects, 0, 8);
            if (found) {
                return found;
            }
        }

        const descendants = element.querySelectorAll(descendantSelector);
        const maxDescendants = 80;
        const count = Math.min(descendants.length, maxDescendants);
        for (let index = 0; index < count; index += 1) {
            const descendant = descendants[index];
            const descendantValues = collectCommandProbeValues(descendant);
            for (const value of descendantValues) {
                const found = findAddToPlaylistServiceCommandDeep(value, videoId, visitedObjects, 0, 8);
                if (found) {
                    return found;
                }
            }
        }
    }

    return null;
}

/**
 * Open native playlist drawer through YouTube command handler.
 * @param {string} videoId
 * @param {Element} anchor
 * @returns {Promise<boolean>}
 */
async function openNativePlaylistDrawerViaServiceCommand(videoId, anchor) {
    const commands = [];
    const resolvedCommand = findAddToPlaylistServiceCommandForVideo(videoId);
    if (resolvedCommand) {
        commands.push(resolvedCommand);
    }

    const generatedCommand = buildAddToPlaylistServiceCommand(videoId);
    if (generatedCommand) {
        commands.push(generatedCommand);
    }

    for (const command of commands) {
        dispatchYtAction(anchor, 'yt-service-request', [anchor, command]);
        if (await waitForNativeAddToPlaylistDrawerOpen(1500)) {
            return true;
        }
    }

    return false;
}

/**
 * Resolve an anchor element for opening the native playlist drawer.
 * @param {string} videoId
 * @returns {Element}
 */
function resolveNativeDrawerAnchor(videoId) {
    const host = document.querySelector(
        `.yt-commander-playlist-host[data-yt-commander-video-id="${videoId}"]`
    );
    if (host instanceof Element) {
        return host;
    }

    const actionSaveButton = document.querySelector(
        '.yt-commander-playlist-action-button[aria-label="Save to playlist"]'
    );
    if (actionSaveButton instanceof Element) {
        return actionSaveButton;
    }

    const app = document.querySelector('ytd-app');
    if (app instanceof Element) {
        return app;
    }

    return document.body;
}

/**
 * Dispatch a YouTube action through the page action bus.
 * @param {Element} node
 * @param {string} actionName
 * @param {any[]} args
 */
function dispatchYtAction(node, actionName, args) {
    const target = node instanceof Element ? node : document.body;
    const detail = {
        actionName,
        optionalAction: false,
        args: Array.isArray(args) ? args : [],
        returnValue: []
    };

    const event = new CustomEvent('yt-action', {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail
    });
    target.dispatchEvent(event);
}

/**
 * Show YouTube native bottom toast from main world.
 * @param {{message?: string, durationMs?: number}} payload
 * @returns {{shown: boolean}}
 */
function showNativeToast(payload) {
    const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
    if (!message) {
        return { shown: false };
    }

    const durationMs = Number.isFinite(payload?.durationMs)
        ? Math.max(1200, Number(payload.durationMs))
        : 4200;

    const candidates = document.querySelectorAll(
        'ytd-app tp-yt-paper-toast#toast, ytd-app tp-yt-paper-toast, tp-yt-paper-toast#toast, tp-yt-paper-toast'
    );
    for (const candidate of candidates) {
        if (!(candidate instanceof Element) || typeof candidate.show !== 'function') {
            continue;
        }
        try {
            candidate.text = message;
            candidate.duration = durationMs;
            candidate.show();
            return { shown: true };
        } catch (_error) {
            // Try next candidate.
        }
    }

    return { shown: false };
}

/**
 * Ensure playlist/edit command metadata is available for yt-service-request.
 * @param {object} command
 * @returns {object}
 */
function withPlaylistEditCommandMetadata(command) {
    if (!command || typeof command !== 'object') {
        return {};
    }

    const commandMetadata = command.commandMetadata && typeof command.commandMetadata === 'object'
        ? command.commandMetadata
        : {};
    const webCommandMetadata = commandMetadata.webCommandMetadata
        && typeof commandMetadata.webCommandMetadata === 'object'
        ? commandMetadata.webCommandMetadata
        : {};

    return {
        ...command,
        commandMetadata: {
            ...commandMetadata,
            webCommandMetadata: {
                ...webCommandMetadata,
                sendPost: true,
                apiUrl: typeof webCommandMetadata.apiUrl === 'string' && webCommandMetadata.apiUrl
                    ? webCommandMetadata.apiUrl
                    : '/youtubei/v1/playlist/edit_playlist'
            }
        }
    };
}

/**
 * Normalize one remove command candidate to a service-request command.
 * @param {any} command
 * @param {string} playlistId
 * @param {string} videoId
 * @returns {object|null}
 */
function normalizePlaylistRemoveServiceCommand(command, playlistId, videoId) {
    if (!command || typeof command !== 'object') {
        return null;
    }

    const candidateWrappers = [
        {
            kind: 'remove',
            root: command.removeFromPlaylistServiceEndpoint,
            wrap: (normalizedEndpoint) => ({
                ...command,
                removeFromPlaylistServiceEndpoint: {
                    ...(command.removeFromPlaylistServiceEndpoint || {}),
                    playlistEditEndpoint: normalizedEndpoint
                }
            })
        },
        {
            kind: 'playlistEdit',
            root: command.playlistEditEndpoint,
            wrap: (normalizedEndpoint) => ({
                ...command,
                playlistEditEndpoint: normalizedEndpoint
            })
        },
        {
            kind: 'servicePlaylistEdit',
            root: command.serviceEndpoint?.playlistEditEndpoint,
            wrap: (normalizedEndpoint) => ({
                ...command,
                serviceEndpoint: {
                    ...(command.serviceEndpoint || {}),
                    playlistEditEndpoint: normalizedEndpoint
                }
            })
        },
        {
            kind: 'serviceRemove',
            root: command.serviceEndpoint?.removeFromPlaylistServiceEndpoint,
            wrap: (normalizedEndpoint) => ({
                ...command,
                serviceEndpoint: {
                    ...(command.serviceEndpoint || {}),
                    removeFromPlaylistServiceEndpoint: {
                        ...(command.serviceEndpoint?.removeFromPlaylistServiceEndpoint || {}),
                        playlistEditEndpoint: normalizedEndpoint
                    }
                }
            })
        },
        {
            kind: 'toggledPlaylistEdit',
            root: command.toggledServiceEndpoint?.playlistEditEndpoint,
            wrap: (normalizedEndpoint) => ({
                ...command,
                toggledServiceEndpoint: {
                    ...(command.toggledServiceEndpoint || {}),
                    playlistEditEndpoint: normalizedEndpoint
                }
            })
        },
        {
            kind: 'toggledRemove',
            root: command.toggledServiceEndpoint?.removeFromPlaylistServiceEndpoint,
            wrap: (normalizedEndpoint) => ({
                ...command,
                toggledServiceEndpoint: {
                    ...(command.toggledServiceEndpoint || {}),
                    removeFromPlaylistServiceEndpoint: {
                        ...(command.toggledServiceEndpoint?.removeFromPlaylistServiceEndpoint || {}),
                        playlistEditEndpoint: normalizedEndpoint
                    }
                }
            })
        }
    ];

    for (const wrapper of candidateWrappers) {
        if (!wrapper.root || typeof wrapper.root !== 'object') {
            continue;
        }

        const endpoint = wrapper.root.playlistEditEndpoint && typeof wrapper.root.playlistEditEndpoint === 'object'
            ? wrapper.root.playlistEditEndpoint
            : wrapper.root;
        if (!endpoint || typeof endpoint !== 'object') {
            continue;
        }

        const endpointPlaylistId = typeof endpoint.playlistId === 'string' ? endpoint.playlistId.trim() : '';
        if (endpointPlaylistId && endpointPlaylistId !== playlistId) {
            continue;
        }

        let normalizedAction = null;
        if (Array.isArray(endpoint.actions)) {
            for (const action of endpoint.actions) {
                normalizedAction = normalizeRemoveAction(action, videoId);
                if (normalizedAction) {
                    break;
                }
            }
        }

        if (!normalizedAction) {
            normalizedAction = normalizeRemoveAction(endpoint, videoId);
        }

        if (!normalizedAction) {
            continue;
        }

        const normalizedEndpoint = {
            ...endpoint,
            playlistId: endpointPlaylistId || playlistId,
            actions: [normalizedAction]
        };

        return withPlaylistEditCommandMetadata(wrapper.wrap(normalizedEndpoint));
    }

    return null;
}

/**
 * Find first playlist-remove service command in arbitrary object graph.
 * @param {any} node
 * @param {string} playlistId
 * @param {string} videoId
 * @param {WeakSet<object>} visited
 * @param {number} depth
 * @param {number} maxDepth
 * @returns {object|null}
 */
function findNativeRemoveServiceCommandDeep(node, playlistId, videoId, visited, depth = 0, maxDepth = 8) {
    if (!node || typeof node !== 'object' || depth > maxDepth) {
        return null;
    }
    if (visited.has(node)) {
        return null;
    }
    visited.add(node);

    const direct = normalizePlaylistRemoveServiceCommand(node, playlistId, videoId);
    if (direct) {
        return direct;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNativeRemoveServiceCommandDeep(
                item,
                playlistId,
                videoId,
                visited,
                depth + 1,
                maxDepth
            );
            if (found) {
                return found;
            }
        }
        return null;
    }

    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') {
            continue;
        }

        const found = findNativeRemoveServiceCommandDeep(
            value,
            playlistId,
            videoId,
            visited,
            depth + 1,
            maxDepth
        );
        if (found) {
            return found;
        }
    }

    return null;
}

/**
 * Resolve native remove command for one playlist video.
 * @param {string} playlistId
 * @param {string} videoId
 * @returns {object|null}
 */
function findNativeRemoveServiceCommandForVideo(playlistId, videoId) {
    if (!PLAYLIST_ID_PATTERN.test(playlistId) || !VIDEO_ID_PATTERN.test(videoId)) {
        return null;
    }

    const probeElements = collectVideoProbeElements(videoId);
    const descendantSelector = [
        'ytd-menu-service-item-renderer',
        'ytd-toggle-menu-service-item-renderer',
        'ytd-menu-renderer',
        'ytd-menu-popup-renderer',
        'ytd-playlist-video-renderer'
    ].join(', ');

    const visited = new WeakSet();
    for (const element of probeElements) {
        const values = collectCommandProbeValues(element);
        for (const value of values) {
            const found = findNativeRemoveServiceCommandDeep(value, playlistId, videoId, visited, 0, 9);
            if (found) {
                return found;
            }
        }

        const descendants = element.querySelectorAll(descendantSelector);
        const maxDescendants = Math.min(descendants.length, 90);
        for (let index = 0; index < maxDescendants; index += 1) {
            const descValues = collectCommandProbeValues(descendants[index]);
            for (const value of descValues) {
                const found = findNativeRemoveServiceCommandDeep(value, playlistId, videoId, visited, 0, 9);
                if (found) {
                    return found;
                }
            }
        }
    }

    return null;
}

/**
 * Wait for one video renderer to disappear from current UI.
 * @param {string} videoId
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
async function waitForVideoRendererRemoval(videoId, timeoutMs = 1800) {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return false;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
        const visibleHosts = document.querySelectorAll(
            `.yt-commander-playlist-host[data-yt-commander-video-id="${videoId}"], `
            + `[data-video-id="${videoId}"], [video-id="${videoId}"]`
        );
        if (visibleHosts.length === 0) {
            return true;
        }

        await delay(100);
    }

    return false;
}

/**
 * Try native remove commands first so YouTube refreshes playlist UI in-place.
 * @param {string} playlistId
 * @param {string[]} videoIds
 * @param {{onProgress?: (progress: {processed: number, total: number}) => void}} [options]
 * @returns {Promise<{removedVideoIds: string[], unresolvedVideoIds: string[]}>}
 */
async function removeFromPlaylistViaNativeCommands(playlistId, videoIds, options = {}) {
    const removedVideoIds = [];
    const unresolvedVideoIds = [];
    const total = videoIds.length;

    for (let index = 0; index < videoIds.length; index += 1) {
        const videoId = videoIds[index];
        const command = findNativeRemoveServiceCommandForVideo(playlistId, videoId);
        if (!command) {
            unresolvedVideoIds.push(videoId);
            if (typeof options?.onProgress === 'function') {
                options.onProgress({
                    processed: index + 1,
                    total
                });
            }
            continue;
        }

        const anchor = resolveNativeDrawerAnchor(videoId);
        dispatchYtAction(anchor, 'yt-service-request', [anchor, command]);
        const removed = await waitForVideoRendererRemoval(videoId, 1700);
        if (removed) {
            removedVideoIds.push(videoId);
        } else {
            unresolvedVideoIds.push(videoId);
        }

        if (typeof options?.onProgress === 'function') {
            options.onProgress({
                processed: index + 1,
                total
            });
        }
    }

    return {
        removedVideoIds,
        unresolvedVideoIds
    };
}

/**
 * Determine whether native add-to-playlist drawer is currently open.
 * @returns {boolean}
 */
function isNativeAddToPlaylistDrawerOpen() {
    return Boolean(findNativeAddToPlaylistDrawerElement());
}

/**
 * Open YouTube native add-to-playlist drawer for a video.
 * @param {{videoId?: string}} payload
 * @returns {Promise<{opened: boolean, popupType: string}>}
 */
async function openNativePlaylistDrawer(payload) {
    const videoId = sanitizeVideoIds([payload?.videoId || ''])[0] || '';
    if (!videoId) {
        throw new Error('No valid video selected for native playlist drawer.');
    }

    const anchor = resolveNativeDrawerAnchor(videoId);
    const openedViaNativeButton = await openNativePlaylistDrawerViaNativeButton(videoId);
    if (openedViaNativeButton) {
        return {
            opened: true,
            popupType: 'NATIVE_BUTTON'
        };
    }

    const openedViaServiceCommand = await openNativePlaylistDrawerViaServiceCommand(videoId, anchor);
    if (openedViaServiceCommand) {
        return {
            opened: true,
            popupType: 'SERVICE_REQUEST'
        };
    }

    return {
        opened: false,
        popupType: 'SERVICE_REQUEST'
    };
}

/**
 * Normalize remove action shape for playlist/edit requests.
 * @param {any} rawAction
 * @param {string} videoIdFallback
 * @returns {{action: 'ACTION_REMOVE_VIDEO'|'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', setVideoId?: string, removedVideoId?: string}|null}
 */
function normalizeRemoveAction(rawAction, videoIdFallback) {
    if (!rawAction || typeof rawAction !== 'object') {
        return null;
    }

    const actionType = typeof rawAction.action === 'string'
        ? rawAction.action
        : 'ACTION_REMOVE_VIDEO';
    const supportedActionTypes = new Set([
        'ACTION_REMOVE_VIDEO',
        'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',
        'ACTION_REMOVE_VIDEO_BY_SET_VIDEO_ID'
    ]);

    if (!supportedActionTypes.has(actionType)) {
        return null;
    }

    const setVideoId = typeof rawAction.setVideoId === 'string' ? rawAction.setVideoId.trim() : '';
    if (setVideoId) {
        return {
            action: 'ACTION_REMOVE_VIDEO',
            setVideoId
        };
    }

    const removedVideoId = typeof rawAction.removedVideoId === 'string'
        ? rawAction.removedVideoId.trim()
        : '';
    if (VIDEO_ID_PATTERN.test(removedVideoId)) {
        return {
            action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',
            removedVideoId
        };
    }

    if (VIDEO_ID_PATTERN.test(videoIdFallback)) {
        return {
            action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',
            removedVideoId: videoIdFallback
        };
    }

    return null;
}

/**
 * Expand one remove action into retry candidates for endpoint compatibility.
 * @param {{action: string, setVideoId?: string, removedVideoId?: string}|null} action
 * @returns {Array<{action: string, setVideoId?: string, removedVideoId?: string}>}
 */
function buildRemoveActionCandidates(action) {
    if (!action || typeof action !== 'object') {
        return [];
    }

    const candidates = [];
    const seen = new Set();

    const pushCandidate = (candidate) => {
        if (!candidate || typeof candidate !== 'object') {
            return;
        }

        const key = [
            candidate.action || '',
            candidate.setVideoId || '',
            candidate.removedVideoId || ''
        ].join('|');
        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        candidates.push(candidate);
    };

    const setVideoId = typeof action.setVideoId === 'string' ? action.setVideoId.trim() : '';
    const removedVideoId = typeof action.removedVideoId === 'string' ? action.removedVideoId.trim() : '';

    if (setVideoId) {
        pushCandidate({
            action: 'ACTION_REMOVE_VIDEO',
            setVideoId
        });
    }

    if (VIDEO_ID_PATTERN.test(removedVideoId)) {
        pushCandidate({
            action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',
            removedVideoId
        });
        pushCandidate({
            action: 'ACTION_REMOVE_VIDEO',
            removedVideoId
        });
    }

    return candidates;
}

/**
 * Build stable key for one remove action.
 * @param {{action?: string, setVideoId?: string, removedVideoId?: string}} action
 * @param {string} [videoIdFallback]
 * @returns {string}
 */
function getRemoveActionKey(action, videoIdFallback = '') {
    if (!action || typeof action !== 'object') {
        return VIDEO_ID_PATTERN.test(videoIdFallback) ? `video:${videoIdFallback}` : 'remove:unknown';
    }

    const setVideoId = typeof action.setVideoId === 'string' ? action.setVideoId.trim() : '';
    if (setVideoId) {
        return `set:${setVideoId}`;
    }

    const removedVideoId = typeof action.removedVideoId === 'string' ? action.removedVideoId.trim() : '';
    if (VIDEO_ID_PATTERN.test(removedVideoId)) {
        return `video:${removedVideoId}`;
    }

    if (VIDEO_ID_PATTERN.test(videoIdFallback)) {
        return `video:${videoIdFallback}`;
    }

    return `remove:${String(action.action || 'unknown')}`;
}

/**
 * Build direct remove actions by video id.
 * @param {string[]} videoIds
 * @param {'ACTION_REMOVE_VIDEO_BY_VIDEO_ID'|'ACTION_REMOVE_VIDEO'} actionType
 * @returns {Array<{videoId: string, key: string, action: {action: string, removedVideoId: string}}>}
 */
function buildDirectRemoveEntries(videoIds, actionType = 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID') {
    const entries = [];
    const seen = new Set();

    videoIds.forEach((videoId) => {
        if (!VIDEO_ID_PATTERN.test(videoId)) {
            return;
        }

        const action = actionType === 'ACTION_REMOVE_VIDEO'
            ? {
                action: 'ACTION_REMOVE_VIDEO',
                removedVideoId: videoId
            }
            : {
                action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',
                removedVideoId: videoId
            };

        const key = getRemoveActionKey(action, videoId);
        const dedupeKey = `${key}|${action.action}`;
        if (seen.has(dedupeKey)) {
            return;
        }

        seen.add(dedupeKey);
        entries.push({
            videoId,
            key,
            action
        });
    });

    return entries;
}

/**
 * Resolve remove action from one playlist option renderer.
 * @param {any} renderer
 * @param {string} playlistId
 * @param {string} videoId
 * @returns {{action: 'ACTION_REMOVE_VIDEO', setVideoId?: string, removedVideoId?: string}|null}
 */
function readRemoveActionFromOptionRenderer(renderer, playlistId, videoId) {
    if (!renderer || typeof renderer !== 'object') {
        return null;
    }

    const rendererPlaylistId = renderer.playlistId
        || renderer.addToPlaylistServiceEndpoint?.playlistEditEndpoint?.playlistId
        || renderer.navigationEndpoint?.watchEndpoint?.playlistId
        || '';
    if (rendererPlaylistId !== playlistId) {
        return null;
    }

    const endpoints = [
        renderer.toggledServiceEndpoint?.playlistEditEndpoint,
        renderer.toggledServiceEndpoint?.addToPlaylistServiceEndpoint?.playlistEditEndpoint,
        renderer.addToPlaylistServiceEndpoint?.playlistEditEndpoint,
        renderer.serviceEndpoint?.playlistEditEndpoint
    ];

    for (const endpoint of endpoints) {
        if (!endpoint || typeof endpoint !== 'object') {
            continue;
        }

        const endpointPlaylistId = typeof endpoint.playlistId === 'string' ? endpoint.playlistId.trim() : '';
        if (endpointPlaylistId && endpointPlaylistId !== playlistId) {
            continue;
        }

        if (Array.isArray(endpoint.actions)) {
            for (const action of endpoint.actions) {
                const normalized = normalizeRemoveAction(action, videoId);
                if (normalized) {
                    return normalized;
                }
            }
        }

        const directAction = normalizeRemoveAction(endpoint, videoId);
        if (directAction) {
            return directAction;
        }
    }

    const selectedInTarget = renderer.isSelected === true || renderer.containsSelectedVideos === true;
    if (selectedInTarget) {
        return normalizeRemoveAction({ action: 'ACTION_REMOVE_VIDEO' }, videoId);
    }

    return null;
}

/**
 * Recursively find remove action for target playlist from get_add_to_playlist payload.
 * @param {any} node
 * @param {string} playlistId
 * @param {string} videoId
 * @param {WeakSet<object>} visited
 * @returns {{action: 'ACTION_REMOVE_VIDEO', setVideoId?: string, removedVideoId?: string}|null}
 */
function findRemoveActionInNode(node, playlistId, videoId, visited = new WeakSet()) {
    if (!node || typeof node !== 'object') {
        return null;
    }

    if (visited.has(node)) {
        return null;
    }
    visited.add(node);

    const renderer = node.playlistAddToOptionRenderer;
    if (renderer && typeof renderer === 'object') {
        const action = readRemoveActionFromOptionRenderer(renderer, playlistId, videoId);
        if (action) {
            return action;
        }
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findRemoveActionInNode(item, playlistId, videoId, visited);
            if (found) {
                return found;
            }
        }
        return null;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
            const found = findRemoveActionInNode(value, playlistId, videoId, visited);
            if (found) {
                return found;
            }
        }
    }

    return null;
}

/**
 * Load playlists for save popup.
 * @param {{videoIds?: string[]}} payload
 * @returns {Promise<{playlists: Array<{id: string, title: string, privacy: string, isSelected: boolean, thumbnailUrl?: string}>}>}
 */
async function getPlaylists(payload) {
    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    const config = await getInnertubeConfig();
    const requestPayload = buildGetAddToPlaylistPayload(config.context, videoIds[0] || '');

    const response = await postInnertube('playlist/get_add_to_playlist', requestPayload, config);
    const map = new Map();
    collectPlaylistOptions(response.body, map, new WeakSet());

    const playlists = Array.from(map.values());
    playlists.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

    return { playlists };
}

/**
 * Load playlist thumbnails via browse API.
 * @param {{playlistIds?: string[]}} payload
 * @returns {Promise<{thumbnailsById: Record<string, string>}>}
 */
async function getPlaylistThumbnails(payload) {
    const playlistIds = sanitizePlaylistIds(payload?.playlistIds || []);
    if (playlistIds.length === 0) {
        return { thumbnailsById: {} };
    }

    const config = await getInnertubeConfig();
    const thumbnailsById = {};
    const queue = [...playlistIds];

    const workers = new Array(Math.min(PLAYLIST_THUMBNAIL_CONCURRENCY, queue.length))
        .fill(0)
        .map(async () => {
            while (queue.length > 0) {
                const playlistId = queue.shift();
                if (!playlistId) {
                    continue;
                }

                const browseId = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
                try {
                    const response = await postInnertube('browse', { context: config.context, browseId }, config);
                    let thumb = readPlaylistThumbnailFromBrowse(response?.body);
                    if (!thumb) {
                        thumb = readPlaylistFirstVideoThumbnail(response?.body);
                    }
                    if (!thumb) {
                        const videoId = readPlaylistFirstVideoId(response?.body);
                        thumb = buildVideoThumbnailUrl(videoId);
                    }
                    if (!thumb) {
                        const nextResponse = await postInnertube('next', { context: config.context, playlistId }, config);
                        const nextVideoId = readPlaylistFirstVideoId(nextResponse?.body);
                        thumb = buildVideoThumbnailUrl(nextVideoId);
                    }
                    if (thumb) {
                        thumbnailsById[playlistId] = thumb;
                    }
                } catch (error) {
                    logger.debug('Failed to fetch playlist thumbnail', { playlistId, error });
                }
            }
        });

    await Promise.all(workers);

    return { thumbnailsById };
}

/**
 * Add videos to one playlist.
 * @param {string} playlistId
 * @param {string[]} videoIds
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 * @param {{throwOnFailure?: boolean, retryAttempts?: number, onProgress?: (processed: number, total: number) => void}} [options]
 * @returns {Promise<{requestedCount: number, addedCount: number, failures: Array<{batchIndex: number, videoIds: string[], error: string}>}>}
 */
async function addVideosToSinglePlaylist(playlistId, videoIds, config, options = {}) {
    const retryAttempts = Number.isFinite(options.retryAttempts)
        ? Math.max(1, Math.floor(options.retryAttempts))
        : EDIT_PLAYLIST_RETRY_ATTEMPTS;
    const singleVideoRetryAttempts = Number.isFinite(options.singleVideoRetryAttempts)
        ? Math.max(1, Math.floor(options.singleVideoRetryAttempts))
        : Math.max(retryAttempts + 2, EDIT_PLAYLIST_SINGLE_VIDEO_RETRY_ATTEMPTS);

    const initialBatches = chunk(videoIds, MAX_BATCH_SIZE);
    const failures = [];
    let addedCount = 0;
    const progress = {
        processed: 0,
        total: videoIds.length
    };
    const pendingBatches = initialBatches.map((batch, batchIndex) => ({
        batchIndex,
        videoIds: batch
    }));
    let syntheticBatchIndex = pendingBatches.length;

    while (pendingBatches.length > 0) {
        const batchEntry = pendingBatches.shift();
        const batch = Array.isArray(batchEntry?.videoIds) ? batchEntry.videoIds : [];
        const batchIndex = Number.isFinite(batchEntry?.batchIndex) ? batchEntry.batchIndex : 0;
        if (batch.length === 0) {
            continue;
        }

        const maxAttempts = batch.length === 1 ? singleVideoRetryAttempts : retryAttempts;
        let success = false;
        let lastError = null;

        const payload = {
            context: config.context,
            playlistId,
            actions: batch.map((videoId) => ({
                action: 'ACTION_ADD_VIDEO',
                addedVideoId: videoId
            }))
        };

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                await postInnertube(['playlist/edit_playlist', 'browse/edit_playlist'], payload, config);
                success = true;
                break;
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts) {
                    await delay(EDIT_PLAYLIST_RETRY_DELAY_MS * attempt);
                }
            }
        }

        if (success) {
            progress.processed += batch.length;
            addedCount += batch.length;
            if (typeof options.onProgress === 'function') {
                options.onProgress(progress.processed, progress.total);
            }
            continue;
        }

        if (batch.length > 1) {
            const splitAt = Math.ceil(batch.length / 2);
            const firstHalf = batch.slice(0, splitAt);
            const secondHalf = batch.slice(splitAt);

            if (secondHalf.length > 0) {
                pendingBatches.unshift({
                    batchIndex: syntheticBatchIndex++,
                    videoIds: secondHalf
                });
            }
            if (firstHalf.length > 0) {
                pendingBatches.unshift({
                    batchIndex: syntheticBatchIndex++,
                    videoIds: firstHalf
                });
            }
            continue;
        }

        failures.push({
            batchIndex,
            videoIds: batch,
            error: lastError instanceof Error ? lastError.message : 'Failed to add videos batch.'
        });
    }

    if (failures.length > 0 && options.throwOnFailure !== false) {
        throw new Error(failures[0]?.error || 'Failed to add videos to playlist.');
    }

    return {
        requestedCount: videoIds.length,
        addedCount,
        failures
    };
}

/**
 * Add videos to selected playlists.
 * @param {{videoIds?: string[], playlistIds?: string[], playlistTitles?: string[]}} payload
 * @param {{onProgress?: (progress: {processed: number, total: number, label: string}) => void}} [options]
 * @returns {Promise<{
 *   requestedVideoCount: number,
 *   requestedPlaylistCount: number,
 *   successCount: number,
 *   failures: Array<{playlistId: string, error: string}>
 * }>}
 */
async function addToPlaylists(payload, options = {}) {
    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    if (videoIds.length === 0) {
        throw new Error('No valid selected videos found.');
    }

    const playlistIds = sanitizePlaylistIds(payload?.playlistIds || []);
    if (playlistIds.length === 0) {
        throw new Error('No valid playlists selected.');
    }

    const playlistTitles = Array.isArray(payload?.playlistTitles) ? payload.playlistTitles : [];
    const config = await getInnertubeConfig();
    const failures = [];
    let successCount = 0;

    for (let i = 0; i < playlistIds.length; i += 1) {
        const playlistId = playlistIds[i];
        const playlistTitle = playlistTitles[i] || playlistId;
        try {
            await addVideosToSinglePlaylist(playlistId, videoIds, config, {
                onProgress: (processed, total) => {
                    if (typeof options?.onProgress === 'function') {
                        options.onProgress({
                            processed,
                            total,
                            label: playlistTitle
                        });
                    }
                }
            });
            successCount += 1;
        } catch (error) {
            failures.push({
                playlistId,
                error: error instanceof Error ? error.message : 'Failed'
            });
        }
    }

    if (successCount === 0 && failures.length > 0) {
        throw new Error(failures[0].error || 'Failed to save videos to playlists.');
    }

    return {
        requestedVideoCount: videoIds.length,
        requestedPlaylistCount: playlistIds.length,
        successCount,
        failures
    };
}

/**
 * Resolve one remove action for a video in a specific playlist.
 * @param {string} playlistId
 * @param {string} videoId
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 * @returns {Promise<{action: 'ACTION_REMOVE_VIDEO'|'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', setVideoId?: string, removedVideoId?: string}|null>}
 */
async function resolveRemoveActionForVideo(playlistId, videoId, config) {
    const payload = buildGetAddToPlaylistPayload(config.context, videoId);
    const response = await postInnertube('playlist/get_add_to_playlist', payload, config);
    return findRemoveActionInNode(response.body, playlistId, videoId, new WeakSet());
}

/**
 * Resolve remove actions via get_add_to_playlist fallback and apply them in batches.
 * Used only when direct batched remove-by-video-id actions fail.
 * @param {string} playlistId
 * @param {string[]} videoIds
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 * @returns {Promise<{appliedVideoIds: Set<string>, failures: Array<{videoId: string, error: string}>}>}
 */
async function removeWithResolvedActions(playlistId, videoIds, config) {
    const lookupResults = await mapWithConcurrency(
        videoIds,
        REMOVE_LOOKUP_CONCURRENCY,
        async (videoId) => {
            try {
                const action = await resolveRemoveActionForVideo(playlistId, videoId, config);
                if (!action) {
                    return {
                        videoId,
                        action: null,
                        error: 'Video is not removable from this playlist.'
                    };
                }

                return {
                    videoId,
                    action,
                    error: ''
                };
            } catch (error) {
                return {
                    videoId,
                    action: null,
                    error: error instanceof Error ? error.message : 'Failed to resolve remove action.'
                };
            }
        }
    );

    const failures = [];
    const actionEntries = [];
    const actionKeys = new Set();

    lookupResults.forEach((result) => {
        if (!result?.action) {
            failures.push({
                videoId: result?.videoId || '',
                error: result?.error || 'Video is not removable from this playlist.'
            });
            return;
        }

        const actionCandidates = buildRemoveActionCandidates(result.action);
        if (actionCandidates.length === 0) {
            failures.push({
                videoId: result.videoId,
                error: 'Video is not removable from this playlist.'
            });
            return;
        }

        const key = getRemoveActionKey(actionCandidates[0], result.videoId);
        if (actionKeys.has(key)) {
            return;
        }

        actionKeys.add(key);
        actionEntries.push({
            key,
            videoId: result.videoId,
            actions: actionCandidates
        });
    });

    if (actionEntries.length === 0) {
        return {
            appliedVideoIds: new Set(),
            failures
        };
    }

    const appliedVideoIds = new Set();
    const failedByKey = new Map();
    const pendingByKey = new Map();
    actionEntries.forEach((entry) => {
        pendingByKey.set(entry.key, entry);
    });

    const maxCandidateCount = actionEntries.reduce(
        (maxCount, entry) => Math.max(maxCount, entry.actions.length),
        0
    );

    for (let candidateIndex = 0; candidateIndex < maxCandidateCount; candidateIndex += 1) {
        const batchEntries = [];
        pendingByKey.forEach((entry, key) => {
            const action = entry.actions[candidateIndex];
            if (!action) {
                return;
            }

            batchEntries.push({
                key,
                videoId: entry.videoId,
                action
            });
        });

        if (batchEntries.length === 0) {
            continue;
        }

        const batchResult = await executeRemoveEntriesBatched(
            playlistId,
            batchEntries,
            config,
            {
                batchSize: MAX_BATCH_SIZE,
                retryAttempts: EDIT_PLAYLIST_RETRY_ATTEMPTS
            }
        );

        batchResult.appliedVideoIds.forEach((videoId) => {
            appliedVideoIds.add(videoId);
        });

        const appliedKeys = new Set(
            batchEntries
                .filter((entry) => batchResult.appliedVideoIds.has(entry.videoId))
                .map((entry) => entry.key)
        );
        appliedKeys.forEach((key) => {
            pendingByKey.delete(key);
            failedByKey.delete(key);
        });

        batchResult.failedEntries.forEach((entry) => {
            failedByKey.set(entry.key, entry.error || 'Failed to remove video.');
        });
    }

    pendingByKey.forEach((entry, key) => {
        failures.push({
            videoId: entry.videoId,
            error: failedByKey.get(key) || 'Failed to remove video.'
        });
    });

    return {
        appliedVideoIds,
        failures
    };
}

/**
 * Remove selected videos from one playlist/watch-later list.
 * @param {{playlistId?: string, videoIds?: string[]}} payload
 * @param {{onProgress?: (progress: {processed: number, total: number}) => void}} [options]
 * @returns {Promise<{
 *   playlistId: string,
 *   requestedVideoCount: number,
 *   removedCount: number,
 *   removedVideoIds: string[],
 *   failures: Array<{videoId: string, error: string}>
 * }>}
 */
async function removeFromPlaylist(payload, options = {}) {
    const playlistId = sanitizePlaylistId(payload?.playlistId || '');
    if (!playlistId) {
        throw new Error('No valid playlist selected.');
    }

    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    if (videoIds.length === 0) {
        throw new Error('No valid selected videos found.');
    }

    const removedVideoIds = new Set();
    const failures = [];

    const nativeResult = await removeFromPlaylistViaNativeCommands(playlistId, videoIds, {
        onProgress: options.onProgress
    });
    nativeResult.removedVideoIds.forEach((videoId) => {
        if (VIDEO_ID_PATTERN.test(videoId)) {
            removedVideoIds.add(videoId);
        }
    });

    const pendingVideoIds = videoIds.filter((videoId) => !removedVideoIds.has(videoId));
    if (pendingVideoIds.length > 0) {
        const config = await getInnertubeConfig();
        const primaryResult = await executeRemoveEntriesBatched(
            playlistId,
            buildDirectRemoveEntries(pendingVideoIds, 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID'),
            config,
            {
                batchSize: MAX_BATCH_SIZE,
                retryAttempts: EDIT_PLAYLIST_RETRY_ATTEMPTS,
                onProgress: (progress) => {
                    if (typeof options.onProgress !== 'function') {
                        return;
                    }
                    const nativeProcessed = videoIds.length - pendingVideoIds.length;
                    options.onProgress({
                        processed: nativeProcessed + (Number(progress?.processed) || 0),
                        total: videoIds.length
                    });
                }
            }
        );
        primaryResult.appliedVideoIds.forEach((videoId) => {
            removedVideoIds.add(videoId);
        });

        if (primaryResult.appliedVideoIds.size === 0) {
            const fallback = await removeWithResolvedActions(playlistId, pendingVideoIds, config);
            fallback.appliedVideoIds.forEach((videoId) => {
                removedVideoIds.add(videoId);
            });
            failures.push(...fallback.failures);
        } else {
            const failureByVideoId = new Map();
            primaryResult.failedEntries.forEach((entry) => {
                if (!removedVideoIds.has(entry.videoId) && !failureByVideoId.has(entry.videoId)) {
                    failureByVideoId.set(entry.videoId, entry.error || 'Failed to remove video.');
                }
            });

            pendingVideoIds
                .filter((videoId) => !removedVideoIds.has(videoId))
                .forEach((videoId) => {
                    failures.push({
                        videoId,
                        error: failureByVideoId.get(videoId) || 'Failed to remove video.'
                    });
                });
        }
    }

    if (removedVideoIds.size === 0) {
        throw new Error(failures[0]?.error || 'Failed to remove selected videos.');
    }

    logger.debug('Playlist remove completed', {
        playlistId,
        requestedVideoCount: videoIds.length,
        removedCount: removedVideoIds.size,
        failureCount: failures.length
    });

    return {
        playlistId,
        requestedVideoCount: videoIds.length,
        removedCount: removedVideoIds.size,
        removedVideoIds: Array.from(removedVideoIds),
        failures
    };
}

/**
 * Delete multiple playlists.
 * @param {{playlistIds: string[]}} payload
 * @param {{onProgress?: (progress: {processed: number, total: number}) => void}} [options]
 * @returns {Promise<{
 *   deletedCount: number,
 *   failedCount: number,
 *   failures: Array<{playlistId: string, error: string}>
 * }>}
 */
async function deletePlaylists(payload, options = {}) {
    const playlistIds = sanitizePlaylistIds(payload?.playlistIds || []);
    if (playlistIds.length === 0) {
        throw new Error('No playlists selected for deletion.');
    }

    const config = await getInnertubeConfig();
    const failures = [];
    const progress = {
        processed: 0,
        total: playlistIds.length
    };

    const results = await mapWithConcurrency(
        playlistIds,
        Math.min(DELETE_PLAYLIST_CONCURRENCY, playlistIds.length),
        async (playlistId) => {
            try {
                await postInnertube('playlist/delete', {
                    context: config.context,
                    playlistId
                }, config);
                progress.processed += 1;
                if (typeof options?.onProgress === 'function') {
                    options.onProgress({
                        processed: progress.processed,
                        total: progress.total
                    });
                }
                return {
                    playlistId,
                    success: true,
                    error: ''
                };
            } catch (error) {
                progress.processed += 1;
                if (typeof options?.onProgress === 'function') {
                    options.onProgress({
                        processed: progress.processed,
                        total: progress.total
                    });
                }
                return {
                    playlistId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to delete playlist.'
                };
            }
        }
    );

    results.forEach((result) => {
        if (result?.success) {
            return;
        }
        failures.push({
            playlistId: result?.playlistId || '',
            error: result?.error || 'Failed to delete playlist.'
        });
    });

    return {
        deletedCount: playlistIds.length - failures.length,
        failedCount: failures.length,
        failures
    };
}

/**
 * Create a playlist and add selected videos into it.
 * @param {{title?: string, privacyStatus?: string, collaborate?: boolean, videoIds?: string[]}} payload
 * @param {{onProgress?: (progress: {processed: number, total: number, label: string}) => void}} [options]
 * @returns {Promise<{
 *   playlistId: string,
 *   requestedVideoCount: number,
 *   addedCount: number,
 *   failures: Array<{batchIndex: number, videoIds: string[], error: string}>
 * }>}
 */
async function createPlaylistAndAdd(payload, options = {}) {
    const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
    if (!title) {
        throw new Error('Playlist title is required.');
    }

    if (title.length > 150) {
        throw new Error('Playlist title is too long.');
    }

    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    if (videoIds.length === 0) {
        throw new Error('No selected videos to save.');
    }

    const privacyStatus = normalizePrivacyStatus(payload?.privacyStatus || 'PRIVATE');
    const collaborate = payload?.collaborate === true;
    const config = await getInnertubeConfig();

    const createPayload = {
        context: config.context,
        title,
        privacyStatus
    };

    if (collaborate) {
        createPayload.isCollaborative = true;
        createPayload.collaborationState = 'COLLABORATION_ENABLED';
    }

    const createResponse = await postInnertube(['playlist/create', 'browse/create_playlist'], createPayload, config);
    const playlistId = findPlaylistIdInNode(createResponse.body);
    if (!playlistId) {
        throw new Error('Playlist created, but ID was not returned.');
    }

    const addResult = await addVideosToSinglePlaylist(playlistId, videoIds, config, {
        throwOnFailure: false,
        retryAttempts: EDIT_PLAYLIST_RETRY_ATTEMPTS,
        onProgress: (processed, total) => {
            if (typeof options?.onProgress === 'function') {
                options.onProgress({
                    processed,
                    total,
                    label: title
                });
            }
        }
    });

    return {
        playlistId,
        requestedVideoCount: videoIds.length,
        addedCount: Number(addResult?.addedCount) || 0,
        failures: Array.isArray(addResult?.failures) ? addResult.failures : []
    };
}

/**
 * Extract one upload timestamp from player response payload.
 * @param {any} responseBody
 * @returns {number|null}
 */
function extractShortsTimestampFromPlayerResponse(responseBody) {
    if (!responseBody || typeof responseBody !== 'object') {
        return null;
    }

    const candidates = [
        responseBody?.microformat?.playerMicroformatRenderer?.uploadDate,
        responseBody?.microformat?.playerMicroformatRenderer?.publishDate,
        responseBody?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp,
        responseBody?.videoDetails?.publishDate
    ];

    for (const candidate of candidates) {
        const parsed = parseDateLikeValue(candidate);
        if (Number.isFinite(parsed)) {
            return Number(parsed);
        }
    }

    return null;
}

/**
 * Resolve one video upload timestamp via internal player endpoint.
 * @param {string} videoId
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 * @returns {Promise<number|null>}
 */
async function resolveUploadTimestampFromPlayer(videoId, config) {
    try {
        const response = await postInnertube(
            'player',
            {
                context: config.context,
                videoId,
                contentCheckOk: true,
                racyCheckOk: true
            },
            config
        );

        return extractShortsTimestampFromPlayerResponse(response.body);
    } catch (error) {
        logger.debug('Player fallback timestamp request failed', {
            videoId,
            error: error instanceof Error ? error.message : String(error || 'Unknown error')
        });
        return null;
    }
}

/**
 * Bridge action: resolve Shorts upload timestamps via player endpoint.
 * We intentionally avoid relying on undocumented batch metadata endpoints.
 * @param {{videoIds?: string[]}} payload
 * @returns {Promise<{timestampsById: Record<string, number|null>}>}
 */
async function getShortsUploadTimestamps(payload) {
    const videoIds = sanitizeVideoIds(payload?.videoIds);
    if (videoIds.length === 0) {
        return { timestampsById: {} };
    }

    const config = await getInnertubeConfig();
    const timestampsById = {};
    const entries = await mapWithConcurrency(
        videoIds,
        SHORTS_TIMESTAMP_RESOLVE_CONCURRENCY,
        async (videoId) => {
            const timestampMs = await resolveUploadTimestampFromPlayer(videoId, config);
            return [videoId, Number.isFinite(timestampMs) ? Number(timestampMs) : null];
        }
    );

    let resolvedCount = 0;
    entries.forEach((entry) => {
        const videoId = Array.isArray(entry) ? entry[0] : '';
        const timestampMs = Array.isArray(entry) ? entry[1] : null;
        if (typeof videoId !== 'string' || !videoId) {
            return;
        }

        if (Number.isFinite(timestampMs)) {
            resolvedCount += 1;
            timestampsById[videoId] = Number(timestampMs);
        } else {
            timestampsById[videoId] = null;
        }
    });

    logger.debug('Resolved Shorts timestamps via player endpoint', {
        requested: videoIds.length,
        resolved: resolvedCount
    });

    return { timestampsById };
}

/**
 * Pick best thumbnail URL from a list.
 * @param {any} thumbnails
 * @returns {string}
 */
function pickThumbnailUrl(thumbnails) {
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
        return '';
    }
    const sorted = [...thumbnails].sort((a, b) => (a?.width || 0) - (b?.width || 0));
    const best = sorted[sorted.length - 1];
    return typeof best?.url === 'string' ? best.url : '';
}

/**
 * Normalize channel URL/handle path.
 * @param {string} url
 * @returns {string}
 */
function normalizeChannelPath(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }
    let path = url;
    try {
        if (path.startsWith('http')) {
            const parsed = new URL(path);
            path = parsed.pathname;
        }
    } catch (_error) {
        // ignore
    }
    return path.split('?')[0].split('#')[0];
}

/**
 * Collect continuation tokens from response tree.
 * @param {any} node
 * @param {Set<string>} tokens
 */
function collectContinuationTokens(node, tokens) {
    if (!node || typeof node !== 'object') {
        return;
    }

    const token = node?.continuationCommand?.token || node?.continuationEndpoint?.continuationCommand?.token;
    if (typeof token === 'string' && token) {
        tokens.add(token);
    }

    Object.values(node).forEach((value) => {
        if (Array.isArray(value)) {
            value.forEach((item) => collectContinuationTokens(item, tokens));
        } else if (value && typeof value === 'object') {
            collectContinuationTokens(value, tokens);
        }
    });
}

/**
 * Collect channel renderer objects from response tree.
 * @param {any} node
 * @param {Array<object>} renderers
 */
function collectChannelRenderers(node, renderers) {
    if (!node || typeof node !== 'object') {
        return;
    }

    Object.entries(node).forEach(([key, value]) => {
        if (key.toLowerCase().endsWith('channelrenderer') && value && typeof value === 'object') {
            renderers.push(value);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => collectChannelRenderers(item, renderers));
        } else if (value && typeof value === 'object') {
            collectChannelRenderers(value, renderers);
        }
    });
}

/**
 * Normalize channel renderer data.
 * @param {any} renderer
 * @returns {object|null}
 */
function normalizeChannelRenderer(renderer) {
    if (!renderer || typeof renderer !== 'object') {
        return null;
    }

    const channelId = typeof renderer.channelId === 'string' ? renderer.channelId : '';
    if (!channelId || !channelId.startsWith('UC')) {
        return null;
    }

    const title = readText(renderer.title) || 'Untitled channel';
    const url = normalizeChannelPath(renderer?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url
        || renderer?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
        || renderer?.channelUrl
        || '');
    const handle = url.startsWith('/@') ? url.split('/')[1] : '';
    const subscriberCount = readText(renderer.subscriberCountText);
    const videoCount = readText(renderer.videoCountText);
    const avatar = pickThumbnailUrl(renderer?.thumbnail?.thumbnails);

    return {
        channelId,
        title,
        handle,
        url,
        avatar,
        subscriberCount,
        videoCount
    };
}

/**
 * Fetch all subscription channels via browse API.
 * @param {{limit?: number}} payload
 * @returns {Promise<{channels: object[], total: number}>}
 */
async function getSubscriptions(payload) {
    const config = await getInnertubeConfig();
    const limit = Number.isFinite(payload?.limit) ? Number(payload.limit) : SUBSCRIPTION_PAGE_LIMIT * 100;

    const channelsById = new Map();
    const seenTokens = new Set();
    let continuations = [];
    let pageCount = 0;

    const first = await postInnertube('browse', { context: config.context, browseId: SUBSCRIPTION_BROWSE_ID }, config);
    const renderers = [];
    collectChannelRenderers(first.body, renderers);
    renderers.forEach((renderer) => {
        const normalized = normalizeChannelRenderer(renderer);
        if (normalized && !channelsById.has(normalized.channelId)) {
            channelsById.set(normalized.channelId, normalized);
        }
    });
    const firstTokens = new Set();
    collectContinuationTokens(first.body, firstTokens);
    continuations = Array.from(firstTokens);

    while (continuations.length > 0 && channelsById.size < limit && pageCount < SUBSCRIPTION_PAGE_LIMIT) {
        const token = continuations.shift();
        if (!token || seenTokens.has(token)) {
            continue;
        }
        seenTokens.add(token);
        pageCount += 1;

        const response = await postInnertube('browse', { context: config.context, continuation: token }, config);
        const batchRenderers = [];
        collectChannelRenderers(response.body, batchRenderers);
        batchRenderers.forEach((renderer) => {
            const normalized = normalizeChannelRenderer(renderer);
            if (normalized && !channelsById.has(normalized.channelId)) {
                channelsById.set(normalized.channelId, normalized);
            }
        });

        const nextTokens = new Set();
        collectContinuationTokens(response.body, nextTokens);
        nextTokens.forEach((next) => {
            if (!seenTokens.has(next)) {
                continuations.push(next);
            }
        });
    }

    return {
        channels: Array.from(channelsById.values()),
        total: channelsById.size
    };
}

/**
 * Unsubscribe from multiple channels.
 * @param {{channelIds: string[]}} payload
 * @returns {Promise<{unsubscribedCount: number}>}
 */
async function unsubscribeChannels(payload) {
    const channelIds = sanitizeChannelIds(payload?.channelIds);
    if (channelIds.length === 0) {
        return { unsubscribedCount: 0 };
    }

    const config = await getInnertubeConfig();
    const chunks = chunk(channelIds, SUBSCRIPTION_BATCH_SIZE);
    let unsubscribedCount = 0;

    for (const channelChunk of chunks) {
        await postInnertube('subscription/unsubscribe', { context: config.context, channelIds: channelChunk }, config);
        unsubscribedCount += channelChunk.length;
    }

    return { unsubscribedCount };
}

/**
 * Post bridge response.
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
 * Post bridge progress update.
 * @param {string} requestId
 * @param {object} data
 */
function postBridgeProgress(requestId, data) {
    window.postMessage({
        source: BRIDGE_SOURCE,
        type: 'YT_COMMANDER_BRIDGE_PROGRESS',
        requestId,
        data
    }, '*');
}

/**
 * Handle validated bridge request.
 * @param {{requestId: string, action: string, payload: any}} message
 */
async function handleBridgeRequest(message) {
    const { requestId, action, payload } = message;
    if (!requestId || typeof requestId !== 'string') {
        return;
    }

    try {
        let result = null;
        if (action === ACTIONS.GET_PLAYLISTS) {
            result = await getPlaylists(payload);
        } else if (action === ACTIONS.GET_PLAYLIST_THUMBNAILS) {
            result = await getPlaylistThumbnails(payload);
        } else if (action === ACTIONS.SHOW_NATIVE_TOAST) {
            result = showNativeToast(payload);
        } else if (action === ACTIONS.OPEN_NATIVE_PLAYLIST_DRAWER) {
            result = await openNativePlaylistDrawer(payload);
        } else if (action === ACTIONS.ADD_TO_PLAYLISTS) {
            result = await addToPlaylists(payload, {
                onProgress: (progress) => {
                    postBridgeProgress(requestId, progress);
                }
            });
        } else if (action === ACTIONS.REMOVE_FROM_PLAYLIST) {
            result = await removeFromPlaylist(payload, {
                onProgress: (progress) => {
                    postBridgeProgress(requestId, progress);
                }
            });
        } else if (action === ACTIONS.CREATE_PLAYLIST_AND_ADD) {
            result = await createPlaylistAndAdd(payload, {
                onProgress: (progress) => {
                    postBridgeProgress(requestId, progress);
                }
            });
        } else if (action === ACTIONS.GET_SHORTS_UPLOAD_TIMESTAMPS) {
            result = await getShortsUploadTimestamps(payload);
        } else if (action === ACTIONS.DELETE_PLAYLISTS) {
            result = await deletePlaylists(payload, {
                onProgress: (progress) => {
                    postBridgeProgress(requestId, progress);
                }
            });
        } else if (action === ACTIONS.GET_SUBSCRIPTIONS) {
            result = await getSubscriptions(payload);
        } else if (action === ACTIONS.UNSUBSCRIBE_CHANNELS) {
            result = await unsubscribeChannels(payload);
        } else {
            throw new Error('Unsupported playlist action.');
        }

        postBridgeResponse(requestId, true, result, null);
    } catch (error) {
        logger.warn('Playlist bridge request failed', error);
        postBridgeResponse(
            requestId,
            false,
            null,
            error instanceof Error ? error.message : 'Playlist action failed.'
        );
    }
}

/**
 * Bridge event listener.
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

    void handleBridgeRequest(message);
}

/**
 * Init bridge.
 */
function initPlaylistApiBridge() {
    if (isInitialized) {
        return;
    }

    window.addEventListener('message', handleWindowMessage);
    isInitialized = true;
    logger.info('Playlist API bridge initialized');
}

initPlaylistApiBridge();

export {
    initPlaylistApiBridge
};











