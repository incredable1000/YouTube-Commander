/**
 * Watched History state management.
 */

let _watchedIds = new Set();
let _isEnabled = true;
let _deleteVideosEnabled = false;
let _initialized = false;
let _initializingPromise = null;
let _pendingContainers = new Set();
let _fullScanRequested = false;
let _flushAgain = false;
let _lastUrl = location.href;
let _renderTimer = null;
let _playbackTimer = null;
let _cacheRefreshTimer = null;
let _mutationObserver = null;
let _runtimeMessageListener = null;
let _storageListener = null;
const _teardownCallbacks = [];
const _playbackBindings = new Map();

export function getWatchedIds() {
    return _watchedIds;
}

export function setWatchedIds(ids) {
    _watchedIds = ids;
}

export function addWatchedId(videoId) {
    _watchedIds.add(videoId);
}

export function clearWatchedIds() {
    _watchedIds.clear();
}

export function isEnabled() {
    return _isEnabled;
}

export function setEnabled(enabled) {
    _isEnabled = enabled;
}

export function isDeleteVideosEnabled() {
    return _deleteVideosEnabled;
}

export function setDeleteVideosEnabled(enabled) {
    _deleteVideosEnabled = enabled;
}

export function isInitialized() {
    return _initialized;
}

export function setInitialized(initialized) {
    _initialized = initialized;
}

export function getInitializingPromise() {
    return _initializingPromise;
}

export function setInitializingPromise(promise) {
    _initializingPromise = promise;
}

export function getPendingContainers() {
    return _pendingContainers;
}

export function clearPendingContainers() {
    _pendingContainers.clear();
}

export function addPendingContainer(container) {
    _pendingContainers.add(container);
}

export function isFullScanRequested() {
    return _fullScanRequested;
}

export function setFullScanRequested(requested) {
    _fullScanRequested = requested;
}

export function isFlushAgain() {
    return _flushAgain;
}

export function setFlushAgain(again) {
    _flushAgain = again;
}

export function getLastUrl() {
    return _lastUrl;
}

export function setLastUrl(url) {
    _lastUrl = url;
}

export function getRenderTimer() {
    return _renderTimer;
}

export function setRenderTimer(timer) {
    _renderTimer = timer;
}

export function getPlaybackTimer() {
    return _playbackTimer;
}

export function setPlaybackTimer(timer) {
    _playbackTimer = timer;
}

export function getCacheRefreshTimer() {
    return _cacheRefreshTimer;
}

export function setCacheRefreshTimer(timer) {
    _cacheRefreshTimer = timer;
}

export function getMutationObserver() {
    return _mutationObserver;
}

export function setMutationObserver(observer) {
    _mutationObserver = observer;
}

export function getRuntimeMessageListener() {
    return _runtimeMessageListener;
}

export function setRuntimeMessageListener(listener) {
    _runtimeMessageListener = listener;
}

export function getStorageListener() {
    return _storageListener;
}

export function setStorageListener(listener) {
    _storageListener = listener;
}

export function getPlaybackBindings() {
    return _playbackBindings;
}

export function getTeardownCallbacks() {
    return _teardownCallbacks;
}

export function addTeardownCallback(callback) {
    _teardownCallbacks.push(callback);
}

export function executeTeardownCallbacks() {
    while (_teardownCallbacks.length > 0) {
        const teardown = _teardownCallbacks.pop();
        try {
            teardown();
        } catch (error) {
            // Ignore
        }
    }
}
