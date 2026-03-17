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
    ADD_TO_PLAYLISTS: 'ADD_TO_PLAYLISTS',
    CREATE_PLAYLIST_AND_ADD: 'CREATE_PLAYLIST_AND_ADD',
    REMOVE_FROM_PLAYLIST: 'REMOVE_FROM_PLAYLIST',
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
const SHORTS_TIMESTAMP_BATCH_SIZE = 60;
const SHORTS_TIMESTAMP_SCAN_DEPTH_LIMIT = 10;
const SHORTS_TIMESTAMP_PLAYER_FALLBACK_CONCURRENCY = 3;
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
 * Read video ID from one metadata object.
 * @param {any} value
 * @param {Set<string>} validIds
 * @returns {string}
 */
function readVideoIdFromValue(value, validIds) {
    if (!value || typeof value !== 'object') {
        return '';
    }

    const candidates = [
        value.videoId,
        value.videoDetails?.videoId,
        value.entityKey,
        value.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId,
        value.reelWatchEndpoint?.videoId
    ];

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') {
            continue;
        }

        const match = candidate.match(/[A-Za-z0-9_-]{10,15}/);
        const videoId = match?.[0] || '';
        if (videoId && validIds.has(videoId)) {
            return videoId;
        }
    }

    return '';
}

/**
 * Read timestamp candidates from one metadata object.
 * @param {any} value
 * @returns {number|null}
 */
function readTimestampFromValue(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidates = [
        value.publishDate,
        value.uploadDate,
        value.datePublished,
        value.publishedDate,
        value.publishedAt,
        value.publishTime,
        value.publishedTimeText,
        value.dateText,
        value.publishedTime
    ];

    for (const candidate of candidates) {
        const parsed = parseDateLikeValue(candidate);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

/**
 * Extract upload timestamps from updated_metadata payload.
 * @param {any} payload
 * @param {Set<string>} validIds
 * @returns {Map<string, number|null>}
 */
function extractShortsTimestampsFromMetadata(payload, validIds) {
    const timestampsById = new Map();
    if (!payload || typeof payload !== 'object' || validIds.size === 0) {
        return timestampsById;
    }

    const visited = new WeakSet();

    /**
     * @param {any} node
     * @param {string} currentVideoId
     * @param {number} depth
     */
    function scan(node, currentVideoId, depth) {
        if (!node || depth > SHORTS_TIMESTAMP_SCAN_DEPTH_LIMIT) {
            return;
        }

        if (Array.isArray(node)) {
            node.forEach((child) => scan(child, currentVideoId, depth + 1));
            return;
        }

        if (typeof node !== 'object') {
            return;
        }

        if (visited.has(node)) {
            return;
        }
        visited.add(node);

        let scopedVideoId = currentVideoId;
        const ownVideoId = readVideoIdFromValue(node, validIds);
        if (ownVideoId) {
            scopedVideoId = ownVideoId;
        }

        if (scopedVideoId && !timestampsById.has(scopedVideoId)) {
            const timestampMs = readTimestampFromValue(node);
            if (Number.isFinite(timestampMs)) {
                timestampsById.set(scopedVideoId, timestampMs);
            }
        }

        Object.values(node).forEach((child) => scan(child, scopedVideoId, depth + 1));
    }

    scan(payload, '', 0);
    return timestampsById;
}

/**
 * Extract upload timestamp from watch-page HTML.
 * @param {string} html
 * @returns {number|null}
 */
function extractUploadTimestampFromHtml(html) {
    if (typeof html !== 'string' || html.length === 0) {
        return null;
    }

    const patterns = [
        /<meta[^>]+itemprop=["']uploadDate["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
        /"uploadDate"\s*:\s*"([^"]+)"/i,
        /"datePublished"\s*:\s*"([^"]+)"/i,
        /"publishDate"\s*:\s*"([^"]+)"/i,
        /\\"uploadDate\\"\s*:\s*\\"([^\\"]+)\\"/i,
        /\\"datePublished\\"\s*:\s*\\"([^\\"]+)\\"/i,
        /\\"publishDate\\"\s*:\s*\\"([^\\"]+)\\"/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        const parsed = parseDateLikeValue(match?.[1] || '');
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
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
            const isSelected = renderer.isSelected === true || renderer.containsSelectedVideos === true;
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
 * Execute remove entries in batched playlist/edit requests.
 * @param {string} playlistId
 * @param {Array<{videoId: string, key: string, action: {action: string, setVideoId?: string, removedVideoId?: string}}>} entries
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 * @param {{batchSize?: number, retryAttempts?: number}} [options]
 * @returns {Promise<{
 *   appliedVideoIds: Set<string>,
 *   failedEntries: Array<{videoId: string, key: string, action: {action: string, setVideoId?: string, removedVideoId?: string}, error: string}>
 * }>}
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

    const batches = chunk(entries, safeBatchSize);
    const appliedVideoIds = new Set();
    const failedEntries = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
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
            batch.forEach((entry) => {
                appliedVideoIds.add(entry.videoId);
            });
            continue;
        }

        const errorText = lastError instanceof Error ? lastError.message : 'Failed to remove videos batch.';
        batch.forEach((entry) => {
            failedEntries.push({
                ...entry,
                error: errorText
            });
        });
    }

    return {
        appliedVideoIds,
        failedEntries
    };
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
 * @param {{throwOnFailure?: boolean, retryAttempts?: number}} [options]
 * @returns {Promise<{requestedCount: number, addedCount: number, failures: Array<{batchIndex: number, videoIds: string[], error: string}>}>}
 */
