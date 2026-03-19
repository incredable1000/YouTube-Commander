/**
 * Main-world volume bridge for Shorts shortcuts.
 */

import { createLogger } from './utils/logger.js';
import { getActivePlayer, getActiveVideo, getYouTubePlayer } from './utils/youtube.js';
import { MESSAGE_TYPES } from '../shared/constants.js';

const logger = createLogger('ShortsVolumeBridge');

const VOLUME_MIN = 0;
const VOLUME_MAX = 100;

let initialized = false;
let messageListenerAttached = false;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getVolumeFromPlayer(player) {
    if (!player || typeof player.getVolume !== 'function') {
        return null;
    }
    const volume = Number(player.getVolume());
    return Number.isFinite(volume) ? volume : null;
}

function setPlayerVolume(player, volume) {
    if (!player || typeof player.setVolume !== 'function') {
        return false;
    }
    player.setVolume(volume);

    if (typeof player.isMuted === 'function') {
        if (volume === 0) {
            if (!player.isMuted() && typeof player.mute === 'function') {
                player.mute();
            }
        } else if (player.isMuted() && typeof player.unMute === 'function') {
            player.unMute();
        }
    }

    return true;
}

function resolvePlayer() {
    return getActivePlayer() || getYouTubePlayer();
}

function handleVolumeStep(step) {
    const delta = Number(step);
    if (!Number.isFinite(delta) || delta === 0) {
        return;
    }

    const player = resolvePlayer();
    const currentPlayerVolume = getVolumeFromPlayer(player);
    if (currentPlayerVolume !== null) {
        const nextVolume = clamp(currentPlayerVolume + delta, VOLUME_MIN, VOLUME_MAX);
        if (nextVolume !== currentPlayerVolume) {
            setPlayerVolume(player, nextVolume);
        }
        return;
    }

    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement)) {
        return;
    }

    const current = Number.isFinite(video.volume) ? video.volume : 0;
    const next = clamp(current + delta / 100, 0, 1);
    if (next === current) {
        return;
    }

    video.volume = next;
    if (next === 0) {
        video.muted = true;
    } else {
        video.muted = false;
    }
}

function handleWindowMessage(event) {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
        return;
    }

    if (event.data.type !== MESSAGE_TYPES.VOLUME_STEP) {
        return;
    }

    handleVolumeStep(event.data.delta);
}

function attachMessageListener() {
    if (messageListenerAttached) {
        return;
    }

    window.addEventListener('message', handleWindowMessage);
    messageListenerAttached = true;
}

async function initShortsVolumeBridge() {
    if (initialized) {
        return;
    }

    attachMessageListener();
    initialized = true;
    logger.info('Shorts volume bridge initialized');
}

export {
    initShortsVolumeBridge
};

