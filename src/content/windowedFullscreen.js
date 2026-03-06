/**
 * Windowed Fullscreen
 * Adds a player-bar button that fits YouTube player to the browser window
 * without entering native fullscreen.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
import { getActivePlayer, isShortsPage, isVideoPage } from './utils/youtube.js';

const logger = createLogger('WindowedFullscreen');

const BUTTON_ID = 'yt-commander-windowed-fullscreen-button';
const BUTTON_CLASS = 'ytp-button yt-commander-fullwindow-button';
const BUTTON_ACTIVE_CLASS = 'is-active';
const PLAYER_ACTIVE_CLASS = 'yt-commander-windowed-player';
const OVERLAY_CLASS = 'yt-commander-windowed-overlay';
const ROOT_LOCK_CLASS = 'yt-commander-windowed-lock';
const OBSERVER_THROTTLE_MS = 650;
const BUTTON_ENSURE_INTERVAL_MS = 1200;
const WINDOWED_ICON_PATH = 'M7 14H5v5h5v-2H7v-3zm0-4h2V7h3V5H5v5zm10 7h-3v2h5v-5h-2v3zm0-12V5h-3v2h3v3h2V5z';
const RELAYOUT_DELAYS_MS = [0, 60, 180];
const DEFAULT_WINDOWED_SHORTCUT = 'Enter';

let isInitialized = false;
let initPromise = null;
let isEnabled = true;
let windowedShortcut = DEFAULT_WINDOWED_SHORTCUT;
let autoWindowedEnabled = false;
let lastAutoWindowedVideoId = null;

let windowedButton = null;
let observer = null;
let runtimeCleanupCallbacks = [];
let ensureTimer = null;

let activePlayer = null;
let mountedRootPlayer = null;
let originalRootParent = null;
let originalRootNextSibling = null;
let overlayHost = null;
let isWindowed = false;

/**
 * Initialize module.
 */
async function initWindowedFullscreen() {
    if (isInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        logger.info('Initializing windowed fullscreen');

        if (isEnabled) {
            startRuntimeTracking();
            syncUiState();
        }

        isInitialized = true;
        logger.info('Windowed fullscreen initialized');
    })();

    try {
        await initPromise;
    } catch (error) {
        logger.error('Failed to initialize windowed fullscreen', error);
        throw error;
    } finally {
        initPromise = null;
    }
}

/**
 * Whether this route supports player-bar controls for watch videos.
 * @returns {boolean}
 */
function isEligiblePage() {
    return isVideoPage() && !isShortsPage();
}

/**
 * Ensure button is attached to current player controls.
 */
function ensureButton() {
    if (!isEnabled || !isEligiblePage()) {
        removeButton();
        return;
    }

    const controls = findControlsHost();
    if (!controls) {
        removeButton();
        return;
    }

    const player = controls.closest('.html5-video-player');
    if (!player) {
        removeButton();
        return;
    }

    if (!windowedButton || !windowedButton.isConnected) {
        const existing = controls.querySelector(`#${BUTTON_ID}`);
        if (existing instanceof HTMLButtonElement) {
            existing.remove();
        }
        windowedButton = createWindowedButton();
    }

    const fullscreenButton = controls.querySelector('.ytp-fullscreen-button');
    const rotationButton = controls.querySelector('.custom-rotation-button');
    const preferredAnchor = rotationButton || fullscreenButton || null;

    if (preferredAnchor && windowedButton.parentElement !== controls) {
        controls.insertBefore(windowedButton, preferredAnchor.nextSibling);
    } else if (!preferredAnchor && windowedButton.parentElement !== controls) {
        controls.appendChild(windowedButton);
    } else if (
        preferredAnchor
        && windowedButton.previousElementSibling !== preferredAnchor
    ) {
        controls.insertBefore(windowedButton, preferredAnchor.nextSibling);
    }

    if (isWindowed) {
        if (activePlayer && activePlayer !== player) {
            exitWindowedMode();
        }
    }

    updateButtonState();
}

/**
 * Build player-bar windowed mode button.
 * @returns {HTMLButtonElement}
 */
function createWindowedButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', 'Windowed fullscreen');
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Windowed fullscreen';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.minWidth = '40px';
    button.style.opacity = '1';
    button.style.visibility = 'visible';

    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('viewBox', '0 0 24 24');
    svgIcon.setAttribute('width', '24');
    svgIcon.setAttribute('height', '24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', WINDOWED_ICON_PATH);

    svgIcon.appendChild(path);
    button.appendChild(svgIcon);

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleWindowedMode();
    });

    return button;
}

/**
 * Toggle windowed fullscreen.
 */
function toggleWindowedMode() {
    if (!isEnabled) {
        return;
    }

    if (isWindowed) {
        exitWindowedMode();
    } else {
        enterWindowedMode();
    }
}

/**
 * Enter windowed fullscreen mode.
 */
function enterWindowedMode() {
    if (!isEligiblePage()) {
        return;
    }

    if (document.fullscreenElement) {
        logger.debug('Skipping windowed mode while native fullscreen is active');
        return;
    }

    const player = getActivePlayer();
    const rootPlayer = getRootPlayerHost(player);
    if (!player || !rootPlayer) {
        return;
    }

    exitWindowedMode();

    activePlayer = player;
    mountedRootPlayer = rootPlayer;
    originalRootParent = rootPlayer.parentNode;
    originalRootNextSibling = rootPlayer.nextSibling;

    overlayHost = ensureOverlayHost();
    if (!overlayHost) {
        mountedRootPlayer = null;
        originalRootParent = null;
        originalRootNextSibling = null;
        return;
    }

    overlayHost.appendChild(rootPlayer);
    rootPlayer.classList.add(PLAYER_ACTIVE_CLASS);

    document.documentElement.classList.add(ROOT_LOCK_CLASS);
    document.body.classList.add(ROOT_LOCK_CLASS);

    isWindowed = true;
    updateButtonState();
    forcePlayerRelayout(rootPlayer);
}

/**
 * Exit windowed fullscreen mode.
 */
function exitWindowedMode() {
    if (mountedRootPlayer) {
        mountedRootPlayer.classList.remove(PLAYER_ACTIVE_CLASS);
    }

    document.querySelectorAll(`.${PLAYER_ACTIVE_CLASS}`).forEach((player) => {
        player.classList.remove(PLAYER_ACTIVE_CLASS);
    });

    if (
        mountedRootPlayer
        && originalRootParent instanceof Node
    ) {
        if (
            originalRootNextSibling instanceof Node
            && originalRootNextSibling.parentNode === originalRootParent
        ) {
            originalRootParent.insertBefore(mountedRootPlayer, originalRootNextSibling);
        } else {
            originalRootParent.appendChild(mountedRootPlayer);
        }
    }

    if (overlayHost && overlayHost.parentNode) {
        overlayHost.remove();
    }

    document.documentElement.classList.remove(ROOT_LOCK_CLASS);
    document.body.classList.remove(ROOT_LOCK_CLASS);

    const relayoutTarget = mountedRootPlayer || getRootPlayerHost(getActivePlayer());

    activePlayer = null;
    mountedRootPlayer = null;
    originalRootParent = null;
    originalRootNextSibling = null;
    overlayHost = null;
    isWindowed = false;
    updateButtonState();
    forcePlayerRelayout(relayoutTarget);
}

/**
 * Refresh button pressed/title state.
 */
function updateButtonState() {
    if (!windowedButton) {
        return;
    }

    windowedButton.classList.toggle(BUTTON_ACTIVE_CLASS, isWindowed);
    windowedButton.setAttribute('aria-pressed', isWindowed ? 'true' : 'false');
    windowedButton.setAttribute(
        'aria-label',
        isWindowed ? 'Exit windowed fullscreen' : 'Windowed fullscreen'
    );
    windowedButton.title = isWindowed ? 'Exit windowed fullscreen' : 'Windowed fullscreen';
}

/**
 * Runtime state sync after navigation/player rebuilds.
 */
function syncUiState() {
    if (!isEnabled) {
        return;
    }

    if (!isEligiblePage()) {
        if (isWindowed) {
            exitWindowedMode();
        }
        removeButton();
        lastAutoWindowedVideoId = null;
        return;
    }

    if (isWindowed) {
        const player = getActivePlayer();
        if (!player) {
            exitWindowedMode();
        } else if (activePlayer && activePlayer !== player) {
            exitWindowedMode();
        }
    }

    ensureButton();
    applyAutoWindowedMode();
}

