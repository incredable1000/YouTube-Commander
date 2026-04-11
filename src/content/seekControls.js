/**
 * Seek Controls
 * Optimized seek controls with YouTube-style overlay animation and resilient SPA handling.
 */

import {
    getActiveVideo,
    getActivePlayer,
    isVideoPage,
    isShortsPage
} from './utils/youtube.js';

import { createLogger } from './utils/logger.js';
import { createKeyboardShortcut, waitForElement, createThrottledObserver } from './utils/events.js';
import { ensureAnimations } from './utils/ui.js';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants.js';
import {
    BUTTON_CLASS,
    BUTTON_CONTAINER_CLASS,
    BUTTON_UPDATE_THROTTLE_MS,
    BUTTON_WAIT_TIMEOUT_MS,
    CONTROL_VISIBILITY_HOLD_MS,
    FLAT_SEEK_SETTING_KEYS,
    SEEK_CONFIG
} from './seek-controls/constants.js';
import {
    clampSeconds,
    isPlainObject,
    normalizeSettings
} from './seek-controls/settings.js';
import {
    triggerNativeSeekOverlay,
    clearNativeSeekOverlay
} from './seek-controls/indicatorDom.js';

const logger = createLogger('SeekControls');

let settings = normalizeSettings(DEFAULT_SETTINGS);
let isInitialized = false;
let initPromise = null;
let isEnabled = true;

let keyboardShortcuts = [];
let buttonsContainer = null;
let buttonEntries = [];

let urlObserver = null;
let lastKnownUrl = location.href;
let runtimeCleanupCallbacks = [];

let storageChangeListener = null;

let buttonUpdateInProgress = false;
let buttonUpdateRequested = false;
let buttonEnsureTimer = null;
let controlsVisibilityTimer = null;
let controlsVisibilityPlayer = null;
let controlsVisibilityRestoreAutohide = false;

/**
 * Initialize seek controls.
 */
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
            await createOrUpdateSeekButtons();
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

/**
 * Load seek settings from both nested and flat storage forms.
 */
async function loadSettings() {
    try {
        const storageResult = await new Promise((resolve) => {
            try {
                chrome.storage.sync.get([STORAGE_KEYS.SETTINGS, ...FLAT_SEEK_SETTING_KEYS], (result) => {
                    if (chrome.runtime?.lastError) {
                        logger.warn('Failed to read seek settings', chrome.runtime.lastError.message);
                        resolve({});
                        return;
                    }
                    resolve(result || {});
                });
            } catch (error) {
                logger.warn('Exception while reading seek settings', error);
                resolve({});
            }
        });

        const merged = {
            ...DEFAULT_SETTINGS,
            ...(isPlainObject(storageResult[STORAGE_KEYS.SETTINGS]) ? storageResult[STORAGE_KEYS.SETTINGS] : {})
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

/**
 * Listen for seek-related storage changes.
 */
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
            updateSeekButtons();
            scheduleEnsureButtons();
        }
    };

    chrome.storage.onChanged.addListener(storageChangeListener);
}

/**
 * Build keyboard shortcuts for configured seek durations.
 */
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
            alt: Boolean(shortcut.alt)
        };

        const forwardCleanup = createKeyboardShortcut(
            { ...modifiers, key: 'ArrowRight' },
            () => performSeek(seekSeconds, 'forward')
        );

        const backwardCleanup = createKeyboardShortcut(
            { ...modifiers, key: 'ArrowLeft' },
            () => performSeek(seekSeconds, 'backward')
        );

        keyboardShortcuts.push(forwardCleanup, backwardCleanup);
    });

    logger.debug('Seek keyboard shortcuts active', keyboardShortcuts.length);
}

/**
 * Try multiple seek paths (player API first, then video element fallback).
 * @param {HTMLVideoElement} video
 * @param {number} targetTime
 */
function applySeekTime(video, targetTime) {
    const safeTarget = Number.isFinite(targetTime) ? Math.max(0, targetTime) : 0;
    const moviePlayer = document.getElementById('movie_player');

    if (moviePlayer && typeof moviePlayer.seekTo === 'function') {
        try {
            moviePlayer.seekTo(safeTarget, true);
            return;
        } catch (error) {
            logger.debug('movie_player.seekTo failed, falling back to video.currentTime', error);
        }
    }

    video.currentTime = safeTarget;
}

