import { normalizeShortcutKey } from '../shared/shortcutKey.js';
import { normalizeQualityId } from '../shared/quality.js';

// Modern YouTube Commander Popup Script
const defaultSettings = {
    // Popup-managed settings
    deleteVideosEnabled: false,
    autoSwitchToOriginal: true,
    rotationShortcut: 'r',
    windowedFullscreenShortcut: 'Enter',
    windowedFullscreenAuto: false,
    
    // Seek settings
    shortSeek: 3,
    mediumSeek: 10,
    longSeek: 30,
    shortSeekKey: { ctrl: false, shift: false, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' },
    
    // Quality settings
    maxQuality: 'hd1080',
    
    // Legacy settings
    fullWindowShortcut: 'f'
};

const LEGACY_FEATURE_KEYS = [
    'seekEnabled',
    'qualityEnabled',
    'audioEnabled',
    'historyEnabled',
    'scrollEnabled',
    'shortsEnabled',
    'shortsUploadAgeEnabled',
    'rotationEnabled',
    'windowedFullscreenEnabled',
    'playlistEnabled'
];

// Current settings
let currentSettings = {};
let cloudflareNextSyncAt = 0;
let cloudflareAutoEnabled = true;
const CLOUDFLARE_STORAGE_KEYS = {
    ENDPOINT: 'cloudflareSyncEndpoint',
    API_TOKEN: 'cloudflareSyncApiToken',
    AUTO_ENABLED: 'cloudflareSyncAutoEnabled',
    INTERVAL_MINUTES: 'cloudflareSyncIntervalMinutes'
};

// Feature toggle functionality (expand/collapse cards)
function toggleFeature(featureName) {
    const content = document.getElementById(`${featureName}Content`);
    const header = content.previousElementSibling; // Get the header element
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        header.classList.remove('expanded');
    } else {
        content.classList.add('expanded');
        header.classList.add('expanded');
    }
}

// Setup delete videos toggle
function setupDeleteVideosToggle() {
    const deleteVideosToggle = document.getElementById('deleteVideosToggle');
    if (deleteVideosToggle) {
        deleteVideosToggle.addEventListener('click', (e) => {
            e.stopPropagation();

            const enabled = !deleteVideosToggle.classList.contains('active');
            setToggleState(deleteVideosToggle, enabled);
            currentSettings.deleteVideosEnabled = enabled;
            showStatus(
                enabled ? 'Delete videos enabled - removing watched cards' : 'Delete videos disabled - showing markers',
                'success'
            );
            saveSyncSettings();
        });
    }
}

/**
 * Setup audio behavior toggle.
 */
function setupAudioSettingToggle() {
    const toggle = document.getElementById('autoSwitchToOriginalToggle');
    if (!toggle) {
        return;
    }

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();

        const enabled = !toggle.classList.contains('active');
        setToggleState(toggle, enabled);
        currentSettings.autoSwitchToOriginal = enabled;
        saveSyncSettings();
        showStatus(
            enabled ? 'Auto switch to original audio enabled' : 'Auto switch to original audio disabled',
            'success'
        );
    });
}

/**
 * Setup windowed fullscreen auto-mode toggle.
 */
function setupWindowedAutoToggle() {
    const toggle = document.getElementById('windowedFullscreenAutoToggle');
    if (!toggle) {
        return;
    }

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();

        const enabled = !toggle.classList.contains('active');
        setToggleState(toggle, enabled);
        currentSettings.windowedFullscreenAuto = enabled;
        saveSyncSettings();
        showStatus(
            enabled ? 'Auto windowed mode enabled' : 'Auto windowed mode disabled',
            'success'
        );
    });
}

/**
 * Update toggle visual state.
 * @param {HTMLElement|null} toggle
 * @param {boolean} enabled
 */
function setToggleState(toggle, enabled) {
    if (!toggle) {
        return;
    }
    toggle.classList.toggle('active', Boolean(enabled));
}

/**
 * Parse a numeric input safely.
 * @param {string} id
 * @param {number} fallback
 * @returns {number}
 */