/**
 * Handle Escape key to exit windowed mode.
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key === 'Escape' && isWindowed) {
        event.preventDefault();
        exitWindowedMode();
        return;
    }

    if (!matchesWindowedShortcut(event)) {
        return;
    }

    if (!shouldHandleWindowedShortcut(event)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleWindowedMode();
}

/**
 * Apply auto-windowed mode once per watch video id.
 */
function applyAutoWindowedMode() {
    if (!autoWindowedEnabled || document.fullscreenElement) {
        return;
    }

    const watchVideoId = getCurrentWatchVideoId();
    if (!watchVideoId) {
        return;
    }

    if (isWindowed) {
        lastAutoWindowedVideoId = watchVideoId;
        return;
    }

    if (watchVideoId === lastAutoWindowedVideoId) {
        return;
    }

    enterWindowedMode();

    if (isWindowed) {
        lastAutoWindowedVideoId = watchVideoId;
    }
}

/**
 * Check whether the configured shortcut key is pressed.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function matchesWindowedShortcut(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) {
        return false;
    }

    const expectedKey = normalizeShortcutKey(windowedShortcut, DEFAULT_WINDOWED_SHORTCUT);
    const eventKey = typeof event.key === 'string' ? event.key : '';

    if (!eventKey) {
        return false;
    }

    if (expectedKey.length === 1) {
        return eventKey.toLowerCase() === expectedKey.toLowerCase();
    }

    return eventKey === expectedKey;
}

/**
 * Handle native fullscreen transitions.
 */
function handleFullscreenChange() {
    if (!isWindowed) {
        return;
    }

    if (document.fullscreenElement) {
        exitWindowedMode();
    }
}

/**
 * Resolve root player host that should be moved into the windowed overlay.
 * @param {Element|null} player
 * @returns {Element|null}
 */
function getRootPlayerHost(player) {
    if (!(player instanceof Element)) {
        return null;
    }

    return player.closest('#movie_player') || player;
}

/**
 * Ensure overlay host exists in document body.
 * @returns {HTMLDivElement|null}
 */
function ensureOverlayHost() {
    if (!document.body) {
        return null;
    }

    const host = document.createElement('div');
    host.className = OVERLAY_CLASS;
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    return host;
}

/**
 * Trigger a few resize ticks so YouTube recalculates stream geometry.
 * @param {Element|null} player
 */
function forcePlayerRelayout(player) {
    const target = player instanceof Element ? player : null;

    RELAYOUT_DELAYS_MS.forEach((delay) => {
        setTimeout(() => {
            try {
                window.dispatchEvent(new Event('resize'));
            } catch (_error) {
                // no-op
            }

            if (target && typeof target.dispatchEvent === 'function') {
                try {
                    target.dispatchEvent(new Event('resize'));
                } catch (_error) {
                    // no-op
                }
            }
        }, delay);
    });
}

/**
 * Start listeners + observer.
 */
function startRuntimeTracking() {
    if (observer || !document.body) {
        return;
    }

    const handleRouteOrPlayerChange = () => {
        syncUiState();
    };

    document.addEventListener('yt-navigate-finish', handleRouteOrPlayerChange);
    document.addEventListener('yt-page-data-updated', handleRouteOrPlayerChange);
    window.addEventListener('popstate', handleRouteOrPlayerChange);
    window.addEventListener('resize', handleRouteOrPlayerChange, { passive: true });
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeydown, true);

    runtimeCleanupCallbacks.push(() => document.removeEventListener('yt-navigate-finish', handleRouteOrPlayerChange));
    runtimeCleanupCallbacks.push(() => document.removeEventListener('yt-page-data-updated', handleRouteOrPlayerChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('popstate', handleRouteOrPlayerChange));
    runtimeCleanupCallbacks.push(() => window.removeEventListener('resize', handleRouteOrPlayerChange));
    runtimeCleanupCallbacks.push(() => document.removeEventListener('fullscreenchange', handleFullscreenChange));
    runtimeCleanupCallbacks.push(() => document.removeEventListener('keydown', handleKeydown, true));

    observer = createThrottledObserver(() => {
        syncUiState();
    }, OBSERVER_THROTTLE_MS);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    if (!ensureTimer) {
        ensureTimer = setInterval(() => {
            if (!isEnabled) {
                return;
            }
            syncUiState();
        }, BUTTON_ENSURE_INTERVAL_MS);
    }
}

