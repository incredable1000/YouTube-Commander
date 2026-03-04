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

const logger = createLogger('SeekControls');

const SEEK_CONFIG = [
    { id: 'short', secondsKey: 'shortSeek', shortcutKey: 'shortSeekKey' },
    { id: 'medium', secondsKey: 'mediumSeek', shortcutKey: 'mediumSeekKey' },
    { id: 'long', secondsKey: 'longSeek', shortcutKey: 'longSeekKey' }
];

const FLAT_SEEK_SETTING_KEYS = [
    'shortSeek',
    'mediumSeek',
    'longSeek',
    'shortSeekKey',
    'mediumSeekKey',
    'longSeekKey'
];

const BUTTON_CONTAINER_CLASS = 'custom-seek-buttons';
const BUTTON_CLASS = 'custom-seek-button';

const BUTTON_WAIT_TIMEOUT_MS = 1200;
const BUTTON_UPDATE_THROTTLE_MS = 650;
const INDICATOR_HIDE_DELAY_MS = 900;
const INDICATOR_REMOVE_DELAY_MS = 220;

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

const indicatorStates = {
    forward: createIndicatorState(),
    backward: createIndicatorState()
};

function createIndicatorState() {
    return {
        element: null,
        player: null,
        totalSeconds: 0,
        hideTimer: null,
        removeTimer: null
    };
}

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

    video.currentTime = targetTime;
    showSeekIndicator(direction, seekSeconds);

    logger.debug(`Seek ${direction} ${seekSeconds}s: ${currentTime.toFixed(2)} -> ${targetTime.toFixed(2)}`);
}

/**
 * Show YouTube-like seek indicator and accumulate repeated seeks.
 * @param {'forward'|'backward'} direction
 * @param {number} seconds
 */
function showSeekIndicator(direction, seconds) {
    if (!isEnabled || isShortsPage()) {
        return;
    }

    const player = getActivePlayer();
    if (!player) {
        return;
    }

    const state = indicatorStates[direction];

    if (state.removeTimer) {
        clearTimeout(state.removeTimer);
        state.removeTimer = null;
    }

    if (!state.element || !state.element.isConnected || state.player !== player) {
        if (state.element && state.element.parentNode) {
            state.element.remove();
        }

        state.element = createIndicatorElement(direction);
        state.player = player;
        state.totalSeconds = 0;

        player.appendChild(state.element);
    }

    state.totalSeconds += seconds;
    updateIndicatorElement(state.element, direction, state.totalSeconds);

    state.element.classList.remove('is-active', 'is-boosted');
    void state.element.offsetWidth;
    state.element.classList.add('is-active');

    if (state.totalSeconds > seconds) {
        state.element.classList.add('is-boosted');
    }

    if (state.hideTimer) {
        clearTimeout(state.hideTimer);
    }

    state.hideTimer = setTimeout(() => {
        hideSeekIndicator(direction);
    }, INDICATOR_HIDE_DELAY_MS);
}

/**
 * Create indicator DOM structure.
 * @param {'forward'|'backward'} direction
 * @returns {HTMLDivElement}
 */
function createIndicatorElement(direction) {
    const root = document.createElement('div');
    root.className = `modern-seek-indicator ${direction}`;

    const scrim = document.createElement('div');
    scrim.className = 'modern-seek-indicator__scrim';

    const content = document.createElement('div');
    content.className = 'modern-seek-indicator__content';

    const chevrons = document.createElement('div');
    chevrons.className = 'modern-seek-indicator__chevrons';

    for (let i = 0; i < 3; i += 1) {
        const chevron = document.createElement('span');
        chevron.className = 'modern-seek-indicator__chevron';
        chevrons.appendChild(chevron);
    }

    const amount = document.createElement('div');
    amount.className = 'modern-seek-indicator__amount';

    const label = document.createElement('div');
    label.className = 'modern-seek-indicator__label';
    label.textContent = 'seconds';

    content.appendChild(chevrons);
    content.appendChild(amount);
    content.appendChild(label);

    root.appendChild(scrim);
    root.appendChild(content);

    updateIndicatorElement(root, direction, 0);

    return root;
}