function parseNumberInput(id, fallback) {
    const input = document.getElementById(id);
    const parsed = Number.parseInt(input?.value || '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parse shortcut input from popup text field.
 * @param {string} id
 * @param {string} fallback
 * @returns {string}
 */
function parseShortcutInput(id, fallback) {
    const input = document.getElementById(id);
    const rawValue = typeof input?.value === 'string' ? input.value.trim() : '';
    return normalizeShortcutKey(rawValue, fallback);
}

// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (settings) => {
        currentSettings = sanitizeSettings(settings);

        document.getElementById('shortSeek').value = currentSettings.shortSeek;
        document.getElementById('mediumSeek').value = currentSettings.mediumSeek;
        document.getElementById('longSeek').value = currentSettings.longSeek;
        document.getElementById('maxQuality').value = normalizeQualityId(
            currentSettings.maxQuality,
            defaultSettings.maxQuality
        );
        document.getElementById('rotationShortcut').value = currentSettings.rotationShortcut || defaultSettings.rotationShortcut;
        document.getElementById('windowedFullscreenShortcut').value = currentSettings.windowedFullscreenShortcut || defaultSettings.windowedFullscreenShortcut;

        setToggleState(document.getElementById('deleteVideosToggle'), currentSettings.deleteVideosEnabled === true);
        setToggleState(
            document.getElementById('autoSwitchToOriginalToggle'),
            currentSettings.autoSwitchToOriginal !== false
        );
        setToggleState(
            document.getElementById('windowedFullscreenAutoToggle'),
            currentSettings.windowedFullscreenAuto === true
        );

        loadWatchedHistoryStats();
        loadCloudflareSyncSettings().catch((error) => {
            showStatus(error?.message || 'Failed to load Cloudflare sync settings', 'error');
        });
        cleanupLegacyFeatureFlags();
    });
}

/**
 * Remove deprecated feature-flag settings from storage.
 */
function cleanupLegacyFeatureFlags() {
    chrome.storage.sync.remove(LEGACY_FEATURE_KEYS, () => {
        if (chrome.runtime.lastError) {
            console.warn('Failed to cleanup legacy feature keys:', chrome.runtime.lastError.message);
        }
    });
}

/**
 * Drop legacy keys from settings object.
 * @param {object} settings
 * @returns {object}
 */
function sanitizeSettings(settings) {
    const sanitized = { ...settings };
    LEGACY_FEATURE_KEYS.forEach((key) => {
        delete sanitized[key];
    });
    sanitized.maxQuality = normalizeQualityId(
        sanitized.maxQuality,
        defaultSettings.maxQuality
    );
    return sanitized;
}

