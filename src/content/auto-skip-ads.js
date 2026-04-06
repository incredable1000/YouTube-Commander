/**
 * Auto Skip Ads
 * Automatically clicks the skip ad button when it becomes available.
 */

import { createLogger } from './utils/logger.js';

const logger = createLogger('AutoSkipAds');

const SKIP_BUTTON_SELECTOR = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern';
const AD_OVERLAY_SELECTOR = '.ytp-ad-player-overlay';
const AD_CONTAINER_SELECTOR = '.ytp-ad-player-overlay-instream-info';

let observer = null;
let skipTimeoutId = null;

function clickSkipButton() {
    const skipButton = document.querySelector(SKIP_BUTTON_SELECTOR);
    if (skipButton && skipButton.offsetParent !== null) {
        skipButton.click();
        logger.info('Ad skipped automatically');
        return true;
    }
    return false;
}

function attemptSkip() {
    if (clickSkipButton()) {
        return;
    }

    const adContainer = document.querySelector(AD_CONTAINER_SELECTOR);
    if (!adContainer) {
        return;
    }

    skipTimeoutId = setTimeout(attemptSkip, 100);
}

function onAdDetected() {
    if (skipTimeoutId) {
        clearTimeout(skipTimeoutId);
        skipTimeoutId = null;
    }

    logger.debug('Ad detected, waiting for skip button');
    attemptSkip();
}

function startObserver() {
    if (observer) {
        return;
    }

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    continue;
                }

                if (node.matches && (node.matches(AD_OVERLAY_SELECTOR) || node.matches(AD_CONTAINER_SELECTOR))) {
                    onAdDetected();
                    return;
                }

                const adOverlay = node.querySelector(AD_OVERLAY_SELECTOR);
                if (adOverlay) {
                    onAdDetected();
                    return;
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    logger.info('Ad observer started');
}

function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    if (skipTimeoutId) {
        clearTimeout(skipTimeoutId);
        skipTimeoutId = null;
    }

    logger.info('Ad observer stopped');
}

function initAutoSkipAds() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }

    document.addEventListener('yt-navigate-finish', () => {
        if (skipTimeoutId) {
            clearTimeout(skipTimeoutId);
            skipTimeoutId = null;
        }
    });
}

initAutoSkipAds();

export {
    initAutoSkipAds,
    startObserver,
    stopObserver
};
