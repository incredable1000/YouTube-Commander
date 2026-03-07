/**
 * Watched history constants.
 */

export const DB_NAME = 'YouTubeCommanderDB';
export const DB_VERSION = 2;
export const STORE_NAME = 'watchedVideos';
export const SYNC_QUEUE_STORE_NAME = 'watchedSyncQueue';

export const FEED_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytm-shorts-lockup-view-model'
].join(', ');

export const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href*="/shorts/"]';
export const MARKER_CLASS = 'yt-commander-watched-marker';
export const HIDDEN_CLASS = 'yt-commander-hidden-video';
export const WATCHED_ATTR = 'data-yt-commander-watched';

export const RENDER_DEBOUNCE_MS = 120;
export const PLAYBACK_BIND_DELAY_MS = 250;
export const PLAYBACK_BIND_MAX_RETRIES = 12;
export const CACHE_REFRESH_DEBOUNCE_MS = 300;
export const MAX_PENDING_NODES = 2000;
