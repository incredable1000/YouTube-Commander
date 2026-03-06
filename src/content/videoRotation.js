/**
 * Video Rotation
 * Lightweight and resilient rotation controls for YouTube watch/shorts players.
 */

import {
    getActiveVideo,
    getActivePlayer,
    getCurrentVideoId,
    isVideoPage,
    isShortsPage
} from './utils/youtube.js';

import { createLogger } from './utils/logger.js';
import { createKeyboardShortcut, createThrottledObserver } from './utils/events.js';
import { createRotationIndicator, showIndicatorOnPlayer } from './utils/ui.js';
import { ICONS } from '../shared/constants.js';

const logger = createLogger('VideoRotation');

const ROTATION_ANGLES = [0, 90, 180, 270];
const STORAGE_KEY = 'ytCommanderVideoRotations';
const STORAGE_WRITE_DEBOUNCE_MS = 280;
const OBSERVER_THROTTLE_MS = 650;
const DEFAULT_ROTATION_SHORTCUT = 'r';

let isInitialized = false;
let initPromise = null;
let isEnabled = true;
let rotationShortcut = DEFAULT_ROTATION_SHORTCUT;

let rotationButton = null;
let keyboardShortcuts = [];
let domObserver = null;
let runtimeCleanupCallbacks = [];

let activeVideo = null;
let activeVideoId = null;
let currentRotation = 0;

let rotationMap = new Map();
let storageWriteTimer = null;

/**
 * Initialize rotation feature.
 */
async function initVideoRotation() {
    if (isInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        logger.info('Initializing video rotation');

        await loadRotationMap();

        if (isEnabled) {
            setupKeyboardShortcuts();
            startRuntimeTracking();
            await ensureRotationControls();
            syncActiveVideoContext();
        }

        isInitialized = true;
        logger.info('Video rotation initialized successfully');
    })();

    try {
        await initPromise;
    } catch (error) {
        logger.error('Failed to initialize video rotation', error);
        throw error;
    } finally {
        initPromise = null;
    }
}

/**
 * Load stored per-video rotation state.
 */
async function loadRotationMap() {
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY], (data) => {
                if (chrome.runtime?.lastError) {
                    logger.warn('Failed to load rotation map', chrome.runtime.lastError.message);
                    resolve({});
                    return;
                }
                resolve(data || {});
            });
        });

        const raw = result[STORAGE_KEY];
        rotationMap = new Map();

        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            Object.entries(raw).forEach(([videoId, angle]) => {
                if (isValidVideoId(videoId)) {
                    const normalized = normalizeAngle(Number(angle));
                    if (normalized !== 0) {
                        rotationMap.set(videoId, normalized);
                    }
                }
            });
        }

        logger.debug('Rotation map loaded', { entries: rotationMap.size });
    } catch (error) {
        logger.warn('Exception while loading rotation map', error);
        rotationMap = new Map();
    }
}

/**
 * Debounced write of rotation state to local storage.
 */
function scheduleRotationMapPersist() {
    if (storageWriteTimer) {
        return;
    }

    storageWriteTimer = setTimeout(() => {
        storageWriteTimer = null;

        const serialized = Object.fromEntries(rotationMap.entries());
        chrome.storage.local.set({ [STORAGE_KEY]: serialized }, () => {
            if (chrome.runtime?.lastError) {
                logger.warn('Failed to persist rotation map', chrome.runtime.lastError.message);
            }
        });
    }, STORAGE_WRITE_DEBOUNCE_MS);
}

/**
 * Ensure rotation button exists on player controls.
 */
async function ensureRotationControls() {
    if (!isEnabled || (!isVideoPage() && !isShortsPage())) {
        removeRotationButton();
        return;
    }

    const controlsHost = findControlsHost();
    if (!controlsHost) {
        return;
    }

    if (!rotationButton || !rotationButton.isConnected) {
        rotationButton = createRotationButton();
    }

    if (rotationButton.parentElement !== controlsHost) {
        controlsHost.insertBefore(rotationButton, controlsHost.firstChild);
    }
}

