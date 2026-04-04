/**
 * Subscription Labels subscription fetch utilities.
 */

import {
    SUBSCRIBE_PAGE_URL,
    MAX_CONTINUATION_PAGES,
    CONTINUATION_FETCH_DELAY_MS,
    BROWSE_SOURCE,
} from './constants.js';
import { parseJsonSafe, extractInitialDataFromHtml, extractYtCfgFromHtml } from './html-parse.js';
import { normalizeChannelPath, isChannelPath } from './channel-utils.js';
import { getInnertubeConfig } from './ytcfg-utils.js';

export function collectChannelData(node, channelIds, channelPaths, continuations) {
    if (!node || typeof node !== 'object') {
        return;
    }

    if (typeof node.channelId === 'string') {
        const channelId = node.channelId.trim();
        if (channelId.startsWith('UC') && channelId.length >= 22) {
            channelIds.add(channelId);
        }
    }

    const browseId =
        node?.browseEndpoint?.browseId || node?.navigationEndpoint?.browseEndpoint?.browseId;
    if (typeof browseId === 'string' && browseId.startsWith('UC')) {
        channelIds.add(browseId);
    }

    const canonicalBaseUrl =
        node?.browseEndpoint?.canonicalBaseUrl ||
        node?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
        node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;

    if (typeof canonicalBaseUrl === 'string' && canonicalBaseUrl) {
        const normalized = normalizeChannelPath(canonicalBaseUrl);
        if (normalized && isChannelPath(normalized)) {
            channelPaths.add(normalized);
        }
    }

    const continuationToken =
        node?.continuationCommand?.token || node?.continuationEndpoint?.continuationCommand?.token;
    if (typeof continuationToken === 'string') {
        continuations.add(continuationToken);
    }

    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            value.forEach((item) =>
                collectChannelData(item, channelIds, channelPaths, continuations)
            );
        } else if (value && typeof value === 'object') {
            collectChannelData(value, channelIds, channelPaths, continuations);
        }
    }
}

export async function postInnertube(path, payload) {
    const config = await getInnertubeConfig();
    const endpoint = `https://www.youtube.com/youtubei/v1/${path}?key=${encodeURIComponent(config.apiKey)}`;
    const body = JSON.stringify({ context: config.context, ...payload });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: config.headers,
        body,
    });

    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
        return { error: responseText };
    }

    return parseJsonSafe(responseText) || {};
}

export async function fetchSubscribedChannels(seed = null, setDebugState, setDebugMeta, logger) {
    const channelIds = seed?.channelIds instanceof Set ? new Set(seed.channelIds) : new Set();
    const channelPaths = seed?.channelPaths instanceof Set ? new Set(seed.channelPaths) : new Set();
    const continuations = new Set(Array.isArray(seed?.continuations) ? seed.continuations : []);
    let hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
    let htmlPayload = '';

    try {
        const response = await fetch(SUBSCRIBE_PAGE_URL, { credentials: 'include' });
        htmlPayload = await response.text();
        if (setDebugState) setDebugState('subscriptionsHtmlStatus', response.status);
        if (setDebugState) setDebugState('subscriptionsHtmlLength', htmlPayload.length);
        if (setDebugMeta) setDebugMeta('html-status', response.status);
        if (setDebugMeta) setDebugMeta('html-length', htmlPayload.length);
        const initialData = extractInitialDataFromHtml(htmlPayload);
        if (initialData) {
            collectChannelData(initialData, channelIds, channelPaths, continuations);
            hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
        }
        if (setDebugState) setDebugState('subscriptionsInitialDataFound', Boolean(initialData));
        const ytcfgFallback = extractYtCfgFromHtml(htmlPayload);
        if (setDebugState) setDebugState('subscriptionsYtCfgFound', Boolean(ytcfgFallback));
        if (setDebugMeta) setDebugMeta('initial-data', Boolean(initialData));
        if (setDebugMeta) setDebugMeta('ytcfg-found', Boolean(ytcfgFallback));
    } catch (error) {
        if (logger) logger.debug('Failed to fetch subscription HTML', error);
        if (setDebugState) setDebugState('subscriptionsHtmlError', error?.message || String(error));
        if (setDebugMeta) setDebugMeta('html-error', error?.message || String(error));
    }

    try {
        const browseData = await postInnertube('browse', { browseId: 'FEchannels' });
        if (browseData && typeof browseData === 'object') {
            collectChannelData(browseData, channelIds, channelPaths, continuations);
            hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
        }
    } catch (error) {
        if (logger) logger.debug('FEchannels browse failed, falling back to HTML', error);
        if (setDebugMeta) setDebugMeta('innertube-error', error?.message || String(error));
    }

    if (!hasSeedData && htmlPayload) {
        const initialData = extractInitialDataFromHtml(htmlPayload);
        if (initialData) {
            collectChannelData(initialData, channelIds, channelPaths, continuations);
            hasSeedData = channelIds.size > 0 || channelPaths.size > 0 || continuations.size > 0;
        }
    }

    const continuationQueue = Array.from(continuations);
    const visited = new Set();
    let pagesFetched = 0;

    while (continuationQueue.length > 0 && pagesFetched < MAX_CONTINUATION_PAGES) {
        const token = continuationQueue.shift();
        if (!token || visited.has(token)) {
            continue;
        }

        visited.add(token);
        pagesFetched += 1;

        try {
            const continuationData = await postInnertube('browse', { continuation: token });
            collectChannelData(continuationData, channelIds, channelPaths, continuations);
            continuations.forEach((cont) => {
                if (!visited.has(cont)) {
                    continuationQueue.push(cont);
                }
            });
        } catch (error) {
            if (logger) logger.debug('Failed to fetch continuation page', error);
        }

        if (CONTINUATION_FETCH_DELAY_MS > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, CONTINUATION_FETCH_DELAY_MS));
        }
    }

    const remaining = continuationQueue.filter((token) => token && !visited.has(token));
    return {
        channelIds,
        channelPaths,
        continuations: remaining,
        complete: remaining.length === 0,
        source: BROWSE_SOURCE,
    };
}
