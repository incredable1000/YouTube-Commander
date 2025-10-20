/**
 * Content Script - Isolated World
 * Entry point for content scripts running in isolated world
 */

import { createLogger } from './utils/logger.js';
import { initializeUtils } from './utils/index.js';

// Initialize utilities
initializeUtils();

const logger = createLogger('ContentIsolated');

// Global error handler for unhandled errors
window.addEventListener('error', (event) => {
    // Only log errors from our extension or YouTube pages, not from other extensions
    const isOurExtension = event.filename && (
        event.filename.includes('youtube-commander') ||
        event.filename.includes('YT-Commander') ||
        event.filename.includes(chrome.runtime.id)
    );
    
    const isYouTubePage = !event.filename || event.filename.includes('youtube.com');
    
    if (isOurExtension || isYouTubePage) {
        logger.error('Unhandled error caught', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error
        });
    }
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    // Filter out YouTube's internal clipboard errors and other non-extension errors
    const isClipboardError = event.reason instanceof Error && 
        (event.reason.name === 'NotAllowedError' && event.reason.message.includes('Clipboard'));
    
    const isYouTubeInternalError = event.reason instanceof Error && 
        event.reason.stack && (event.reason.stack.includes('polymer.js') || 
                              event.reason.stack.includes('youtube.com') ||
                              event.reason.stack.includes('www-player.js') ||
                              event.reason.stack.includes('base.js'));
    
    const isNotificationError = event.reason instanceof Error &&
        event.reason.message && event.reason.message.includes('download all specified images');
    
    const isNetworkError = event.reason instanceof Error &&
        (event.reason.name === 'TypeError' && event.reason.message.includes('fetch')) ||
        (event.reason.name === 'NetworkError') ||
        (event.reason.message && event.reason.message.includes('Failed to fetch'));
    
    const isBrowserInternalError = event.reason instanceof Error &&
        event.reason.message && (
            event.reason.message.includes('ResizeObserver loop limit exceeded') ||
            event.reason.message.includes('Non-Error promise rejection captured') ||
            event.reason.message.includes('Script error')
        );
    
    // Skip YouTube's internal errors, notification errors, and browser internal errors
    if (isClipboardError || isYouTubeInternalError || isNotificationError || isNetworkError || isBrowserInternalError) {
        event.preventDefault(); // Prevent console spam
        return;
    }
    
    // Only log if it's likely related to our extension
    const isExtensionRelated = !event.reason || 
        (event.reason instanceof Error && event.reason.stack && 
         (event.reason.stack.includes('YT-Commander') || 
          event.reason.stack.includes('youtube-commander') ||
          event.reason.stack.includes(chrome.runtime?.id || 'extension-id'))) ||
        (typeof event.reason === 'object' && event.reason.constructor?.name?.includes('Extension'));
    
    if (isExtensionRelated) {
        logger.error('Unhandled promise rejection caught', event.reason);
    } else {
        // Log as debug for non-extension errors
        logger.debug('External promise rejection filtered', event.reason);
    }
    
    // Prevent the default behavior (logging to console)
    event.preventDefault();
});

// Global module references for dynamic enable/disable
let moduleInstances = {};
let currentSettings = {};

