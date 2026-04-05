/**
 * Authentication utilities for Playlist API.
 */

import { getCookieValue, sha1Hex } from './ytcfg-utils.js';

let cachedAuthHeader = null;
let cachedAuthHeaderAt = 0;

export async function buildSapisidAuthorization() {
    const now = Date.now();
    if (cachedAuthHeader && now - cachedAuthHeaderAt < 30_000) {
        return cachedAuthHeader;
    }
    const sapisid = getCookieValue('SAPISID') || getCookieValue('__Secure-3PAPISID');
    if (!sapisid) {
        return null;
    }
    const timestamp = Math.floor(now / 1000);
    const hash = await sha1Hex(`${timestamp} ${sapisid} ${location.origin}`);
    cachedAuthHeader = `SAPISIDHASH ${timestamp}_${hash}`;
    cachedAuthHeaderAt = now;
    return cachedAuthHeader;
}

export function clearCachedAuth() {
    cachedAuthHeader = null;
    cachedAuthHeaderAt = 0;
}
