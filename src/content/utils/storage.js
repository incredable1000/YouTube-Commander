/**
 * Storage Utilities
 * Centralized Chrome storage operations with async/await support
 */

/**
 * Check if extension context is still valid
 * @returns {boolean} True if context is valid
 */
function isExtensionContextValid() {
    try {
        return !!(chrome && chrome.storage && chrome.runtime && !chrome.runtime.lastError);
    } catch (error) {
        return false;
    }
}

/**
 * Get data from Chrome storage (sync)
 * @param {string|object} keys - Keys to retrieve
 * @param {object} defaultValues - Default values if keys don't exist
 * @returns {Promise<object>} Retrieved data
 */
export async function getStorageData(keys, defaultValues = {}) {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn('[Storage] Extension context invalidated, returning default values');
            resolve(defaultValues);
            return;
        }

        try {
            chrome.storage.sync.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn('[Storage] Chrome runtime error:', chrome.runtime.lastError.message);
                    resolve(defaultValues);
                    return;
                }
                
                // Merge with default values
                const data = { ...defaultValues, ...result };
                resolve(data);
            });
        } catch (error) {
            console.warn('[Storage] Error accessing storage:', error.message);
            resolve(defaultValues);
        }
    });
}

/**
 * Set data in Chrome storage (sync)
 * @param {object} data - Data to store
 * @returns {Promise<void>}
 */
export async function setStorageData(data) {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn('[Storage] Extension context invalidated, skipping storage write');
            resolve();
            return;
        }

        try {
            chrome.storage.sync.set(data, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Storage] Chrome runtime error:', chrome.runtime.lastError.message);
                    resolve(); // Don't reject, just log and continue
                    return;
                }
                resolve();
            });
        } catch (error) {
            console.warn('[Storage] Error writing to storage:', error.message);
            resolve(); // Don't reject, just log and continue
        }
    });
}

/**
 * Get data from Chrome storage (local)
 * @param {string|object} keys - Keys to retrieve
 * @param {object} defaultValues - Default values if keys don't exist
 * @returns {Promise<object>} Retrieved data
 */
export async function getLocalStorageData(keys, defaultValues = {}) {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn('[Storage] Extension context invalidated, returning default values');
            resolve(defaultValues);
            return;
        }

        try {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn('[Storage] Chrome runtime error:', chrome.runtime.lastError.message);
                    resolve(defaultValues);
                    return;
                }
                
                const data = { ...defaultValues, ...result };
                resolve(data);
            });
        } catch (error) {
            console.warn('[Storage] Error accessing local storage:', error.message);
            resolve(defaultValues);
        }
    });
}

/**
 * Set data in Chrome storage (local)
 * @param {object} data - Data to store
 * @returns {Promise<void>}
 */
export async function setLocalStorageData(data) {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn('[Storage] Extension context invalidated, skipping local storage write');
            resolve();
            return;
        }

        try {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Storage] Chrome runtime error:', chrome.runtime.lastError.message);
                    resolve(); // Don't reject, just log and continue
                    return;
                }
                resolve();
            });
        } catch (error) {
            console.warn('[Storage] Error writing to local storage:', error.message);
            resolve(); // Don't reject, just log and continue
        }
    });
}

/**
 * Listen for storage changes
 * @param {function} callback - Callback function to handle changes
 * @param {string} area - Storage area to listen to ('sync' or 'local')
 */
export function onStorageChanged(callback, area = 'sync') {
    if (!isExtensionContextValid()) {
        console.warn('[Storage] Extension context invalidated, skipping storage listener setup');
        return;
    }

    try {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === area) {
                callback(changes);
            }
        });
    } catch (error) {
        console.warn('[Storage] Error setting up storage listener:', error.message);
    }
}

/**
 * Remove data from Chrome storage
 * @param {string|string[]} keys - Keys to remove
 * @param {string} area - Storage area ('sync' or 'local')
 * @returns {Promise<void>}
 */
export async function removeStorageData(keys, area = 'sync') {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn('[Storage] Extension context invalidated, skipping storage removal');
            resolve();
            return;
        }

        try {
            chrome.storage[area].remove(keys, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[Storage] Chrome runtime error:', chrome.runtime.lastError.message);
                    resolve(); // Don't reject, just log and continue
                    return;
                }
                resolve();
            });
        } catch (error) {
            console.warn('[Storage] Error removing from storage:', error.message);
            resolve(); // Don't reject, just log and continue
        }
    });
}

/**
 * Clear all data from Chrome storage
 * @param {string} area - Storage area ('sync' or 'local')
 * @returns {Promise<void>}
 */
export async function clearStorageData(area = 'sync') {
    return new Promise((resolve, reject) => {
        if (!isExtensionContextValid()) {
            console.warn('[Storage] Extension context invalidated, skipping storage clear');
            resolve();
            return;
        }

        try {
            chrome.storage[area].clear(() => {
                if (chrome.runtime.lastError) {
                    console.warn('[Storage] Chrome runtime error:', chrome.runtime.lastError.message);
                    resolve(); // Don't reject, just log and continue
                    return;
                }
                resolve();
            });
        } catch (error) {
            console.warn('[Storage] Error clearing storage:', error.message);
            resolve(); // Don't reject, just log and continue
        }
    });
}
