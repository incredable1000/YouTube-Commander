/**
 * Shared constants for Shorts upload-age labels.
 */

const FEED_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-rich-grid-slim-media',
    'ytd-shorts-lockup-view-model',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model'
].join(', ');

const SHORT_LINK_SELECTOR = 'a[href*="/shorts/"]';
const LABEL_CLASS = 'yt-commander-short-upload-age';
const LABEL_ATTR = 'data-yt-commander-short-id';
const RENDER_DEBOUNCE_MS = 140;
const PROCESS_CHUNK_SIZE = 120;
const FETCH_RETRY_MS = 5 * 60_000;
const RELATIVE_REFRESH_MS = 60_000;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{10,15}$/;
const BRIDGE_SOURCE = 'yt-commander';
const BRIDGE_REQUEST_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_REQUEST';
const BRIDGE_RESPONSE_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_RESPONSE';
const BRIDGE_ACTION_GET_SHORTS_UPLOAD_TIMESTAMPS = 'GET_SHORTS_UPLOAD_TIMESTAMPS';
const BRIDGE_TIMEOUT_MS = 30_000;

export {
    FEED_RENDERER_SELECTOR,
    SHORT_LINK_SELECTOR,
    LABEL_CLASS,
    LABEL_ATTR,
    RENDER_DEBOUNCE_MS,
    PROCESS_CHUNK_SIZE,
    FETCH_RETRY_MS,
    RELATIVE_REFRESH_MS,
    VIDEO_ID_PATTERN,
    BRIDGE_SOURCE,
    BRIDGE_REQUEST_TYPE,
    BRIDGE_RESPONSE_TYPE,
    BRIDGE_ACTION_GET_SHORTS_UPLOAD_TIMESTAMPS,
    BRIDGE_TIMEOUT_MS
};
