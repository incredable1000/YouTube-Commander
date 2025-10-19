/**
 * Shared Constants
 * Application-wide constants and configuration
 */

// Extension information
export const EXTENSION_NAME = 'YouTube Commander';
export const EXTENSION_PREFIX = '[YT-Commander]';

// Default settings
export const DEFAULT_SETTINGS = {
    // Seek controls
    shortSeek: 3,
    mediumSeek: 10,
    longSeek: 30,
    shortSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: true, shift: false, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' },
    
    // Quality controls
    maxQuality: 'hd1080',
    
    // Audio track controls
    autoSwitchToOriginal: true,
    
    // Backup reminders
    backupRemindersEnabled: true,
    
    // Debug settings
    debugMode: false,
    logLevel: 2 // INFO level
};

// Video quality levels in order of preference
export const QUALITY_LEVELS = [
    'highres',   // 4K
    'hd1440',    // 1440p
    'hd1080',    // 1080p
    'hd720',     // 720p
    'large',     // 480p
    'medium',    // 360p
    'small',     // 240p
    'tiny'       // 144p
];

// YouTube selectors (commonly used)
export const SELECTORS = {
    // Video and player
    VIDEO: 'video.html5-main-video',
    PLAYER: '.html5-video-player',
    MOVIE_PLAYER: '#movie_player',
    
    // Shorts
    SHORTS_RENDERER: 'ytd-reel-video-renderer',
    ACTIVE_SHORTS_RENDERER: 'ytd-reel-video-renderer[is-active]',
    SHORTS_VIDEO: 'ytd-shorts video.html5-main-video',
    SHORTS_PLAYER: 'ytd-shorts .html5-video-player',
    
    // Controls
    TIME_DURATION: '.ytp-time-duration',
    CONTROLS: '.ytp-chrome-controls',
    
    // Playlist
    PLAYLIST_VIDEO_RENDERER: 'ytd-playlist-video-renderer',
    PLAYLIST_THUMBNAIL: 'a#thumbnail',
    PLAYLIST_MENU: '#menu',
    
    // General
    BODY: 'body'
};

// Event names
export const EVENTS = {
    VIDEO_CHANGE: 'yt-commander-video-change',
    SETTINGS_CHANGE: 'yt-commander-settings-change',
    QUALITY_CHANGE: 'yt-commander-quality-change',
    AUDIO_TRACK_CHANGE: 'yt-commander-audio-track-change'
};

// Storage keys
export const STORAGE_KEYS = {
    SETTINGS: 'ytCommanderSettings',
    WATCHED_HISTORY: 'watchedHistory',
    BACKUP_REMINDER: 'backupRemindersEnabled',
    DEBUG_MODE: 'debugMode',
    LOG_LEVEL: 'logLevel'
};

// Timeouts and delays
export const TIMEOUTS = {
    PLAYER_READY: 10000,
    VIDEO_READY: 10000,
    ELEMENT_WAIT: 5000,
    MUTATION_THROTTLE: 1000,
    RETRY_DELAY: 500,
    MAX_RETRIES: 30
};

// CSS class names
export const CSS_CLASSES = {
    BUTTON: 'yt-commander-button',
    BUTTON_CONTAINER: 'yt-commander-button-container',
    INDICATOR: 'yt-commander-indicator',
    SEEK_INDICATOR: 'yt-commander-seek-indicator',
    ROTATION_INDICATOR: 'yt-commander-rotation-indicator',
    HIDDEN: 'yt-commander-hidden'
};

// Icons (SVG paths)
export const ICONS = {
    OPEN_NEW_TAB: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    ROTATION: 'M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z',
    FULL_WINDOW: 'M10 16h2v-4h4v-2h-6v6zm14-6h-6v2h4v4h2v-6zm-14 14v-6h2v4h4v2h-6zm14 0h-6v2h8v-8h-2v6z'
};

// Message types for communication
export const MESSAGE_TYPES = {
    OPEN_NEW_TAB: 'openNewTab',
    SET_QUALITY: 'SET_QUALITY',
    QUALITY_CHANGED: 'QUALITY_CHANGED',
    AUDIO_TRACK_CHANGED: 'AUDIO_TRACK_CHANGED'
};

// URLs and patterns
export const URL_PATTERNS = {
    WATCH: '/watch',
    SHORTS: '/shorts',
    PLAYLIST: '/playlist?'
};

// Performance monitoring
export const PERFORMANCE = {
    MARK_PREFIX: 'yt-commander-',
    MEASURE_PREFIX: 'yt-commander-measure-'
};
