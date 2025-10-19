/**
 * Content Script - Isolated World
 * Entry point for content scripts running in isolated world
 */

import { createLogger } from './utils/logger.js';
import { initializeUtils } from './utils/index.js';

// Initialize utilities
initializeUtils();

const logger = createLogger('ContentIsolated');

// Global module references for dynamic enable/disable
let moduleInstances = {};
let currentSettings = {};

// Import and initialize modules
async function initializeModules() {
    try {
        logger.info('Initializing isolated world modules');
        
        // Import modules dynamically to handle dependencies
        const modules = await Promise.allSettled([
            import('./seekControls.js'),
            import('./scrollToTop.js'),
            import('./shortsCounter.js'),
            import('./videoRotation.js'),
            import('./playlistControls.js'),
            import('./qualityControls-wrapper.js'),
            import('./watchedHistory.js'),
        ]);
        
        // Initialize successfully imported modules
        const initPromises = [];
        
        modules.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const moduleNames = [
                    'seekControls', 
                    'scrollToTop', 
                    'shortsCounter',
                    'videoRotation',
                    'playlistControls',
                    'qualityControlsWrapper',
                    'watchedHistory'
                ];
                const moduleName = moduleNames[index];
                
                logger.info(`${moduleName} module loaded successfully`);
                
                // Call initialization functions and store module instances
                const module = result.value;
                
                // Store module instance for later enable/disable
                moduleInstances[moduleName] = module;
                
                if (module.initSeekControls) initPromises.push(module.initSeekControls());
                if (module.initScrollToTop) initPromises.push(module.initScrollToTop());
                if (module.initShortsCounter) initPromises.push(module.initShortsCounter());
                if (module.initVideoRotation) initPromises.push(module.initVideoRotation());
                if (module.initPlaylistControls) initPromises.push(module.initPlaylistControls());
                if (module.initQualityWrapper) initPromises.push(module.initQualityWrapper());
                if (module.initWatchedHistory) initPromises.push(module.initWatchedHistory());
            } else {
                logger.error(`Failed to load module:`, result.reason);
            }
        });
        
        // Wait for all initializations to complete
        await Promise.allSettled(initPromises);
        
        logger.info('All isolated world modules initialized');
        
        // Load initial settings
        loadSettings();
        
    } catch (error) {
        logger.error('Failed to initialize modules', error);
    }
}

// Load settings from storage
async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get();
        currentSettings = settings;
        logger.info('Settings loaded:', currentSettings);
        applySettings();
    } catch (error) {
        logger.error('Failed to load settings:', error);
    }
}

// Apply settings to enable/disable features
function applySettings() {
    const featureMap = {
        seekEnabled: 'seekControls',
        qualityEnabled: 'qualityControlsWrapper', 
        audioEnabled: 'audioTrackControls',
        historyEnabled: 'watchedHistory',
        scrollEnabled: 'scrollToTop',
        shortsEnabled: 'shortsCounter',
        rotationEnabled: 'videoRotation',
        playlistEnabled: 'playlistControls'
    };
    
    // Update settings for modules that support it
    updateModuleSettings();
    
    Object.entries(featureMap).forEach(([settingKey, moduleName]) => {
        const isEnabled = currentSettings[settingKey] !== false; // Default to enabled
        const moduleInstance = moduleInstances[moduleName];
        
        if (moduleInstance) {
            if (isEnabled) {
                enableFeature(moduleName, moduleInstance);
            } else {
                disableFeature(moduleName, moduleInstance);
            }
        }
    });
}

// Update module settings
function updateModuleSettings() {
    // Update seek controls settings
    const seekModule = moduleInstances['seekControls'];
    if (seekModule && seekModule.updateSettings) {
        seekModule.updateSettings(currentSettings);
    }
    
    // Add other modules here as needed
    logger.debug('Module settings updated');
}

// Enable a feature
function enableFeature(moduleName, moduleInstance) {
    logger.info(`Enabling feature: ${moduleName}`);
    
    // Call enable method if it exists
    if (moduleInstance.enable && typeof moduleInstance.enable === 'function') {
        moduleInstance.enable();
    }
    
    // Re-initialize if needed
    if (moduleInstance.init && typeof moduleInstance.init === 'function') {
        moduleInstance.init();
    }
}

// Disable a feature
function disableFeature(moduleName, moduleInstance) {
    logger.info(`Disabling feature: ${moduleName}`);
    
    // Call disable method if it exists
    if (moduleInstance.disable && typeof moduleInstance.disable === 'function') {
        moduleInstance.disable();
    }
    
    // Call cleanup method if it exists
    if (moduleInstance.cleanup && typeof moduleInstance.cleanup === 'function') {
        moduleInstance.cleanup();
    }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED') {
        logger.info('Settings updated from popup:', message.settings);
        currentSettings = message.settings;
        applySettings();
        sendResponse({ success: true });
    }
    return true;
});

// Start initialization
initializeModules();