async function addVideosToSinglePlaylist(playlistId, videoIds, config, options = {}) {
    const retryAttempts = Number.isFinite(options.retryAttempts)
        ? Math.max(1, Math.floor(options.retryAttempts))
        : EDIT_PLAYLIST_RETRY_ATTEMPTS;

    const batches = chunk(videoIds, MAX_BATCH_SIZE);
    const failures = [];
    let addedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
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
            addedCount += batch.length;
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
 * @param {{videoIds?: string[], playlistIds?: string[]}} payload
 * @returns {Promise<{
 *   requestedVideoCount: number,
 *   requestedPlaylistCount: number,
 *   successCount: number,
 *   failures: Array<{playlistId: string, error: string}>
 * }>}
 */
async function addToPlaylists(payload) {
    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    if (videoIds.length === 0) {
        throw new Error('No valid selected videos found.');
    }

    const playlistIds = sanitizePlaylistIds(payload?.playlistIds || []);
    if (playlistIds.length === 0) {
        throw new Error('No valid playlists selected.');
    }

    const config = await getInnertubeConfig();
    const failures = [];
    let successCount = 0;

    for (const playlistId of playlistIds) {
        try {
            await addVideosToSinglePlaylist(playlistId, videoIds, config);
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
 * @returns {Promise<{
 *   playlistId: string,
 *   requestedVideoCount: number,
 *   removedCount: number,
 *   removedVideoIds: string[],
 *   failures: Array<{videoId: string, error: string}>
 * }>}
 */
async function removeFromPlaylist(payload) {
    const playlistId = sanitizePlaylistId(payload?.playlistId || '');
    if (!playlistId) {
        throw new Error('No valid playlist selected.');
    }

    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    if (videoIds.length === 0) {
        throw new Error('No valid selected videos found.');
    }

    const config = await getInnertubeConfig();
    const primaryResult = await executeRemoveEntriesBatched(
        playlistId,
        buildDirectRemoveEntries(videoIds, 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID'),
        config,
        {
            batchSize: MAX_BATCH_SIZE,
            retryAttempts: EDIT_PLAYLIST_RETRY_ATTEMPTS
        }
    );
    const removedVideoIds = new Set(primaryResult.appliedVideoIds);

    if (removedVideoIds.size === 0) {
        throw new Error(primaryResult.failedEntries[0]?.error || 'Failed to remove selected videos.');
    }

    const failureByVideoId = new Map();
    primaryResult.failedEntries.forEach((entry) => {
        if (!removedVideoIds.has(entry.videoId) && !failureByVideoId.has(entry.videoId)) {
            failureByVideoId.set(entry.videoId, entry.error || 'Failed to remove video.');
        }
    });

    const failures = videoIds
        .filter((videoId) => !removedVideoIds.has(videoId))
        .map((videoId) => ({
            videoId,
            error: failureByVideoId.get(videoId) || 'Failed to remove video.'
        }));

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
 * Create a playlist and add selected videos into it.
 * @param {{title?: string, privacyStatus?: string, collaborate?: boolean, videoIds?: string[]}} payload
 * @returns {Promise<{
 *   playlistId: string,
 *   requestedVideoCount: number,
 *   addedCount: number,
 *   failures: Array<{batchIndex: number, videoIds: string[], error: string}>
 * }>}
 */
async function createPlaylistAndAdd(payload) {
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
        retryAttempts: EDIT_PLAYLIST_RETRY_ATTEMPTS
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
 * Resolve one chunk of Shorts upload timestamps via YouTube metadata endpoint.
 * Unresolved IDs are returned as null and retried later by cache policy.
 * @param {string[]} videoIds
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 * @returns {Promise<Map<string, number|null>>}
 */
async function resolveShortsTimestampChunk(videoIds, config) {
    const ids = sanitizeVideoIds(videoIds);
    const results = new Map();
    if (ids.length === 0) {
        return results;
    }

    const idSet = new Set(ids);
    let batchTimestamps = new Map();

    try {
        const payload = {
            context: config.context,
            videoIds: ids
        };

        const response = await postInnertube('updated_metadata', payload, config);

        batchTimestamps = extractShortsTimestampsFromMetadata(response.body, idSet);
    } catch (error) {
        logger.warn('Failed batch Shorts timestamp request', {
            videoCount: ids.length,
            error
        });
    }

    const unresolvedIds = ids.filter((videoId) => !Number.isFinite(batchTimestamps.get(videoId)));
    if (unresolvedIds.length > 0) {
        const fallbackTimestamps = await mapWithConcurrency(
            unresolvedIds,
            SHORTS_TIMESTAMP_PLAYER_FALLBACK_CONCURRENCY,
            async (videoId) => {
                const timestampMs = await resolveUploadTimestampFromPlayer(videoId, config);
                return [videoId, Number.isFinite(timestampMs) ? Number(timestampMs) : null];
            }
        );

        fallbackTimestamps.forEach((entry) => {
            const videoId = Array.isArray(entry) ? entry[0] : '';
            const timestampMs = Array.isArray(entry) ? entry[1] : null;
            if (typeof videoId === 'string' && videoId) {
                results.set(videoId, Number.isFinite(timestampMs) ? Number(timestampMs) : null);
            }
        });
    }

    batchTimestamps.forEach((timestampMs, videoId) => {
        if (!idSet.has(videoId)) {
            return;
        }

        results.set(videoId, Number.isFinite(timestampMs) ? Number(timestampMs) : null);
    });

    ids.forEach((videoId) => {
        if (!results.has(videoId)) {
            results.set(videoId, null);
        }
    });

    logger.debug('Resolved Shorts timestamp chunk', {
        requested: ids.length,
        batchResolved: ids.length - unresolvedIds.length,
        fallbackResolved: unresolvedIds.filter((videoId) => Number.isFinite(results.get(videoId))).length
    });

    return results;
}

/**
 * Bridge action: resolve Shorts upload timestamps in batched requests.
 * @param {{videoIds?: string[]}} payload
 * @returns {Promise<{timestampsById: Record<string, number|null>}>}
 */
async function getShortsUploadTimestamps(payload) {
    const videoIds = sanitizeVideoIds(payload?.videoIds);
    if (videoIds.length === 0) {
        return { timestampsById: {} };
    }

    const config = await getInnertubeConfig();
    const chunks = chunk(videoIds, SHORTS_TIMESTAMP_BATCH_SIZE);
    const timestampsById = {};

    for (const videoIdChunk of chunks) {
        const chunkResult = await resolveShortsTimestampChunk(videoIdChunk, config);
        videoIdChunk.forEach((videoId) => {
            const timestampMs = chunkResult.get(videoId);
            timestampsById[videoId] = Number.isFinite(timestampMs) ? Number(timestampMs) : null;
        });
    }

    return {
        timestampsById
    };
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
        } else if (action === ACTIONS.ADD_TO_PLAYLISTS) {
            result = await addToPlaylists(payload);
        } else if (action === ACTIONS.REMOVE_FROM_PLAYLIST) {
            result = await removeFromPlaylist(payload);
        } else if (action === ACTIONS.CREATE_PLAYLIST_AND_ADD) {
            result = await createPlaylistAndAdd(payload);
        } else if (action === ACTIONS.GET_SHORTS_UPLOAD_TIMESTAMPS) {
            result = await getShortsUploadTimestamps(payload);
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











