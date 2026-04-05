export const BRIDGE_SOURCE = 'yt-commander';
export const REQUEST_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_REQUEST';
export const RESPONSE_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_RESPONSE';

export const ACTIONS = {
    GET_SUBSCRIPTIONS: 'GET_SUBSCRIPTIONS',
    UNSUBSCRIBE_CHANNELS: 'UNSUBSCRIBE_CHANNELS',
};

export const STORAGE_KEYS = {
    CATEGORIES: 'subscriptionManagerCategories',
    ASSIGNMENTS: 'subscriptionManagerAssignments',
    SNAPSHOT: 'subscriptionManagerSnapshot',
    FILTER: 'subscriptionManagerFilter',
    SORT: 'subscriptionManagerSort',
    SIDEBAR_COLLAPSED: 'subscriptionManagerSidebarCollapsed',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PENDING_COUNT: 'subscriptionSyncPendingCount',
};

export const SUBSCRIPTION_BUTTON_CLASS = 'yt-commander-subscription-masthead-button';
export const QUICK_ADD_PAGES = [
    /^https?:\/\/(www\.)?youtube\.com\/watch/i,
    /^https?:\/\/(www\.)?youtube\.com\/shorts/i,
    /^https?:\/\/(www\.)?youtube\.com\/@/i,
    /^https?:\/\/(www\.)?youtube\.com\/channel\//i,
    /^https?:\/\/(www\.)?youtube\.com\/c\//i,
    /^https?:\/\/(www\.)?youtube\.com\/user\//i,
];
export const QUICK_ADD_CONTEXT_SELECTOR = [
    'ytd-video-owner-renderer',
    'ytd-watch-metadata',
    'ytd-reel-player-header-renderer',
    'ytd-reel-player-overlay-renderer',
    'ytd-reel-channel-renderer',
    'ytd-channel-header-renderer',
    'ytd-channel-tagline-renderer',
    'ytd-channel-metadata',
    'ytd-channel-name',
    'ytd-channel-renderer',
    'ytd-c4-tabbed-header-renderer',
    'yt-flexible-actions-view-model',
    '#subscribe-button',
    '.ytReelChannelBarViewModelReelSubscribeButton',
].join(', ');
export const QUICK_ADD_HOST_SELECTOR = [
    '.ytReelChannelBarViewModelReelSubscribeButton',
    '#subscribe-button',
    '.ytFlexibleActionsViewModelAction',
].join(', ');
export const SUBSCRIBE_RENDERER_SELECTOR =
    'ytd-subscribe-button-renderer, yt-subscribe-button-view-model, ytd-subscribe-button-view-model';
export const DEFAULT_QUICK_ADD_LABEL = 'Add';
export const OVERLAY_CLASS = 'yt-commander-sub-manager-overlay';
export const MODAL_CLASS = 'yt-commander-sub-manager-modal';
export const CARDS_CLASS = 'yt-commander-sub-manager-cards';
export const BADGE_CLASS = 'yt-commander-sub-manager-badge';
export const BADGE_REMOVE_CLASS = 'yt-commander-sub-manager-badge-remove';
export const STATUS_CLASS = 'yt-commander-sub-manager-status';
export const PICKER_CLASS = 'yt-commander-sub-manager-picker';
export const FILTER_ITEM_CLASS = 'yt-commander-sub-manager-filter-item';
export const FILTER_DOT_CLASS = 'yt-commander-sub-manager-filter-dot';
export const FILTER_COUNT_CLASS = 'yt-commander-sub-manager-filter-count';
export const QUICK_ADD_CLASS = 'yt-commander-sub-manager-quick-add';
export const MODAL_VERSION = '2026-03-20-1';

export const CARD_ROW_HEIGHT_ESTIMATE = 312;
export const CARD_MIN_WIDTH = 260;
export const CARD_GAP = 14;
export const VIRTUAL_OVERSCAN = 6;
export const SNAPSHOT_TTL_MS = 30 * 60 * 1000;

export const ICONS = {
    plus: 'M11 5h2v14h-2zM5 11h14v2H5z',
    minus: 'M5 11h14v2H5z',
    categoryAdd:
        'M17.63 5.84 11.63 1.84C11.43 1.73 11.22 1.67 11 1.67H4C2.9 1.67 2 2.57 2 3.67v7c0 .53.21 1.04.59 1.41l6 6c.39.39.9.59 1.41.59s1.02-.2 1.41-.59l8.59-8.59c.38-.38.59-.9.59-1.41 0-.53-.21-1.04-.59-1.41l-2.38-2.34zM7 7.5C6.17 7.5 5.5 6.83 5.5 6S6.17 4.5 7 4.5 8.5 5.17 8.5 6 7.83 7.5 7 7.5zM15 10h2v2h2v2h-2v2h-2v-2h-2v-2h2z',
    categoryMove:
        'M17.63 5.84 11.63 1.84C11.43 1.73 11.22 1.67 11 1.67H4C2.9 1.67 2 2.57 2 3.67v7c0 .53.21 1.04.59 1.41l6 6c.39.39.9.59 1.41.59s1.02-.2 1.41-.59l8.59-8.59c.38-.38.59-.9.59-1.41 0-.53-.21-1.04-.59-1.41l-2.38-2.34zM7 7.5C6.17 7.5 5.5 6.83 5.5 6S6.17 4.5 7 4.5 8.5 5.17 8.5 6 7.83 7.5 7 7.5zM14 11h4.17l-1.59-1.59L18 8l4 4-4 4-1.41-1.41 1.59-1.59H14v-2z',
    check: 'M9 16.2 4.8 12 3.4 13.4 9 19 21 7 19.6 5.6z',
    close: 'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29 10.59 10.6 16.89 4.29z',
    trash: 'M6 7h12v2H6V7zm2 3h8v9H8v-9zm3-7h2l1 2H10l1-2z',
    sort: 'M3 6h10v2H3V6zm0 5h7v2H3v-2zm0 5h4v2H3v-2zm15-8v8h2V8h-2zm-3 3v5h2v-5h-2z',
    openNewTab:
        'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    collapse: 'M15.41 7.41 14 6 8 12 14 18 15.41 16.59 10.83 12z',
    expand: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
    prev: 'M15.41 7.41 14 6 8 12 14 18 15.41 16.59 10.83 12z',
    next: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
    chevronDown: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z',
    refresh: 'M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a5 5 0 1 1-5 5H5a7 7 0 1 0 12.65-5.65z',
};
