/**
 * Parsing utilities for playlist operations.
 */

export function parseJsonSafe(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

export function readApiError(responseText) {
    const parsed = parseJsonSafe(responseText);
    if (!parsed) {
        return 'Unknown error';
    }

    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        return parsed.errors[0]?.internalErrorMessage || parsed.errors[0]?.errorCode || 'API error';
    }

    if (typeof parsed.errorMessage === 'string') {
        return parsed.errorMessage;
    }

    if (typeof parsed.error?.message === 'string') {
        return parsed.error.message;
    }

    if (typeof parsed.message === 'string') {
        return parsed.message;
    }

    return 'Unknown error';
}

export function readTextValue(value) {
    if (!value) {
        return '';
    }

    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value.simpleText === 'string') {
        return value.simpleText.trim();
    }

    if (Array.isArray(value.runs)) {
        return value.runs
            .map((run) => (run && typeof run.text === 'string' ? run.text : ''))
            .join('')
            .trim();
    }

    if (typeof value === 'object' && value !== null) {
        if (typeof value.text === 'string') {
            return String(value.text).trim();
        }
    }

    return '';
}

export function parseRelativeAgeToTimestamp(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const text = readTextValue(value);
    if (!text) {
        return null;
    }

    const numMatch = text.match(/^([\d,]+)\s*(second|minute|hour|day|week|month|year)s?\s*ago$/i);
    if (!numMatch) {
        return null;
    }

    const num = parseInt(numMatch[1].replace(/,/g, ''), 10);
    if (!Number.isFinite(num) || num <= 0) {
        return null;
    }

    const unit = numMatch[2].toLowerCase();
    const now = Date.now();

    switch (unit) {
        case 'second':
            return now - num * 1000;
        case 'minute':
            return now - num * 60 * 1000;
        case 'hour':
            return now - num * 3600 * 1000;
        case 'day':
            return now - num * 86400 * 1000;
        case 'week':
            return now - num * 604800 * 1000;
        case 'month':
            return now - num * 2592000 * 1000;
        case 'year':
            return now - num * 31536000 * 1000;
        default:
            return null;
    }
}

export function parseDateLikeValue(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const text = readTextValue(value);
    if (!text) {
        return null;
    }

    const parsed = Date.parse(text);
    if (Number.isFinite(parsed)) {
        return parsed;
    }

    return parseRelativeAgeToTimestamp(value);
}
