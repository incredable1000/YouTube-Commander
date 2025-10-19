/**
 * Utils Index
 * Centralized export of all utility modules
 */

// Re-export all utilities for easy importing
export * from './youtube.js';
export * from './storage.js';
export * from './logger.js';
export * from './events.js';
export * from './ui.js';

// Re-export constants
export * from '../../shared/constants.js';

// Import utilities for initialization
import { ensureAnimations } from './ui.js';
import { logError } from './logger.js';

// Convenience function to initialize all utilities
export function initializeUtils() {
    // Ensure CSS animations are loaded
    ensureAnimations();
    
    // Set up global error handling
    window.addEventListener('error', (event) => {
        logError('Global', 'Unhandled error', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error
        });
    });
    
    // Set up unhandled promise rejection handling
    window.addEventListener('unhandledrejection', (event) => {
        logError('Global', 'Unhandled promise rejection', event.reason);
    });
}
