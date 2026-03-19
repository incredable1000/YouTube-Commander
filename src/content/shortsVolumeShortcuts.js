/**
 * Shorts volume shortcuts (Ctrl + ArrowUp/ArrowDown).
 */

import { createLogger } from './utils/logger.js';
import { createKeyboardShortcut } from './utils/events.js';
import { isShortsWatchPage } from './shorts-counter/pageContext.js';
import { MESSAGE_TYPES } from '../shared/constants.js';

const logger = createLogger('ShortsVolumeShortcuts');

const VOLUME_STEP_PERCENT = 5;
const VOLUME_UP_SHORTCUT = { ctrl: true, shift: false, alt: false, key: 'ArrowUp' };
const VOLUME_DOWN_SHORTCUT = { ctrl: true, shift: false, alt: false, key: 'ArrowDown' };

let isInitialized = false;
let initPromise = null;
let shortcutCleanups = [];

/**
 * Initialize Shorts volume keyboard shortcuts.
 */
async function initShortsVolumeShortcuts() {
    if (isInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        logger.info('Initializing Shorts volume shortcuts');
        setupShortcuts();
        isInitialized = true;
        logger.info('Shorts volume shortcuts initialized');
    })();

    try {
        await initPromise;
    } catch (error) {
        logger.error('Failed to initialize Shorts volume shortcuts', error);
        throw error;
    } finally {
        initPromise = null;
    }
}

function setupShortcuts() {
    shortcutCleanups.forEach((cleanup) => cleanup());
    shortcutCleanups = [];

    shortcutCleanups.push(
        createKeyboardShortcut(VOLUME_UP_SHORTCUT, () => {
            adjustVolume(1);
        })
    );

    shortcutCleanups.push(
        createKeyboardShortcut(VOLUME_DOWN_SHORTCUT, () => {
            adjustVolume(-1);
        })
    );
}

function adjustVolume(direction) {
    if (!isShortsWatchPage()) {
        return;
    }

    window.postMessage({
        type: MESSAGE_TYPES.VOLUME_STEP,
        delta: direction * VOLUME_STEP_PERCENT
    }, '*');
}

export {
    initShortsVolumeShortcuts
};
