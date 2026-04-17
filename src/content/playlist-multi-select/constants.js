/**
 * Shared constants for playlist multi-select.
 */

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
    DELETE_PLAYLISTS: 'DELETE_PLAYLISTS'
};

const FEED_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-slim-media',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-shorts-lockup-view-model',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2'
].join(', ');

const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href*="/shorts/"]';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{10,15}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,120}$/;

const MASTHEAD_SLOT_CLASS = 'yt-commander-playlist-masthead-slot';
const MASTHEAD_BUTTON_CLASS = 'yt-commander-playlist-masthead-button';
const MASTHEAD_BADGE_CLASS = 'yt-commander-playlist-masthead-badge';

const HOST_CLASS = 'yt-commander-playlist-host';
const HOST_SELECTED_CLASS = 'yt-commander-playlist-selected';
const OVERLAY_CLASS = 'yt-commander-playlist-overlay';

const ACTION_BAR_CLASS = 'yt-commander-playlist-action-bar';
const ACTION_MENU_CLASS = 'yt-commander-playlist-action-menu';
const PLAYLIST_PANEL_CLASS = 'yt-commander-playlist-panel';
const CREATE_BACKDROP_CLASS = 'yt-commander-playlist-create-backdrop';
const CREATE_MODAL_CLASS = 'yt-commander-playlist-create-modal';

const ROOT_SELECTION_CLASS = 'yt-commander-playlist-selection-mode';

const REQUEST_TIMEOUT_MS = 0;
const PROCESS_CHUNK_SIZE = 120;

const STATUS_KIND = {
    INFO: 'info',
    SUCCESS: 'success',
    ERROR: 'error'
};

const VISIBILITY_OPTIONS = [
    {
        value: 'PUBLIC',
        label: 'Public',
        description: 'Anyone can search for and view'
    },
    {
        value: 'UNLISTED',
        label: 'Unlisted',
        description: 'Anyone with the link can view'
    },
    {
        value: 'PRIVATE',
        label: 'Private',
        description: 'Only you can view'
    }
];

export {
    BRIDGE_SOURCE,
    REQUEST_TYPE,
    RESPONSE_TYPE,
    ACTIONS,
    FEED_RENDERER_SELECTOR,
    VIDEO_LINK_SELECTOR,
    VIDEO_ID_PATTERN,
    PLAYLIST_ID_PATTERN,
    MASTHEAD_SLOT_CLASS,
    MASTHEAD_BUTTON_CLASS,
    MASTHEAD_BADGE_CLASS,
    HOST_CLASS,
    HOST_SELECTED_CLASS,
    OVERLAY_CLASS,
    ACTION_BAR_CLASS,
    ACTION_MENU_CLASS,
    PLAYLIST_PANEL_CLASS,
    CREATE_BACKDROP_CLASS,
    CREATE_MODAL_CLASS,
    ROOT_SELECTION_CLASS,
    REQUEST_TIMEOUT_MS,
    PROCESS_CHUNK_SIZE,
    STATUS_KIND,
    VISIBILITY_OPTIONS
};
