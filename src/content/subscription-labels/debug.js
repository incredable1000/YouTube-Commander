// Subscription Labels Debug Utilities
let debugState = null;
export function setDebugState(key, value) {
    try {
        if (!debugState) {
            debugState = { loadedAt: Date.now() };
        }
        debugState[key] = value;
        window.__YT_COMMANDER_SUBS_LABELS__ = debugState;
    } catch (_error) {
        // Ignore debug state errors.
    }
}
export function setDebugAttribute(value) {
    try {
        document.documentElement.setAttribute('data-yt-commander-subs-labels', value);
    } catch (_error) {
        // Ignore DOM errors.
    }
}
export function setDebugMeta(key, value) {
    try {
        const safeValue = typeof value === 'string' ? value.slice(0, 180) : String(value);
        document.documentElement.setAttribute(`data-yt-commander-subs-${key}`, safeValue);
    } catch (_error) {
        // Ignore DOM errors.
    }
}
export function isElementHidden(element) {
    if (!element) {
        return true;
    }
    if (element.hasAttribute('hidden')) {
        return true;
    }
    if (element.getAttribute('aria-hidden') === 'true') {
        return true;
    }
    return false;
}
