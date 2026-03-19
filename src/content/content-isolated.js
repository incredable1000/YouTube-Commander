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
            import('./shortsUploadAge.js').catch(e => { logger.warn('Failed to import shortsUploadAge:', e); throw e; }),
            import('./shortsProgressBar.js').catch(e => { logger.warn('Failed to import shortsProgressBar:', e); throw e; }),
            import('./videoRotation.js').catch(e => { logger.warn('Failed to import videoRotation:', e); throw e; }),
            import('./windowedFullscreen.js').catch(e => { logger.warn('Failed to import windowedFullscreen:', e); throw e; }),
            import('./open-video-tab.js').catch(e => { logger.warn('Failed to import openVideoTab:', e); throw e; }),
            import('./playlistControls.js').catch(e => { logger.warn('Failed to import playlistControls:', e); throw e; }),
            import('./playlistMultiSelect.js').catch(e => { logger.warn('Failed to import playlistMultiSelect:', e); throw e; }),
            import('./qualityControls-wrapper.js').catch(e => { logger.warn('Failed to import qualityControls-wrapper:', e); throw e; }),
            import('./watchedHistory.js').catch(e => { logger.warn('Failed to import watchedHistory:', e); throw e; }),
            import('./subscriptionManager.js').catch(e => { logger.warn('Failed to import subscriptionManager:', e); throw e; }),
            import('./miniGuidePlaylistButton.js').catch(e => { logger.warn('Failed to import miniGuidePlaylistButton:', e); throw e; })
        ]);
        
        // Initialize successfully imported modules
        const initPromises = [];
        
        modules.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const moduleNames = [
                    'seekControls', 
                    'scrollToTop', 
                    'shortsCounter',
                    'shortsUploadAge',
                    'shortsProgressBar',
                    'videoRotation',
                    'windowedFullscreen',
                    'openVideoTab',
                    'playlistControls',
                    'playlistMultiSelect',
                    'qualityControlsWrapper',
                    'watchedHistory',
                    'subscriptionManager',
                    'miniGuidePlaylistButton'
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
                if (module.initShortsUploadAge) initPromises.push(module.initShortsUploadAge());
                if (module.initShortsProgressBar) initPromises.push(module.initShortsProgressBar());
                if (module.initVideoRotation) initPromises.push(module.initVideoRotation());
                if (module.initWindowedFullscreen) initPromises.push(module.initWindowedFullscreen());
                if (module.initOpenVideoTab) initPromises.push(module.initOpenVideoTab());
                if (module.initPlaylistControls) initPromises.push(module.initPlaylistControls());
                if (module.initPlaylistMultiSelect) initPromises.push(module.initPlaylistMultiSelect());
                if (module.initQualityWrapper) initPromises.push(module.initQualityWrapper());
                if (module.initWatchedHistory) initPromises.push(module.initWatchedHistory());
                if (module.initSubscriptionManager) initPromises.push(module.initSubscriptionManager());
                if (module.initMiniGuidePlaylistButton) initPromises.push(module.initMiniGuidePlaylistButton());
            } else {
                logger.error(`Failed to load module:`, result.reason);
                const moduleNames = [
                    'seekControls', 
                    'scrollToTop', 
                    'shortsCounter',
                    'shortsUploadAge',
                    'shortsProgressBar',
                    'videoRotation',
                    'windowedFullscreen',
                    'openVideoTab',
                    'playlistControls',
                    'playlistMultiSelect',
                    'qualityControlsWrapper',
                    'watchedHistory',
                    'subscriptionManager',
                    'miniGuidePlaylistButton'
                ];
                const failedName = moduleNames[index];
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

// Apply runtime settings
function applySettings() {
    // Feature flags were removed from popup UX; modules stay enabled.
    updateModuleSettings();

    // Main-world audio controls do not exist in isolated world moduleInstances.
    // Forward the current auto-switch preference explicitly.
    sendAudioSettingsToMainWorld();
}

// Forward audio settings to the main-world audio controls script
function sendAudioSettingsToMainWorld() {
    const enabled = currentSettings.autoSwitchToOriginal !== false;
    window.postMessage({
        type: 'YT_COMMANDER_AUDIO_SETTINGS',
        enabled
    }, '*');
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

    // Update rotation settings
    const rotationModule = moduleInstances['videoRotation'];
    if (rotationModule && rotationModule.updateSettings) {
        rotationModule.updateSettings(currentSettings);
    }

    // Update windowed fullscreen settings
    const windowedModule = moduleInstances['windowedFullscreen'];
    if (windowedModule && windowedModule.updateSettings) {
        windowedModule.updateSettings(currentSettings);
    }
    
    // Add other modules here as needed
    logger.debug('Module settings updated');
}

// Handle messages from popup
try {
    if (chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            try {
                const watchedModule = moduleInstances['watchedHistory'];
                if (message.type === 'SETTINGS_UPDATED') {
                    logger.info('Settings updated from popup:', message.settings);
                    currentSettings = message.settings;
                    applySettings();
                    sendResponse({ success: true });
                } else if (message.type === 'GET_WATCHED_COUNT') {
                    // Handle watched count requests from background script
                    if (watchedModule && watchedModule.getWatchedCount) {
                        const count = watchedModule.getWatchedCount();
                        sendResponse({ count });
                    } else {
                        sendResponse({ count: 0 });
                    }
                } else if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
                    // Handle watched videos export requests
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
                } else if (message.type === 'GET_PENDING_SYNC_VIDEO_IDS') {
                    if (watchedModule && watchedModule.getPendingSyncVideoIds) {
                        watchedModule.getPendingSyncVideoIds(message.limit).then(videoIds => {
                            sendResponse({ success: true, videoIds });
                        }).catch(error => {
                            logger.error('Failed to read pending sync IDs:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true;
                    }
                    sendResponse({ success: false, error: 'Watched history module not available' });
                } else if (message.type === 'ACK_SYNCED_VIDEO_IDS') {
                    if (watchedModule && watchedModule.ackSyncedVideoIds) {
                        watchedModule.ackSyncedVideoIds(message.videoIds).then(removedCount => {
                            sendResponse({ success: true, removedCount });
                        }).catch(error => {
                            logger.error('Failed to ack synced IDs:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true;
                    }
                    sendResponse({ success: false, error: 'Watched history module not available' });
                } else if (message.type === 'GET_PENDING_SYNC_COUNT') {
                    if (watchedModule && watchedModule.getPendingSyncCount) {
                        watchedModule.getPendingSyncCount().then(count => {
                            sendResponse({ success: true, count });
                        }).catch(error => {
                            logger.error('Failed to get pending sync count:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true;
                    }
                    sendResponse({ success: false, error: 'Watched history module not available' });
                } else if (message.type === 'SEED_SYNC_QUEUE_FROM_HISTORY') {
                    if (watchedModule && watchedModule.seedSyncQueueFromHistory) {
                        watchedModule.seedSyncQueueFromHistory().then(seededCount => {
                            sendResponse({ success: true, seededCount });
                        }).catch(error => {
                            logger.error('Failed to seed sync queue:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true;
                    }
                    sendResponse({ success: false, error: 'Watched history module not available' });
                } else if (message.type === 'GET_SYNC_ACCOUNT_IDENTITY') {
                    if (watchedModule && watchedModule.getSyncAccountIdentity) {
                        const identity = watchedModule.getSyncAccountIdentity();
                        sendResponse({ success: true, ...identity });
                    } else {
                        sendResponse({
                            success: true,
                            accountKey: 'default',
                            source: 'fallback',
                            isPrimaryCandidate: false
                        });
                    }
                } else if (message.type === 'IMPORT_WATCHED_VIDEOS') {
                    if (watchedModule && watchedModule.importWatchedHistory) {
                        watchedModule.importWatchedHistory(message.videoIds, message.options).then((count) => {
                            sendResponse({ success: true, count });
                        }).catch((error) => {
                            logger.error('Failed to import watched videos:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true; // Keep message channel open for async response
                    }
                    sendResponse({ success: false, error: 'Watched history module not available' });
                } else if (message.type === 'GET_WATCHED_STATS') {
                    // Handle watched history stats requests
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
                } else if (message.type === 'OPEN_SUBSCRIPTION_MANAGER') {
                    const subscriptionModule = moduleInstances['subscriptionManager'];
                    if (subscriptionModule && subscriptionModule.openSubscriptionManager) {
                        subscriptionModule.openSubscriptionManager().then(() => {
                            sendResponse({ success: true });
                        }).catch(error => {
                            logger.error('Failed to open subscription manager:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true;
                    }
                    sendResponse({ success: false, error: 'Subscription manager module not available' });
                } else if (message.type === 'GET_SUBSCRIPTION_SNAPSHOT') {
                    const subscriptionModule = moduleInstances['subscriptionManager'];
                    if (subscriptionModule && subscriptionModule.getSubscriptionSnapshot) {
                        subscriptionModule.getSubscriptionSnapshot().then(snapshot => {
                            sendResponse({ success: true, ...snapshot });
                        }).catch(error => {
                            logger.error('Failed to load subscription snapshot:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                        return true;
                    }
                    sendResponse({ success: false, error: 'Subscription manager module not available' });
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




