export function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}

export function storageSet(values) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                reject(
                    new Error(
                        chrome.runtime.lastError.message ||
                            'Failed to save subscription manager data'
                    )
                );
                return;
            }
            resolve();
        });
    });
}
