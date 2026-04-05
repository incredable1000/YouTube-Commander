/**
 * Channel identity resolution utilities for subscription manager.
 */

import { QUICK_ADD_CONTEXT_SELECTOR } from './constants.js';
import { normalizeHandle, normalizeChannelUrl } from './data-utils.js';
import { extractChannelIdFromUrl, extractHandleFromUrl } from './parse-utils.js';

export function readChannelIdFromElement(element) {
    if (!element) return '';
    return (
        element.getAttribute('channel-external-id') ||
        element.getAttribute('channel-id') ||
        element.getAttribute('data-channel-external-id') ||
        element.getAttribute('data-channel-id') ||
        element.dataset?.channelExternalId ||
        element.dataset?.channelId ||
        ''
    );
}

export function resolveChannelIdentityFromContext(renderer) {
    let channelId = '',
        handle = '',
        url = '';
    if (renderer) channelId = readChannelIdFromElement(renderer);
    if (!channelId) {
        const flexy = document.querySelector('ytd-watch-flexy');
        channelId = readChannelIdFromElement(flexy);
    }
    if (!channelId) {
        const reelHost = renderer?.closest('ytd-reel-video-renderer');
        channelId = readChannelIdFromElement(reelHost);
    }
    if (!channelId) {
        const reel = document.querySelector(
            'ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]'
        );
        channelId = readChannelIdFromElement(reel);
    }
    if (!channelId) {
        const reelHeader = document.querySelector(
            'ytd-reel-player-header-renderer, ytd-reel-player-overlay-renderer'
        );
        channelId = readChannelIdFromElement(reelHeader);
    }
    if (!channelId) {
        const owner = document.querySelector(
            'ytd-video-owner-renderer, ytd-channel-name, ytd-channel-header-renderer'
        );
        channelId = readChannelIdFromElement(owner);
    }
    if (!channelId) {
        const metaChannel = document.querySelector('meta[itemprop="channelId"]');
        channelId = metaChannel?.getAttribute('content') || '';
    }
    const context = renderer?.closest(QUICK_ADD_CONTEXT_SELECTOR) || renderer;
    const link = context?.querySelector('a[href^="/channel/"], a[href^="/@"]');
    if (link) url = link.getAttribute('href') || '';
    if (!url) {
        const ownerLink = document.querySelector(
            'ytd-video-owner-renderer a[href^="/channel/"], ytd-video-owner-renderer a[href^="/@"], ytd-channel-name a[href^="/channel/"], ytd-channel-name a[href^="/@"]'
        );
        url = ownerLink?.getAttribute('href') || '';
    }
    if (!url) {
        const reelLink = document.querySelector(
            'ytd-reel-player-header-renderer a[href^="/channel/"], ytd-reel-player-header-renderer a[href^="/@"], ytd-reel-player-overlay-renderer a[href^="/channel/"], ytd-reel-player-overlay-renderer a[href^="/@"]'
        );
        url = reelLink?.getAttribute('href') || '';
    }
    if (!url) {
        const canonical =
            document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        url = canonical;
    }
    handle = extractHandleFromUrl(url) || '';
    if (!handle && renderer) {
        const labelText =
            renderer.querySelector('button[aria-label]')?.getAttribute('aria-label') || '';
        const handleMatch = labelText.match(/@[\w.-]+/i);
        handle = handleMatch ? handleMatch[0] : '';
    }
    if (!channelId) channelId = extractChannelIdFromUrl(url);
    return { channelId, handle, url };
}

export function resolveChannelIdFromIdentity(
    identity,
    channelsById,
    channelsByHandle,
    channelsByUrl
) {
    if (identity.channelId && channelsById.has(identity.channelId)) return identity.channelId;
    const normalizedHandle = normalizeHandle(identity.handle);
    if (normalizedHandle && channelsByHandle.has(normalizedHandle))
        return channelsByHandle.get(normalizedHandle) || '';
    if (normalizedHandle && channelsByHandle.has(normalizedHandle.replace(/^@/, '')))
        return channelsByHandle.get(normalizedHandle.replace(/^@/, '')) || '';
    const normalizedUrl = normalizeChannelUrl(identity.url);
    if (normalizedUrl && channelsByUrl.has(normalizedUrl))
        return channelsByUrl.get(normalizedUrl) || '';
    return identity.channelId || '';
}

export function getHandleAssignmentKey(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) return '';
    return `handle:${normalized.replace(/^@/, '')}`;
}

export function getUrlAssignmentKey(url) {
    const normalized = normalizeChannelUrl(url);
    if (!normalized) return '';
    return `url:${normalized}`;
}

export function resolveAssignmentKeyForRead(identity, channelId, readChannelAssignments) {
    const handleKey = getHandleAssignmentKey(identity.handle);
    const urlKey = getUrlAssignmentKey(identity.url);
    if (channelId && readChannelAssignments(channelId).length > 0) return channelId;
    if (handleKey && readChannelAssignments(handleKey).length > 0) return handleKey;
    if (urlKey && readChannelAssignments(urlKey).length > 0) return urlKey;
    return channelId || handleKey || urlKey || '';
}

export function resolveAssignmentKeyForWrite(identity, channelId) {
    const handleKey = getHandleAssignmentKey(identity.handle);
    const urlKey = getUrlAssignmentKey(identity.url);
    return channelId || handleKey || urlKey || '';
}

export function migrateAssignmentKeyIfNeeded(
    channelId,
    identity,
    readChannelAssignments,
    writeChannelAssignments,
    persistLocalState
) {
    if (!channelId) return;
    const handleKey = getHandleAssignmentKey(identity.handle);
    const urlKey = getUrlAssignmentKey(identity.url);
    const fallbackKeys = [handleKey, urlKey].filter(Boolean);
    if (fallbackKeys.length === 0) return;
    const existing = readChannelAssignments(channelId);
    let migrated = false;
    fallbackKeys.forEach((key) => {
        const fallback = readChannelAssignments(key);
        if (fallback.length === 0) return;
        if (existing.length === 0) writeChannelAssignments(channelId, fallback);
        writeChannelAssignments(key, []);
        migrated = true;
    });
    if (migrated) void persistLocalState();
}
