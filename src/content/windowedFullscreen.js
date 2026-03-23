/**
 * Windowed Fullscreen
 * Adds a player-bar button that fits YouTube player to the browser window
 * without entering native fullscreen.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
import { getActivePlayer, isShortsPage, isVideoPage } from './utils/youtube.js';
import { normalizeShortcutKey, shortcutKeyEquals } from '../shared/shortcutKey.js';
import {
    AUTO_WINDOWED_WARMUP_MS,
    BUTTON_ACTIVE_CLASS,
    BUTTON_CLASS,
    BUTTON_ENSURE_INTERVAL_MS,
    BUTTON_ID,
    DEFAULT_WINDOWED_SHORTCUT,
    OBSERVER_THROTTLE_MS,
    OVERLAY_CLASS,
    PLAYER_ACTIVE_CLASS,
    RELAYOUT_DELAYS_MS,
    RESTORE_ANCHOR_CLASS,
    RESTORE_RETRY_DELAY_MS,
    RESTORE_RETRY_MAX_ATTEMPTS,
    ROOT_LOCK_CLASS,
    WINDOWED_ICON_PATH
} from './windowed-fullscreen/constants.js';
import {
    ensureOverlayHost as createWindowedOverlayHost,
    findFallbackPlayerMount,
    forcePlayerRelayout as triggerPlayerRelayout,
    getCurrentWatchVideoId,
    getRootPlayerHost,
    isUsableMountParent
} from './windowed-fullscreen/dom.js';

const logger = createLogger('WindowedFullscreen');

let isInitialized = false;
let initPromise = null;
let isEnabled = true;
let windowedShortcut = DEFAULT_WINDOWED_SHORTCUT;
let autoWindowedEnabled = false;
let lastAutoWindowedVideoId = null;
let autoWarmupVideoId = null;
let autoWarmupStartedAt = 0;

let windowedButton = null;
let observer = null;
let runtimeCleanupCallbacks = [];
let ensureTimer = null;

let activePlayer = null;
let mountedRootPlayer = null;
let originalRootParent = null;
let originalRootNextSibling = null;
let restoreAnchor = null;
let overlayHost = null;
let isWindowed = false;

function forcePlayerRelayout(player) {
    triggerPlayerRelayout(player, RELAYOUT_DELAYS_MS);
}

function ensureOverlayHost() {
    if (overlayHost && overlayHost.isConnected) {
        return overlayHost;
    }
    overlayHost = createWindowedOverlayHost(OVERLAY_CLASS);
    return overlayHost;
}

/**
 * Resolve the currently mounted windowed player element when available.
 * @returns {HTMLElement|null}
 */
function getMountedPlayerElement() {
    const mountedPlayer = resolvePlayerFromRoot(mountedRootPlayer);
    return mountedPlayer instanceof HTMLElement ? mountedPlayer : null;
}

/**
 * Remove stale duplicated player roots left behind after YouTube rebuilds the player.
 * @param {Element|null} rootToKeep
 */
function cleanupStaleOverlayRoots(rootToKeep = mountedRootPlayer) {
    if (
        !(overlayHost instanceof Element)
        || !overlayHost.isConnected
        || !(rootToKeep instanceof Element)
        || !overlayHost.contains(rootToKeep)
    ) {
        return;
    }

    let removedFocusedRoot = false;

    findRootPlayers().forEach((root) => {
        if (!(root instanceof Element) || !overlayHost.contains(root) || root === rootToKeep) {
            return;
        }

        if (root.contains(document.activeElement)) {
            removedFocusedRoot = true;
        }

        root.classList.remove(PLAYER_ACTIVE_CLASS);
        root.remove();
    });

    if (removedFocusedRoot) {
        focusPlayerForKeyboardControls();
    }
}

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
    const openVideoButton = controls.querySelector('#yt-commander-open-video-button');
    const preferredAnchor = openVideoButton || rotationButton || fullscreenButton || null;

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

    if (isWindowed && activePlayer && activePlayer !== player) {
        activePlayer = player;
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

    button.addEventListener('mousedown', (event) => {
        // Keep keyboard focus on player so native arrow-key controls continue to work.
        event.preventDefault();
    });

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleWindowedMode();
        focusPlayerForKeyboardControls();
    });

    return button;
}

