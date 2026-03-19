/**
 * Shorts volume shortcuts (Ctrl + ArrowUp/ArrowDown).
 */

import { createLogger } from './utils/logger.js';
import { createKeyboardShortcut } from './utils/events.js';
import { getActiveShortsVideoElement, isShortsWatchPage } from './shorts-counter/pageContext.js';
import { getYouTubePlayer } from './utils/youtube.js';

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

    const player = getYouTubePlayer();
    if (player && typeof player.getVolume === 'function' && typeof player.setVolume === 'function') {
        const current = Number(player.getVolume());
        const safeCurrent = Number.isFinite(current) ? current : 0;
        const next = Math.min(100, Math.max(0, safeCurrent + direction * VOLUME_STEP_PERCENT));
        if (next === safeCurrent) {
            return;
        }

        player.setVolume(next);

        if (typeof player.isMuted === 'function') {
            if (next === 0) {
                if (!player.isMuted() && typeof player.mute === 'function') {
                    player.mute();
                }
            } else if (player.isMuted() && typeof player.unMute === 'function') {
                player.unMute();
            }
        }
        return;
    }

    const video = getActiveShortsVideoElement();
    if (!(video instanceof HTMLVideoElement)) {
        return;
    }

    const current = Number.isFinite(video.volume) ? video.volume : 0;
    const next = Math.min(1, Math.max(0, current + direction * (VOLUME_STEP_PERCENT / 100)));
    if (next === current) {
        return;
    }

    video.volume = next;

    if (next === 0) {
        video.muted = true;
    } else if (video.muted) {
        video.muted = false;
    }
}

export {
    initShortsVolumeShortcuts
};
