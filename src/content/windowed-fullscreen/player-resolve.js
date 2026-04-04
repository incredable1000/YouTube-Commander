/**
 * Windowed fullscreen player resolution utilities.
 */

import { getActivePlayer } from '../utils/youtube.js';
import { PLAYER_ACTIVE_CLASS } from './constants.js';
import { isUsableMountParent, findFallbackPlayerMount, getRootPlayerHost } from './dom.js';

export function findRootPlayers() {
    return Array.from(document.querySelectorAll('#movie_player'));
}

export function findExternalRootPlayer(overlayHost) {
    const roots = findRootPlayers();
    if (roots.length === 0) {
        return null;
    }
    if (!overlayHost || !overlayHost.isConnected) {
        return roots[0];
    }
    return roots.find((root) => !overlayHost.contains(root) && isStableRootPlayer(root)) || null;
}

export function resolvePlayerFromRoot(rootPlayer) {
    if (!(rootPlayer instanceof Element)) {
        return null;
    }
    if (rootPlayer.matches('.html5-video-player')) {
        return rootPlayer;
    }
    const player = rootPlayer.querySelector('.html5-video-player');
    return player instanceof Element ? player : null;
}

export function isStableRootPlayer(rootPlayer) {
    if (!(rootPlayer instanceof Element) || !rootPlayer.isConnected) {
        return false;
    }

    if (!isUsableMountParent(rootPlayer.parentNode)) {
        return false;
    }

    const player = resolvePlayerFromRoot(rootPlayer);
    if (!(player instanceof HTMLElement)) {
        return false;
    }

    const video = rootPlayer.querySelector('video.html5-main-video, .html5-video-container video');
    const controls = player.querySelector(
        '.ytp-right-controls, .ytp-left-controls, .ytp-chrome-bottom'
    );
    const rect = rootPlayer.getBoundingClientRect();

    return (
        video instanceof HTMLVideoElement ||
        controls instanceof Element ||
        (rect.width > 0 && rect.height > 0 && player.childElementCount > 0)
    );
}

export function getLiveRootPlayer(mountedRootPlayer) {
    const fallbackParent = findFallbackPlayerMount();
    if (fallbackParent instanceof Element) {
        const root = fallbackParent.querySelector('#movie_player');
        if (root instanceof Element) {
            return root;
        }
    }

    if (mountedRootPlayer instanceof Element && mountedRootPlayer.isConnected) {
        return mountedRootPlayer;
    }

    return getRootPlayerHost(getActivePlayer());
}

export function getMountedPlayerElement(mountedPlayer) {
    const mounted = resolvePlayerFromRoot(mountedPlayer);
    return mounted instanceof HTMLElement ? mounted : null;
}

export function getLivePlayerElement(liveRoot, mountedPlayer) {
    const liveResolved = resolvePlayerFromRoot(liveRoot);
    const resolved =
        liveResolved instanceof HTMLElement
            ? liveResolved
            : getMountedPlayerElement(mountedPlayer) || getActivePlayer();
    return resolved;
}
