/**
 * Logger Utility
 * Centralized logging system with categories and levels
 */

// Log levels
export const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

// Current log level (can be changed via storage)
let currentLogLevel = LOG_LEVELS.INFO;

// Extension prefix
const PREFIX = '[YT-Commander]';

/**
 * Set the current log level
 * @param {number} level - Log level from LOG_LEVELS
 */
export function setLogLevel(level) {
    currentLogLevel = level;
}

/**
 * Get formatted timestamp
 * @returns {string} ISO timestamp
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Format log message
 * @param {string} level - Log level name
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @returns {string} Formatted message
 */
function formatMessage(level, category, message) {
    return `${PREFIX}[${getTimestamp()}][${level}][${category}] ${message}`;
}

/**
 * Log error message
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
export function logError(category, message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
        console.error(formatMessage('ERROR', category, message), data || '');
    }
}

/**
 * Log warning message
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
export function logWarn(category, message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
        console.warn(formatMessage('WARN', category, message), data || '');
    }
}

/**
 * Log info message
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
export function logInfo(category, message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
        console.log(formatMessage('INFO', category, message), data || '');
    }
}

/**
 * Log debug message
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
export function logDebug(category, message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
        console.log(formatMessage('DEBUG', category, message), data || '');
    }
}

/**
 * Legacy debug log function for backward compatibility
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
export function debugLog(category, message, data = null) {
    logDebug(category, message, data);
}

/**
 * Log performance timing
 * @param {string} category - Log category
 * @param {string} operation - Operation name
 * @param {number} startTime - Start time from performance.now()
 */
export function logPerformance(category, operation, startTime) {
    const duration = performance.now() - startTime;
    logDebug(category, `${operation} completed in ${duration.toFixed(2)}ms`);
}

/**
 * Create a scoped logger for a specific category
 * @param {string} category - Default category for this logger
 * @returns {object} Scoped logger functions
 */
export function createLogger(category) {
    return {
        error: (message, data) => logError(category, message, data),
        warn: (message, data) => logWarn(category, message, data),
        info: (message, data) => logInfo(category, message, data),
        debug: (message, data) => logDebug(category, message, data),
        performance: (operation, startTime) => logPerformance(category, operation, startTime)
    };
}
