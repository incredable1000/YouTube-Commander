/**
 * Seek Controls
 * Optimized seek controls with YouTube-style overlay animation and resilient SPA handling.
 */

import { getActiveVideo, getActivePlayer } from './utils/youtube.js';
import { createLogger } from './utils/logger.js';
import { createKeyboardShortcut, createThrottledObserver } from './utils/events.js';
import { ensureAnimations } from './utils/ui.js';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants.js';
import {
    BUTTON_UPDATE_THROTTLE_MS,
    FLAT_SEEK_SETTING_KEYS,
    SEEK_CONFIG,
} from './seek-controls/constants.js';
import { clampSeconds, isPlainObject, normalizeSettings } from './seek-controls/settings.js';
import { createIndicatorState } from './seek-controls/indicatorDom.js';
import {
    applySeekTime,
    showPlayerSeekFeedback,
    syncProgressUiAfterSeek,
    showSeekIndicator,
    clearSeekIndicators,
} from './seek-controls/seek-actions.js';
import {
    createOrUpdateSeekButtons,
    removeSeekButtons,
    updateSeekButtons,
    scheduleEnsureButtons,
} from './seek-controls/seek-button.js';

const logger = createLogger('SeekControls');

let settings = normalizeSettings(DEFAULT_SETTINGS);
let isInitialized = false;
let initPromise = null;
let isEnabled = true;

let keyboardShortcuts = [];
let urlObserver = null;
let lastKnownUrl = location.href;
let runtimeCleanupCallbacks = [];
let storageChangeListener = null;
let buttonsContainer = null;
let buttonEnsureTimer = null;

const indicatorStates = {
    forward: createIndicatorState(),
    backward: createIndicatorState(),
};

async function initSeekControls() {
    if (isInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        logger.info('Initializing seek controls');

        ensureAnimations();
        await loadSettings();
        setupStorageListener();

        if (isEnabled) {
            setupKeyboardShortcuts();
            await createOrUpdateSeekButtons(settings, performSeek);
            startRuntimeTracking();
        }

        isInitialized = true;
        logger.info('Seek controls initialized successfully');
    })();

    try {
        await initPromise;
    } catch (error) {
        logger.error('Failed to initialize seek controls', error);
        throw error;
    } finally {
        initPromise = null;
    }
}

async function loadSettings() {
    try {
        const storageResult = await new Promise((resolve) => {
            try {
                chrome.storage.sync.get(
                    [STORAGE_KEYS.SETTINGS, ...FLAT_SEEK_SETTING_KEYS],
                    (result) => {
                        if (chrome.runtime?.lastError) {
                            logger.warn(
                                'Failed to read seek settings',
                                chrome.runtime.lastError.message
                            );
                            resolve({});
                            return;
                        }
                        resolve(result || {});
                    }
                );
            } catch (error) {
                logger.warn('Exception while reading seek settings', error);
                resolve({});
            }
        });

        const merged = {
            ...DEFAULT_SETTINGS,
            ...(isPlainObject(storageResult[STORAGE_KEYS.SETTINGS])
                ? storageResult[STORAGE_KEYS.SETTINGS]
                : {}),
        };

        FLAT_SEEK_SETTING_KEYS.forEach((key) => {
            if (storageResult[key] !== undefined) {
                merged[key] = storageResult[key];
            }
        });

        settings = normalizeSettings(merged);
        logger.debug('Seek settings loaded', settings);
    } catch (error) {
        logger.error('Failed to load seek settings', error);
        settings = normalizeSettings(DEFAULT_SETTINGS);
    }
}

function setupStorageListener() {
    if (storageChangeListener) {
        return;
    }

    storageChangeListener = (changes, areaName) => {
        if (areaName !== 'sync') {
            return;
        }

        const hasNestedChange = Boolean(changes[STORAGE_KEYS.SETTINGS]);
        const hasFlatChange = FLAT_SEEK_SETTING_KEYS.some((key) => Boolean(changes[key]));

        if (!hasNestedChange && !hasFlatChange) {
            return;
        }

        const next = { ...settings };

        if (hasNestedChange && isPlainObject(changes[STORAGE_KEYS.SETTINGS].newValue)) {
            Object.assign(next, changes[STORAGE_KEYS.SETTINGS].newValue);
        }

        FLAT_SEEK_SETTING_KEYS.forEach((key) => {
            if (changes[key]) {
                next[key] = changes[key].newValue;
            }
        });

        settings = normalizeSettings(next);
        logger.info('Seek settings updated from storage', settings);

        if (isEnabled) {
            setupKeyboardShortcuts();
            updateSeekButtons(settings);
            scheduleEnsureButtons(settings, performSeek);
        }
    };

    chrome.storage.onChanged.addListener(storageChangeListener);
}

