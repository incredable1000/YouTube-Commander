/**
 * Windowed fullscreen constants.
 */

export const BUTTON_ID = 'yt-commander-windowed-fullscreen-button';
export const BUTTON_CLASS = 'ytp-button yt-commander-fullwindow-button';
export const BUTTON_ACTIVE_CLASS = 'is-active';
export const PLAYER_ACTIVE_CLASS = 'yt-commander-windowed-player';
export const OVERLAY_CLASS = 'yt-commander-windowed-overlay';
export const ROOT_LOCK_CLASS = 'yt-commander-windowed-lock';
export const RESTORE_ANCHOR_CLASS = 'yt-commander-windowed-anchor';
export const OBSERVER_THROTTLE_MS = 650;
export const BUTTON_ENSURE_INTERVAL_MS = 1200;
export const WINDOWED_ICON_PATH = 'M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5zm10 7h-3v2h5v-5h-2v3zm0-12V5h-3v2h3v3h2V5z';
export const RELAYOUT_DELAYS_MS = [0, 60, 180];
export const DEFAULT_WINDOWED_SHORTCUT = 'Enter';
export const AUTO_WINDOWED_WARMUP_MS = 1200;
export const RESTORE_RETRY_MAX_ATTEMPTS = 12;
export const RESTORE_RETRY_DELAY_MS = 120;
export const FALLBACK_PLAYER_MOUNT_SELECTORS = [
    'ytd-watch-flexy #player-container #player',
    'ytd-watch-flexy #player-full-bleed-container #player',
    'ytd-watch-flexy #primary #player',
    'ytd-watch-flexy #player',
    '#primary #player'
];
