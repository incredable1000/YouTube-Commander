/**
 * Session-storage helpers for Shorts counter state.
 */

/**
 * Ensure loaded storage data is valid.
 * @param {object|null} rawData
 * @returns {{countedVideos: Set<string>, counter: number}}
 */
function hydrateCounterData(rawData) {
    const safeData = rawData && typeof rawData === 'object' ? rawData : {};
    const storedIds = Array.isArray(safeData.countedVideos)
        ? safeData.countedVideos.filter((id) => typeof id === 'string' && id.length > 0)
        : [];

    const countedVideos = new Set(storedIds);
    const parsedCounter = Number.isFinite(safeData.counter) && safeData.counter >= 0
        ? Math.floor(safeData.counter)
        : countedVideos.size;
    const counter = Math.max(parsedCounter, countedVideos.size);

    return {
        countedVideos,
        counter
    };
}

/**
 * Load counter state from session storage.
 * @param {string} storageKey
 * @returns {{countedVideos: Set<string>, counter: number}}
 */
function loadCounterState(storageKey) {
    const raw = window.sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return hydrateCounterData(parsed);
}

/**
 * Persist counter state into session storage.
 * @param {string} storageKey
 * @param {{countedVideos: Set<string>, counter: number}} state
 */
function saveCounterState(storageKey, state) {
    const payload = {
        countedVideos: Array.from(state.countedVideos || []),
        counter: Number.isFinite(state.counter) ? Math.max(0, Math.floor(state.counter)) : 0
    };

    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
}

export {
    hydrateCounterData,
    loadCounterState,
    saveCounterState
};