/**
 * Wake native YouTube control visibility without forcing custom chrome styling.
 * @param {HTMLElement|null} player
 */
function showPlayerSeekFeedback(player) {
    if (!(player instanceof HTMLElement)) {
        return;
    }

    const moviePlayer = document.getElementById('movie_player');
    const controlsRoot = moviePlayer instanceof HTMLElement ? moviePlayer : player;
    const hadAutohide = controlsRoot.classList.contains('ytp-autohide');

    if (controlsVisibilityPlayer !== controlsRoot) {
        controlsVisibilityRestoreAutohide = hadAutohide;
    } else {
        controlsVisibilityRestoreAutohide = controlsVisibilityRestoreAutohide || hadAutohide;
    }

    controlsVisibilityPlayer = controlsRoot;
    controlsRoot.classList.remove('ytp-autohide');

    if (controlsVisibilityTimer) {
        clearTimeout(controlsVisibilityTimer);
        controlsVisibilityTimer = null;
    }

    controlsVisibilityTimer = setTimeout(() => {
        const root = controlsVisibilityPlayer;
        if (root instanceof HTMLElement) {
            const video = getActiveVideo();
            const keepVisible = root.matches(':hover')
                || (video instanceof HTMLVideoElement && (video.paused || video.ended));

            if (controlsVisibilityRestoreAutohide && !keepVisible) {
                root.classList.add('ytp-autohide');
            }
        }

        controlsVisibilityPlayer = null;
        controlsVisibilityRestoreAutohide = false;
        controlsVisibilityTimer = null;
    }, CONTROL_VISIBILITY_HOLD_MS);

    const targets = [
        controlsRoot,
        controlsRoot.querySelector('.ytp-chrome-bottom'),
        controlsRoot.querySelector('.ytp-progress-bar-container')
    ].filter((node) => node instanceof HTMLElement);

    const playerRect = player.getBoundingClientRect();
    const baseEvent = {
        bubbles: true,
        cancelable: true,
        clientX: playerRect.left + (playerRect.width * 0.5),
        clientY: playerRect.top + (playerRect.height * 0.86)
    };

    targets.forEach((target) => {
        ['mousemove', 'mouseover', 'mouseenter'].forEach((eventName) => {
            try {
                target.dispatchEvent(new MouseEvent(eventName, baseEvent));
            } catch (_error) {
                // no-op
            }
        });
    });

    const controlApis = [moviePlayer, player].filter((node) => Boolean(node));
    controlApis.forEach((api) => {
        ['showControls', 'showControlsForAWhile_', 'showControls_', 'wakeUpControls'].forEach((methodName) => {
            const method = api[methodName];
            if (typeof method === 'function') {
                try {
                    method.call(api);
                } catch (_error) {
                    // no-op
                }
            }
        });
    });
}

/**
 * Force progress/timer UI refresh after programmatic seek.
 * @param {HTMLVideoElement} video
 * @param {HTMLElement|null} player
 */
function syncProgressUiAfterSeek(video, player) {
    if (!(video instanceof HTMLVideoElement)) {
        return;
    }

    const moviePlayer = document.getElementById('movie_player');
    const controlsRoot = moviePlayer instanceof HTMLElement
        ? moviePlayer
        : (player instanceof HTMLElement ? player : null);
    const progressContainer = controlsRoot?.querySelector('.ytp-progress-bar-container') || null;

    const emitVideoEvents = () => {
        try {
            video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
            video.dispatchEvent(new Event('seeked', { bubbles: true }));
        } catch (_error) {
            // no-op
        }
    };

    const triggerApiRefresh = () => {
        [moviePlayer, player].forEach((api) => {
            if (!api) {
                return;
            }

            ['updateProgressBar_', 'updateProgressBar', 'updateTimeDisplay_', 'updateTimeDisplay'].forEach((methodName) => {
                const method = api[methodName];
                if (typeof method === 'function') {
                    try {
                        method.call(api);
                    } catch (_error) {
                        // no-op
                    }
                }
            });
        });
    };

    const nudgeProgressLayer = () => {
        if (!(progressContainer instanceof HTMLElement)) {
            return;
        }

        const rect = progressContainer.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        const duration = Number(video.duration) || 0;
        const ratio = duration > 0 ? Math.max(0, Math.min(1, video.currentTime / duration)) : 0.5;
        const clientX = rect.left + (rect.width * ratio);
        const clientY = rect.top + (rect.height * 0.5);

        try {
            progressContainer.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY
            }));
        } catch (_error) {
            // no-op
        }
    };

    emitVideoEvents();
    triggerApiRefresh();
    window.requestAnimationFrame(() => {
        emitVideoEvents();
        triggerApiRefresh();
        nudgeProgressLayer();
    });
}

