/**
 * Open current watch video in a clean new tab (playlist params removed).
 */

import { createLogger } from './utils/logger.js';
import { createKeyboardShortcut, createThrottledObserver } from './utils/events.js';
import { createIcon } from './utils/ui.js';
import { getActivePlayer, getCurrentVideoId, isShortsPage, isVideoPage } from './utils/youtube.js';
import { normalizeShortcutKey } from '../shared/shortcutKey.js';
import { ICONS } from '../shared/constants.js';

const logger = createLogger('OpenVideoTab');

const BUTTON_ID = 'yt-commander-open-video-button';
const BUTTON_CLASS = 'ytp-button yt-commander-open-video-button';
const OBSERVER_THROTTLE_MS = 650;
const DEFAULT_OPEN_VIDEO_SHORTCUT = { ctrl: true, shift: false, alt: false, key: 'Enter' };
const DEFAULT_OPEN_CHANNEL_SHORTCUT = { ctrl: false, shift: true, alt: false, key: 'Enter' };

let isInitialized = false;
let initPromise = null;
let openButton = null;
let domObserver = null;
let keyboardShortcuts = [];
let openVideoShortcut = { ...DEFAULT_OPEN_VIDEO_SHORTCUT };
let openChannelShortcut = { ...DEFAULT_OPEN_CHANNEL_SHORTCUT };

/**
 * Initialize the open-in-new-tab player button.
 */
export async function initOpenVideoTab() {
    if (isInitialized) {
        return;
    }

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        logger.info('Initializing open video tab control');

        ensureOpenButton();
        setupKeyboardShortcuts();

        domObserver = createThrottledObserver(() => {
            ensureOpenButton();
        }, OBSERVER_THROTTLE_MS);

        domObserver.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('yt-navigate-finish', ensureOpenButton);

        isInitialized = true;
        logger.info('Open video tab control initialized');
    })();

    try {
        await initPromise;
    } catch (error) {
        logger.error('Failed to initialize open video tab control', error);
        throw error;
    } finally {
        initPromise = null;
    }
}

/**
 * Update shortcuts from extension settings.
 * @param {object} settings
 */
export function updateSettings(settings = {}) {
    openVideoShortcut = normalizeShortcutConfig(
        settings.openVideoNewTabShortcut,
        DEFAULT_OPEN_VIDEO_SHORTCUT
    );
    openChannelShortcut = normalizeShortcutConfig(
        settings.openChannelNewTabShortcut,
        DEFAULT_OPEN_CHANNEL_SHORTCUT
    );
    setupKeyboardShortcuts();
}

function ensureOpenButton() {
    if (!isVideoPage()) {
        removeOpenButton();
        return;
    }

    const controls = findControlsHost();
    if (!controls) {
        removeOpenButton();
        return;
    }

    if (!openButton || !openButton.isConnected) {
        const existing = controls.querySelector(`#${BUTTON_ID}`);
        if (existing instanceof HTMLButtonElement) {
            existing.remove();
        }
        openButton = createOpenButton();
    }

    const windowedButton = controls.querySelector('#yt-commander-windowed-fullscreen-button');
    const fullscreenButton = controls.querySelector('.ytp-fullscreen-button');
    const preferredAnchor = windowedButton || fullscreenButton || null;

    if (preferredAnchor && openButton.parentElement !== controls) {
        controls.insertBefore(openButton, preferredAnchor);
    } else if (!preferredAnchor && openButton.parentElement !== controls) {
        controls.appendChild(openButton);
    } else if (
        preferredAnchor
        && openButton.nextElementSibling !== preferredAnchor
    ) {
        controls.insertBefore(openButton, preferredAnchor);
    }
}

function removeOpenButton() {
    if (openButton) {
        openButton.remove();
        openButton = null;
    }
}

function setupKeyboardShortcuts() {
    keyboardShortcuts.forEach((teardown) => teardown());
    keyboardShortcuts = [];

    if (!openVideoShortcut || !openChannelShortcut) {
        return;
    }

    keyboardShortcuts.push(
        createKeyboardShortcut(openVideoShortcut, () => {
            if (!isVideoOrShortsPage()) {
                return;
            }
            openCurrentVideoInNewTab();
        })
    );

    keyboardShortcuts.push(
        createKeyboardShortcut(openChannelShortcut, () => {
            if (!isVideoOrShortsPage()) {
                return;
            }
            openCurrentChannelInNewTab();
        })
    );
}

