export function setupNavigationObservers(isShortsPage, handleContextChange) {
    const callbacks = [];

    const handleYtNavigateFinish = () => {
        handleContextChange('yt-navigate', { force: true });
    };
    document.addEventListener('yt-navigate-finish', handleYtNavigateFinish);
    callbacks.push(() =>
        document.removeEventListener('yt-navigate-finish', handleYtNavigateFinish)
    );

    const handleYtPageDataUpdated = () => {
        handleContextChange('yt-navigate');
    };
    document.addEventListener('yt-page-data-updated', handleYtPageDataUpdated);
    callbacks.push(() =>
        document.removeEventListener('yt-page-data-updated', handleYtPageDataUpdated)
    );

    const handlePopState = () => {
        handleContextChange('yt-navigate', { force: true });
    };
    window.addEventListener('popstate', handlePopState);
    callbacks.push(() => window.removeEventListener('popstate', handlePopState));

    let mutationQueued = false;
    const navigationObserver = new MutationObserver(() => {
        if (mutationQueued) {
            return;
        }

        mutationQueued = true;
        window.setTimeout(() => {
            mutationQueued = false;
            handleContextChange('yt-navigate');
        }, 100);
    });

    if (document.body) {
        navigationObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    return { observer: navigationObserver, callbacks };
}

export function setupShortsObserver(handleContextChange) {
    const shortsObserver = new MutationObserver((mutations) => {
        const isShorts = document.querySelector(
            'ytd-reel-video-renderer[is-active], ytd-reel-player-overlay-renderer'
        );
        if (!isShorts) {
            return;
        }

        const hasActiveShortChange = mutations.some((mutation) => {
            if (mutation.type === 'attributes') {
                return mutation.attributeName === 'is-active';
            }

            return (
                mutation.type === 'childList' &&
                (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
            );
        });

        if (hasActiveShortChange) {
            handleContextChange('shorts-scroll', { force: true });
        }
    });

    if (document.body) {
        shortsObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['is-active'],
        });
    }

    return shortsObserver;
}

export function setupVideoLifecycleObservers(handleContextChange) {
    const callbacks = [];

    const handleVideoPlay = (event) => {
        if (!event?.target || event.target.nodeName !== 'VIDEO') {
            return;
        }
        handleContextChange('play');
    };
    document.addEventListener('play', handleVideoPlay, true);
    callbacks.push(() => document.removeEventListener('play', handleVideoPlay, true));

    const handleLoadedMetadata = (event) => {
        if (!event?.target || event.target.nodeName !== 'VIDEO') {
            return;
        }
        handleContextChange('loadedmetadata');
    };
    document.addEventListener('loadedmetadata', handleLoadedMetadata, true);
    callbacks.push(() =>
        document.removeEventListener('loadedmetadata', handleLoadedMetadata, true)
    );

    const handleCanPlay = (event) => {
        if (!event?.target || event.target.nodeName !== 'VIDEO') {
            return;
        }
        handleContextChange('canplay');
    };
    document.addEventListener('canplay', handleCanPlay, true);
    callbacks.push(() => document.removeEventListener('canplay', handleCanPlay, true));

    return callbacks;
}

export function setupFocusObservers(handleContextChange) {
    const callbacks = [];

    const handleFocus = () => {
        handleContextChange('focus');
    };
    window.addEventListener('focus', handleFocus);
    callbacks.push(() => window.removeEventListener('focus', handleFocus));

    return callbacks;
}

export function cleanupObservers(observers, callbacks) {
    observers.forEach((observer) => {
        if (observer && typeof observer.disconnect === 'function') {
            observer.disconnect();
        }
    });
    callbacks.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
            cleanup();
        }
    });
}
