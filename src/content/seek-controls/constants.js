/**
 * Seek controls constants.
 */

export const SEEK_CONFIG = [
    { id: 'short', secondsKey: 'shortSeek', shortcutKey: 'shortSeekKey' },
    { id: 'medium', secondsKey: 'mediumSeek', shortcutKey: 'mediumSeekKey' },
    { id: 'long', secondsKey: 'longSeek', shortcutKey: 'longSeekKey' }
];

export const FLAT_SEEK_SETTING_KEYS = [
    'shortSeek',
    'mediumSeek',
    'longSeek',
    'shortSeekKey',
    'mediumSeekKey',
    'longSeekKey'
];

export const BUTTON_CONTAINER_CLASS = 'custom-seek-buttons';
export const BUTTON_CLASS = 'custom-seek-button';

export const BUTTON_WAIT_TIMEOUT_MS = 1200;
export const BUTTON_UPDATE_THROTTLE_MS = 650;
export const CONTROL_VISIBILITY_HOLD_MS = 1250;
