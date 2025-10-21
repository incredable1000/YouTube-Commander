// Modern YouTube Commander Popup Script
// Default settings with feature toggles
const defaultSettings = {
    // Feature toggles
    seekEnabled: true,
    qualityEnabled: true,
    audioEnabled: true,
    historyEnabled: true,
    scrollEnabled: true,
    shortsEnabled: true,
    rotationEnabled: true,
    playlistEnabled: true,
    backupEnabled: true,
    
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

// Backup toggle (only remaining toggle)
function setupBackupToggle() {
    const backupToggle = document.getElementById('backupToggle');
    if (backupToggle) {
        backupToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (backupToggle.classList.contains('active')) {
                backupToggle.classList.remove('active');
                chrome.storage.local.set({ backupRemindersEnabled: false });
                showStatus('Backup reminders disabled', 'success');
            } else {
                backupToggle.classList.add('active');
                chrome.storage.local.set({ backupRemindersEnabled: true });
                showStatus('Backup reminders enabled', 'success');
            }
        });
    }
}

// Format shortcut for display
function formatShortcut(shortcut) {
    if (!shortcut) return '';
    const parts = [];
    
    // Add modifiers in standard order
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    
    // Format the main key
    if (shortcut.key === 'ArrowRight') {
        parts.push('→');
    } else if (shortcut.key === 'ArrowLeft') {
        parts.push('←');
    } else if (shortcut.key === 'ArrowUp') {
        parts.push('↑');
    } else if (shortcut.key === 'ArrowDown') {
        parts.push('↓');
    } else if (shortcut.key === ' ') {
        parts.push('Space');
    } else {
        parts.push(shortcut.key);
    }
    
    return parts.join(' + ');
}

// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (settings) => {
        currentSettings = settings;
        
        // Load basic settings
        document.getElementById('shortSeek').value = settings.shortSeek;
        document.getElementById('mediumSeek').value = settings.mediumSeek;
        document.getElementById('longSeek').value = settings.longSeek;
        document.getElementById('maxQuality').value = settings.maxQuality;
        
        // Fixed shortcuts are now hardcoded in defaultSettings
        
        // Load backup toggle (uses different storage)
        chrome.storage.local.get(['backupRemindersEnabled'], (result) => {
            const backupToggle = document.getElementById('backupToggle');
            if (backupToggle) {
                if (result.backupRemindersEnabled !== false) {
                    backupToggle.classList.add('active');
                } else {
                    backupToggle.classList.remove('active');
                }
            }
        });
        
        // Load watched history stats
        loadWatchedHistoryStats();
    });
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

// Save settings (auto-save)
function saveSettings(showMessage = false) {
    const settings = {
        ...currentSettings,
        shortSeek: parseInt(document.getElementById('shortSeek').value),
        mediumSeek: parseInt(document.getElementById('mediumSeek').value),
        longSeek: parseInt(document.getElementById('longSeek').value),
        maxQuality: document.getElementById('maxQuality').value
    };
    
    // Use fixed shortcuts from defaultSettings
    settings.shortSeekKey = defaultSettings.shortSeekKey;
    settings.mediumSeekKey = defaultSettings.mediumSeekKey;
    settings.longSeekKey = defaultSettings.longSeekKey;
    
    chrome.storage.sync.set(settings, () => {
        if (showMessage) {
            showStatus('Settings saved!', 'success');
        }
        
        // Notify content scripts of settings change
        chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { 
                    type: 'SETTINGS_UPDATED', 
                    settings: settings 
                }).catch(() => {
                    // Ignore errors for tabs that don't have content scripts
                });
            });
        });
    });
}

// Auto-save when input values change
function setupAutoSave() {
    // Auto-save for number inputs
    ['shortSeek', 'mediumSeek', 'longSeek'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                saveSettings();
            });
        }
    });
    
    // Auto-save for quality select
    const qualitySelect = document.getElementById('maxQuality');
    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            saveSettings();
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
                console.log(`⚡ Processing batch ${Math.floor(currentIndex/batchSize) + 1} with ${batch.length} IDs via content script`);
                
                try {
                    // Try content script first
                    const response = await chrome.tabs.sendMessage(activeTab.id, {
                        type: 'IMPORT_WATCHED_VIDEOS',
                        videoIds: batch
                    });
                    
                    if (response && response.success) {
                        batchImported = response.count || 0;
                        console.log(`⚡ Batch ${Math.floor(currentIndex/batchSize) + 1} imported ${batchImported} videos via content script`);
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
                    console.log(`⚡ Batch ${Math.floor(currentIndex/batchSize) + 1} imported ${batchImported} videos via background script`);
                }
                    console.log(`⚡ Batch ${Math.floor(currentIndex/batchSize) + 1} imported ${batchImported} videos`);
                
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
    // Use event delegation for feature headers
    document.addEventListener('click', (e) => {
        console.log('Click detected on:', e.target); // Debug log
        
        // Check if it's a toggle switch
        const toggleSwitch = e.target.closest('.toggle-switch');
        if (toggleSwitch) {
            console.log('Toggle switch clicked:', toggleSwitch.id); // Debug log
            return; // Let the toggle switch handler deal with it
        }
        
        // Check if it's a feature header
        const header = e.target.closest('.feature-header');
        if (header && header.dataset.feature) {
            const featureName = header.dataset.feature;
            console.log(`Feature header clicked: ${featureName}`); // Debug log
            toggleFeature(featureName);
        }
    });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing popup...'); // Debug log
    
    loadSettings();
    
    // Add a small delay to ensure DOM is fully ready
    setTimeout(() => {
        console.log('Setting up backup toggle...'); // Debug log
        setupBackupToggle();
        setupAutoSave();
        setupFeatureHeaders();
    }, 100);
    
    // Event listeners
    document.getElementById('exportHistory').addEventListener('click', exportHistory);
    document.getElementById('importHistory').addEventListener('click', importHistory);
    document.getElementById('historyFileInput').addEventListener('change', handleFileImport);
    
    
    // Auto-refresh stats every 5 seconds
    setInterval(loadWatchedHistoryStats, 5000);
});

// Test function to manually check toggles
window.testToggles = function() {
    console.log('=== TOGGLE TEST ===');
    const toggles = ['seekToggle', 'qualityToggle', 'audioToggle', 'historyToggle'];
    
    toggles.forEach(toggleId => {
        const toggle = document.getElementById(toggleId);
        console.log(`${toggleId}:`, toggle);
        if (toggle) {
            console.log(`  - Classes: ${toggle.className}`);
            console.log(`  - Active: ${toggle.classList.contains('active')}`);
            console.log(`  - Event listeners: ${toggle.onclick ? 'onclick' : 'addEventListener'}`);
        }
    });
    console.log('=== END TEST ===');
};

// Make functions globally available
window.toggleFeature = toggleFeature;
