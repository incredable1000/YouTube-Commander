/**
 * Content Script - Isolated World
 * Entry point for content scripts running in isolated world
 */

import { createLogger } from './utils/logger.js';
import { initializeUtils } from './utils/index.js';

// Initialize utilities
initializeUtils();

const logger = createLogger('ContentIsolated');

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
                
                // Call initialization functions
                const module = result.value;
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
    } catch (error) {
        logger.error('Failed to initialize modules', error);
    }
}

// Start initialization
initializeModules();
