/**
 * Watched history video-id helpers.
 */

/**
 * Extract video id from watch/short URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractVideoId(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    try {
        const parsed = new URL(url, location.origin);

        if (parsed.pathname === '/watch') {
            return parsed.searchParams.get('v');
        }

        if (parsed.pathname.startsWith('/shorts/')) {
            const shortsId = parsed.pathname.split('/shorts/')[1];
            return shortsId ? shortsId.split('/')[0] : null;
        }

        return null;
    } catch (_error) {
        const fallback = url.match(/(?:v=|\/shorts\/)([A-Za-z0-9_-]{10,15})/);
        return fallback ? fallback[1] : null;
    }
}

/**
 * Validate a YouTube video id.
 * @param {string|null|undefined} videoId
 * @returns {boolean}
 */
export function isValidVideoId(videoId) {
    return typeof videoId === 'string' && /^[A-Za-z0-9_-]{10,15}$/.test(videoId);
}
