export function registerEventListeners(targets, handlers, cleanupCallbacks) {
    const { handleRouteOrPlayerChange, handleFullscreenChange, handleKeydown } = handlers;

    const registrations = [
        [targets.document, 'yt-navigate-finish', handleRouteOrPlayerChange],
        [targets.document, 'yt-page-data-updated', handleRouteOrPlayerChange],
        [targets.window, 'popstate', handleRouteOrPlayerChange],
        [targets.window, 'resize', handleRouteOrPlayerChange, { passive: true }],
        [targets.document, 'fullscreenchange', handleFullscreenChange],
        [targets.document, 'keydown', handleKeydown, true],
    ];

    registrations.forEach(([target, event, handler, options]) => {
        target.addEventListener(event, handler, options);
        cleanupCallbacks.push(() => target.removeEventListener(event, handler, options));
    });
}

export function stopRuntime(observer, ensureTimer, cleanupCallbacks) {
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    if (ensureTimer) {
        clearInterval(ensureTimer);
        ensureTimer = null;
    }

    while (cleanupCallbacks.length > 0) {
        const teardown = cleanupCallbacks.pop();
        teardown();
    }
}