// Load watched history statistics (using content script approach)
async function loadWatchedHistoryStats() {
    try {
        // Get the active tab specifically
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.url.includes('youtube.com')) {
            // Try to find any YouTube tab as fallback
            const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
            if (tabs.length === 0) {
                document.getElementById('watchedCount').textContent = '0';
                document.getElementById('todayCount').textContent = '0';
                return;
            }
            // Use first YouTube tab found
            const targetTab = tabs[0];
            
            try {
                // Try content script message first
                const response = await chrome.tabs.sendMessage(targetTab.id, {
                    type: 'GET_WATCHED_STATS'
                });
                
                if (response && response.success) {
                    document.getElementById('watchedCount').textContent = response.total || 0;
                    document.getElementById('todayCount').textContent = response.today || 0;
                    return;
                }
            } catch (messageError) {
                console.warn('Stats via content script failed:', messageError);
            }
            
            // Fallback to background script
            try {
                const bgResponse = await chrome.runtime.sendMessage({
                    type: 'GET_WATCHED_STATS',
                    tabId: targetTab.id
                });
                
                if (bgResponse && bgResponse.success) {
                    document.getElementById('watchedCount').textContent = bgResponse.total || 0;
                    document.getElementById('todayCount').textContent = bgResponse.today || 0;
                    return;
                }
            } catch (bgError) {
                console.warn('Stats via background script failed:', bgError);
            }
        } else {
            // We're on a YouTube tab, try content script directly
            try {
                const response = await chrome.tabs.sendMessage(activeTab.id, {
                    type: 'GET_WATCHED_STATS'
                });
                
                if (response && response.success) {
                    document.getElementById('watchedCount').textContent = response.total || 0;
                    document.getElementById('todayCount').textContent = response.today || 0;
                    return;
                }
            } catch (messageError) {
                console.warn('Stats via content script failed:', messageError);
                
                // Fallback to background script
                try {
                    const bgResponse = await chrome.runtime.sendMessage({
                        type: 'GET_WATCHED_STATS',
                        tabId: activeTab.id
                    });
                    
                    if (bgResponse && bgResponse.success) {
                        document.getElementById('watchedCount').textContent = bgResponse.total || 0;
                        document.getElementById('todayCount').textContent = bgResponse.today || 0;
                        return;
                    }
                } catch (bgError) {
                    console.warn('Stats via background script failed:', bgError);
                }
            }
        }
        
        // If all methods fail, show 0
        document.getElementById('watchedCount').textContent = '0';
        document.getElementById('todayCount').textContent = '0';
        
    } catch (error) {
        console.error('Stats loading error:', error);
        document.getElementById('watchedCount').textContent = '0';
        document.getElementById('todayCount').textContent = '0';
    }
}

// Save sync settings and notify all YouTube tabs.
function saveSyncSettings(showMessage = false) {
    const settings = sanitizeSettings({
        ...currentSettings,
        shortSeek: parseNumberInput('shortSeek', defaultSettings.shortSeek),
        mediumSeek: parseNumberInput('mediumSeek', defaultSettings.mediumSeek),
        longSeek: parseNumberInput('longSeek', defaultSettings.longSeek),
        maxQuality: document.getElementById('maxQuality')?.value || defaultSettings.maxQuality,
        rotationShortcut: parseShortcutInput('rotationShortcut', defaultSettings.rotationShortcut),
        windowedFullscreenShortcut: parseShortcutInput('windowedFullscreenShortcut', defaultSettings.windowedFullscreenShortcut),
        windowedFullscreenAuto: currentSettings.windowedFullscreenAuto === true,
        shortSeekKey: defaultSettings.shortSeekKey,
        mediumSeekKey: defaultSettings.mediumSeekKey,
        longSeekKey: defaultSettings.longSeekKey
    });

    currentSettings = settings;
    broadcastSettings(settings);

    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            showStatus('Failed to save settings', 'error');
            return;
        }
        if (showMessage) {
            showStatus('Settings saved', 'success');
        }
    });
}

/**
 * Broadcast fresh settings to all YouTube tabs.
 * @param {object} settings
 */
function broadcastSettings(settings) {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings
            }, () => {
                // Ignore tabs without active content scripts.
                if (chrome.runtime.lastError) {
                    return;
                }
            });
        });
    });
}

// Auto-save when input values change
function setupAutoSave() {
    // Auto-save for number inputs
    ['shortSeek', 'mediumSeek', 'longSeek', 'rotationShortcut', 'windowedFullscreenShortcut'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                saveSyncSettings();
            });
            input.addEventListener('change', () => {
                saveSyncSettings();
            });
        }
    });
    
    // Auto-save for quality select
    const qualitySelect = document.getElementById('maxQuality');
    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            saveSyncSettings();
        });
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    setTimeout(() => {
        status.className = 'status';
    }, 3000);
}

/**
 * Format account key for compact popup display.
 * @param {string} accountKey
 * @returns {string}
 */
