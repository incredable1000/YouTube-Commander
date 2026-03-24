/**
 * Hide subscribed channel videos on the Home feed.
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('HideSubscribedVideos');

const HOME_BROWSE_SELECTOR = 'ytd-browse[page-subtype="home"], ytd-browse[browse-id="FEwhat_to_watch"]';
const FEED_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-media',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytm-shorts-lockup-view-model'
].join(', ');
const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href*="/shorts/"]';
const HIDDEN_CLASS = 'yt-commander-hidden-subscribed-video';
const SUBSCRIPTION_CACHE_KEY = 'ytCommanderSubscribedChannelsCache';
const SHORTS_CHANNEL_CACHE_KEY = 'ytCommanderShortsChannelCache';
const CACHE_REFRESH_DEBOUNCE_MS = 400;
const RENDER_DEBOUNCE_MS = 120;
const MAX_PENDING_NODES = 2000;

let hideSubscribedEnabled = false;
let subscribedChannelIds = new Set();
let subscribedChannelPaths = new Set();
let shortsChannelCache = new Map();
let lastCacheStamp = 0;

let mutationObserver = null;
let renderTimer = null;
let cacheRefreshTimer = null;
const pendingContainers = new Set();

let storageListener = null;

function isElementHidden(element) {
    if (!element) {
        return true;
    }
    if (element.hasAttribute('hidden')) {
        return true;
    }
    if (element.getAttribute('aria-hidden') === 'true') {
        return true;
    }
    return false;
}

function getHomeBrowseRoot() {
    const roots = document.querySelectorAll(HOME_BROWSE_SELECTOR);
    for (const root of roots) {
        if (!root || !root.isConnected) {
            continue;
        }
        if (isElementHidden(root)) {
            continue;
        }
        return root;
    }
    return null;
}

function isHomeContainer(container) {
    const root = container?.closest?.(HOME_BROWSE_SELECTOR);
    if (!root || !root.isConnected) {
        return false;
    }
    return !isElementHidden(root);
}

function normalizeChannelPath(path) {
    if (!path) {
        return '';
    }
    let trimmed = path;
    try {
        if (trimmed.startsWith('http')) {
            const url = new URL(trimmed);
            trimmed = url.pathname;
        }
    } catch (_error) {
        // Ignore URL parsing errors.
    }
    trimmed = trimmed.split('?')[0].split('#')[0];
    return trimmed.trim().toLowerCase();
}

function extractChannelIdFromPath(path) {
    if (!path) {
        return null;
    }
    const match = path.match(/\/channel\/([^/?#]+)/i);
    if (!match) {
        return null;
    }
    return match[1] || null;
}

function isChannelPath(path) {
    return path.startsWith('/channel/')
        || path.startsWith('/@')
        || path.startsWith('/c/')
        || path.startsWith('/user/');
}

function extractVideoIdFromHref(href) {
    if (!href) {
        return '';
    }
    const shortsMatch = href.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
    if (shortsMatch) {
        return shortsMatch[1];
    }
    const queryMatch = href.match(/[?&]v=([A-Za-z0-9_-]{8,})/);
    if (queryMatch) {
        return queryMatch[1];
    }
    return '';
}

function findChannelAnchor(container) {
    const selectors = [
        '#channel-name a[href]',
        'ytd-channel-name a[href]',
        'ytd-video-owner-renderer a[href]',
        '#metadata #channel-name a[href]',
        'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-row a[href]'
    ];

    for (const selector of selectors) {
        const anchor = container.querySelector(selector);
        const href = anchor?.getAttribute?.('href') || '';
        if (anchor && href) {
            return anchor;
        }
    }

    const fallbackAnchors = container.querySelectorAll('a[href]');
    for (const anchor of fallbackAnchors) {
        const href = anchor.getAttribute('href') || '';
        if (href) {
            return anchor;
        }
    }
    return null;
}

function getDataRoots(container) {
    const roots = [];
    const candidates = [
        container?.data,
        container?.__data,
        container?.__data?.data,
        container?.__data?.item,
        container?.__data?.data?.content,
        container?.__data?.data?.lockup,
        container?.__data?.data?.shortsLockupViewModel,
        container?.__dataHost,
        container?.__dataHost?.__data,
        container?.__dataHost?.data
    ];

    candidates.forEach((candidate) => {
        if (candidate && typeof candidate === 'object') {
            roots.push(candidate);
        }
    });

    return roots;
}

function extractChannelInfoFromData(container) {
    const roots = getDataRoots(container);
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

        const browseId = node?.browseEndpoint?.browseId || node?.navigationEndpoint?.browseEndpoint?.browseId;
        if (typeof browseId === 'string' && browseId.startsWith('UC')) {
            return { channelId: browseId, channelPath: null };
        }

        const possibleRuns = [
            node?.shortBylineText?.runs,
            node?.longBylineText?.runs,
            node?.ownerText?.runs,
            node?.title?.runs
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

        const canonicalBaseUrl = node?.browseEndpoint?.canonicalBaseUrl
            || node?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
            || node?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
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

function extractChannelInfo(container) {
    const anchor = findChannelAnchor(container);
    if (anchor) {
        const href = anchor.getAttribute('href') || '';
        if (href) {
            let path = href;
            try {
                const url = new URL(href, location.origin);
                path = url.pathname;
            } catch (_error) {
                path = href;
            }
            const normalizedPath = normalizeChannelPath(path);
            const channelId = extractChannelIdFromPath(path);
            return {
                channelId: channelId || null,
                channelPath: normalizedPath
            };
        }
    }
    return extractChannelInfoFromData(container);
}

function loadShortsChannelCache() {
    shortsChannelCache = new Map();
    try {
        const raw = window.localStorage.getItem(SHORTS_CHANNEL_CACHE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        Object.entries(parsed).forEach(([videoId, channelId]) => {
            if (typeof videoId === 'string' && typeof channelId === 'string' && channelId.startsWith('UC')) {
                shortsChannelCache.set(videoId, channelId);
            }
        });
    } catch (_error) {
        shortsChannelCache = new Map();
    }
}

function loadSubscriptionCache() {
    let cached = null;
    try {
        const raw = window.localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
        cached = raw ? JSON.parse(raw) : null;
    } catch (_error) {
        cached = null;
    }

    const fetchedAt = Number(cached?.fetchedAt) || 0;
    const ids = Array.isArray(cached?.channelIds) ? cached.channelIds : [];
    const paths = Array.isArray(cached?.channelPaths) ? cached.channelPaths : [];
    if (fetchedAt && fetchedAt === lastCacheStamp && ids.length === subscribedChannelIds.size) {
        return;
    }

    subscribedChannelIds = new Set(ids.filter((id) => typeof id === 'string' && id.startsWith('UC')));
    subscribedChannelPaths = new Set(
        paths
            .filter((path) => typeof path === 'string')
            .map((path) => normalizeChannelPath(path))
            .filter((path) => path && isChannelPath(path))
    );
    lastCacheStamp = fetchedAt || Date.now();
}

function scheduleCacheRefresh(reason) {
    if (cacheRefreshTimer) {
        return;
    }
    cacheRefreshTimer = window.setTimeout(() => {
        cacheRefreshTimer = null;
        loadSubscriptionCache();
        loadShortsChannelCache();
        scheduleRender(`cache-refresh:${reason}`);
    }, CACHE_REFRESH_DEBOUNCE_MS);
}

function isSubscribedChannel(channelId, channelPath, videoId) {
    if (channelId && subscribedChannelIds.has(channelId)) {
        return true;
    }
    if (channelPath && subscribedChannelPaths.has(channelPath)) {
        return true;
    }
    if (videoId) {
        const cachedChannelId = shortsChannelCache.get(videoId);
        if (cachedChannelId && subscribedChannelIds.has(cachedChannelId)) {
            return true;
        }
    }
    return false;
}

function decorateContainer(container) {
    if (!container || !container.isConnected) {
        return;
    }

    if (!isHomeContainer(container)) {
        container.classList.remove(HIDDEN_CLASS);
        return;
    }

    const link = container.querySelector(VIDEO_LINK_SELECTOR);
    const videoId = extractVideoIdFromHref(link?.getAttribute?.('href') || '');
    const info = extractChannelInfo(container);
    const subscribed = isSubscribedChannel(info.channelId, info.channelPath, videoId);

    if (hideSubscribedEnabled && subscribed) {
        container.classList.add(HIDDEN_CLASS);
    } else {
        container.classList.remove(HIDDEN_CLASS);
    }
}

function scheduleRender(reason, fullScan = false) {
    if (renderTimer) {
        return;
    }
    renderTimer = window.setTimeout(() => {
        renderTimer = null;
        flushRender(reason, fullScan).catch((error) => {
            logger.debug('Hide subscribed render failed', error);
        });
    }, RENDER_DEBOUNCE_MS);
}

async function flushRender(reason, fullScan = false) {
    if (!hideSubscribedEnabled) {
        document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((node) => node.classList.remove(HIDDEN_CLASS));
    }

    loadSubscriptionCache();
    loadShortsChannelCache();

    const toProcess = new Set();
    if (fullScan) {
        document.querySelectorAll(FEED_RENDERER_SELECTOR).forEach((node) => {
            if (node instanceof Element) {
                toProcess.add(node);
            }
        });
    }
    pendingContainers.forEach((node) => toProcess.add(node));
    pendingContainers.clear();

    if (toProcess.size === 0) {
        return;
    }

    const batch = Array.from(toProcess);
    const chunkSize = 120;
    for (let i = 0; i < batch.length; i += chunkSize) {
        const slice = batch.slice(i, i + chunkSize);
        slice.forEach((container) => decorateContainer(container));
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
}

function queueContainer(container) {
    if (!container || !(container instanceof Element)) {
        return;
    }
    if (pendingContainers.size >= MAX_PENDING_NODES) {
        pendingContainers.clear();
    }
    pendingContainers.add(container);
    scheduleRender('mutation');
}

function scanVisibleContainers() {
    const homeRoot = getHomeBrowseRoot();
    if (!homeRoot) {
        return;
    }
    homeRoot.querySelectorAll(FEED_RENDERER_SELECTOR).forEach((node) => {
        if (node instanceof Element) {
            queueContainer(node);
        }
    });
}

function startObserver() {
    if (mutationObserver) {
        return;
    }

    mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) {
                    return;
                }
                if (node.matches && node.matches(FEED_RENDERER_SELECTOR)) {
                    queueContainer(node);
                    return;
                }
                node.querySelectorAll?.(FEED_RENDERER_SELECTOR).forEach((child) => queueContainer(child));
            });
        });
    });

    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function injectStyles() {
    if (document.getElementById('yt-commander-hide-subscribed-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'yt-commander-hide-subscribed-styles';
    style.textContent = `
        .${HIDDEN_CLASS} {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
}

async function loadHideSubscribedSetting() {
    try {
        const result = await chrome.storage.sync.get(['hideSubscribedVideosEnabled']);
        hideSubscribedEnabled = result.hideSubscribedVideosEnabled === true;
    } catch (error) {
        logger.debug('Failed to load hide subscribed setting', error);
        hideSubscribedEnabled = false;
    }
}

function attachListeners() {
    if (!storageListener) {
        storageListener = (changes, area) => {
            if (area !== 'sync') {
                return;
            }
            if (changes.hideSubscribedVideosEnabled) {
                hideSubscribedEnabled = changes.hideSubscribedVideosEnabled.newValue === true;
                scheduleRender('setting-change', true);
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    window.addEventListener('yt-navigate-finish', () => scheduleRender('navigate', true));
    document.addEventListener('yt-navigate-finish', () => scheduleRender('navigate', true));
    window.addEventListener('yt-page-data-updated', () => scheduleRender('page-update', true));
    document.addEventListener('yt-page-data-updated', () => scheduleRender('page-update', true));
}

function updateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return;
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'hideSubscribedVideosEnabled')) {
        hideSubscribedEnabled = settings.hideSubscribedVideosEnabled === true;
        scheduleRender('settings-update', true);
    }
}

async function initHideSubscribedVideos() {
    injectStyles();
    await loadHideSubscribedSetting();
    loadSubscriptionCache();
    loadShortsChannelCache();
    attachListeners();
    startObserver();
    scanVisibleContainers();
    scheduleCacheRefresh('init');
}

export {
    initHideSubscribedVideos,
    updateSettings
};