/**
 * Seek active video and trigger indicator.
 * @param {number} seconds
 * @param {'forward'|'backward'} direction
 */
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
    showSeekIndicator(direction, seekSeconds, currentTime);

    logger.debug(`Seek ${direction} ${seekSeconds}s: ${currentTime.toFixed(2)} -> ${targetTime.toFixed(2)}`);
}

/**
 * Show YouTube-like seek indicator using native overlay.
 * @param {'forward'|'backward'} direction
 * @param {number} seconds
 * @param {number} currentTime
 */
function showSeekIndicator(direction, seconds, currentTime) {
    if (!isEnabled || isShortsPage()) {
        return;
    }

    triggerNativeSeekOverlay(seconds, direction, currentTime);
}

/**
 * Remove all active seek indicators immediately.
 */
function clearSeekIndicators() {
    clearNativeSeekOverlay();

    if (controlsVisibilityTimer) {
        clearTimeout(controlsVisibilityTimer);
        controlsVisibilityTimer = null;
    }

    controlsVisibilityPlayer = null;
    controlsVisibilityRestoreAutohide = false;
}

/**
 * Ensure seek buttons exist and are updated for current player controls.
 */
async function createOrUpdateSeekButtons() {
    if (!isEnabled) {
        return;
    }

    if (buttonUpdateInProgress) {
        buttonUpdateRequested = true;
        return;
    }

    buttonUpdateInProgress = true;

    try {
        if (!isVideoPage() || isShortsPage()) {
            removeSeekButtons();
            return;
        }

        let totalTime = document.querySelector('.ytp-time-duration');
        if (!totalTime) {
            try {
                totalTime = await waitForElement('.ytp-time-duration', BUTTON_WAIT_TIMEOUT_MS);
            } catch (_error) {
                return;
            }
        }

        const mountPoint = resolveSeekButtonsMountPoint(totalTime);
        if (!mountPoint) {
            return;
        }

        const { parent, anchor } = mountPoint;
        const desiredSibling = anchor.nextSibling;

        if (!buttonsContainer || !buttonsContainer.isConnected) {
            removeSeekButtons();
            buttonsContainer = buildSeekButtonsContainer();
        }

        if (buttonsContainer.parentElement !== parent || buttonsContainer.previousSibling !== anchor) {
            parent.insertBefore(buttonsContainer, desiredSibling);
        }

        updateSeekButtons();
        buttonsContainer.style.display = '';
    } catch (error) {
        logger.debug('Failed to create or update seek buttons', error);
    } finally {
        buttonUpdateInProgress = false;

        if (buttonUpdateRequested) {
            buttonUpdateRequested = false;
            createOrUpdateSeekButtons();
        }
    }
}

/**
 * Resolve parent + anchor where seek controls should be inserted.
 * We place the controls beside the time display, not inside it.
 * @param {Element} totalTimeElement
 * @returns {{ parent: Element, anchor: Element }|null}
 */
function resolveSeekButtonsMountPoint(totalTimeElement) {
    if (!totalTimeElement) {
        return null;
    }

    const timeDisplay = totalTimeElement.closest('.ytp-time-display') || totalTimeElement.parentElement;
    if (!timeDisplay || !timeDisplay.parentElement) {
        return null;
    }

    return {
        parent: timeDisplay.parentElement,
        anchor: timeDisplay
    };
}

/**
 * Build seek buttons container.
 * @returns {HTMLDivElement}
 */