function formatAccountKey(accountKey) {
    const value = typeof accountKey === 'string' ? accountKey.trim() : '';
    if (!value || value === 'default') {
        return 'Not locked';
    }
    if (value.length <= 22) {
        return value;
    }
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

/**
 * Format remaining milliseconds to mm:ss.
 * @param {number} remainingMs
 * @returns {string}
 */
function formatRemainingMinSec(remainingMs) {
    const safeMs = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Render live "Next Sync In" countdown.
 */
function renderNextSyncCountdown() {
    const nextSyncEl = document.getElementById('cloudflareNextSyncIn');
    if (!nextSyncEl) {
        return;
    }

    if (!cloudflareAutoEnabled) {
        nextSyncEl.textContent = 'Off';
        return;
    }

    if (!Number.isFinite(cloudflareNextSyncAt) || cloudflareNextSyncAt <= 0) {
        nextSyncEl.textContent = '--:--';
        return;
    }

    const remainingMs = cloudflareNextSyncAt - Date.now();
    nextSyncEl.textContent = formatRemainingMinSec(remainingMs);
}

/**
 * Send runtime message with timeout and callback error handling.
 * @param {object} message
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function sendRuntimeMessage(message, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            reject(new Error('Background did not respond in time'));
        }, timeoutMs);

        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeoutId);

                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'Failed to contact background'));
                    return;
                }

                resolve(response);
            });
        } catch (error) {
            if (!settled) {
                settled = true;
                clearTimeout(timeoutId);
                reject(error);
            }
        }
    });
}

/**
 * Load Cloudflare sync settings from local storage.
 */
async function loadCloudflareSyncSettings() {
    const result = await chrome.storage.local.get([
        CLOUDFLARE_STORAGE_KEYS.ENDPOINT,
        CLOUDFLARE_STORAGE_KEYS.API_TOKEN,
        CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED,
        CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES
    ]);

    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');

    if (endpointInput) {
        endpointInput.value = typeof result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT]
            : '';
    }

    if (tokenInput) {
        tokenInput.value = typeof result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN] === 'string'
            ? result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN]
            : '';
    }

    if (intervalSelect) {
        const interval = Number.parseInt(result[CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES], 10);
        intervalSelect.value = Number.isFinite(interval) ? String(interval) : '30';
    }

    setToggleState(autoToggle, result[CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED] !== false);

    await refreshCloudflareSyncStatus();
}

/**
 * Persist Cloudflare sync settings from inputs.
 * @returns {Promise<{ endpointUrl: string, apiToken: string, autoEnabled: boolean, intervalMinutes: number }>}
 */
async function saveCloudflareSyncSettings() {
    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');

    const endpointUrl = typeof endpointInput?.value === 'string' ? endpointInput.value.trim() : '';
    const apiToken = typeof tokenInput?.value === 'string' ? tokenInput.value.trim() : '';
    const autoEnabled = !autoToggle || autoToggle.classList.contains('active');
    const intervalValue = Number.parseInt(intervalSelect?.value || '30', 10);
    const intervalMinutes = Number.isFinite(intervalValue) ? intervalValue : 30;

    await chrome.storage.local.set({
        [CLOUDFLARE_STORAGE_KEYS.ENDPOINT]: endpointUrl,
        [CLOUDFLARE_STORAGE_KEYS.API_TOKEN]: apiToken,
        [CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED]: autoEnabled,
        [CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES]: intervalMinutes
    });

    const updateResponse = await sendRuntimeMessage({
        type: 'UPDATE_CLOUDFLARE_SYNC_CONFIG',
        endpointUrl,
        apiToken,
        autoEnabled,
        intervalMinutes
    }, 20000);

    if (!updateResponse?.success) {
        throw new Error(updateResponse?.error || 'Failed to update Cloudflare sync config');
    }

    return { endpointUrl, apiToken, autoEnabled, intervalMinutes };
}

/**
 * Render cloud sync status in popup.
 * @param {object} status
 */
