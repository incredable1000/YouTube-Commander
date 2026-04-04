/**
 * Watched History playback binding utilities.
 */

import { createLogger } from '../utils/logger.js';
import { PLAYBACK_BIND_DELAY_MS, PLAYBACK_BIND_MAX_RETRIES } from './constants.js';
import { extractVideoId, isValidVideoId } from './videoId.js';
import { getCurrentVideoId } from '../utils/youtube.js';

const logger = createLogger('WatchedHistory');

let isEnabled = true;
let playbackTimer = null;
const playbackBindings = new Map();

export function setIsEnabled(enabled) {
    isEnabled = enabled;
}

export function getPlaybackBindings() {
    return playbackBindings;
}

export function getCurrentPageVideoId() {
    if (location.pathname === '/watch') {
        const watchId = getCurrentVideoId();
        return isValidVideoId(watchId) ? watchId : null;
    }

    if (location.pathname.startsWith('/shorts/')) {
        const parts = location.pathname.split('/shorts/');
        const shortsId = parts[1] ? parts[1].split('/')[0] : null;
        return isValidVideoId(shortsId) ? shortsId : null;
    }

    return null;
}

export function getActiveVideoElement() {
    if (location.pathname.startsWith('/shorts/')) {
        const activeRenderer = getActiveShortsRenderer();
        if (activeRenderer) {
            const insideRenderer = activeRenderer.querySelector('video.html5-main-video');
            if (insideRenderer) {
                return insideRenderer;
            }
        }

        return document.querySelector('ytd-shorts video.html5-main-video');
    }

    return document.querySelector('video.html5-main-video');
}

function getActiveShortsRenderer() {
    const renderers = document.querySelectorAll('ytd-reel-video-renderer');
    for (const renderer of renderers) {
        if (renderer.isConnected && renderer.offsetParent !== null) {
            return renderer;
        }
    }
    return null;
}

function resolvePlaybackVideoId(video, fallbackVideoId = null) {
    if (isValidVideoId(fallbackVideoId)) {
        return fallbackVideoId;
    }

    if (location.pathname.startsWith('/shorts/')) {
        const renderer = video?.closest?.('ytd-reel-video-renderer');
        if (renderer) {
            const rendererLink = renderer.querySelector(
                'a[href*="/shorts/"], a[href*="/watch?v="]'
            );
            if (rendererLink?.href) {
                const rendererVideoId = extractVideoId(rendererLink.href);
                if (isValidVideoId(rendererVideoId)) {
                    return rendererVideoId;
                }
            }
        }

        const activeRenderer = getActiveShortsRenderer();
        if (activeRenderer) {
            const activeLink = activeRenderer.querySelector(
                'a[href*="/shorts/"], a[href*="/watch?v="]'
            );
            if (activeLink?.href) {
                const activeVideoId = extractVideoId(activeLink.href);
                if (isValidVideoId(activeVideoId)) {
                    return activeVideoId;
                }
            }
        }
    }

    return getCurrentPageVideoId();
}

export function pruneDisconnectedPlaybackBindings() {
    for (const [video, binding] of playbackBindings.entries()) {
        if (video.isConnected) {
            continue;
        }

        video.removeEventListener('play', binding.onPlay);
        video.removeEventListener('loadeddata', binding.onLoadedData);
        playbackBindings.delete(video);
    }
}

export function bindPlayHandler(video, currentVideoId, watchedIds, addToWatchedHistory) {
    const existing = playbackBindings.get(video);
    if (existing) {
        existing.markCurrent(currentVideoId);
        return;
    }

    const binding = {
        lastMarkedId: '',
        onPlay: null,
        onLoadedData: null,
        markCurrent: () => {},
    };

    const markCurrent = (seedVideoId = null) => {
        if (!isEnabled) {
            return;
        }

        const currentPageId = getCurrentPageVideoId();
        if (!currentPageId) {
            return;
        }

        const resolvedVideoId = resolvePlaybackVideoId(video, seedVideoId);
        if (!isValidVideoId(resolvedVideoId)) {
            return;
        }

        if (binding.lastMarkedId === resolvedVideoId && watchedIds.has(resolvedVideoId)) {
            return;
        }

        binding.lastMarkedId = resolvedVideoId;
        addToWatchedHistory(resolvedVideoId).catch((error) => {
            logger.error('Failed to mark video on play event', error);
        });
    };

    const onPlay = () => markCurrent();
    const onLoadedData = () => {
        if (!video.paused) {
            markCurrent();
        }
    };

    binding.onPlay = onPlay;
    binding.onLoadedData = onLoadedData;
    binding.markCurrent = markCurrent;

    video.addEventListener('play', onPlay);
    video.addEventListener('loadeddata', onLoadedData);
    playbackBindings.set(video, binding);

    if (!video.paused || isValidVideoId(currentVideoId)) {
        markCurrent(currentVideoId);
    }
}

export function schedulePlaybackBinding(playbackBindings, watchedIds, addToWatchedHistory) {
    if (!isEnabled) {
        return;
    }

    if (playbackTimer) {
        clearTimeout(playbackTimer);
    }

    let attempt = 0;

    const bind = () => {
        if (!isEnabled) {
            return;
        }

        const pageVideoId = getCurrentPageVideoId();
        if (!pageVideoId) {
            return;
        }

        const activeVideo = getActiveVideoElement();
        if (!activeVideo) {
            attempt += 1;
            if (attempt < PLAYBACK_BIND_MAX_RETRIES) {
                playbackTimer = setTimeout(bind, PLAYBACK_BIND_DELAY_MS);
            }
            return;
        }

        pruneDisconnectedPlaybackBindings();
        bindPlayHandler(activeVideo, pageVideoId, watchedIds, addToWatchedHistory);
    };

    playbackTimer = setTimeout(bind, PLAYBACK_BIND_DELAY_MS);
}
