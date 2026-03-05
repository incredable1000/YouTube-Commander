/**
 * Scroll To Top
 * Reliable, low-overhead scroll-to-top button for YouTube pages.
 */

import { createLogger } from './utils/logger.js';
import { createIcon } from './utils/ui.js';
import { addEventListenerWithCleanup } from './utils/events.js';

const logger = createLogger('ScrollToTop');

const BUTTON_ID = 'yt-scroll-to-top';
const SCROLL_THRESHOLD = 200;

let scrollButton = null;
let initialized = false;
let enabled = true;
let visible = false;
let scrollListenerCleanup = null;
let clickListenerCleanup = null;
let navigateListenerCleanup = null;
let pendingFrame = false;

/**
 * Return the best available scrolling element.
 * @returns {HTMLElement}
 */
function getScrollElement() {
    return document.scrollingElement || document.documentElement;
}

/**
 * Get current vertical scroll offset.
 * @returns {number}
 */
function getCurrentScrollTop() {
    const scrollElement = getScrollElement();
    if (scrollElement && typeof scrollElement.scrollTop === 'number') {
        return scrollElement.scrollTop;
    }
    return window.scrollY || 0;
}

/**
 * Build a single scroll button instance.
 * @returns {HTMLButtonElement}
 */
function createScrollToTopButton() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
        existing.remove();
    }

    const icon = createIcon({
        viewBox: '0 0 24 24',
        width: '20',
        height: '20',
        path: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
        fill: 'currentColor'
    });
    icon.style.transform = 'rotate(-90deg)';

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.setAttribute('aria-label', 'Scroll to top');
    button.appendChild(icon);

    Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: '0',
        pointerEvents: 'none',
        transform: 'translateY(8px) scale(0.96)',
        transition: 'opacity 0.2s ease, transform 0.2s ease, background-color 0.2s ease',
        zIndex: '9999',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)'
    });

    button.addEventListener('mouseenter', () => {
        if (!enabled) {
            return;
        }
        button.style.background = 'rgba(255, 255, 255, 0.2)';
    });

    button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(0, 0, 0, 0.8)';
    });

    return button;
}

/**
 * Update button visibility state without redundant style writes.
 * @param {boolean} shouldShow
 */
function setButtonVisibility(shouldShow) {
    if (!scrollButton || visible === shouldShow) {
        return;
    }

    visible = shouldShow;
    scrollButton.style.opacity = shouldShow ? '1' : '0';
    scrollButton.style.pointerEvents = shouldShow ? 'auto' : 'none';
    scrollButton.style.transform = shouldShow ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.96)';
}

/**
 * Compute and apply button visibility.
 */
function updateVisibility() {
    if (!scrollButton || !enabled) {
        setButtonVisibility(false);
        return;
    }

    const shouldShow = getCurrentScrollTop() > SCROLL_THRESHOLD;
    setButtonVisibility(shouldShow);
}

/**
 * Schedule a visibility update on next frame.
 */
function scheduleVisibilityUpdate() {
    if (pendingFrame) {
        return;
    }

    pendingFrame = true;
    window.requestAnimationFrame(() => {
        pendingFrame = false;
        updateVisibility();
    });
}

/**
 * Smoothly scroll to top.
 */
function scrollToTop() {
    const prefersReducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = prefersReducedMotion ? 'auto' : 'smooth';

    try {
        const scrollElement = getScrollElement();
        if (scrollElement && typeof scrollElement.scrollTo === 'function') {
            scrollElement.scrollTo({ top: 0, behavior });
            return;
        }

        window.scrollTo({ top: 0, behavior });
    } catch (error) {
        window.scrollTo(0, 0);
        logger.warn('Used fallback scroll method', error);
    }
}

/**
 * Attach event listeners required while enabled.
 */
function attachRuntimeListeners() {
    if (scrollListenerCleanup) {
        return;
    }

    scrollListenerCleanup = addEventListenerWithCleanup(window, 'scroll', scheduleVisibilityUpdate, { passive: true });
    navigateListenerCleanup = addEventListenerWithCleanup(document, 'yt-navigate-finish', scheduleVisibilityUpdate);
}

/**
 * Detach listeners to reduce overhead while disabled.
 */
function detachRuntimeListeners() {
    if (scrollListenerCleanup) {
        scrollListenerCleanup();
        scrollListenerCleanup = null;
    }

    if (navigateListenerCleanup) {
        navigateListenerCleanup();
        navigateListenerCleanup = null;
    }
}

/**
 * Initialize scroll-to-top functionality.
 */
function initScrollToTop() {
    if (initialized) {
        return;
    }

    try {
        if (!document.body) {
            return;
        }

        scrollButton = createScrollToTopButton();
        document.body.appendChild(scrollButton);

        clickListenerCleanup = addEventListenerWithCleanup(scrollButton, 'click', (event) => {
            event.preventDefault();
            scrollToTop();
        });

        initialized = true;
        attachRuntimeListeners();
        updateVisibility();
        logger.info('Scroll-to-top initialized');
    } catch (error) {
        logger.error('Failed to initialize scroll-to-top', error);
    }
}

/**
 * Enable scroll-to-top feature.
 */
function enable() {
    enabled = true;

    if (!initialized) {
        initScrollToTop();
    } else {
        attachRuntimeListeners();
        updateVisibility();
    }

    logger.info('Scroll-to-top enabled');
}

/**
 * Disable scroll-to-top feature.
 */
function disable() {
    enabled = false;
    detachRuntimeListeners();
    setButtonVisibility(false);
    logger.info('Scroll-to-top disabled');
}

/**
 * Cleanup all listeners and DOM artifacts.
 */
function cleanup() {
    detachRuntimeListeners();

    if (clickListenerCleanup) {
        clickListenerCleanup();
        clickListenerCleanup = null;
    }

    if (scrollButton) {
        scrollButton.remove();
        scrollButton = null;
    }

    initialized = false;
    visible = false;
    pendingFrame = false;
    logger.info('Scroll-to-top cleaned up');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollToTop, { once: true });
} else {
    initScrollToTop();
}

export {
    initScrollToTop,
    enable,
    disable,
    cleanup
};