/**
 * Update indicator label text.
 * @param {HTMLDivElement} element
 * @param {'forward'|'backward'} direction
 * @param {number} totalSeconds
 */
function updateIndicatorElement(element, direction, totalSeconds) {
    const amount = element.querySelector('.modern-seek-indicator__amount');
    if (!amount) {
        return;
    }

    const prefix = direction === 'forward' ? '+' : '-';
    amount.textContent = `${prefix}${totalSeconds}`;
}

/**
 * Hide indicator and reset accumulated state.
 * @param {'forward'|'backward'} direction
 */
function hideSeekIndicator(direction) {
    const state = indicatorStates[direction];

    if (!state.element) {
        state.totalSeconds = 0;
        return;
    }

    state.element.classList.remove('is-active', 'is-boosted');

    if (state.hideTimer) {
        clearTimeout(state.hideTimer);
        state.hideTimer = null;
    }

    state.removeTimer = setTimeout(() => {
        if (state.element && state.element.parentNode) {
            state.element.remove();
        }

        state.element = null;
        state.player = null;
        state.totalSeconds = 0;
        state.removeTimer = null;
    }, INDICATOR_REMOVE_DELAY_MS);
}

/**
 * Remove all active seek indicators immediately.
 */
function clearSeekIndicators() {
    ['forward', 'backward'].forEach((direction) => {
        const state = indicatorStates[direction];

        if (state.hideTimer) {
            clearTimeout(state.hideTimer);
            state.hideTimer = null;
        }

        if (state.removeTimer) {
            clearTimeout(state.removeTimer);
            state.removeTimer = null;
        }

        if (state.element && state.element.parentNode) {
            state.element.remove();
        }

        state.element = null;
        state.player = null;
        state.totalSeconds = 0;
    });
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

        const host = totalTime?.parentElement;
        if (!host) {
            return;
        }

        if (!buttonsContainer || !buttonsContainer.isConnected || buttonsContainer.parentElement !== host) {
            removeSeekButtons();
            buttonsContainer = buildSeekButtonsContainer();
            host.appendChild(buttonsContainer);
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

/**
 * Normalize settings with safe defaults.
 * @param {object} source
 * @returns {object}
 */
function normalizeSettings(source) {
    const safe = isPlainObject(source) ? source : {};

    return {
        ...DEFAULT_SETTINGS,
        shortSeek: clampSeconds(safe.shortSeek, DEFAULT_SETTINGS.shortSeek),
        mediumSeek: clampSeconds(safe.mediumSeek, DEFAULT_SETTINGS.mediumSeek),
        longSeek: clampSeconds(safe.longSeek, DEFAULT_SETTINGS.longSeek),
        shortSeekKey: normalizeShortcut(safe.shortSeekKey, DEFAULT_SETTINGS.shortSeekKey),
        mediumSeekKey: normalizeShortcut(safe.mediumSeekKey, DEFAULT_SETTINGS.mediumSeekKey),
        longSeekKey: normalizeShortcut(safe.longSeekKey, DEFAULT_SETTINGS.longSeekKey)
    };
}

/**
 * Normalize shortcut shape.
 * @param {any} value
 * @param {object} fallback
 * @returns {{ctrl: boolean, shift: boolean, alt: boolean, key: string}}
 */
function normalizeShortcut(value, fallback) {
    const source = isPlainObject(value) ? value : {};

    return {
        ctrl: Boolean(source.ctrl ?? fallback.ctrl ?? false),
        shift: Boolean(source.shift ?? fallback.shift ?? false),
        alt: Boolean(source.alt ?? fallback.alt ?? false),
        key: typeof source.key === 'string' && source.key.length > 0
            ? source.key
            : (fallback.key || 'ArrowRight')
    };
}

/**
 * Clamp seek seconds to a safe range.
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function clampSeconds(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(600, Math.max(1, parsed));
}

/**
 * Check plain object.
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
