/**
 * Time parsing and relative-age formatting helpers for Shorts labels.
 */

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

const DATE_PATTERNS = [
    /<meta[^>]+itemprop=["']uploadDate["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /"uploadDate"\s*:\s*"([^"]+)"/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"publishDate"\s*:\s*"([^"]+)"/i,
    /\\"uploadDate\\"\s*:\s*\\"([^\\"]+)\\"/i,
    /\\"datePublished\\"\s*:\s*\\"([^\\"]+)\\"/i,
    /\\"publishDate\\"\s*:\s*\\"([^\\"]+)\\"/i
];

/**
 * Parse date string into timestamp.
 * @param {string} value
 * @returns {number|null}
 */
function parseDateString(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? `${trimmed}T00:00:00Z`
        : trimmed;

    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Extract upload timestamp from Shorts page HTML.
 * @param {string} html
 * @returns {number|null}
 */
function extractUploadTimestampFromHtml(html) {
    if (typeof html !== 'string' || html.length === 0) {
        return null;
    }

    for (const pattern of DATE_PATTERNS) {
        const match = html.match(pattern);
        const timestamp = parseDateString(match?.[1] || '');
        if (timestamp) {
            return timestamp;
        }
    }

    return null;
}

/**
 * Convert timestamp to compact relative label.
 * @param {number} timestampMs
 * @param {number} [nowMs=Date.now()]
 * @returns {string}
 */
function formatRelativeAge(timestampMs, nowMs = Date.now()) {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
        return '';
    }

    const diffMs = nowMs - timestampMs;
    if (!Number.isFinite(diffMs) || diffMs < 0) {
        return 'just now';
    }

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 45) {
        return 'just now';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return RELATIVE_FORMATTER.format(-minutes, 'minute');
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return RELATIVE_FORMATTER.format(-hours, 'hour');
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
        return RELATIVE_FORMATTER.format(-days, 'day');
    }

    const weeks = Math.floor(days / 7);
    if (weeks < 5) {
        return RELATIVE_FORMATTER.format(-weeks, 'week');
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
        return RELATIVE_FORMATTER.format(-months, 'month');
    }

    const years = Math.floor(days / 365);
    return RELATIVE_FORMATTER.format(-years, 'year');
}

/**
 * Extract relative-age phrase from text when YouTube already exposes it.
 * @param {string} value
 * @returns {string}
 */
function extractRelativeFromText(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }

    if (/\bjust now\b/i.test(normalized)) {
        return 'just now';
    }

    const match = normalized.match(/\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i);
    if (!match) {
        return '';
    }

    const amount = Number.parseInt(match[1], 10);
    if (!Number.isFinite(amount) || amount < 0) {
        return '';
    }

    const unit = match[2].toLowerCase();
    return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
}

export {
    extractUploadTimestampFromHtml,
    formatRelativeAge,
    parseDateString,
    extractRelativeFromText
};
