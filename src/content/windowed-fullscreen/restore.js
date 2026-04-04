/**
 * Windowed fullscreen restore utilities.
 */

import { RESTORE_ANCHOR_CLASS } from './constants.js';
import { findFallbackPlayerMount, forcePlayerRelayout, isUsableMountParent } from './dom.js';

export function createRestoreAnchor(rootPlayer) {
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

export function createRestoreAnchorInParent(parent) {
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

export function ensureRestoreAnchorFallback(
    restoreAnchor,
    setRestoreAnchor,
    setOriginalParent,
    setOriginalSibling
) {
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

    const newAnchor = createRestoreAnchorInParent(fallbackParent);
    setRestoreAnchor(newAnchor);
    setOriginalParent(fallbackParent);
    setOriginalSibling(null);
}

export function restoreMountedRootPlayer(
    mountedRootPlayer,
    restoreAnchor,
    originalRootParent,
    originalRootNextSibling
) {
    if (!(mountedRootPlayer instanceof Element)) {
        return false;
    }

    const fallbackParent = findFallbackPlayerMount();
    if (fallbackParent) {
        if (restoreAnchor && restoreAnchor.parentNode === fallbackParent) {
            fallbackParent.insertBefore(mountedRootPlayer, restoreAnchor);
        } else {
            fallbackParent.appendChild(mountedRootPlayer);
        }

        return true;
    }

    if (restoreAnchor && restoreAnchor.parentNode instanceof Node) {
        restoreAnchor.parentNode.insertBefore(mountedRootPlayer, restoreAnchor);
        return true;
    }

    if (isUsableMountParent(originalRootParent)) {
        if (
            originalRootNextSibling instanceof Node &&
            originalRootNextSibling.parentNode === originalRootParent
        ) {
            originalRootParent.insertBefore(mountedRootPlayer, originalRootNextSibling);
        } else {
            originalRootParent.appendChild(mountedRootPlayer);
        }
        return true;
    }

    return false;
}

export function scheduleDeferredRestore(
    rootPlayer,
    logger,
    forceRelayout,
    RESTORE_RETRY_MAX,
    RESTORE_RETRY_DELAY
) {
    if (!(rootPlayer instanceof Element)) {
        return;
    }

    let attempt = 0;
    const tryRestore = () => {
        if (rootPlayer.isConnected) {
            forceRelayout(rootPlayer);
            return;
        }

        const fallbackParent = findFallbackPlayerMount();
        if (fallbackParent) {
            fallbackParent.appendChild(rootPlayer);
            forceRelayout(rootPlayer);
            return;
        }

        attempt += 1;
        if (attempt >= RESTORE_RETRY_MAX) {
            logger.warn('Unable to restore player root after retries');
            return;
        }

        setTimeout(tryRestore, RESTORE_RETRY_DELAY);
    };

    setTimeout(tryRestore, RESTORE_RETRY_DELAY);
}
