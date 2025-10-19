/**
 * Storage Utilities
 * Centralized Chrome storage operations with async/await support
 */

/**
 * Get data from Chrome storage (sync)
 * @param {string|object} keys - Keys to retrieve
 * @param {object} defaultValues - Default values if keys don't exist
 * @returns {Promise<object>} Retrieved data
 */
export async function getStorageData(keys, defaultValues = {}) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(keys, (result) => {
            // Merge with default values
            const data = { ...defaultValues, ...result };
            resolve(data);
        });
    });
}

/**
 * Set data in Chrome storage (sync)
 * @param {object} data - Data to store
 * @returns {Promise<void>}
 */
export async function setStorageData(data) {
    return new Promise((resolve) => {
        chrome.storage.sync.set(data, () => {
            resolve();
        });
    });
}

/**
 * Get data from Chrome storage (local)
 * @param {string|object} keys - Keys to retrieve
 * @param {object} defaultValues - Default values if keys don't exist
 * @returns {Promise<object>} Retrieved data
 */
export async function getLocalStorageData(keys, defaultValues = {}) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
            const data = { ...defaultValues, ...result };
            resolve(data);
        });
    });
}

/**
 * Set data in Chrome storage (local)
 * @param {object} data - Data to store
 * @returns {Promise<void>}
 */
export async function setLocalStorageData(data) {
    return new Promise((resolve) => {
        chrome.storage.local.set(data, () => {
            resolve();
        });
    });
}

/**
 * Listen for storage changes
 * @param {function} callback - Callback function to handle changes
 * @param {string} area - Storage area to listen to ('sync' or 'local')
 */
export function onStorageChanged(callback, area = 'sync') {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === area) {
            callback(changes);
        }
    });
}

/**
 * Remove data from Chrome storage
 * @param {string|string[]} keys - Keys to remove
 * @param {string} area - Storage area ('sync' or 'local')
 * @returns {Promise<void>}
 */
export async function removeStorageData(keys, area = 'sync') {
    return new Promise((resolve) => {
        chrome.storage[area].remove(keys, () => {
            resolve();
        });
    });
}

/**
 * Clear all data from Chrome storage
 * @param {string} area - Storage area ('sync' or 'local')
 * @returns {Promise<void>}
 */
export async function clearStorageData(area = 'sync') {
    return new Promise((resolve) => {
        chrome.storage[area].clear(() => {
            resolve();
        });
    });
}