/**
 * Restore keyboard focus to the YouTube player after interacting with custom controls.
 */
function focusPlayerForKeyboardControls() {
    const player = getMountedPlayerElement()
        || (activePlayer instanceof HTMLElement ? activePlayer : null)
        || getActivePlayer();
    if (player instanceof HTMLElement) {
        try {
            player.focus({ preventScroll: true });
            return;
        } catch (_error) {
            // Fallback below.
        }
    }

    const video = document.querySelector('video.html5-main-video');
    if (video instanceof HTMLElement) {
        try {
            video.focus({ preventScroll: true });
        } catch (_error) {
            // No-op.
        }
    }
}

/**
 * Toggle windowed fullscreen.
 */
function toggleWindowedMode() {
    if (!isEnabled) {
        return;
    }

    if (isWindowed) {
        markCurrentVideoAsAutoHandled();
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
    restoreAnchor = createRestoreAnchor(rootPlayer);

    overlayHost = ensureOverlayHost();
    if (!overlayHost) {
        if (restoreAnchor && restoreAnchor.parentNode) {
            restoreAnchor.remove();
        }
        mountedRootPlayer = null;
        originalRootParent = null;
        originalRootNextSibling = null;
        restoreAnchor = null;
        return;
    }

    overlayHost.appendChild(rootPlayer);
    rootPlayer.classList.add(PLAYER_ACTIVE_CLASS);
    cleanupStaleOverlayRoots(rootPlayer);

    document.documentElement.classList.add(ROOT_LOCK_CLASS);
    document.body.classList.add(ROOT_LOCK_CLASS);

    isWindowed = true;
    updateButtonState();
    forcePlayerRelayout(rootPlayer);
}

function findRootPlayers() {
    return Array.from(document.querySelectorAll('#movie_player'));
}

function findExternalRootPlayer() {
    const roots = findRootPlayers();
    if (roots.length === 0) {
        return null;
    }
    if (!overlayHost || !overlayHost.isConnected) {
        return roots[0];
    }
    return roots.find((root) => !overlayHost.contains(root)) || null;
}

function resolvePlayerFromRoot(rootPlayer) {
    if (!(rootPlayer instanceof Element)) {
        return null;
    }
    const player = rootPlayer.querySelector('.html5-video-player');
    return player instanceof Element ? player : null;
}

function remountWindowedRoot(nextRoot) {
    if (!(nextRoot instanceof Element)) {
        return;
    }
    overlayHost = ensureOverlayHost();
    if (!overlayHost) {
        exitWindowedMode();
        return;
    }

    if (mountedRootPlayer && mountedRootPlayer !== nextRoot) {
        mountedRootPlayer.classList.remove(PLAYER_ACTIVE_CLASS);
    }
    if (restoreAnchor && restoreAnchor.parentNode) {
        restoreAnchor.remove();
    }
    restoreAnchor = createRestoreAnchor(nextRoot);
    originalRootParent = nextRoot.parentNode;
    originalRootNextSibling = nextRoot.nextSibling;
    overlayHost.appendChild(nextRoot);
    nextRoot.classList.add(PLAYER_ACTIVE_CLASS);
    mountedRootPlayer = nextRoot;
    activePlayer = resolvePlayerFromRoot(nextRoot) || activePlayer;
    cleanupStaleOverlayRoots(nextRoot);

    document.documentElement.classList.add(ROOT_LOCK_CLASS);
    document.body.classList.add(ROOT_LOCK_CLASS);
    isWindowed = true;
    updateButtonState();
    forcePlayerRelayout(nextRoot);
}

function createRestoreAnchorInParent(parent) {
    if (!isUsableMountParent(parent)) {
        return null;
    }

    const anchor = document.createElement('div');
    anchor.className = RESTORE_ANCHOR_CLASS;
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.display = 'none';
    parent.appendChild(anchor);
    return anchor;
}

function ensureRestoreAnchorFallback() {
    if (restoreAnchor && restoreAnchor.isConnected) {
        return;
    }

    const fallbackParent = findFallbackPlayerMount();
    if (!fallbackParent) {
        return;
    }

    if (restoreAnchor && restoreAnchor.parentNode) {
        restoreAnchor.remove();
    }

    restoreAnchor = createRestoreAnchorInParent(fallbackParent);
    originalRootParent = fallbackParent;
    originalRootNextSibling = null;
}

/**
 * Exit windowed fullscreen mode.
 */
function exitWindowedMode() {
    const externalRoot = findExternalRootPlayer();
    const hasExternalReplacement = externalRoot instanceof Element
        && externalRoot.isConnected
        && isUsableMountParent(externalRoot.parentNode)
        && (!(mountedRootPlayer instanceof Element) || externalRoot !== mountedRootPlayer);

    if (mountedRootPlayer) {
        mountedRootPlayer.classList.remove(PLAYER_ACTIVE_CLASS);
    }

    document.querySelectorAll(`.${PLAYER_ACTIVE_CLASS}`).forEach((player) => {
        player.classList.remove(PLAYER_ACTIVE_CLASS);
    });

    const rootToRestore = mountedRootPlayer instanceof Element ? mountedRootPlayer : null;
    if (!hasExternalReplacement && !isUsableMountParent(originalRootParent)) {
        ensureRestoreAnchorFallback();
    }
    let restored = false;
    if (!hasExternalReplacement) {
        restored = restoreMountedRootPlayer();
    } else {
        restored = true;
    }

    if (restoreAnchor && restoreAnchor.parentNode) {
        restoreAnchor.remove();
    }
    restoreAnchor = null;

    if (overlayHost && overlayHost.parentNode) {
        overlayHost.remove();
    }

    document.documentElement.classList.remove(ROOT_LOCK_CLASS);
    document.body.classList.remove(ROOT_LOCK_CLASS);

    const relayoutTarget = hasExternalReplacement
        ? externalRoot
        : (mountedRootPlayer || getRootPlayerHost(getActivePlayer()));

    if (!restored && rootToRestore) {
        scheduleDeferredRestore(rootToRestore);
        logger.warn('Windowed player restore deferred until mount target becomes available');
    }

    if (hasExternalReplacement) {
        if (rootToRestore && rootToRestore.parentNode === overlayHost) {
            rootToRestore.remove();
        }
        mountedRootPlayer = null;
        activePlayer = resolvePlayerFromRoot(externalRoot) || null;
    } else {
        activePlayer = null;
        mountedRootPlayer = null;
    }
    originalRootParent = null;
    originalRootNextSibling = null;
    restoreAnchor = null;
    overlayHost = null;
    isWindowed = false;
    updateButtonState();
    forcePlayerRelayout(relayoutTarget);
}

/**
 * Insert an invisible anchor before moving player so we can restore to the exact slot.
 * @param {Element} rootPlayer
 * @returns {HTMLDivElement|null}
 */
function createRestoreAnchor(rootPlayer) {
    if (!(rootPlayer instanceof Element) || !(rootPlayer.parentNode instanceof Node)) {
        return null;
    }

    const anchor = document.createElement('div');
    anchor.className = RESTORE_ANCHOR_CLASS;
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.display = 'none';
    rootPlayer.parentNode.insertBefore(anchor, rootPlayer);
    return anchor;
}

/**
 * Restore moved player root to original location or a safe fallback mount point.
 * @returns {boolean}
 */
function restoreMountedRootPlayer() {
    if (!(mountedRootPlayer instanceof Element)) {
        return false;
    }

    if (restoreAnchor && restoreAnchor.parentNode instanceof Node) {
        restoreAnchor.parentNode.insertBefore(mountedRootPlayer, restoreAnchor);
        return true;
    }

    if (isUsableMountParent(originalRootParent)) {
        if (
            originalRootNextSibling instanceof Node
            && originalRootNextSibling.parentNode === originalRootParent
        ) {
            originalRootParent.insertBefore(mountedRootPlayer, originalRootNextSibling);
        } else {
            originalRootParent.appendChild(mountedRootPlayer);
        }
        return true;
    }

    const fallbackParent = findFallbackPlayerMount();
    if (fallbackParent) {
        fallbackParent.appendChild(mountedRootPlayer);
        return true;
    }

    return false;
}

/**
 * Retry restoring detached player root when page containers are still rebuilding.
 * @param {Element} rootPlayer
 */
function scheduleDeferredRestore(rootPlayer) {
    if (!(rootPlayer instanceof Element)) {
        return;
    }

    let attempt = 0;
    const tryRestore = () => {
        if (rootPlayer.isConnected) {
            forcePlayerRelayout(rootPlayer);
            return;
        }

        const fallbackParent = findFallbackPlayerMount();
        if (fallbackParent) {
            fallbackParent.appendChild(rootPlayer);
            forcePlayerRelayout(rootPlayer);
            return;
        }

        attempt += 1;
        if (attempt >= RESTORE_RETRY_MAX_ATTEMPTS) {
            logger.warn('Unable to restore player root after retries');
            return;
        }

        setTimeout(tryRestore, RESTORE_RETRY_DELAY_MS);
    };

    setTimeout(tryRestore, RESTORE_RETRY_DELAY_MS);
}

/**
 * Ensure auto mode waits until player shell is stable before moving player root.
 * @param {string} watchVideoId
 * @returns {boolean}
 */
function isAutoWindowedReady(watchVideoId) {
    if (watchVideoId !== autoWarmupVideoId) {
        autoWarmupVideoId = watchVideoId;
        autoWarmupStartedAt = Date.now();
        return false;
    }

    if ((Date.now() - autoWarmupStartedAt) < AUTO_WINDOWED_WARMUP_MS) {
        return false;
    }

    const player = getActivePlayer();
    const rootPlayer = getRootPlayerHost(player);
    if (!player || !rootPlayer || !rootPlayer.parentElement || !rootPlayer.isConnected) {
        return false;
    }

    const controls = findControlsHost();
    if (!controls) {
        return false;
    }

    const video = player.querySelector('video.html5-main-video');
    if (video instanceof HTMLVideoElement && video.readyState < 1) {
        return false;
    }

    return true;
}

/**
 * Reset auto-windowed warmup state.
 */
function resetAutoWarmup() {
    autoWarmupVideoId = null;
    autoWarmupStartedAt = 0;
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
        resetAutoWarmup();
        return;
    }

    if (isWindowed) {
        cleanupStaleOverlayRoots(mountedRootPlayer);

        const player = getActivePlayer() || resolvePlayerFromRoot(mountedRootPlayer);
        const rootPlayer = getRootPlayerHost(player);
        const externalRoot = findExternalRootPlayer();
        if (!restoreAnchor || !restoreAnchor.isConnected || !isUsableMountParent(originalRootParent)) {
            ensureRestoreAnchorFallback();
        }
        if (externalRoot && externalRoot !== mountedRootPlayer) {
            remountWindowedRoot(externalRoot);
        } else if (!player || !rootPlayer) {
            exitWindowedMode();
        } else if (mountedRootPlayer && rootPlayer !== mountedRootPlayer) {
            mountedRootPlayer = rootPlayer;
            activePlayer = player;
        } else if (mountedRootPlayer && overlayHost && !overlayHost.contains(mountedRootPlayer)) {
            overlayHost.appendChild(mountedRootPlayer);
            mountedRootPlayer.classList.add(PLAYER_ACTIVE_CLASS);
            forcePlayerRelayout(mountedRootPlayer);
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
        markCurrentVideoAsAutoHandled();
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
    focusPlayerForKeyboardControls();
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
        resetAutoWarmup();
        return;
    }

    if (watchVideoId === lastAutoWindowedVideoId) {
        resetAutoWarmup();
        return;
    }

    if (!isAutoWindowedReady(watchVideoId)) {
        return;
    }

    enterWindowedMode();

    if (isWindowed) {
        focusPlayerForKeyboardControls();
        lastAutoWindowedVideoId = watchVideoId;
        resetAutoWarmup();
    }
}

/**
 * Check whether the configured shortcut key is pressed.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function matchesWindowedShortcut(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return false;
    }

    const expectedKey = normalizeShortcutKey(windowedShortcut, DEFAULT_WINDOWED_SHORTCUT);
    const eventKey = typeof event.key === 'string' ? event.key : '';

    if (!eventKey) {
        return false;
    }

    return shortcutKeyEquals(eventKey, expectedKey);
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
 * Mark current watch video as manually handled so auto mode does not immediately re-enter.
 */
function markCurrentVideoAsAutoHandled() {
    if (!autoWindowedEnabled) {
        return;
    }

    const watchVideoId = getCurrentWatchVideoId();
    if (watchVideoId) {
        lastAutoWindowedVideoId = watchVideoId;
    }
    resetAutoWarmup();
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
        resetAutoWarmup();
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
    resetAutoWarmup();
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
