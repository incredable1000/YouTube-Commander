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
import { normalizeShortcutKey } from '../shared/shortcutKey.js';
import { computeRotationFitScale } from './videoRotation/fitScale.js';

const logger = createLogger('VideoRotation');

const ROTATION_ANGLES = [0, 90, 180, 270];
const SESSION_STORAGE_KEY = 'ytCommanderVideoRotationsSession';
const STORAGE_WRITE_DEBOUNCE_MS = 280;
const OBSERVER_THROTTLE_MS = 650;
const DEFAULT_ROTATION_SHORTCUT = 'r';
const INDICATOR_DURATION_MS = 1100;
const ZERO_ANGLE_CLEANUP_MS = 270;

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
let activeVideoMetricsCleanup = null;

let rotationMap = new Map();
let storageWriteTimer = null;
let rotationIndicator = null;
let rotationIndicatorTimer = null;
let zeroAngleCleanupTimer = null;

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
 * Load session-only per-video rotation state.
 */
async function loadRotationMap() {
    try {
        const rawJson = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        rotationMap = new Map();

        if (!rawJson) {
            return;
        }

        const raw = JSON.parse(rawJson);
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
 * Debounced write of rotation state to session storage.
 */
function scheduleRotationMapPersist() {
    if (storageWriteTimer) {
        return;
    }

    storageWriteTimer = setTimeout(() => {
        storageWriteTimer = null;

        try {
            if (rotationMap.size === 0) {
                window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
                return;
            }

            const serialized = JSON.stringify(Object.fromEntries(rotationMap.entries()));
            window.sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
        } catch (error) {
            logger.warn('Failed to persist session rotation map', error);
        }
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

    if (activeVideoMetricsCleanup) {
        activeVideoMetricsCleanup();
        activeVideoMetricsCleanup = null;
    }
    cancelZeroAngleCleanup();

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
    activeVideoMetricsCleanup = attachVideoMetricListeners(activeVideo);
    applyVideoRotation(activeVideo, currentRotation);
}

/**
 * Reapply rotation when intrinsic video metrics become available or change.
 * @param {HTMLVideoElement} video
 * @returns {() => void}
 */
function attachVideoMetricListeners(video) {
    const handleMetricChange = () => {
        if (!isEnabled || video !== activeVideo || currentRotation === 0) {
            return;
        }
        applyVideoRotation(video, currentRotation);
    };

    video.addEventListener('loadedmetadata', handleMetricChange);
    video.addEventListener('resize', handleMetricChange);

    return () => {
        video.removeEventListener('loadedmetadata', handleMetricChange);
        video.removeEventListener('resize', handleMetricChange);
    };
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
    const previousRotation = currentRotation;

    currentRotation = ROTATION_ANGLES[nextIndex];

    if (currentRotation === 0 && previousRotation === 270) {
        applyVideoRotation(activeVideo, 0, {
            visualAngle: 360,
            animateToZero: true
        });
        scheduleZeroAngleCleanup(activeVideo);
    } else {
        cancelZeroAngleCleanup();
        applyVideoRotation(activeVideo, currentRotation);
    }

    persistCurrentVideoRotation();
    showRotationIndicator('rotate');

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

    if (currentRotation === 0) {
        showRotationIndicator('reset');
        return;
    }

    currentRotation = 0;
    applyVideoRotation(activeVideo, 0, {
        visualAngle: 360,
        animateToZero: true
    });
    scheduleZeroAngleCleanup(activeVideo);
    persistCurrentVideoRotation();
    showRotationIndicator('reset');
}

/**
 * Apply rotation style using CSS rotate property.
 * @param {HTMLVideoElement} video
 * @param {number} angle
 * @param {{visualAngle?: number, animateToZero?: boolean}} [options]
 */
function applyVideoRotation(video, angle, options = {}) {
    if (!video) {
        return;
    }

    const normalized = normalizeAngle(angle);
    const visualAngle = Number.isFinite(options.visualAngle) ? Number(options.visualAngle) : normalized;
    const animateToZero = options.animateToZero === true;

    if (normalized === 0 && !animateToZero) {
        clearVideoRotation(video);
        return;
    }

    const scale = normalized === 0
        ? 1
        : computeRotationFitScale(video, normalized, getActivePlayer());

    video.classList.add('yt-commander-rotatable');
    video.classList.remove('yt-commander-rotatable-instant');
    video.style.transformOrigin = 'center center';
    video.style.transform = `rotate(${visualAngle}deg) scale(${scale})`;
}

/**
 * Clear rotation style.
 * @param {HTMLVideoElement} video
 * @param {{instant?: boolean}} [options]
 */
function clearVideoRotation(video, options = {}) {
    if (!video) {
        return;
    }

    const instant = options.instant === true;
    if (instant) {
        video.classList.add('yt-commander-rotatable-instant');
    }

    video.style.transform = '';
    video.style.transformOrigin = '';
    video.classList.remove('yt-commander-rotatable');

    if (instant) {
        // Force style flush before restoring animated class behavior.
        void video.offsetWidth;
        video.classList.remove('yt-commander-rotatable-instant');
    }
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
function showRotationIndicator(trigger = 'rotate') {
    const player = getActivePlayer();
    if (!player) {
        return;
    }

    clearRotationIndicator();

    const indicator = createRotationIndicator(currentRotation, { trigger });
    if (!indicator) {
        return;
    }

    rotationIndicator = indicator;
    showIndicatorOnPlayer(indicator, player);

    window.requestAnimationFrame(() => {
        if (indicator === rotationIndicator) {
            indicator.classList.add('is-visible');
        }
    });

    rotationIndicatorTimer = window.setTimeout(() => {
        clearRotationIndicator();
    }, INDICATOR_DURATION_MS);
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

    clearRotationIndicator();
    cancelZeroAngleCleanup();

    activeVideo = null;
    activeVideoId = null;
    currentRotation = 0;

    if (activeVideoMetricsCleanup) {
        activeVideoMetricsCleanup();
        activeVideoMetricsCleanup = null;
    }
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
 * Remove active rotation indicator and clear timers.
 */
function clearRotationIndicator() {
    if (rotationIndicatorTimer) {
        clearTimeout(rotationIndicatorTimer);
        rotationIndicatorTimer = null;
    }

    if (rotationIndicator) {
        rotationIndicator.remove();
        rotationIndicator = null;
    }
}

/**
 * Cancel pending post-animation cleanup.
 */
function cancelZeroAngleCleanup() {
    if (zeroAngleCleanupTimer) {
        clearTimeout(zeroAngleCleanupTimer);
        zeroAngleCleanupTimer = null;
    }
}

/**
 * Cleanup 360deg visual transform after a forward rotate-to-zero animation.
 * @param {HTMLVideoElement} video
 */
function scheduleZeroAngleCleanup(video) {
    cancelZeroAngleCleanup();

    zeroAngleCleanupTimer = setTimeout(() => {
        zeroAngleCleanupTimer = null;

        if (!video || video !== activeVideo || currentRotation !== 0) {
            return;
        }

        clearVideoRotation(video, { instant: true });
    }, ZERO_ANGLE_CLEANUP_MS);
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

