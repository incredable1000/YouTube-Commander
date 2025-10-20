/**
 * Content Script - Main World
 * Entry point for content scripts running in main world (for YouTube API access)
 */

import { createLogger } from './utils/logger.js';
import { initializeUtils } from './utils/index.js';

// Initialize utilities
initializeUtils();

const logger = createLogger('ContentMain');

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

// Import and initialize main world modules
async function initializeMainWorldModules() {
    try {
        logger.info('Initializing main world modules');
        
        // These modules need access to YouTube's internal APIs
        // Import refactored main world modules
        const modules = await Promise.allSettled([
            import('./qualityControls.js').catch(e => { logger.warn('Failed to import qualityControls:', e); throw e; }),
            import('./audioTrackControls.js').catch(e => { logger.warn('Failed to import audioTrackControls:', e); throw e; })
        ]);
        
        // Initialize successfully imported modules
        modules.forEach((result, index) => {
            const moduleName = ['qualityControls', 'audioTrackControls'][index];
            
            if (result.status === 'fulfilled') {
                logger.info(`${moduleName} module loaded successfully`);
                
                // These modules auto-initialize when loaded
                // No explicit init call needed as they run immediately
            } else {
                logger.error(`Failed to load ${moduleName} module`, result.reason);
            }
        });
        
        logger.info('Main world modules initialization complete');
    } catch (error) {
        logger.error('Failed to initialize main world modules', error);
    }
}

// Start initialization with error handling
initializeMainWorldModules().catch(error => {
    logger.error('Failed to initialize main world modules during startup', error);
});
