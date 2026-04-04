/**
 * Subscription Labels link utilities.
 */

import { ROW_CLASS } from './constants.js';
import { normalizeChannelPath, isChannelPath, extractChannelIdFromPath } from './channel-utils.js';

export function isChannelLink(href) {
    if (!href) {
        return false;
    }
    let path = href;
    try {
        if (path.startsWith('http')) {
            path = new URL(path, location.origin).pathname;
        }
    } catch (_error) {
        // Ignore URL parsing errors.
    }
    return (
        path.startsWith('/channel/') ||
        path.startsWith('/@') ||
        path.startsWith('/c/') ||
        path.startsWith('/user/')
    );
}

export function findChannelAnchor(card) {
    const scopedSelectors = [
        '#channel-name a[href]',
        'ytd-channel-name a[href]',
        'ytd-video-owner-renderer a[href]',
        '#metadata #channel-name a[href]',
        'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-row a[href]',
    ];

    for (const selector of scopedSelectors) {
        const anchor = card.querySelector(selector);
        const href = anchor?.getAttribute?.('href') || '';
        if (anchor && isChannelLink(href)) {
            return anchor;
        }
    }

    const fallbackAnchors = card.querySelectorAll('a[href]');
    for (const anchor of fallbackAnchors) {
        const href = anchor.getAttribute('href') || '';
        if (isChannelLink(href)) {
            return anchor;
        }
    }

    return null;
}

export function getDataRoots(card) {
    const roots = [];
    const candidates = [
        card?.data,
        card?.__data,
        card?.__data?.data,
        card?.__data?.item,
        card?.__data?.data?.content,
        card?.__data?.data?.lockup,
        card?.__data?.data?.shortsLockupViewModel,
        card?.__dataHost,
        card?.__dataHost?.__data,
        card?.__dataHost?.data,
    ];

    candidates.forEach((candidate) => {
        if (candidate && typeof candidate === 'object') {
            roots.push(candidate);
        }
    });

    return roots;
}

export function extractChannelInfoFromData(card) {
    const roots = getDataRoots(card);
    if (roots.length === 0) {
        return { channelId: null, channelPath: null };
    }

    const stack = [...roots];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object') {
            continue;
        }

        if (typeof node.channelId === 'string') {
            const channelId = node.channelId.trim();
            if (channelId.startsWith('UC')) {
                return { channelId, channelPath: null };
            }
        }

        const browseId =
            node?.browseEndpoint?.browseId || node?.navigationEndpoint?.browseEndpoint?.browseId;
        if (typeof browseId === 'string' && browseId.startsWith('UC')) {
            return { channelId: browseId, channelPath: null };
        }

        const possibleRuns = [
            node?.shortBylineText?.runs,
            node?.longBylineText?.runs,
            node?.ownerText?.runs,
            node?.title?.runs,
        ];
        for (const runs of possibleRuns) {
            if (!Array.isArray(runs)) {
                continue;
            }
            for (const run of runs) {
                const runBrowseId = run?.navigationEndpoint?.browseEndpoint?.browseId;
                if (typeof runBrowseId === 'string' && runBrowseId.startsWith('UC')) {
                    return { channelId: runBrowseId, channelPath: null };
                }
                const runUrl = run?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
                if (typeof runUrl === 'string') {
                    const normalized = normalizeChannelPath(runUrl);
                    if (normalized && isChannelPath(normalized)) {
                        return { channelId: null, channelPath: normalized };
                    }
                }
            }
        }

        const canonicalBaseUrl =
            node?.browseEndpoint?.canonicalBaseUrl ||
            node?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
            node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
        if (typeof canonicalBaseUrl === 'string') {
            const normalized = normalizeChannelPath(canonicalBaseUrl);
            if (normalized && isChannelPath(normalized)) {
                return { channelId: null, channelPath: normalized };
            }
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach((item) => stack.push(item));
            } else if (value && typeof value === 'object') {
                stack.push(value);
            }
        }
    }

    return { channelId: null, channelPath: null };
}

export function extractChannelInfo(card) {
    const anchor = findChannelAnchor(card);
    let host = null;
    if (anchor) {
        const href = anchor.getAttribute('href') || '';
        if (!href) {
            return { channelId: null, channelPath: null, anchor, host: null };
        }

        let path = href;
        try {
            const url = new URL(href, location.origin);
            path = url.pathname;
        } catch (_error) {
            path = href;
        }

        const normalizedPath = normalizeChannelPath(path);
        let channelId = extractChannelIdFromPath(path);
        host =
            anchor.closest(`.${ROW_CLASS}`) ||
            anchor.closest('ytd-channel-name, #channel-name, ytd-video-owner-renderer') ||
            anchor.parentElement ||
            anchor;
        return { channelId, channelPath: normalizedPath, anchor, host };
    }

    const fallback = extractChannelInfoFromData(card);
    host = card.querySelector(METADATA_SELECTORS.join(',')) || null;
    return {
        channelId: fallback.channelId,
        channelPath: fallback.channelPath,
        anchor: null,
        host,
    };
}

const METADATA_SELECTORS = [
    '#metadata-line',
    'yt-content-metadata-view-model',
    '#meta',
    '.metadata-snippet-toggle-widget-model',
];