/**
 * Stop runtime listeners + observer.
 */
function stopRuntimeTracking() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    if (ensureTimer) {
        clearInterval(ensureTimer);
        ensureTimer = null;
    }

    while (runtimeCleanupCallbacks.length > 0) {
        const teardown = runtimeCleanupCallbacks.pop();
        teardown();
    }
}

/**
 * Remove button from DOM.
 */
function removeButton() {
    if (windowedButton) {
        windowedButton.remove();
        windowedButton = null;
    }
}

/**
 * Resolve controls host from the active watch player only.
 * @returns {Element|null}
 */
function findControlsHost() {
    const rotationButton = document.querySelector('.custom-rotation-button');
    if (rotationButton instanceof Element && rotationButton.parentElement) {
        return rotationButton.parentElement;
    }

    const player = getActivePlayer();
    if (!player) {
        return null;
    }

    const right = player.querySelector('.ytp-right-controls');
    if (right instanceof Element) {
        return right;
    }

    return player.querySelector('.ytp-left-controls');
}

/**
 * Determine whether configured shortcut should toggle windowed mode.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function shouldHandleWindowedShortcut(event) {
    if (!isEnabled || !isEligiblePage() || event.repeat) {
        return false;
    }

    const active = document.activeElement;
    if (!(active instanceof Element)) {
        return true;
    }

    if (
        active.matches('input, textarea, select, [contenteditable="true"]')
        || active.closest('input, textarea, select, [contenteditable="true"]')
    ) {
        return false;
    }

    if (active.closest('#movie_player, .html5-video-player')) {
        return true;
    }

    if (
        active.matches('button, a, [role="button"]')
        || active.closest('button, a, [role="button"]')
    ) {
        return false;
    }

    return true;
}

/**
 * Get current watch video id from URL.
 * @returns {string|null}
 */
function getCurrentWatchVideoId() {
    try {
        const url = new URL(location.href);
        const value = url.searchParams.get('v');
        return value && value.trim() ? value.trim() : null;
    } catch (_error) {
        return null;
    }
}

/**
 * Update module settings from popup.
 * @param {object} newSettings
 */
function updateSettings(newSettings) {
    if (!isPlainObject(newSettings)) {
        return;
    }

    const nextShortcut = normalizeShortcutKey(
        newSettings.windowedFullscreenShortcut,
        windowedShortcut || DEFAULT_WINDOWED_SHORTCUT
    );

    const nextAutoEnabled = newSettings.windowedFullscreenAuto === true;

    const shortcutChanged = nextShortcut !== windowedShortcut;
    const autoModeChanged = nextAutoEnabled !== autoWindowedEnabled;

    if (!shortcutChanged && !autoModeChanged) {
        return;
    }

    windowedShortcut = nextShortcut;
    autoWindowedEnabled = nextAutoEnabled;

    if (autoModeChanged) {
        lastAutoWindowedVideoId = null;
    }

    logger.debug('Windowed fullscreen settings updated', {
        windowedShortcut,
        autoWindowedEnabled
    });

    if (isEnabled) {
        syncUiState();
    }
}

/**
 * Normalize shortcut key value.
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

/**
 * Enable module.
 */
function enable() {
    isEnabled = true;

    if (!isInitialized) {
        initWindowedFullscreen();
        return;
    }

    startRuntimeTracking();
    syncUiState();
}

/**
 * Disable module and reset UI.
 */
function disable() {
    isEnabled = false;
    stopRuntimeTracking();
    exitWindowedMode();
    removeButton();
    lastAutoWindowedVideoId = null;
}

/**
 * Cleanup module state.
 */
function cleanup() {
    disable();
    isInitialized = false;
    initPromise = null;
    logger.info('Windowed fullscreen cleaned up');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initWindowedFullscreen().catch((error) => {
            logger.error('Failed to initialize windowed fullscreen on DOMContentLoaded', error);
        });
    });
} else {
    initWindowedFullscreen().catch((error) => {
        logger.error('Failed to initialize windowed fullscreen', error);
    });
}

export {
    initWindowedFullscreen,
    updateSettings,
    enable,
    disable,
    cleanup
};