function normalizeShortcutConfig(source, fallback) {
    if (!source || typeof source !== 'object') {
        return { ...fallback };
    }
    const key = normalizeShortcutKey(source.key, fallback.key);
    const ctrl = source.ctrl === true;
    const shift = source.shift === true;
    const alt = source.alt === true;
    if (!ctrl && !shift && !alt && key === 'Enter') {
        return { ...fallback };
    }
    return { ctrl, shift, alt, key };
}

function findControlsHost() {
    const player = getActivePlayer();
    if (!player) {
        return null;
    }

    return player.querySelector('.ytp-right-controls') || null;
}

function createOpenButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.title = 'Open video in new tab';
    button.setAttribute('aria-label', 'Open video in new tab');

    const icon = createIcon({
        viewBox: '0 0 24 24',
        width: '24',
        height: '24',
        path: ICONS.OPEN_NEW_TAB,
        fill: 'currentColor'
    });

    button.appendChild(icon);

    button.addEventListener('mousedown', (event) => {
        // Keep focus on the player so native shortcuts still work.
        event.preventDefault();
    });

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCurrentVideoInNewTab();
    });

    return button;
}

function openCurrentVideoInNewTab() {
    const videoId = resolveVideoId();
    if (!videoId) {
        logger.warn('Unable to resolve video id for open-in-new-tab action');
        return;
    }

    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

    openUrlInNewTab(url);
}

function openCurrentChannelInNewTab() {
    const channelUrl = resolveChannelUrl();
    if (!channelUrl) {
        logger.warn('Unable to resolve channel url for open-in-new-tab action');
        return;
    }
    openUrlInNewTab(channelUrl);
}

function openUrlInNewTab(url) {
    try {
        if (chrome?.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'OPEN_NEW_TAB', url });
            return;
        }
    } catch (error) {
        logger.error('Failed to request background tab open', error);
    }

    try {
        window.open(url, '_blank');
    } catch (error) {
        logger.error('Failed to open new tab fallback', error);
    }
}

function resolveVideoId() {
    try {
        const urlId = getCurrentVideoId();
        if (typeof urlId === 'string' && urlId.trim()) {
            return urlId.trim();
        }

        if (isShortsPage()) {
            const match = window.location.pathname.match(/\/shorts\/([A-Za-z0-9_-]{10,15})/);
            if (match && match[1]) {
                return match[1];
            }
        }

        const player = getActivePlayer() || document.getElementById('movie_player');
        const playerId = player?.getVideoData?.()?.video_id;
        if (typeof playerId === 'string' && playerId.trim()) {
            return playerId.trim();
        }

        const playerUrl = player?.getVideoUrl?.();
        if (typeof playerUrl === 'string' && playerUrl.trim()) {
            const url = new URL(playerUrl, window.location.origin);
            const id = url.searchParams.get('v');
            if (id) {
                return id;
            }
        }
    } catch (error) {
        logger.warn('Failed to resolve video id', error);
    }

    return null;
}

function resolveChannelUrl() {
    const selectors = [
        'ytd-video-owner-renderer a[href^="/channel/"]',
        'ytd-video-owner-renderer a[href^="/@"]',
        'ytd-channel-name a[href^="/channel/"]',
        'ytd-channel-name a[href^="/@"]',
        'ytd-reel-player-header-renderer a[href^="/channel/"]',
        'ytd-reel-player-header-renderer a[href^="/@"]',
        'ytd-reel-player-overlay-renderer a[href^="/channel/"]',
        'ytd-reel-player-overlay-renderer a[href^="/@"]',
        'ytd-reel-video-renderer[is-active] a[href^="/channel/"]',
        'ytd-reel-video-renderer[is-active] a[href^="/@"]'
    ];

    for (const selector of selectors) {
        const link = document.querySelector(selector);
        if (link instanceof HTMLAnchorElement && link.href) {
            return link.href;
        }
    }

    const channelId = document.querySelector('meta[itemprop="channelId"]')?.getAttribute('content');
    if (channelId) {
        return `https://www.youtube.com/channel/${channelId}`;
    }

    return '';
}

function isVideoOrShortsPage() {
    return isVideoPage() || isShortsPage();
}
