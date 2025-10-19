/**
 * Quality Controls Wrapper - Refactored with DRY principles
 * Bridge between isolated and main world for quality control
 */

import { createLogger } from './utils/logger.js';
import { getStorageData } from './utils/storage.js';
import { DEFAULT_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';

// Create scoped logger
const logger = createLogger('QualityWrapper');

/**
 * Send quality setting to main world script
 */
function sendQualityToPage(quality) {
    try {
        window.postMessage({ 
            type: MESSAGE_TYPES.SET_QUALITY, 
            quality: quality 
        }, '*');
        
        logger.debug('Quality setting sent to page', { quality });
    } catch (error) {
        logger.error('Failed to send quality to page', error);
    }
}

/**
 * Load and apply initial quality setting
 */
async function loadInitialQuality() {
    try {
        const settings = await getStorageData('ytCommanderSettings', DEFAULT_SETTINGS);
        const quality = settings.maxQuality || DEFAULT_SETTINGS.maxQuality;
        
        sendQualityToPage(quality);
        logger.info('Initial quality loaded and applied', { quality });
    } catch (error) {
        logger.error('Failed to load initial quality', error);
        // Fallback to default
        sendQualityToPage(DEFAULT_SETTINGS.maxQuality);
    }
}

/**
 * Set up message listeners
 */
function setupMessageListeners() {
    // Listen for quality changes from popup or other sources
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            if (message.type === MESSAGE_TYPES.QUALITY_CHANGED) {
                sendQualityToPage(message.quality);
                logger.info('Quality changed via message', { quality: message.quality });
            }
        } catch (error) {
            logger.error('Error handling runtime message', error);
        }
    });
    
    logger.debug('Message listeners set up');
}

/**
 * Update settings from popup
 */
function updateSettings(newSettings) {
    const quality = newSettings.maxQuality || DEFAULT_SETTINGS.maxQuality;
    logger.info('Settings updated from popup', { quality });
    sendQualityToPage(quality);
}

/**
 * Enable quality controls
 */
function enable() {
    logger.info('Quality controls enabled');
    // Quality controls are always active when enabled
}

/**
 * Disable quality controls
 */
function disable() {
    logger.info('Quality controls disabled');
    // Could send a message to stop quality management
}

/**
 * Initialize quality controls wrapper
 */
async function initQualityWrapper() {
    try {
        logger.info('Initializing quality controls wrapper');
        
        // Load initial quality setting
        await loadInitialQuality();
        
        // Set up message listeners
        setupMessageListeners();
        
        logger.info('Quality controls wrapper initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize quality controls wrapper', error);
    }
}

// Initialize immediately
initQualityWrapper();

// Export for potential external use
export {
    initQualityWrapper,
    sendQualityToPage,
    updateSettings,
    enable,
    disable
};