function renderCloudflareSyncStatus(status = {}) {
    const pendingEl = document.getElementById('cloudflarePendingCount');
    const lastSyncEl = document.getElementById('cloudflareLastSyncAt');
    const infoEl = document.getElementById('cloudflareLastSyncInfo');
    const primaryAccountEl = document.getElementById('cloudflarePrimaryAccount');
    cloudflareAutoEnabled = status.autoEnabled !== false;
    cloudflareNextSyncAt = Number(status.nextSyncAt) || 0;

    if (pendingEl) {
        pendingEl.textContent = String(Number(status.pendingCount) || 0);
    }

    if (primaryAccountEl) {
        primaryAccountEl.textContent = formatAccountKey(status.primaryAccountKey);
    }

    if (lastSyncEl) {
        const timestamp = Number(status.lastAt) || 0;
        lastSyncEl.textContent = timestamp > 0
            ? new Date(timestamp).toLocaleString()
            : 'Never';
    }

    if (infoEl) {
        if (status.status === 'error') {
            infoEl.textContent = status.error || 'Error';
            return;
        }

        if (status.status === 'success') {
            infoEl.textContent = `Success (${Number(status.syncedCount) || 0} ids)`;
            return;
        }

        infoEl.textContent = status.status || 'Idle';
    }

    renderNextSyncCountdown();
}

/**
 * Refresh cloud sync status from background.
 */
async function refreshCloudflareSyncStatus() {
    try {
        const status = await sendRuntimeMessage({
            type: 'GET_CLOUDFLARE_SYNC_STATUS'
        }, 30000);

        if (status?.success) {
            renderCloudflareSyncStatus(status);
        }
    } catch (_error) {
        // Keep existing UI values when background status is unavailable.
    }
}

/**
 * Setup Cloudflare auto-sync controls.
 */
function setupCloudflareSyncControls() {
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');
    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');

    if (autoToggle) {
        autoToggle.addEventListener('click', async (event) => {
            event.stopPropagation();
            setToggleState(autoToggle, !autoToggle.classList.contains('active'));
            try {
                await saveCloudflareSyncSettings();
                await refreshCloudflareSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to save Cloudflare settings', 'error');
            }
        });
    }

    if (intervalSelect) {
        intervalSelect.addEventListener('change', async () => {
            try {
                await saveCloudflareSyncSettings();
                await refreshCloudflareSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to update sync interval', 'error');
            }
        });
    }

    const saveOnBlur = async () => {
        try {
            await saveCloudflareSyncSettings();
            await refreshCloudflareSyncStatus();
        } catch (error) {
            showStatus(error?.message || 'Failed to update Cloudflare settings', 'error');
        }
    };

    endpointInput?.addEventListener('blur', saveOnBlur);
    tokenInput?.addEventListener('blur', saveOnBlur);
}


