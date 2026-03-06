/**
 * Shared shortcut key helpers.
 */

const NAMED_KEYS = {
    enter: 'Enter',
    space: ' ',
    spacebar: ' ',
    escape: 'Escape',
    esc: 'Escape',
    tab: 'Tab',
    backspace: 'Backspace',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown'
};

/**
 * Normalize raw key input into canonical KeyboardEvent.key form.
 * @param {any} value
 * @param {string} fallback
 * @returns {string}
 */
export function normalizeShortcutKey(value, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    if (trimmed.length === 1) {
        return trimmed.toLowerCase();
    }

    const named = NAMED_KEYS[trimmed.toLowerCase()];
    return named || trimmed;
}

/**
 * Compare an event key against a normalized shortcut key.
 * @param {string} eventKey
 * @param {string} expectedKey
 * @returns {boolean}
 */
export function shortcutKeyEquals(eventKey, expectedKey) {
    if (typeof eventKey !== 'string' || typeof expectedKey !== 'string') {
        return false;
    }

    if (expectedKey.length === 1) {
        return eventKey.toLowerCase() === expectedKey.toLowerCase();
    }

    return eventKey === expectedKey;
}

