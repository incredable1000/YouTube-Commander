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
 * Serialize error objects for proper logging
 * @param {any} data - Data to serialize
 * @returns {any} Serialized data
 */
function serializeError(data) {
    if (data === null || data === undefined) {
        return data;
    }
    
    if (data instanceof Error) {
        return {
            name: data.name,
            message: data.message,
            stack: data.stack,
            cause: data.cause
        };
    }
    
    if (typeof data === 'object') {
        // Handle DOM elements and other non-serializable objects
        if (data.nodeType || data instanceof Node || data instanceof Element) {
            return `[DOM Element: ${data.tagName || data.nodeName || 'Unknown'}]`;
        }
        
        // Handle functions
        if (typeof data === 'function') {
            return `[Function: ${data.name || 'anonymous'}]`;
        }
        
        // Handle arrays
        if (Array.isArray(data)) {
            try {
                return data.map(item => serializeError(item));
            } catch (e) {
                return `[Array with ${data.length} items - serialization failed]`;
            }
        }
        
        // Handle regular objects
        try {
            // Try to get meaningful properties
            const serialized = {};
            const keys = Object.getOwnPropertyNames(data).slice(0, 10); // Limit to first 10 properties
            
            for (const key of keys) {
                try {
                    const value = data[key];
                    if (typeof value === 'function') {
                        serialized[key] = '[Function]';
                    } else if (value && typeof value === 'object' && value !== data) {
                        // Avoid circular references
                        serialized[key] = Object.prototype.toString.call(value);
                    } else {
                        serialized[key] = value;
                    }
                } catch (e) {
                    serialized[key] = '[Inaccessible]';
                }
            }
            
            return Object.keys(serialized).length > 0 ? serialized : `[Object: ${Object.prototype.toString.call(data)}]`;
        } catch (e) {
            return `[Object: ${Object.prototype.toString.call(data)} - serialization failed: ${e.message}]`;
        }
    }
    
    return data;
}

/**
 * Log error message
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
export function logError(category, message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
        const serializedData = data ? serializeError(data) : '';
        console.error(formatMessage('ERROR', category, message), serializedData);
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
        const serializedData = data ? serializeError(data) : '';
        console.warn(formatMessage('WARN', category, message), serializedData);
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
        const serializedData = data ? serializeError(data) : '';
        console.log(formatMessage('INFO', category, message), serializedData);
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
        const serializedData = data ? serializeError(data) : '';
        console.log(formatMessage('DEBUG', category, message), serializedData);
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