// Export history functionality (using legacy direct approach)
async function exportHistory() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url.includes('youtube.com')) {
            showStatus('Please open YouTube to export history', 'error');
            return;
        }

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open('YouTubeCommanderDB');
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result;
                        const transaction = db.transaction(['watchedVideos'], 'readonly');
                        const store = transaction.objectStore('watchedVideos');
                        const getAll = store.getAll();
                        getAll.onsuccess = () => {
                            const videos = getAll.result;
                            // Create simple TXT content with just video IDs (legacy format)
                            const content = videos.map(v => v.videoId).join('\n');
                            
                            const blob = new Blob([content], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `youtube-watched-history.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            resolve(videos.length);
                        };
                        getAll.onerror = () => reject(getAll.error);
                    };
                });
            }
        });
        
        showStatus(`Exported ${result[0].result} videos`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showStatus('Error exporting history', 'error');
    }
}

/**
 * Sync watched history to Cloudflare worker endpoint.
 */
async function syncToCloudflare() {
    const syncButton = document.getElementById('syncToCloudflare');
    if (!syncButton) {
        return;
    }

    const initialLabel = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.textContent = 'Syncing...';

    try {
        showStatus('Syncing watched history to Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        if (!endpointUrl) {
            throw new Error('Cloudflare Worker URL is required');
        }

        showStatus('Uploading pending unsynced IDs to Cloudflare...', 'info');
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'SYNC_TO_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 90000);

        if (!response?.success) {
            throw new Error(response?.error || 'Cloudflare sync failed');
        }

        const syncedCount = Number.isFinite(response.syncedCount) ? response.syncedCount : 0;
        const host = typeof response.endpointHost === 'string' && response.endpointHost
            ? response.endpointHost
            : 'Cloudflare';
        showStatus(
            `Synced ${syncedCount} IDs to ${host}. Pending: ${Number(response.pendingCount) || 0}`,
            'success'
        );
        await refreshCloudflareSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to sync watched history', 'error');
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = initialLabel;
    }
}

/**
 * Lock cloud sync to currently active YouTube account context.
 */
async function lockPrimarySyncAccount() {
    const button = document.getElementById('lockPrimarySyncAccount');
    if (!button) {
        return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
    if (!activeTab?.id) {
        showStatus('Open a YouTube tab first to lock account', 'error');
        return;
    }

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Locking...';

    try {
        const response = await sendRuntimeMessage({
            type: 'LOCK_PRIMARY_SYNC_ACCOUNT',
            tabId: activeTab.id
        }, 30000);

        if (!response?.success) {
            throw new Error(response?.error || 'Failed to lock sync account');
        }

        renderCloudflareSyncStatus(response);
        showStatus('Sync account locked to current YouTube tab', 'success');
    } catch (error) {
        showStatus(error?.message || 'Failed to lock sync account', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

/**
 * Download IDs from Cloudflare and import to local IndexedDB.
 */
async function downloadFromCloudflare() {
    const button = document.getElementById('downloadFromCloudflare');
    if (!button) {
        return;
    }

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Downloading...';

    try {
        showStatus('Downloading IDs from Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        if (!endpointUrl) {
            throw new Error('Cloudflare Worker URL is required');
        }

        const response = await sendRuntimeMessage({
            type: 'DOWNLOAD_FROM_CLOUDFLARE',
            endpointUrl,
            apiToken
        }, 240000);

        if (!response?.success) {
            throw new Error(response?.error || 'Cloudflare download failed');
        }

        showStatus(
            `Downloaded ${Number(response.pulledCount) || 0} IDs, imported ${Number(response.importedCount) || 0} new IDs`,
            'success'
        );
        await refreshCloudflareSyncStatus();
        await loadWatchedHistoryStats();
    } catch (error) {
        showStatus(error?.message || 'Failed to download from Cloudflare', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

// Import history functionality
function importHistory() {
    const fileInput = document.getElementById('historyFileInput');
    fileInput.click();
}

async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
        
        // Parse video IDs based on file type
        let videoIds = [];
        const fileName = file.name.toLowerCase();
        
        console.log('Import file:', fileName, 'Content length:', content.length);
        console.log('First 200 chars:', content.substring(0, 200));
        
        if (fileName.endsWith('.csv')) {
            // Parse CSV format
            const lines = content.split('\n').filter(line => line.trim());
            // Skip header if present
            const dataLines = lines[0].includes('Video ID') ? lines.slice(1) : lines;
            
            videoIds = dataLines.map(line => {
                // Extract video ID from first column (handle quoted values)
                const match = line.match(/^"?([^",]+)"?/);
                return match ? match[1].trim() : null;
            }).filter(id => id && id.length === 11); // YouTube video IDs are 11 characters
            
        } else {
            // Parse TXT format (legacy - one video ID per line)
            videoIds = content.split('\n')
                .map(line => line.trim())
                .filter(id => id && id.length >= 10 && id.length <= 12); // Be more flexible with ID length
        }
        
        console.log('Parsed video IDs:', videoIds.length, videoIds.slice(0, 5));
        
        if (videoIds.length === 0) {
            showStatus('No valid video IDs found in file', 'error');
            console.log('No video IDs found. File content:', content);
            return;
        }
        
        // Get the active tab specifically for better permission handling
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.url.includes('youtube.com')) {
            showStatus('Please make sure you are on a YouTube page and try again', 'error');
            return;
        }
        
        // For large imports, process in smaller batches to avoid memory issues
        const batchSize = 5000; // Process 5k at a time to avoid memory issues
        let totalImported = 0;
        let currentIndex = 0;
        
        showStatus(`Processing ${videoIds.length} video IDs in batches...`, 'info');
        
        while (currentIndex < videoIds.length) {
            const batch = videoIds.slice(currentIndex, currentIndex + batchSize);
            const progress = Math.round((currentIndex / videoIds.length) * 100);
            
            showStatus(`Processing batch ${Math.floor(currentIndex/batchSize) + 1}... (${progress}%)`, 'info');
            
            try {
                let batchImported = 0;
                
                // Use content script message approach since script injection is blocked
                console.log(`[Import] Processing batch ${Math.floor(currentIndex / batchSize) + 1} with ${batch.length} IDs via content script`);
                
                try {
                    // Try content script first
                    const response = await chrome.tabs.sendMessage(activeTab.id, {
                        type: 'IMPORT_WATCHED_VIDEOS',
                        videoIds: batch
                    });
                    
                    if (response && response.success) {
                        batchImported = response.count || 0;
                        console.log(`[Import] Batch ${Math.floor(currentIndex / batchSize) + 1} imported ${batchImported} videos via content script`);
                    } else {
                        throw new Error(response?.error || 'Content script import failed');
                    }
                } catch (messageError) {
                    console.warn('Content script import failed, trying storage fallback:', messageError);
                    
                    // Fallback: Store in chrome.storage and let background script handle it
                    const storageKey = `import_batch_${Date.now()}_${Math.random()}`;
                    await chrome.storage.local.set({
                        [storageKey]: {
                            videoIds: batch,
                            timestamp: Date.now()
                        }
                    });
                    
                    // Notify background script to process the batch
                    const bgResponse = await chrome.runtime.sendMessage({
                        type: 'PROCESS_IMPORT_BATCH',
                        storageKey: storageKey,
                        tabId: activeTab.id
                    });
                    
                    batchImported = bgResponse?.count || 0;
                    console.log(`[Import] Batch ${Math.floor(currentIndex / batchSize) + 1} imported ${batchImported} videos via background script`);
                }
                console.log(`[Import] Batch ${Math.floor(currentIndex / batchSize) + 1} imported ${batchImported} videos`);
                
                totalImported += batchImported;
                currentIndex += batchSize;
                
                // Small delay between batches to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error('Error processing batch:', error);
                showStatus(`Error processing batch at ${currentIndex}. Continuing...`, 'warning');
                currentIndex += batchSize; // Skip this batch and continue
            }
        }
        
        showStatus(`Successfully imported ${totalImported} videos!`, 'success');
        loadWatchedHistoryStats(); // Refresh stats
        
    } catch (error) {
        console.error('Import error:', error);
        showStatus('Error importing file', 'error');
    }
}


// Setup feature header click handlers
function setupFeatureHeaders() {
    document.addEventListener('click', (e) => {
        const toggleSwitch = e.target.closest('.toggle-switch');
        if (toggleSwitch) {
            return;
        }

        const header = e.target.closest('.feature-header');
        if (header && header.dataset.feature) {
            const featureName = header.dataset.feature;
            toggleFeature(featureName);
        }
    });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    setupAudioSettingToggle();
    setupWindowedAutoToggle();
    setupDeleteVideosToggle();
    setupCloudflareSyncControls();
    setupAutoSave();
    setupFeatureHeaders();

    document.getElementById('exportHistory').addEventListener('click', exportHistory);
    document.getElementById('importHistory').addEventListener('click', importHistory);
    document.getElementById('syncToCloudflare').addEventListener('click', syncToCloudflare);
    document.getElementById('downloadFromCloudflare').addEventListener('click', downloadFromCloudflare);
    document.getElementById('lockPrimarySyncAccount').addEventListener('click', lockPrimarySyncAccount);
    document.getElementById('historyFileInput').addEventListener('change', handleFileImport);

    setInterval(loadWatchedHistoryStats, 5000);
    setInterval(refreshCloudflareSyncStatus, 30000);
    setInterval(renderNextSyncCountdown, 1000);
});

// Make functions globally available
window.toggleFeature = toggleFeature;