/**
 * Find the right-side player controls container.
 * @returns {Element|null}
 */
function findControlsHost() {
    const player = getActivePlayer();
    if (!player) {
        return null;
    }

    return player.querySelector('.ytp-right-controls') || null;
}

/**
 * Build rotation button element.
 * @returns {HTMLButtonElement}
 */
function createRotationButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ytp-button custom-rotation-button';
    button.title = 'Rotate video 90°';
    button.setAttribute('aria-label', 'Rotate video 90 degrees');

    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.setAttribute('width', '24');
    svgIcon.setAttribute('height', '24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS.ROTATION);

    svgIcon.appendChild(path);
    button.appendChild(svgIcon);

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        rotateVideo();
    });

    return button;
}

/**
 * Sync active video context and apply stored angle for this video.
 */
function syncActiveVideoContext(forceReapply = false) {
    const nextVideo = getActiveVideo();
    const nextVideoId = getActiveVideoId();

    if (nextVideo === activeVideo && nextVideoId === activeVideoId) {
        if (forceReapply && activeVideo) {
            applyVideoRotation(activeVideo, currentRotation);
        }
        return;
    }

    if (activeVideo && activeVideo !== nextVideo) {
        clearVideoRotation(activeVideo);
    }

    activeVideo = nextVideo;
    activeVideoId = nextVideoId;

    if (!activeVideo) {
        currentRotation = 0;
        return;
    }

    currentRotation = activeVideoId ? (rotationMap.get(activeVideoId) || 0) : 0;
    applyVideoRotation(activeVideo, currentRotation);
}

/**
 * Rotate active video to next angle.
 */
function rotateVideo() {
    if (!isEnabled) {
        return;
    }

    syncActiveVideoContext();

    if (!activeVideo) {
        logger.debug('No active video available for rotation');
        return;
    }

    const currentIndex = ROTATION_ANGLES.indexOf(currentRotation);
    const nextIndex = (currentIndex + 1) % ROTATION_ANGLES.length;

    currentRotation = ROTATION_ANGLES[nextIndex];
    applyVideoRotation(activeVideo, currentRotation);
    persistCurrentVideoRotation();
    showRotationIndicator();

    logger.debug(`Video rotated to ${currentRotation}°`);
}

/**
 * Reset active video rotation to 0°.
 */
function resetRotation() {
    if (!isEnabled) {
        return;
    }

    syncActiveVideoContext();

    if (!activeVideo) {
        return;
    }

    currentRotation = 0;
    applyVideoRotation(activeVideo, 0);
    persistCurrentVideoRotation();
    showRotationIndicator();
}

/**
 * Apply rotation style using CSS rotate property.
 * @param {HTMLVideoElement} video
 * @param {number} angle
 */
function applyVideoRotation(video, angle) {
    if (!video) {
        return;
    }

    const normalized = normalizeAngle(angle);

    if (normalized === 0) {
        clearVideoRotation(video);
        return;
    }

    const scale = computeFitScale(video, normalized);

    video.classList.add('yt-commander-rotatable');
    video.style.transformOrigin = 'center center';
    video.style.transform = `rotate(${normalized}deg) scale(${scale})`;
}

/**
 * Clear rotation style.
 * @param {HTMLVideoElement} video
 */
function clearVideoRotation(video) {
    if (!video) {
        return;
    }

    video.style.transform = '';
    video.style.transformOrigin = '';
    video.classList.remove('yt-commander-rotatable');
}

/**
 * Compute scale factor to keep 90°/270° rotated video inside player bounds.
 * @param {HTMLVideoElement} video
 * @param {number} angle
 * @returns {number}
 */
