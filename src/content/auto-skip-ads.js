/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button when it appears.
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('AutoSkipAds');

const SKIP_BUTTON_SELECTORS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '[aria-label*="Skip"][aria-label*="ad"]',
    'button.ytp-ad-skip-button'
];

let checkIntervalId = null;

function isAdShowing() {
    return !!document.querySelector('.ytp-ad-player-overlay');
}

function getSkipButton() {
    for (const selector of SKIP_BUTTON_SELECTORS) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null) {
            return button;
        }
    }
    return null;
}

function clickSkipButton() {
    const button = getSkipButton();
    if (!button) {
        return false;
    }

    const rect = button.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const elementsAtPoint = document.elementsFromPoint(centerX, centerY);
    if (!elementsAtPoint.includes(button)) {
        logger.debug('Skip button not top element at point');
        return false;
    }

    const mouseEvents = [
        new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: centerX, clientY: centerY }),
        new MouseEvent('mouseenter', { bubbles: true, cancelable: true, clientX: centerX, clientY: centerY }),
        new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: centerX, clientY: centerY }),
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: centerX, clientY: centerY, button: 0, buttons: 1 }),
        new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: centerX, clientY: centerY, button: 0, buttons: 0 })
    ];

    mouseEvents.forEach(event => button.dispatchEvent(event));
    button.click();

    logger.info('Skip button clicked via mouse events');
    return true;
}

function checkAndSkip() {
    if (!isAdShowing()) {
        return;
    }

    const button = getSkipButton();
    if (button) {
        clickSkipButton();
    }
}

function startChecking() {
    if (checkIntervalId) {
        return;
    }

    checkIntervalId = setInterval(checkAndSkip, 200);
    logger.info('Ad checking started');
}

function stopChecking() {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
    }
    logger.info('Ad checking stopped');
}

function initAutoSkipAds() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startChecking);
    } else {
        startChecking();
    }

    document.addEventListener('yt-navigate-finish', stopChecking);
}

initAutoSkipAds();

export {
    initAutoSkipAds,
    startChecking,
    stopChecking
};
