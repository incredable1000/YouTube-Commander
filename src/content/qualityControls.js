/**
 * Quality Controls (Main World)
 * Applies preferred quality once when a video loads, then does not override manual changes.
 */

import { createLogger } from './utils/logger.js';
import { DEFAULT_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';
import { normalizeQualityId } from '../shared/quality.js';
import { createQualityController } from './quality-controls/controller.js';

const logger = createLogger('QualityControls');

let initialized = false;
let messageListenerAttached = false;

const controller = createQualityController({
    logger,
    initialQuality: DEFAULT_SETTINGS.maxQuality
});

/**
 * Handle quality messages from isolated-world wrapper.
 * @param {MessageEvent} event
 */
function handleWindowMessage(event) {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
        return;
    }

    if (event.data.type !== MESSAGE_TYPES.SET_QUALITY) {
        return;
    }

    const requestedQuality = normalizeQualityId(
        event.data.quality,
        controller.getPreferredQuality()
    );

    controller.updatePreferredQuality(requestedQuality, {
        applyNow: true,
        forceApply: true
    });

    window.postMessage({
        type: MESSAGE_TYPES.QUALITY_CHANGED,
        quality: requestedQuality,
        success: true
    }, '*');
}

/**
 * Attach message listener once.
 */
function attachMessageListener() {
    if (messageListenerAttached) {
        return;
    }

    window.addEventListener('message', handleWindowMessage);
    messageListenerAttached = true;
}

/**
 * Initialize quality controls.
 */
async function initQualityControls() {
    if (initialized) {
        return;
    }

    attachMessageListener();
    controller.start();
    initialized = true;

    logger.info('Quality controls initialized');
}

/**
 * Apply explicit quality update programmatically.
 * @param {string} quality
 * @returns {boolean}
 */
function setVideoQuality(quality) {
    const normalized = controller.updatePreferredQuality(quality, {
        applyNow: true,
        forceApply: true
    });

    return Boolean(normalized);
}

/**
 * Read current preferred quality.
 * @returns {string}
 */
function getPreferredQuality() {
    return controller.getPreferredQuality();
}

/**
 * Cleanup runtime listeners.
 */
function cleanupQualityControls() {
    controller.stop();
    if (messageListenerAttached) {
        window.removeEventListener('message', handleWindowMessage);
        messageListenerAttached = false;
    }
    initialized = false;
    logger.info('Quality controls cleaned up');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void initQualityControls();
    }, { once: true });
} else {
    void initQualityControls();
}

window.ytCommanderQualityControls = {
    init: initQualityControls,
    cleanup: cleanupQualityControls,
    setVideoQuality,
    getPreferredQuality
};

export {
    initQualityControls,
    cleanupQualityControls,
    setVideoQuality,
    getPreferredQuality
};