function computeFitScale(video, angle) {
    if (angle !== 90 && angle !== 270) {
        return 1;
    }

    const width = video.clientWidth || video.videoWidth || 0;
    const height = video.clientHeight || video.videoHeight || 0;

    if (width <= 0 || height <= 0) {
        return 1;
    }

    const player = getActivePlayer();
    const playerRect = player ? player.getBoundingClientRect() : null;
    const playerWidth = playerRect?.width || width;
    const playerHeight = playerRect?.height || height;

    if (playerWidth <= 0 || playerHeight <= 0) {
        return 1;
    }

    const rotatedWidth = height;
    const rotatedHeight = width;

    const widthScale = playerWidth / rotatedWidth;
    const heightScale = playerHeight / rotatedHeight;
    const scale = Math.min(widthScale, heightScale);

    if (!Number.isFinite(scale) || scale <= 0) {
        return 1;
    }

    return scale;
}

/**
 * Persist rotation value for current video id.
 */
function persistCurrentVideoRotation() {
    if (!activeVideoId) {
        return;
    }

    if (currentRotation === 0) {
        rotationMap.delete(activeVideoId);
    } else {
        rotationMap.set(activeVideoId, currentRotation);
    }

    scheduleRotationMapPersist();
}

/**
 * Show rotation indicator on current player.
 */
function showRotationIndicator() {
    const player = getActivePlayer();
    if (!player) {
        return;
    }

    const indicator = createRotationIndicator(currentRotation);
    if (indicator) {
        showIndicatorOnPlayer(indicator, player);
    }
}

/**
 * Build keyboard shortcuts.
 */
function setupKeyboardShortcuts() {
    keyboardShortcuts.forEach((teardown) => teardown());
    keyboardShortcuts = [];

    const rotateKey = normalizeShortcutKey(rotationShortcut, DEFAULT_ROTATION_SHORTCUT);
    const resetKey = rotateKey.length === 1 ? rotateKey.toUpperCase() : rotateKey;

    keyboardShortcuts.push(
        createKeyboardShortcut(
            { key: rotateKey, ctrl: false, shift: false, alt: false },
            () => rotateVideo()
        )
    );

    keyboardShortcuts.push(
        createKeyboardShortcut(
            { key: resetKey, ctrl: false, shift: true, alt: false },
            () => resetRotation()
        )
    );

    logger.debug('Rotation shortcuts updated', {
        rotateKey,
        resetKey
    });
}

/**
 * Start lightweight DOM/navigation tracking.
 */
