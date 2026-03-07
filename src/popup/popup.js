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

// Backup reminder toggle
function setupBackupToggle() {
    const backupToggle = document.getElementById('backupToggle');
    if (backupToggle) {
        backupToggle.addEventListener('click', (e) => {
            e.stopPropagation();

            const enabled = !backupToggle.classList.contains('active');
            backupToggle.classList.toggle('active', enabled);

            chrome.storage.local.set({ backupRemindersEnabled: enabled }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Failed to update backup reminder setting:', chrome.runtime.lastError.message);
                    showStatus('Failed to update backup reminders', 'error');
                    return;
                }

                chrome.runtime.sendMessage({
                    type: 'TOGGLE_BACKUP_REMINDERS',
                    enabled
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('Failed to notify background for backup reminders:', chrome.runtime.lastError.message);
                    }
                });

                showStatus(
                    enabled ? 'Backup reminders enabled' : 'Backup reminders disabled',
                    'success'
                );
            });
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

        chrome.storage.local.get(['backupRemindersEnabled'], (result) => {
            const backupToggle = document.getElementById('backupToggle');
            setToggleState(backupToggle, result.backupRemindersEnabled !== false);
        });

        loadWatchedHistoryStats();
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
                    const request = indexedDB.open('YouTubeCommanderDB', 1);
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
    setupBackupToggle();
    setupAutoSave();
    setupFeatureHeaders();

    document.getElementById('exportHistory').addEventListener('click', exportHistory);
    document.getElementById('importHistory').addEventListener('click', importHistory);
    document.getElementById('historyFileInput').addEventListener('change', handleFileImport);

    setInterval(loadWatchedHistoryStats, 5000);
});

// Make functions globally available
window.toggleFeature = toggleFeature;

