/**
 * Shared helpers for YouTube quality ids and selection logic.
 */

const QUALITY_HEIGHT_MAP = Object.freeze({
    highres: 4320,
    hd2880: 2880,
    hd2160: 2160,
    hd1440: 1440,
    hd1080: 1080,
    hd720: 720,
    large: 480,
    medium: 360,
    small: 240,
    tiny: 144
});

const DEFAULT_QUALITY = 'hd1080';
const AUTO_QUALITY = 'auto';
const KNOWN_QUALITY_IDS = Object.freeze([
    'highres',
    'hd2880',
    'hd2160',
    'hd1440',
    'hd1080',
    'hd720',
    'large',
    'medium',
    'small',
    'tiny'
]);

/**
 * Convert a quality id to numeric height for sorting/comparison.
 * @param {string} qualityId
 * @returns {number}
 */
function getQualityHeight(qualityId) {
    if (typeof qualityId !== 'string') {
        return Number.NaN;
    }

    const normalized = qualityId.trim().toLowerCase();
    if (!normalized) {
        return Number.NaN;
    }

    if (Object.prototype.hasOwnProperty.call(QUALITY_HEIGHT_MAP, normalized)) {
        return QUALITY_HEIGHT_MAP[normalized];
    }

    const hdMatch = normalized.match(/^hd(\d{3,4})$/);
    if (hdMatch) {
        const parsed = Number.parseInt(hdMatch[1], 10);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }

    const pMatch = normalized.match(/^(\d{3,4})p$/);
    if (pMatch) {
        const parsed = Number.parseInt(pMatch[1], 10);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }

    return Number.NaN;
}

/**
 * Normalize quality id to canonical lowercase value.
 * @param {string} qualityId
 * @param {string} [fallback=DEFAULT_QUALITY]
 * @returns {string}
 */
function normalizeQualityId(qualityId, fallback = DEFAULT_QUALITY) {
    if (typeof qualityId === 'string') {
        const normalized = qualityId.trim().toLowerCase();
        if (normalized && normalized !== AUTO_QUALITY) {
            return normalized;
        }
    }

    return normalizeQualityIdSafeFallback(fallback);
}

/**
 * Check whether quality id is known/supported by settings UI.
 * @param {string} qualityId
 * @returns {boolean}
 */
function isKnownQualityId(qualityId) {
    if (typeof qualityId !== 'string') {
        return false;
    }

    const normalized = qualityId.trim().toLowerCase();
    return KNOWN_QUALITY_IDS.includes(normalized) || Number.isFinite(getQualityHeight(normalized));
}

/**
 * Unique + normalize quality ids from player API output.
 * @param {string[]} qualities
 * @returns {string[]}
 */
function normalizeAvailableQualities(qualities) {
    if (!Array.isArray(qualities)) {
        return [];
    }

    const seen = new Set();
    const normalized = [];

    qualities.forEach((quality) => {
        if (typeof quality !== 'string') {
            return;
        }

        const value = quality.trim().toLowerCase();
        if (!value || value === AUTO_QUALITY || seen.has(value)) {
            return;
        }

        seen.add(value);
        normalized.push(value);
    });

    return normalized;
}

/**
 * Sort quality ids by preference descending (best to worst).
 * @param {string[]} qualities
 * @returns {string[]}
 */
function sortQualitiesByPreference(qualities) {
    const normalized = normalizeAvailableQualities(qualities);
    return normalized.sort((left, right) => {
        const leftHeight = getQualityHeight(left);
        const rightHeight = getQualityHeight(right);

        const leftScore = Number.isFinite(leftHeight) ? leftHeight : -1;
        const rightScore = Number.isFinite(rightHeight) ? rightHeight : -1;

        if (rightScore !== leftScore) {
            return rightScore - leftScore;
        }

        return right.localeCompare(left);
    });
}

/**
 * Pick best available quality at/below preferred max; fallback to closest available.
 * @param {string} preferredQuality
 * @param {string[]} availableQualities
 * @returns {string}
 */
function chooseBestAvailableQuality(preferredQuality, availableQualities) {
    const sortedAvailable = sortQualitiesByPreference(availableQualities);
    if (sortedAvailable.length === 0) {
        return '';
    }

    const preferred = normalizeQualityId(preferredQuality, DEFAULT_QUALITY);
    if (preferred === 'highres') {
        return sortedAvailable[0];
    }

    const preferredHeight = getQualityHeight(preferred);
    if (!Number.isFinite(preferredHeight)) {
        return sortedAvailable[0];
    }

    const atOrBelow = sortedAvailable.find((quality) => {
        const height = getQualityHeight(quality);
        return Number.isFinite(height) && height <= preferredHeight;
    });
    if (atOrBelow) {
        return atOrBelow;
    }

    const ascending = [...sortedAvailable].sort((left, right) => {
        const leftHeight = getQualityHeight(left);
        const rightHeight = getQualityHeight(right);
        const leftScore = Number.isFinite(leftHeight) ? leftHeight : Number.POSITIVE_INFINITY;
        const rightScore = Number.isFinite(rightHeight) ? rightHeight : Number.POSITIVE_INFINITY;
        return leftScore - rightScore;
    });

    const abovePreferred = ascending.find((quality) => {
        const height = getQualityHeight(quality);
        return Number.isFinite(height) && height > preferredHeight;
    });

    return abovePreferred || sortedAvailable[0];
}

/**
 * Normalize fallback value safely without recursion loops.
 * @param {string} fallback
 * @returns {string}
 */
function normalizeQualityIdSafeFallback(fallback) {
    if (typeof fallback === 'string') {
        const normalizedFallback = fallback.trim().toLowerCase();
        if (normalizedFallback && normalizedFallback !== AUTO_QUALITY) {
            return normalizedFallback;
        }
    }

    return DEFAULT_QUALITY;
}

export {
    DEFAULT_QUALITY,
    KNOWN_QUALITY_IDS,
    getQualityHeight,
    isKnownQualityId,
    normalizeQualityId,
    normalizeAvailableQualities,
    sortQualitiesByPreference,
    chooseBestAvailableQuality
};