function startRuntimeTracking() {
    if (domObserver || !document.body) {
        return;
    }

    const handlePotentialPlayerChange = () => {
        if (!isEnabled) {
            return;
        }

        ensureRotationControls();
        syncActiveVideoContext(true);
    };

    document.addEventListener('yt-navigate-finish', handlePotentialPlayerChange);
    window.addEventListener('popstate', handlePotentialPlayerChange);
    window.addEventListener('focus', handlePotentialPlayerChange);
    window.addEventListener('resize', handlePotentialPlayerChange, { passive: true });
    document.addEventListener('fullscreenchange', handlePotentialPlayerChange);

    runtimeCleanupCallbacks.push(() => document.removeEventListener('yt-navigate-finish', handlePotentialPlayerChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('popstate', handlePotentialPlayerChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('focus', handlePotentialPlayerChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('resize', handlePotentialPlayerChange));
    runtimeCleanupCallbacks.push(() => document.removeEventListener('fullscreenchange', handlePotentialPlayerChange));

    domObserver = createThrottledObserver(() => {
        if (!isEnabled) {
            return;
        }

        if (!rotationButton || !rotationButton.isConnected) {
            ensureRotationControls();
        }

        syncActiveVideoContext(true);
    }, OBSERVER_THROTTLE_MS);

    domObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Stop observers and runtime listeners.
 */
function stopRuntimeTracking() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }

    while (runtimeCleanupCallbacks.length > 0) {
        const teardown = runtimeCleanupCallbacks.pop();
        teardown();
    }
}

/**
 * Enable rotation controls.
 */
function enable() {
    isEnabled = true;

    if (!isInitialized) {
        initVideoRotation();
        return;
    }

    setupKeyboardShortcuts();
    startRuntimeTracking();
    ensureRotationControls();
    syncActiveVideoContext();
}

/**
 * Disable rotation controls and clear active rotation styles.
 */
function disable() {
    isEnabled = false;

    keyboardShortcuts.forEach((teardown) => teardown());
    keyboardShortcuts = [];

    stopRuntimeTracking();
    removeRotationButton();

    if (activeVideo) {
        clearVideoRotation(activeVideo);
    }

    activeVideo = null;
    activeVideoId = null;
    currentRotation = 0;
}

/**
 * Remove rotation button from DOM.
 */
function removeRotationButton() {
    if (rotationButton) {
        rotationButton.remove();
        rotationButton = null;
    }
}

/**
 * Cleanup module resources.
 */
function cleanup() {
    disable();

    if (storageWriteTimer) {
        clearTimeout(storageWriteTimer);
        storageWriteTimer = null;
    }

    isInitialized = false;
    initPromise = null;

    logger.info('Video rotation cleaned up');
}

/**
 * Update rotation settings from popup.
 * @param {object} newSettings
 */
function updateSettings(newSettings) {
    if (!isPlainObject(newSettings)) {
        return;
    }

    const nextShortcut = normalizeShortcutKey(
        newSettings.rotationShortcut,
        rotationShortcut || DEFAULT_ROTATION_SHORTCUT
    );

    if (nextShortcut === rotationShortcut) {
        return;
    }

    rotationShortcut = nextShortcut;

    if (isEnabled) {
        setupKeyboardShortcuts();
    }
}

/**
 * Get valid current video id for watch/shorts pages.
 * @returns {string|null}
 */
function getActiveVideoId() {
    if (isVideoPage()) {
        const watchId = getCurrentVideoId();
        return isValidVideoId(watchId) ? watchId : null;
    }

    if (isShortsPage()) {
        const parts = location.pathname.split('/shorts/');
        const shortsId = parts[1] ? parts[1].split('/')[0] : null;
        return isValidVideoId(shortsId) ? shortsId : null;
    }

    return null;
}

/**
 * Normalize angle to 0/90/180/270.
 * @param {number} angle
 * @returns {number}
 */
function normalizeAngle(angle) {
    const rounded = Math.round(Number(angle) || 0);
    return ROTATION_ANGLES.includes(rounded) ? rounded : 0;
}

/**
 * Validate YouTube-like id.
 * @param {string|null} value
 * @returns {boolean}
 */
function isValidVideoId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{10,15}$/.test(value);
}

/**
 * Normalize a shortcut key value.
 * @param {any} value
 * @param {string} fallback
 * @returns {string}
 */
function normalizeShortcutKey(value, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    const lower = trimmed.toLowerCase();

    if (trimmed.length === 1) {
        return trimmed.toLowerCase();
    }
    if (lower === 'enter') {
        return 'Enter';
    }
    if (lower === 'space' || lower === 'spacebar') {
        return ' ';
    }
    if (lower === 'escape' || lower === 'esc') {
        return 'Escape';
    }
    if (lower === 'tab') {
        return 'Tab';
    }
    if (lower === 'backspace') {
        return 'Backspace';
    }
    if (lower === 'arrowleft') {
        return 'ArrowLeft';
    }
    if (lower === 'arrowright') {
        return 'ArrowRight';
    }
    if (lower === 'arrowup') {
        return 'ArrowUp';
    }
    if (lower === 'arrowdown') {
        return 'ArrowDown';
    }

    return trimmed;
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
        initVideoRotation().catch((error) => {
            logger.error('Failed to initialize video rotation on DOMContentLoaded', error);
        });
    });
} else {
    initVideoRotation().catch((error) => {
        logger.error('Failed to initialize video rotation', error);
    });
}

export {
    initVideoRotation,
    rotateVideo,
    resetRotation,
    updateSettings,
    enable,
    disable,
    cleanup
};

