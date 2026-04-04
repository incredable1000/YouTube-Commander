/**
 * Seek controls seek action utilities.
 */

import { getActiveVideo, getActivePlayer, isShortsPage } from '../utils/youtube.js';
import {
    CONTROL_VISIBILITY_HOLD_MS,
    INDICATOR_HIDE_DELAY_MS,
    INDICATOR_REMOVE_DELAY_MS,
} from './constants.js';
import { createIndicatorElement, updateIndicatorElement } from './indicatorDom.js';
import { applyIndicatorInset } from './indicator-utils.js';

let controlsVisibilityTimer = null;
let controlsVisibilityPlayer = null;
let controlsVisibilityRestoreAutohide = false;

export function applySeekTime(video, targetTime) {
    const safeTarget = Number.isFinite(targetTime) ? Math.max(0, targetTime) : 0;
    const moviePlayer = document.getElementById('movie_player');

    if (moviePlayer && typeof moviePlayer.seekTo === 'function') {
        try {
            moviePlayer.seekTo(safeTarget, true);
            return;
        } catch (error) {
            // Fall back to video.currentTime
        }
    }

    video.currentTime = safeTarget;
}

export function showPlayerSeekFeedback(player) {
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
            const keepVisible =
                root.matches(':hover') ||
                (video instanceof HTMLVideoElement && (video.paused || video.ended));

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
        controlsRoot.querySelector('.ytp-progress-bar-container'),
    ].filter((node) => node instanceof HTMLElement);

    const playerRect = player.getBoundingClientRect();
    const baseEvent = {
        bubbles: true,
        cancelable: true,
        clientX: playerRect.left + playerRect.width * 0.5,
        clientY: playerRect.top + playerRect.height * 0.86,
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
        ['showControls', 'showControlsForAWhile_', 'showControls_', 'wakeUpControls'].forEach(
            (methodName) => {
                const method = api[methodName];
                if (typeof method === 'function') {
                    try {
                        method.call(api);
                    } catch (_error) {
                        // no-op
                    }
                }
            }
        );
    });
}

export function syncProgressUiAfterSeek(video, player) {
    if (!(video instanceof HTMLVideoElement)) {
        return;
    }

    const moviePlayer = document.getElementById('movie_player');
    const controlsRoot =
        moviePlayer instanceof HTMLElement
            ? moviePlayer
            : player instanceof HTMLElement
              ? player
              : null;
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

            [
                'updateProgressBar_',
                'updateProgressBar',
                'updateTimeDisplay_',
                'updateTimeDisplay',
            ].forEach((methodName) => {
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
        const clientX = rect.left + rect.width * ratio;
        const clientY = rect.top + rect.height * 0.5;

        try {
            progressContainer.dispatchEvent(
                new MouseEvent('mousemove', {
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                })
            );
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

export function showSeekIndicator(indicatorStates, direction, seconds) {
    if (isShortsPage()) {
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

    applyIndicatorInset(state.element, player);

    state.totalSeconds += seconds;
    updateIndicatorElement(state.element, direction, state.totalSeconds);

    state.element.classList.remove('is-active');
    void state.element.offsetWidth;
    state.element.classList.add('is-active');

    if (state.hideTimer) {
        clearTimeout(state.hideTimer);
    }

    state.hideTimer = setTimeout(() => {
        hideSeekIndicator(indicatorStates, direction);
    }, INDICATOR_HIDE_DELAY_MS);
}

export function hideSeekIndicator(indicatorStates, direction) {
    const state = indicatorStates[direction];

    if (!state.element) {
        state.totalSeconds = 0;
        return;
    }

    state.element.classList.remove('is-active');

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

export function clearSeekIndicators(indicatorStates) {
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

    if (controlsVisibilityTimer) {
        clearTimeout(controlsVisibilityTimer);
        controlsVisibilityTimer = null;
    }

    controlsVisibilityPlayer = null;
    controlsVisibilityRestoreAutohide = false;
}

export function resetControlsVisibility() {
    controlsVisibilityTimer = null;
    controlsVisibilityPlayer = null;
    controlsVisibilityRestoreAutohide = false;
}
