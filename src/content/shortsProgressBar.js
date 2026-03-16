/**
 * Shorts Progress Bar
 * Keeps the Shorts progress indicator visible.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver, addEventListenerWithCleanup } from './utils/events.js';
import { isShortsPage } from './utils/youtube.js';

const logger = createLogger('ShortsProgressBar');

const OBSERVER_THROTTLE_MS = 300;

const PROGRESS_SELECTORS = [
    'ytd-shorts .html5-video-player .ytp-chrome-bottom',
    'ytd-shorts .html5-video-player .ytp-progress-bar-container',
    'ytd-shorts .html5-video-player .ytp-progress-bar',
    'ytd-shorts desktop-shorts-player-controls yt-progress-bar',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarHost',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarHostHidden',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarDragContainer',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarProgressBar',
    'ytd-shorts desktop-shorts-player-controls .ytProgressBarLineProgressBarLine',
    'ytd-shorts desktop-shorts-player-controls .ytProgressBarLineProgressBarPlayed',
    'ytd-shorts ytd-reel-player-overlay-renderer #progress-bar',
    'ytd-shorts ytd-reel-player-overlay-renderer #progress',
    'ytd-shorts ytd-reel-player-overlay-renderer .progress-bar',
    'ytd-shorts ytd-reel-player-overlay-renderer .progress',
    'ytd-shorts ytd-reel-player-header-renderer #progress-bar',
    'ytd-shorts ytd-reel-player-header-renderer #progress',
    'ytd-shorts ytd-reel-player-header-renderer .progress-bar',
    'ytd-shorts ytd-reel-player-header-renderer .progress'
];

const PROGRESS_SELECTOR = PROGRESS_SELECTORS.join(', ');

const FORCE_DISPLAY_SELECTOR = [
    'ytd-shorts .html5-video-player .ytp-chrome-bottom',
    'ytd-shorts .html5-video-player .ytp-progress-bar-container',
    'ytd-shorts desktop-shorts-player-controls yt-progress-bar',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarHost',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarHostHidden',
    'ytd-shorts desktop-shorts-player-controls .ytPlayerProgressBarDragContainer',
    'ytd-shorts ytd-reel-player-overlay-renderer #progress-bar',
    'ytd-shorts ytd-reel-player-header-renderer #progress-bar'
].join(', ');

let observer = null;
let cleanupCallbacks = [];
let initialized = false;

function applyProgressVisibility() {
    if (!isShortsPage()) {
        return;
    }

    const elements = document.querySelectorAll(PROGRESS_SELECTOR);
    if (!elements.length) {
        return;
    }

    elements.forEach((element) => {
        if (!(element instanceof Element)) {
            return;
        }

        element.removeAttribute('hidden');

        if ('style' in element) {
            element.style.opacity = '1';
            element.style.visibility = 'visible';

            if (element.matches(FORCE_DISPLAY_SELECTOR)) {
                element.style.display = 'block';
            }
        }

        if (element.classList.contains('ytPlayerProgressBarHostHidden')) {
            element.classList.remove('ytPlayerProgressBarHostHidden');
        }

        element.classList.add('yt-commander-shorts-progress-visible');
    });
}

function setupObserver() {
    if (observer) {
        return;
    }

    observer = createThrottledObserver(() => {
        applyProgressVisibility();
    }, OBSERVER_THROTTLE_MS, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
    });
}

function teardownObserver() {
    if (!observer) {
        return;
    }

    observer.disconnect();
    observer = null;
}

function handleNavigation() {
    if (isShortsPage()) {
        setupObserver();
        applyProgressVisibility();
    } else {
        teardownObserver();
    }
}

/**
 * Initialize Shorts progress bar visibility fixes.
 */
export function initShortsProgressBar() {
    if (initialized) {
        handleNavigation();
        return;
    }

    initialized = true;

    try {
        handleNavigation();

        cleanupCallbacks.push(
            addEventListenerWithCleanup(document, 'yt-navigate-finish', handleNavigation),
            addEventListenerWithCleanup(document, 'yt-page-data-updated', handleNavigation),
            addEventListenerWithCleanup(window, 'pageshow', handleNavigation),
            addEventListenerWithCleanup(document, 'visibilitychange', () => {
                if (!document.hidden) {
                    handleNavigation();
                }
            })
        );
    } catch (error) {
        logger.error('Failed to initialize shorts progress bar', error);
    }
}