// Import and initialize modules
async function initializeModules() {
    try {
        logger.info('Initializing isolated world modules');
        
        // Import modules dynamically to handle dependencies
        const modules = await Promise.allSettled([
            import('./seekControls.js').catch(e => { logger.warn('Failed to import seekControls:', e); throw e; }),
            import('./scrollToTop.js').catch(e => { logger.warn('Failed to import scrollToTop:', e); throw e; }),
            import('./shortsCounter.js').catch(e => { logger.warn('Failed to import shortsCounter:', e); throw e; }),
            import('./videoRotation.js').catch(e => { logger.warn('Failed to import videoRotation:', e); throw e; }),
            import('./playlistControls.js').catch(e => { logger.warn('Failed to import playlistControls:', e); throw e; }),
            import('./qualityControls-wrapper.js').catch(e => { logger.warn('Failed to import qualityControls-wrapper:', e); throw e; }),
            import('./watchedHistory.js').catch(e => { logger.warn('Failed to import watchedHistory:', e); throw e; }),
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
        // Check if extension context is still valid
        if (!chrome || !chrome.storage || !chrome.runtime) {
            logger.warn('Extension context invalidated, using default settings');
            currentSettings = {};
            return;
        }

        const settings = await chrome.storage.sync.get();
        currentSettings = settings;
        logger.info('Settings loaded:', currentSettings);
        applySettings();
    } catch (error) {
        if (error.message && error.message.includes('Extension context invalidated')) {
            logger.warn('Extension context invalidated during settings load');
            currentSettings = {};
        } else {
            logger.error('Failed to load settings:', error);
            // Use default settings if loading fails
            currentSettings = {};
        }
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
    
    // Update quality controls settings
    const qualityModule = moduleInstances['qualityControlsWrapper'];
    if (qualityModule && qualityModule.updateSettings) {
        qualityModule.updateSettings(currentSettings);
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
try {
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                if (message.type === 'SETTINGS_UPDATED') {
                    logger.info('Settings updated from popup:', message.settings);
                    currentSettings = message.settings;
                    applySettings();
                    sendResponse({ success: true });
                } else if (message.type === 'GET_WATCHED_COUNT') {
                    // Handle watched count requests from background script
                    const watchedModule = moduleInstances['watchedHistory'];
                    if (watchedModule && watchedModule.getWatchedCount) {
                        const count = watchedModule.getWatchedCount();
                        sendResponse({ count });
                    } else {
                        sendResponse({ count: 0 });
                    }
                } else if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
                    // Handle watched videos export requests
                    const watchedModule = moduleInstances['watchedHistory'];
                    if (watchedModule && watchedModule.getAllWatchedVideos) {
                        watchedModule.getAllWatchedVideos().then(videos => {
                            sendResponse({ success: true, videos });
                        }).catch(error => {
                            logger.error('Failed to get watched videos:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                    } else {
                        sendResponse({ success: false, error: 'Watched history module not available' });
                    }
                } else if (message.type === 'IMPORT_WATCHED_VIDEOS') {
                    // Handle watched videos import requests
                    console.log('🚀 Content script received IMPORT_WATCHED_VIDEOS message with', message.videoIds?.length, 'IDs');
                    console.log('🚀 Available modules:', Object.keys(moduleInstances));
                    
                    const watchedModule = moduleInstances['watchedHistory'];
                    console.log('🚀 Watched module:', !!watchedModule);
                    console.log('🚀 importWatchedHistory function:', !!(watchedModule && watchedModule.importWatchedHistory));
                    
                    if (watchedModule && watchedModule.importWatchedHistory) {
                        console.log('🚀 Calling importWatchedHistory function...');
                        watchedModule.importWatchedHistory(message.videoIds).then(count => {
                            console.log('🚀 Import completed successfully, count:', count);
                            sendResponse({ success: true, count });
                        }).catch(error => {
                            console.error('🚀 Import failed with error:', error);
                            logger.error('Failed to import watched videos:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true; // Keep message channel open for async response
                    } else {
                        console.error('🚀 Watched history module not available');
                        console.log('🚀 Module details:', {
                            moduleExists: !!watchedModule,
                            functionExists: !!(watchedModule && watchedModule.importWatchedHistory),
                            moduleKeys: watchedModule ? Object.keys(watchedModule) : 'N/A'
                        });
                        sendResponse({ success: false, error: 'Watched history module not available' });
                    }
                } else if (message.type === 'GET_WATCHED_STATS') {
                    // Handle watched history stats requests
                    const watchedModule = moduleInstances['watchedHistory'];
                    if (watchedModule && watchedModule.getAllWatchedVideos) {
                        watchedModule.getAllWatchedVideos().then(videos => {
                            const today = new Date();
                            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                            const todayVideos = videos.filter(v => v.timestamp >= todayStart);
                            sendResponse({ 
                                success: true, 
                                total: videos.length, 
                                today: todayVideos.length 
                            });
                        }).catch(error => {
                            logger.error('Failed to get watched stats:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true; // Keep message channel open for async response
                    } else {
                        sendResponse({ success: false, error: 'Watched history module not available' });
                    }
                }
            } catch (error) {
                logger.warn('Error handling message:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true; // Keep message channel open for async responses
        });
    }
} catch (error) {
    logger.warn('Failed to set up message listener, extension context may be invalidated:', error);
}

// Start initialization with error handling
initializeModules().catch(error => {
    logger.error('Failed to initialize isolated world modules during startup', error);
});

// Add a global test function to verify content script is loaded
window.testYTCommanderContentScript = function() {
    console.log('🎯 YT Commander Content Script is loaded and working!');
    console.log('🎯 Available modules:', Object.keys(moduleInstances));
    return 'Content script is working';
};
