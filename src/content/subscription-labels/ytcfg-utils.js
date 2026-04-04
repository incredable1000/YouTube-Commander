/**
 * Subscription Labels ytcfg utilities.
 */

import { parseJsonSafe } from './html-parse.js';

let ytcfgFallback = null;

export function setYtcfgFallback(data) {
    ytcfgFallback = data;
}

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
        // Ignore and fallback below.
    }

    if (ytcfgFallback && typeof ytcfgFallback === 'object') {
        return ytcfgFallback[key];
    }

    return undefined;
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

async function sha1Hex(input) {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const bytes = Array.from(new Uint8Array(hashBuffer));
    return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildSapisidAuthorization() {
    const sapisid = getCookieValue('SAPISID') || getCookieValue('__Secure-3PAPISID');
    if (!sapisid) {
        return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const hash = await sha1Hex(`${timestamp} ${sapisid} ${location.origin}`);
    return `SAPISIDHASH ${timestamp}_${hash}`;
}

export async function waitForYtCfgReady(maxAttempts = 20, delayMs = 120) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
        const context = getYtCfgValue('INNERTUBE_CONTEXT');
        if (apiKey && context) {
            return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
}

export async function getInnertubeConfig() {
    await waitForYtCfgReady();

    const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('YouTube API key is unavailable on this page.');
    }

    const rawContext = getYtCfgValue('INNERTUBE_CONTEXT');
    const context =
        rawContext && typeof rawContext === 'object'
            ? JSON.parse(JSON.stringify(rawContext))
            : {
                  client: {
                      hl: getYtCfgValue('HL') || 'en',
                      gl: getYtCfgValue('GL') || 'US',
                      clientName: getYtCfgValue('INNERTUBE_CLIENT_NAME') || 'WEB',
                      clientVersion: getYtCfgValue('INNERTUBE_CLIENT_VERSION') || '',
                  },
              };

    const clientName =
        getYtCfgValue('INNERTUBE_CONTEXT_CLIENT_NAME') ||
        context?.client?.clientName ||
        getYtCfgValue('INNERTUBE_CLIENT_NAME') ||
        '1';
    const clientVersion =
        getYtCfgValue('INNERTUBE_CONTEXT_CLIENT_VERSION') ||
        context?.client?.clientVersion ||
        getYtCfgValue('INNERTUBE_CLIENT_VERSION') ||
        '';
    const visitorData = getYtCfgValue('VISITOR_DATA') || context?.client?.visitorData;
    const sessionIndex = getYtCfgValue('SESSION_INDEX') ?? 0;
    const identityToken = getYtCfgValue('ID_TOKEN') || getYtCfgValue('DELEGATED_SESSION_ID');
    const authorizationHeader = await buildSapisidAuthorization();

    const headers = {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': String(clientName),
        'X-Youtube-Client-Version': String(clientVersion),
        'X-Origin': location.origin,
    };

    if (sessionIndex !== null && sessionIndex !== undefined) {
        headers['X-Goog-AuthUser'] = String(sessionIndex);
    }

    if (visitorData) {
        headers['X-Goog-Visitor-Id'] = String(visitorData);
    }

    if (identityToken) {
        headers['X-Youtube-Identity-Token'] = String(identityToken);
    }

    if (authorizationHeader) {
        headers.Authorization = authorizationHeader;
    }

    return { apiKey, context, headers };
}

export function readApiError(responseText) {
    if (!responseText) {
        return 'Unknown YouTube API error.';
    }

    const payload = parseJsonSafe(responseText);
    const parsedError =
        payload?.error?.message ||
        payload?.error?.errors?.[0]?.message ||
        payload?.alerts?.[0]?.alertRenderer?.text?.simpleText;
    if (parsedError) {
        return String(parsedError);
    }

    return String(responseText).slice(0, 240);
}
