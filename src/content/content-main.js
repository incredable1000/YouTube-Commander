/**
 * Content Script - Main World
 * Entry point for content scripts running in main world (for YouTube API access)
 */

import { createLogger } from './utils/logger.js';
import { initializeUtils } from './utils/index.js';

// Initialize utilities
initializeUtils();

const logger = createLogger('ContentMain');

// Import and initialize main world modules
async function initializeMainWorldModules() {
    try {
        logger.info('Initializing main world modules');
        
        // These modules need access to YouTube's internal APIs
        // Import refactored main world modules
        const modules = await Promise.allSettled([
            import('./qualityControls.js'),
            import('./audioTrackControls.js')
        ]);
        
        // Initialize successfully imported modules
        modules.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                const moduleName = ['qualityControls', 'audioTrackControls'][index];
                logger.info(`${moduleName} module loaded successfully`);
                
                // These modules auto-initialize when loaded
                // No explicit init call needed as they run immediately
            } else {
                logger.error(`Failed to load module:`, result.reason);
            }
        });
        
        logger.info('Main world modules initialization complete');
    } catch (error) {
        logger.error('Failed to initialize main world modules', error);
    }
}

// Start initialization
initializeMainWorldModules();