function buildSeekButtonsContainer() {
    const container = document.createElement('div');
    container.className = BUTTON_CONTAINER_CLASS;

    buttonEntries = [];

    SEEK_CONFIG.forEach((config) => {
        const backwardButton = createSeekButton(config.secondsKey, 'backward');
        const forwardButton = createSeekButton(config.secondsKey, 'forward');

        container.appendChild(backwardButton);
        container.appendChild(forwardButton);
    });

    return container;
}

/**
 * Create a single seek button.
 * @param {string} secondsKey
 * @param {'forward'|'backward'} direction
 * @returns {HTMLButtonElement}
 */
function createSeekButton(secondsKey, direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${BUTTON_CLASS} ${direction}`;
    button.dataset.secondsKey = secondsKey;
    button.dataset.direction = direction;

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const key = button.dataset.secondsKey;
        const buttonDirection = button.dataset.direction === 'backward' ? 'backward' : 'forward';
        const seconds = Number(settings[key]) || DEFAULT_SETTINGS.shortSeek;

        performSeek(seconds, buttonDirection);
    });

    buttonEntries.push(button);
    return button;
}

/**
 * Refresh seek button labels and tooltips.
 */
function updateSeekButtons() {
    buttonEntries.forEach((button) => {
        const secondsKey = button.dataset.secondsKey;
        const direction = button.dataset.direction === 'backward' ? 'backward' : 'forward';

        const seconds = Number(settings[secondsKey]) || DEFAULT_SETTINGS.shortSeek;
        button.textContent = String(seconds);
        button.title = `Seek ${direction} ${seconds} seconds`;
    });
}

/**
 * Remove seek buttons from DOM.
 */
function removeSeekButtons() {
    if (buttonsContainer) {
        buttonsContainer.remove();
    }

    buttonsContainer = null;
    buttonEntries = [];
}

/**
 * Throttled trigger for button re-check.
 */
function scheduleEnsureButtons() {
    if (buttonEnsureTimer) {
        return;
    }

    buttonEnsureTimer = setTimeout(() => {
        buttonEnsureTimer = null;
        createOrUpdateSeekButtons();
    }, 140);
}

/**
 * Start observing YouTube SPA/player control changes.
 */
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
            clearSeekIndicators();
        }

        createOrUpdateSeekButtons();
    };

    document.addEventListener('yt-navigate-finish', handlePageChange);
    window.addEventListener('popstate', handlePageChange);
    window.addEventListener('resize', handlePageChange, { passive: true });

    runtimeCleanupCallbacks.push(() => document.removeEventListener('yt-navigate-finish', handlePageChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('popstate', handlePageChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('resize', handlePageChange));

    urlObserver = createThrottledObserver(() => {
        if (!isEnabled) {
            return;
        }

        const urlChanged = location.href !== lastKnownUrl;
        if (urlChanged) {
            lastKnownUrl = location.href;
            clearSeekIndicators();
        }

        if (urlChanged || !buttonsContainer || !buttonsContainer.isConnected) {
            createOrUpdateSeekButtons();
        }
    }, BUTTON_UPDATE_THROTTLE_MS);

    urlObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Stop observing runtime changes.
 */
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

/**
 * Update seek settings from popup.
 * @param {object} newSettings
 */
function updateSettings(newSettings) {
    if (!isPlainObject(newSettings)) {
        return;
    }

    const merged = {
        ...settings,
        ...newSettings
    };

    settings = normalizeSettings(merged);

    logger.info('Seek settings updated from popup', settings);

    if (isEnabled) {
        setupKeyboardShortcuts();
        updateSeekButtons();
        scheduleEnsureButtons();
    }
}

/**
 * Enable seek controls.
 */
function enable() {
    isEnabled = true;

    if (!isInitialized) {
        initSeekControls();
        return;
    }

    setupKeyboardShortcuts();
    startRuntimeTracking();
    createOrUpdateSeekButtons();
}

/**
 * Disable seek controls.
 */
function disable() {
    isEnabled = false;

    keyboardShortcuts.forEach((teardown) => teardown());
    keyboardShortcuts = [];

    stopRuntimeTracking();
    removeSeekButtons();
    clearSeekIndicators();
}

/**
 * Cleanup all resources used by seek controls.
 */
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

export {
    initSeekControls,
    performSeek,
    updateSettings,
    enable,
    disable,
    cleanup
};
