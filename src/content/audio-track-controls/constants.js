/**
 * Constants for audio track controls.
 */

const AUDIO_MESSAGE_TYPES = {
    SETTINGS_UPDATED: 'YT_COMMANDER_AUDIO_SETTINGS'
};

const AUTO_SWITCH_DELAYS = {
    initial: 800,
    'yt-navigate': 650,
    'video-context-change': 300,
    play: 120,
    loadedmetadata: 120,
    canplay: 80,
    'shorts-scroll': 220,
    focus: 300,
    visibility: 220,
    fallback: 300
};

const RETRY_DELAYS_MS = [120, 250, 500, 900, 1500, 2300, 3200, 4500];

export {
    AUDIO_MESSAGE_TYPES,
    AUTO_SWITCH_DELAYS,
    RETRY_DELAYS_MS
};
