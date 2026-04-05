export function cleanupStaleOverlayRoots(
    overlayHost,
    mountedRootPlayer,
    rootPlayers,
    PLAYER_ACTIVE_CLASS,
    focusPlayerFn
) {
    if (
        !(overlayHost instanceof Element) ||
        !overlayHost.isConnected ||
        !(mountedRootPlayer instanceof Element) ||
        !overlayHost.contains(mountedRootPlayer)
    ) {
        return;
    }

    let removedFocusedRoot = false;

    rootPlayers.forEach((root) => {
        if (
            !(root instanceof Element) ||
            !overlayHost.contains(root) ||
            root === mountedRootPlayer
        ) {
            return;
        }

        if (root.contains(document.activeElement)) {
            removedFocusedRoot = true;
        }

        root.classList.remove(PLAYER_ACTIVE_CLASS);
        root.remove();
    });

    if (removedFocusedRoot && focusPlayerFn) {
        focusPlayerFn();
    }
}

export function removeDuplicateRootPlayers(mountedRootPlayer, rootPlayers, PLAYER_ACTIVE_CLASS) {
    if (!(mountedRootPlayer instanceof Element)) {
        return;
    }

    rootPlayers.forEach((root) => {
        if (
            !(root instanceof Element) ||
            root === mountedRootPlayer ||
            root.closest('ytd-miniplayer')
        ) {
            return;
        }

        root.classList.remove(PLAYER_ACTIVE_CLASS);
        root.remove();
    });
}

export function focusPlayerForKeyboardControls(
    mountedRootPlayer,
    getLiveRootPlayer,
    getLivePlayerElement,
    activePlayer
) {
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
