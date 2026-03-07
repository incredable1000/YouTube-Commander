/**
 * Quality Controls Wrapper (Isolated World)
 * Sends quality settings to main-world quality controller.
 */

import { createLogger } from './utils/logger.js';
import { getStorageData } from './utils/storage.js';
import { DEFAULT_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';
import { normalizeQualityId } from '../shared/quality.js';

const logger = createLogger('QualityWrapper');

let initialized = false;
let enabled = true;
let runtimeListenerAttached = false;
let lastSentQuality = '';

/**
 * Post quality update to main world.
 * @param {string} quality
 * @param {{force?: boolean}} [options]
 */
function sendQualityToPage(quality, options = {}) {
    if (!enabled) {
        return;
    }

    const normalized = normalizeQualityId(quality, DEFAULT_SETTINGS.maxQuality);
    const force = options.force === true;

    if (!force && normalized === lastSentQuality) {
        return;
    }

    window.postMessage({
        type: MESSAGE_TYPES.SET_QUALITY,
        quality: normalized
    }, '*');

    lastSentQuality = normalized;
    logger.debug('Quality setting sent to page', { quality: normalized, force });
}

/**
 * Read stored quality and apply to current page context.
 */
async function loadInitialQuality() {
    try {
        const settings = await getStorageData(null, DEFAULT_SETTINGS);
        const quality = normalizeQualityId(settings.maxQuality, DEFAULT_SETTINGS.maxQuality);
        sendQualityToPage(quality, { force: true });
        logger.info('Initial quality loaded and applied', { quality });
    } catch (error) {
        logger.error('Failed to load initial quality', error);
        sendQualityToPage(DEFAULT_SETTINGS.maxQuality, { force: true });
    }
}

/**
 * Attach runtime message listener once.
 */
function setupMessageListeners() {
    if (runtimeListenerAttached) {
        return;
    }

    chrome.runtime.onMessage.addListener((message) => {
        try {
            if (message?.type === MESSAGE_TYPES.QUALITY_CHANGED) {
                sendQualityToPage(message.quality, { force: true });
            }
        } catch (error) {
            logger.error('Error handling runtime message', error);
        }
    });

    runtimeListenerAttached = true;
}

/**
 * Update settings from popup/runtime changes.
 * @param {object} newSettings
 */
function updateSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') {
        return;
    }

    const quality = normalizeQualityId(
        newSettings.maxQuality,
        DEFAULT_SETTINGS.maxQuality
    );

    sendQualityToPage(quality);
    logger.info('Quality settings updated', { quality });
}

/**
 * Enable quality wrapper.
 */
function enable() {
    enabled = true;
    if (initialized) {
        sendQualityToPage(lastSentQuality || DEFAULT_SETTINGS.maxQuality, { force: true });
    }
}

/**
 * Disable quality wrapper.
 */
function disable() {
    enabled = false;
}

/**
 * Initialize quality wrapper.
 */
async function initQualityWrapper() {
    if (initialized) {
        return;
    }

    setupMessageListeners();
    await loadInitialQuality();
    initialized = true;
    logger.info('Quality controls wrapper initialized');
}

export {
    initQualityWrapper,
    sendQualityToPage,
    updateSettings,
    enable,
    disable
};
