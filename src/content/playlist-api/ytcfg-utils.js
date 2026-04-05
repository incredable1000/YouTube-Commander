/**
 * YouTube API utilities for playlist operations.
 */

export function getYtCfgValue(key) {
    try {
        if (window.ytcfg && typeof window.ytcfg.get === 'function') {
            return window.ytcfg.get(key);
        }
    } catch (_error) {
        // Ignore and fallback below.
    }

    try {
        return window.ytcfg?.data_?.[key];
    } catch (_error) {
        return undefined;
    }
}

export function getCookieValue(name) {
    try {
        const encoded = encodeURIComponent(name);
        const match = document.cookie.match(new RegExp(`(?:^|; )${encoded}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    } catch (_error) {
        return '';
    }
}

export async function sha1Hex(input) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const bytes = Array.from(new Uint8Array(hashBuffer));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildInnertubeEndpoint(path, apiKey) {
    return `/youtubei/v1/${path}?prettyPrint=false&key=${encodeURIComponent(apiKey)}`;
}

export function delay(ms) {
    const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    return new Promise((resolve) => {
        window.setTimeout(resolve, safeMs);
    });
}

export function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

export function readText(field) {
    if (!field) {
        return '';
    }

    if (typeof field.simpleText === 'string') {
        return field.simpleText;
    }

    if (Array.isArray(field.runs)) {
        return field.runs
            .map((run) => run?.text || '')
            .join('')
            .trim();
    }

    return '';
}
