/**
 * Windowed Fullscreen
 * Adds a player-bar button that fits YouTube player to the browser window
 * without entering native fullscreen.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
import { getActivePlayer, isShortsPage, isVideoPage } from './utils/youtube.js';
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
} from './windowed-fullscreen/constants.js';
import {
    ensureOverlayHost as createWindowedOverlayHost,
    findFallbackPlayerMount,
    forcePlayerRelayout as triggerPlayerRelayout,
    getRootPlayerHost,
    isUsableMountParent,
} from './windowed-fullscreen/dom.js';
import { isPlainObject } from './windowed-fullscreen/utils.js';
import {
    findRootPlayers,
    getLiveRootPlayer,
    getLivePlayerElement,
    getMountedPlayerElement,
} from './windowed-fullscreen/player-resolve.js';
import {
    createRestoreAnchor,
    ensureRestoreAnchorFallback,
    restoreMountedRootPlayer,
    scheduleDeferredRestore,
} from './windowed-fullscreen/restore.js';
import {
    createWindowedButton,
    updateButtonState,
    removeButton as destroyButton,
} from './windowed-fullscreen/ui.js';
import {
    matchesWindowedShortcut as checkWindowedShortcut,
    shouldHandleWindowedShortcut as checkWindowedShortcutEligibility,
} from './windowed-fullscreen/shortcuts-utils.js';
import { isEligiblePage as checkEligiblePage } from './windowed-fullscreen/mode-utils.js';

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

function cleanupStaleOverlayRoots(rootToKeep = mountedRootPlayer) {
    if (
        !(overlayHost instanceof Element) ||
        !overlayHost.isConnected ||
        !(rootToKeep instanceof Element) ||
        !overlayHost.contains(rootToKeep)
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

function removeDuplicateRootPlayers(rootToKeep = mountedRootPlayer) {
    if (!(rootToKeep instanceof Element)) {
        return;
    }

    findRootPlayers().forEach((root) => {
        if (!(root instanceof Element) || root === rootToKeep || root.closest('ytd-miniplayer')) {
            return;
        }

        root.classList.remove(PLAYER_ACTIVE_CLASS);
        root.remove();
    });
}

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

function ensureButton() {
    if (!isEnabled || !checkEligiblePage(isVideoPage, isShortsPage)) {
        windowedButton = destroyButton(windowedButton);
        return;
    }

    const controls = findControlsHost();
    if (!controls) {
        windowedButton = destroyButton(windowedButton);
        return;
    }

    const player = controls.closest('.html5-video-player');
    if (!player) {
        windowedButton = destroyButton(windowedButton);
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
    } else if (preferredAnchor && windowedButton.previousElementSibling !== preferredAnchor) {
        controls.insertBefore(windowedButton, preferredAnchor.nextSibling);
    }

    if (isWindowed && activePlayer && activePlayer !== player) {
        activePlayer = player;
    }

    updateButtonState(windowedButton, isWindowed);
}

function focusPlayerForKeyboardControls() {
    const player =
        getLivePlayerElement(getLiveRootPlayer(mountedRootPlayer), mountedRootPlayer) ||
        (activePlayer instanceof HTMLElement ? activePlayer : null);
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

function enterWindowedMode() {
    if (!checkEligiblePage(isVideoPage, isShortsPage)) {
        return;
    }

    if (document.fullscreenElement) {
        logger.debug('Skipping windowed mode while native fullscreen is active');
        return;
    }

    const rootPlayer = getLiveRootPlayer(mountedRootPlayer);
    const player = getActivePlayer();
    if (!player || !rootPlayer) {
        return;
    }

    exitWindowedMode();

    activePlayer = player;
    mountedRootPlayer = rootPlayer;
    originalRootParent = null;
    originalRootNextSibling = null;
    restoreAnchor = null;

    overlayHost = ensureOverlayHost();
    if (!overlayHost) {
        mountedRootPlayer = null;
        return;
    }

    rootPlayer.classList.add(PLAYER_ACTIVE_CLASS);

    document.documentElement.classList.add(ROOT_LOCK_CLASS);
    document.body.classList.add(ROOT_LOCK_CLASS);

    isWindowed = true;
    updateButtonState(windowedButton, isWindowed);
    forcePlayerRelayout(rootPlayer);
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

    nextRoot.classList.add(PLAYER_ACTIVE_CLASS);
    mountedRootPlayer = nextRoot;
    activePlayer = getMountedPlayerElement(nextRoot) || activePlayer;
    originalRootParent = null;
    originalRootNextSibling = null;
    restoreAnchor = null;

    document.documentElement.classList.add(ROOT_LOCK_CLASS);
    document.body.classList.add(ROOT_LOCK_CLASS);
    isWindowed = true;
    updateButtonState(windowedButton, isWindowed);
    forcePlayerRelayout(nextRoot);
}

function exitWindowedMode() {
    if (mountedRootPlayer) {
        mountedRootPlayer.classList.remove(PLAYER_ACTIVE_CLASS);
    }

    document.querySelectorAll(`.${PLAYER_ACTIVE_CLASS}`).forEach((player) => {
        player.classList.remove(PLAYER_ACTIVE_CLASS);
    });

    if (overlayHost && overlayHost.parentNode) {
        overlayHost.remove();
    }

    document.documentElement.classList.remove(ROOT_LOCK_CLASS);
    document.body.classList.remove(ROOT_LOCK_CLASS);

    const relayoutTarget =
        getLiveRootPlayer(mountedRootPlayer) ||
        mountedRootPlayer ||
        getRootPlayerHost(getActivePlayer());

    activePlayer = null;
    mountedRootPlayer = null;
    originalRootParent = null;
    originalRootNextSibling = null;
    restoreAnchor = null;
    overlayHost = null;
    isWindowed = false;
    updateButtonState(windowedButton, isWindowed);
    forcePlayerRelayout(relayoutTarget);
}

function isAutoWindowedReady(watchVideoId) {
    if (watchVideoId !== autoWarmupVideoId) {
        autoWarmupVideoId = watchVideoId;
        autoWarmupStartedAt = Date.now();
        return false;
    }

    if (Date.now() - autoWarmupStartedAt < AUTO_WINDOWED_WARMUP_MS) {
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

function resetAutoWarmup() {
    autoWarmupVideoId = null;
    autoWarmupStartedAt = 0;
}

function syncUiState() {
    if (!isEnabled) {
        return;
    }

    if (!checkEligiblePage(isVideoPage, isShortsPage)) {
        if (isWindowed) {
            exitWindowedMode();
        }
        windowedButton = destroyButton(windowedButton);
        lastAutoWindowedVideoId = null;
        resetAutoWarmup();
        return;
    }

    if (isWindowed) {
        const rootPlayer = getLiveRootPlayer(mountedRootPlayer);
        const player = getLivePlayerElement(rootPlayer, mountedRootPlayer);
        if (!player || !rootPlayer) {
            exitWindowedMode();
        } else if (mountedRootPlayer && rootPlayer !== mountedRootPlayer) {
            remountWindowedRoot(rootPlayer);
        } else if (mountedRootPlayer) {
            activePlayer = player;
            if (!mountedRootPlayer.classList.contains(PLAYER_ACTIVE_CLASS)) {
                mountedRootPlayer.classList.add(PLAYER_ACTIVE_CLASS);
                forcePlayerRelayout(mountedRootPlayer);
            }
        }
    }

    ensureButton();
    applyAutoWindowedMode();
}

function handleKeydown(event) {
    if (event.key === 'Escape' && isWindowed) {
        event.preventDefault();
        markCurrentVideoAsAutoHandled();
        exitWindowedMode();
        return;
    }

    if (!checkWindowedShortcut(event, windowedShortcut, DEFAULT_WINDOWED_SHORTCUT)) {
        return;
    }

    if (
        !checkWindowedShortcutEligibility(event, isEnabled, () =>
            checkEligiblePage(isVideoPage, isShortsPage)
        )
    ) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleWindowedMode();
    focusPlayerForKeyboardControls();
}

function applyAutoWindowedMode() {
    if (!autoWindowedEnabled || document.fullscreenElement) {
        return;
    }

    const watchVideoId = new URL(location.href).searchParams.get('v');
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

function handleFullscreenChange() {
    if (!isWindowed) {
        return;
    }

    if (document.fullscreenElement) {
        exitWindowedMode();
    }
}

function markCurrentVideoAsAutoHandled() {
    if (!autoWindowedEnabled) {
        return;
    }

    const watchVideoId = new URL(location.href).searchParams.get('v');
    if (watchVideoId) {
        lastAutoWindowedVideoId = watchVideoId;
    }
    resetAutoWarmup();
}

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

    runtimeCleanupCallbacks.push(() =>
        document.removeEventListener('yt-navigate-finish', handleRouteOrPlayerChange)
    );
    runtimeCleanupCallbacks.push(() =>
        document.removeEventListener('yt-page-data-updated', handleRouteOrPlayerChange)
    );
    runtimeCleanupCallbacks.push(() =>
        window.removeEventListener('popstate', handleRouteOrPlayerChange)
    );
    runtimeCleanupCallbacks.push(() =>
        window.removeEventListener('resize', handleRouteOrPlayerChange)
    );
    runtimeCleanupCallbacks.push(() =>
        document.removeEventListener('fullscreenchange', handleFullscreenChange)
    );
    runtimeCleanupCallbacks.push(() =>
        document.removeEventListener('keydown', handleKeydown, true)
    );

    observer = createThrottledObserver(() => {
        syncUiState();
    }, OBSERVER_THROTTLE_MS);

    observer.observe(document.body, {
        childList: true,
        subtree: true,
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

function findControlsHost() {
    const rotationButton = document.querySelector('.custom-rotation-button');
    if (rotationButton instanceof Element && rotationButton.parentElement) {
        return rotationButton.parentElement;
    }

    const player = getLivePlayerElement(getLiveRootPlayer(mountedRootPlayer), mountedRootPlayer);
    if (!player) {
        return null;
    }

    const right = player.querySelector('.ytp-right-controls');
    if (right instanceof Element) {
        return right;
    }

    return player.querySelector('.ytp-left-controls');
}

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
        autoWindowedEnabled,
    });

    if (isEnabled) {
        syncUiState();
    }
}

function enable() {
    isEnabled = true;

    if (!isInitialized) {
        initWindowedFullscreen();
        return;
    }

    startRuntimeTracking();
    syncUiState();
}

function disable() {
    isEnabled = false;
    stopRuntimeTracking();
    exitWindowedMode();
    windowedButton = destroyButton(windowedButton);
    lastAutoWindowedVideoId = null;
    resetAutoWarmup();
}

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

export { initWindowedFullscreen, updateSettings, enable, disable, cleanup };
