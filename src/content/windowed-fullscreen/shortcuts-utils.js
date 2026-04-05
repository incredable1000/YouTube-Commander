import { normalizeShortcutKey, shortcutKeyEquals } from '../../shared/shortcutKey.js';

export function matchesWindowedShortcut(event, windowedShortcut, defaultShortcut) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return false;
    }

    const expectedKey = normalizeShortcutKey(windowedShortcut, defaultShortcut);
    const eventKey = typeof event.key === 'string' ? event.key : '';

    if (!eventKey) {
        return false;
    }

    return shortcutKeyEquals(eventKey, expectedKey);
}

export function shouldHandleWindowedShortcut(event, isEnabled, isEligiblePage) {
    if (!isEnabled || !isEligiblePage || event.repeat) {
        return false;
    }

    const active = document.activeElement;
    if (!(active instanceof Element)) {
        return true;
    }

    if (
        active.matches('input, textarea, select, [contenteditable="true"]') ||
        active.closest('input, textarea, select, [contenteditable="true"]')
    ) {
        return false;
    }

    if (active.closest('#movie_player, .html5-video-player')) {
        return true;
    }

    if (
        active.matches('button, a, [role="button"]') ||
        active.closest('button, a, [role="button"]')
    ) {
        return false;
    }

    return true;
}