function setupKeyboardShortcuts() {
    keyboardShortcuts.forEach((teardown) => teardown());
    keyboardShortcuts = [];

    SEEK_CONFIG.forEach((config) => {
        const seekSeconds = settings[config.secondsKey];
        const shortcut = settings[config.shortcutKey];

        if (!shortcut || !Number.isFinite(seekSeconds) || seekSeconds <= 0) {
            return;
        }

        const modifiers = {
            ctrl: Boolean(shortcut.ctrl),
            shift: Boolean(shortcut.shift),
            alt: Boolean(shortcut.alt),
        };

        const forwardCleanup = createKeyboardShortcut({ ...modifiers, key: 'ArrowRight' }, () =>
            performSeek(seekSeconds, 'forward')
        );

        const backwardCleanup = createKeyboardShortcut({ ...modifiers, key: 'ArrowLeft' }, () =>
            performSeek(seekSeconds, 'backward')
        );

        keyboardShortcuts.push(forwardCleanup, backwardCleanup);
    });

    logger.debug('Seek keyboard shortcuts active', keyboardShortcuts.length);
}

function performSeek(seconds, direction) {
    if (!isEnabled) {
        return;
    }

    const seekSeconds = clampSeconds(seconds, 1);
    const video = getActiveVideo();
    const player = getActivePlayer();

    if (!video) {
        logger.debug('No active video available for seek');
        return;
    }

    const currentTime = Number(video.currentTime) || 0;
    const delta = direction === 'forward' ? seekSeconds : -seekSeconds;

    let targetTime = currentTime + delta;

    if (Number.isFinite(video.duration) && video.duration > 0) {
        targetTime = Math.max(0, Math.min(video.duration, targetTime));
    } else {
        targetTime = Math.max(0, targetTime);
    }

    if (Math.abs(targetTime - currentTime) < 0.01) {
        return;
    }

    applySeekTime(video, targetTime);
    showPlayerSeekFeedback(player);
    syncProgressUiAfterSeek(video, player);
    showSeekIndicator(indicatorStates, direction, seekSeconds);

    logger.debug(
        `Seek ${direction} ${seekSeconds}s: ${currentTime.toFixed(2)} -> ${targetTime.toFixed(2)}`
    );
}

function startRuntimeTracking() {
    if (urlObserver || !document.body) {
        return;
    }

    const handlePageChange = () => {
        if (!isEnabled) {
            return;
        }

        if (location.href !== lastKnownUrl) {
            lastKnownUrl = location.href;
            clearSeekIndicators(indicatorStates);
        }

        createOrUpdateSeekButtons(settings, performSeek);
    };

    document.addEventListener('yt-navigate-finish', handlePageChange);
    window.addEventListener('popstate', handlePageChange);
    window.addEventListener('resize', handlePageChange, { passive: true });

    runtimeCleanupCallbacks.push(() =>
        document.removeEventListener('yt-navigate-finish', handlePageChange)
    );
    runtimeCleanupCallbacks.push(() => window.removeEventListener('popstate', handlePageChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('resize', handlePageChange));

    urlObserver = createThrottledObserver(() => {
        if (!isEnabled) {
            return;
        }

        const urlChanged = location.href !== lastKnownUrl;
        if (urlChanged) {
            lastKnownUrl = location.href;
            clearSeekIndicators(indicatorStates);
        }

        if (urlChanged || !buttonsContainer || !buttonsContainer.isConnected) {
            createOrUpdateSeekButtons(settings, performSeek);
        }
    }, BUTTON_UPDATE_THROTTLE_MS);

    urlObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function stopRuntimeTracking() {
    if (urlObserver) {
        urlObserver.disconnect();
        urlObserver = null;
    }

    while (runtimeCleanupCallbacks.length > 0) {
        const teardown = runtimeCleanupCallbacks.pop();
        teardown();
    }
}

function updateSettings(newSettings) {
    if (!isPlainObject(newSettings)) {
        return;
    }

    const merged = {
        ...settings,
        ...newSettings,
    };

    settings = normalizeSettings(merged);

    logger.info('Seek settings updated from popup', settings);

    if (isEnabled) {
        setupKeyboardShortcuts();
        updateSeekButtons(settings);
        scheduleEnsureButtons(settings, performSeek);
    }
}

function enable() {
    isEnabled = true;

    if (!isInitialized) {
        initSeekControls();
        return;
    }

    setupKeyboardShortcuts();
    startRuntimeTracking();
    createOrUpdateSeekButtons(settings, performSeek);
}

function disable() {
    isEnabled = false;

    keyboardShortcuts.forEach((teardown) => teardown());
    keyboardShortcuts = [];

    stopRuntimeTracking();
    removeSeekButtons();
    clearSeekIndicators(indicatorStates);
}

function cleanup() {
    disable();

    if (buttonEnsureTimer) {
        clearTimeout(buttonEnsureTimer);
        buttonEnsureTimer = null;
    }

    if (storageChangeListener) {
        chrome.storage.onChanged.removeListener(storageChangeListener);
        storageChangeListener = null;
    }

    isInitialized = false;
    initPromise = null;

    logger.info('Seek controls cleaned up');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSeekControls().catch((error) => {
            logger.error('Failed to initialize seek controls on DOMContentLoaded', error);
        });
    });
} else {
    initSeekControls().catch((error) => {
        logger.error('Failed to initialize seek controls', error);
    });
}

export { initSeekControls, performSeek, updateSettings, enable, disable, cleanup };
