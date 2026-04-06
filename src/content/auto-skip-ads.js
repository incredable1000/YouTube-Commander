/**
 * Auto Skip Ads
 * Automatically skips YouTube ads by clicking skip buttons and speeding up playback.
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('AutoSkipAds');

const SKIP_BUTTON_SELECTORS = [
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    'button[aria-label^="Skip ad"]',
    'button[aria-label*="Skip"]'
];

let checkIntervalId = null;
let isAdPlaying = false;

function isAdShowing() {
    const video = document.querySelector('video');
    return video && (
        document.querySelector('.ad-showing') ||
        document.querySelector('.ad-interrupting') ||
        document.querySelector('.ytp-ad-player-overlay') ||
        video.classList.contains('ad-showing')
    );
}

function clickSkipButton() {
    for (const selector of SKIP_BUTTON_SELECTORS) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null && !button.disabled) {
            const rect = button.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
                button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
                button.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
                button.click();
                logger.info('Skip button clicked');
                return true;
            }
        }
    }
    return false;
}

function speedUpAd() {
    const video = document.querySelector('video.html5-main-video');
    if (!video || video.paused) {
        return;
    }

    const maxRate = /firefox/i.test(navigator.userAgent) ? 200 : 16;
    if (video.playbackRate < maxRate) {
        video.playbackRate = maxRate;
        logger.debug(`Ad speed set to ${maxRate}x`);
    }
}

function skipAd() {
    const adShowing = isAdShowing();
    
    if (!adShowing) {
        if (isAdPlaying) {
            isAdPlaying = false;
            const video = document.querySelector('video.html5-main-video');
            if (video) {
                video.playbackRate = 1;
            }
        }
        return;
    }

    isAdPlaying = true;

    if (!clickSkipButton()) {
        speedUpAd();
    }
}

function startChecking() {
    if (checkIntervalId) {
        return;
    }

    checkIntervalId = setInterval(skipAd, 250);
    logger.info('Ad checking started');

    document.addEventListener('yt-navigate-finish', () => {
        const video = document.querySelector('video.html5-main-video');
        if (video) {
            video.playbackRate = 1;
        }
        isAdPlaying = false;
    });
}

function stopChecking() {
    if (checkIntervalId) {
        clearInterval(checkIntervalId);
        checkIntervalId = null;
    }

    const video = document.querySelector('video.html5-main-video');
    if (video) {
        video.playbackRate = 1;
    }
    
    logger.info('Ad checking stopped');
}

function initAutoSkipAds() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startChecking);
    } else {
        startChecking();
    }
}

initAutoSkipAds();

export {
    initAutoSkipAds,
    startChecking,
    stopChecking
};
