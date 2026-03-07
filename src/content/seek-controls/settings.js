/**
 * Seek controls settings helpers.
 */

import { DEFAULT_SETTINGS } from '../../shared/constants.js';

/**
 * Check plain object.
 * @param {any} value
 * @returns {boolean}
 */
export function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Clamp seek seconds to a safe range.
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
export function clampSeconds(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(600, Math.max(1, parsed));
}

/**
 * Normalize shortcut shape.
 * @param {any} value
 * @param {object} fallback
 * @returns {{ctrl: boolean, shift: boolean, alt: boolean, key: string}}
 */
export function normalizeShortcut(value, fallback) {
    const source = isPlainObject(value) ? value : {};

    return {
        ctrl: Boolean(source.ctrl ?? fallback.ctrl ?? false),
        shift: Boolean(source.shift ?? fallback.shift ?? false),
        alt: Boolean(source.alt ?? fallback.alt ?? false),
        key: typeof source.key === 'string' && source.key.length > 0
            ? source.key
            : (fallback.key || 'ArrowRight')
    };
}

/**
 * Normalize settings with safe defaults.
 * @param {object} source
 * @returns {object}
 */
export function normalizeSettings(source) {
    const safe = isPlainObject(source) ? source : {};

    return {
        ...DEFAULT_SETTINGS,
        shortSeek: clampSeconds(safe.shortSeek, DEFAULT_SETTINGS.shortSeek),
        mediumSeek: clampSeconds(safe.mediumSeek, DEFAULT_SETTINGS.mediumSeek),
        longSeek: clampSeconds(safe.longSeek, DEFAULT_SETTINGS.longSeek),
        shortSeekKey: normalizeShortcut(safe.shortSeekKey, DEFAULT_SETTINGS.shortSeekKey),
        mediumSeekKey: normalizeShortcut(safe.mediumSeekKey, DEFAULT_SETTINGS.mediumSeekKey),
        longSeekKey: normalizeShortcut(safe.longSeekKey, DEFAULT_SETTINGS.longSeekKey)
    };
}
