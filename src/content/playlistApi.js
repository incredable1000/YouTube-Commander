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
    ADD_TO_PLAYLISTS: 'ADD_TO_PLAYLISTS'
};

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{10,15}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,120}$/;
const MAX_BATCH_SIZE = 45;

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
 * Split array into chunks.
 * @param {string[]} items
 * @param {number} size
 * @returns {string[][]}
 */
function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
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
 * Recursively collect playlist options from a get_add_to_playlist payload.
 * @param {any} node
 * @param {Map<string, {id: string, title: string, privacy: string, isSelected: boolean}>} output
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

            if (!output.has(playlistId)) {
                output.set(playlistId, {
                    id: playlistId,
                    title,
                    privacy,
                    isSelected
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
 * Load playlists for save popup.
 * @param {{videoIds?: string[]}} payload
 * @returns {Promise<{playlists: Array<{id: string, title: string, privacy: string, isSelected: boolean}>}>}
 */
async function getPlaylists(payload) {
    const videoIds = sanitizeVideoIds(payload?.videoIds || []);
    const config = await getInnertubeConfig();

    const requestPayload = {
        context: config.context,
        excludeWatchLater: false
    };
    if (videoIds.length > 0) {
        requestPayload.videoId = videoIds[0];
        requestPayload.videoIds = [videoIds[0]];
    }

    const response = await postInnertube('playlist/get_add_to_playlist', requestPayload, config);
    const map = new Map();
    collectPlaylistOptions(response.body, map, new WeakSet());

    const playlists = Array.from(map.values());
    playlists.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

    return { playlists };
}

/**
 * Add videos to one playlist.
 * @param {string} playlistId
 * @param {string[]} videoIds
 * @param {{apiKey: string, context: object, headers: Record<string, string>}} config
 */
async function addVideosToSinglePlaylist(playlistId, videoIds, config) {
    const batches = chunk(videoIds, MAX_BATCH_SIZE);

    for (const batch of batches) {
        const payload = {
            context: config.context,
            playlistId,
            actions: batch.map((videoId) => ({
                action: 'ACTION_ADD_VIDEO',
                addedVideoId: videoId
            }))
        };

        await postInnertube(['playlist/edit_playlist', 'browse/edit_playlist'], payload, config);
    }
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
        } else if (action === ACTIONS.ADD_TO_PLAYLISTS) {
            result = await addToPlaylists(payload);
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
