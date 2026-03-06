/**
 * Page and video-id helpers for Shorts counter.
 */

import { getCurrentVideoId } from '../utils/youtube.js';

/**
 * Parse short ID from a URL/href.
 * @param {string} href
 * @returns {string|null}
 */
function extractShortIdFromHref(href) {
    if (!href || typeof href !== 'string') {
        return null;
    }

    try {
        const url = new URL(href, window.location.origin);
        const pathMatch = url.pathname.match(/\/shorts\/([^/?#]+)/);
        if (pathMatch?.[1]) {
            return pathMatch[1];
        }

        const queryId = url.searchParams.get('v');
        return queryId || null;
    } catch (_error) {
        return null;
    }
}

/**
 * True only on Shorts watch-view pages (/shorts/<id>), not channel Shorts tabs.
 * @returns {boolean}
 */
function isShortsWatchPage() {
    const path = window.location.pathname || '';
    if (!path.startsWith('/shorts/')) {
        return false;
    }

    return Boolean(extractShortIdFromHref(window.location.href));
}

/**
 * Derive the current active Shorts video ID.
 * @returns {string|null}
 */
function getCurrentShortsId() {
    if (!isShortsWatchPage()) {
        return null;
    }

    const fromUrl = extractShortIdFromHref(window.location.href);
    if (fromUrl) {
        return fromUrl;
    }

    const activeRenderer = document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
    if (activeRenderer) {
        const rendererId = activeRenderer.getAttribute('video-id') || activeRenderer.dataset?.videoId;
        if (rendererId) {
            return rendererId;
        }

        const activeLink = activeRenderer.querySelector('a[href*="/shorts/"]');
        const fromRendererLink = extractShortIdFromHref(activeLink?.href || '');
        if (fromRendererLink) {
            return fromRendererLink;
        }
    }

    const fromQuery = getCurrentVideoId();
    return fromQuery || null;
}

/**
 * Get the active Shorts renderer.
 * @returns {Element|null}
 */
function getActiveShortsRenderer() {
    const explicitActive = document.querySelector('ytd-shorts ytd-reel-video-renderer[is-active]');
    if (explicitActive) {
        return explicitActive;
    }

    const renderers = document.querySelectorAll('ytd-shorts ytd-reel-video-renderer');
    const midY = window.innerHeight / 2;
    for (const renderer of renderers) {
        const rect = renderer.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) {
            return renderer;
        }
    }

    return null;
}

/**
 * Return active Shorts video element.
 * @returns {HTMLVideoElement|null}
 */
function getActiveShortsVideoElement() {
    const activeRenderer = getActiveShortsRenderer();
    if (activeRenderer) {
        const rendererVideo = activeRenderer.querySelector('video.html5-main-video');
        if (rendererVideo instanceof HTMLVideoElement) {
            return rendererVideo;
        }
    }

    const fallbackVideo = document.querySelector('ytd-shorts video.html5-main-video');
    return fallbackVideo instanceof HTMLVideoElement ? fallbackVideo : null;
}

/**
 * Check if element is interactable.
 * @param {Element|null} element
 * @returns {boolean}
 */
function isInteractableElement(element) {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/**
 * Try to advance to the next short item.
 * @returns {boolean}
 */
function advanceToNextShort() {
    const activeRenderer = getActiveShortsRenderer();
    if (activeRenderer) {
        const renderers = Array.from(document.querySelectorAll('ytd-shorts ytd-reel-video-renderer'));
        const activeIndex = renderers.indexOf(activeRenderer);
        if (activeIndex >= 0 && activeIndex < renderers.length - 1) {
            const nextRenderer = renderers[activeIndex + 1];
            if (nextRenderer) {
                nextRenderer.scrollIntoView({ behavior: 'auto', block: 'center' });
                return true;
            }
        }
    }

    const nextButtonSelectors = [
        'ytd-shorts ytd-reel-player-overlay-renderer #navigation-button-down button',
        'ytd-shorts ytd-reel-player-overlay-renderer #navigation-button-down',
        'ytd-shorts #navigation-button-down button',
        'ytd-shorts #navigation-button-down',
        'ytd-shorts ytd-button-renderer#navigation-button-down button',
        'ytd-shorts ytd-button-renderer#navigation-button-down',
        'ytd-shorts button[aria-label*="Next"]',
        'ytd-shorts button[aria-label*="next"]',
        'ytd-shorts button[title*="Next"]',
        'ytd-shorts [aria-label*="Next"]'
    ];

    for (const selector of nextButtonSelectors) {
        const button = document.querySelector(selector);
        if (!isInteractableElement(button)) {
            continue;
        }

        button.click();
        return true;
    }

    try {
        const eventInit = {
            key: 'ArrowDown',
            code: 'ArrowDown',
            keyCode: 40,
            which: 40,
            bubbles: true,
            cancelable: true
        };

        document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        return true;
    } catch (_error) {
        return false;
    }
}

export {
    extractShortIdFromHref,
    isShortsWatchPage,
    getCurrentShortsId,
    getActiveShortsVideoElement,
    getActiveShortsRenderer,
    advanceToNextShort
};
