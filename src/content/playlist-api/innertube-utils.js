/**
 * InnerTube API utilities for Playlist API.
 */

import { getYtCfgValue, delay, chunk } from './ytcfg-utils.js';
import { parseJsonSafe } from './parse-utils.js';
import { buildSapisidAuthorization } from './auth-utils.js';

export async function waitForYtCfgReady() {
    const maxAttempts = 20;
    const delayMs = 100;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
        const context = getYtCfgValue('INNERTUBE_CONTEXT');
        if (apiKey && context) {
            return;
        }
        await new Promise((resolve) => {
            window.setTimeout(resolve, delayMs);
        });
    }
}

export function cloneSerializable(value) {
    if (!value || typeof value !== 'object') {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_error) {
        return value;
    }
}

export async function getInnertubeConfig() {
    await waitForYtCfgReady();
    const apiKey = getYtCfgValue('INNERTUBE_API_KEY');
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('YouTube API key is unavailable on this page.');
    }
    const rawContext = getYtCfgValue('INNERTUBE_CONTEXT');
    const context = cloneSerializable(rawContext);
    if (!context) {
        throw new Error('YouTube client context is unavailable.');
    }
    const authHeader = await buildSapisidAuthorization();
    const headers = {
        'Content-Type': 'application/json',
        'x-youtube-client-name': String(getYtCfgValue('INNERTUBE_CLIENT_NAME') || ''),
        'x-youtube-client-version': String(getYtCfgValue('INNERTUBE_CLIENT_VERSION') || ''),
    };
    if (authHeader) {
        headers['Authorization'] = authHeader;
    }
    return { apiKey, context, headers };
}

export async function postInnertube(paths, payload, config) {
    if (!Array.isArray(paths)) {
        paths = [paths];
    }
    const { apiKey, context, headers } = config;
    const baseUrl = getYtCfgValue('INNERTUBE_API_BASE') || 'https://www.youtube.com/youtubei/v1';
    const targetPath = Array.isArray(paths) ? paths[0] : paths;
    const url = `${baseUrl}/${targetPath}?key=${apiKey}&prettyPrint=false`;
    const mergedPayload = {
        ...cloneSerializable(context),
        ...cloneSerializable(payload),
    };
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(mergedPayload),
            credentials: 'include',
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`YouTube API error ${response.status}: ${text}`);
        }
        return parseJsonSafe(await response.text());
    } catch (error) {
        throw error;
    }
}

export async function mapWithConcurrency(items, concurrency, mapper) {
    const results = [];
    const batches = chunk(items, concurrency);
    for (const batch of batches) {
        const batchResults = await Promise.all(batch.map(mapper));
        results.push(...batchResults);
    }
    return results;
}
