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
    shortSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: true, shift: false, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' },
    
    // Quality settings
    maxQuality: 'hd1080',
    
    // Legacy settings
    fullWindowShortcut: 'f'
};

// Current recording state
let isRecording = false;
let currentInput = null;
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

// Toggle switch functionality
function setupToggleSwitches() {
    const toggles = {
        'seekToggle': 'seekEnabled',
        'qualityToggle': 'qualityEnabled',
        'audioToggle': 'audioEnabled',
        'historyToggle': 'historyEnabled',
        'scrollToggle': 'scrollEnabled',
        'shortsToggle': 'shortsEnabled',
        'rotationToggle': 'rotationEnabled',
        'playlistToggle': 'playlistEnabled'
    };
    
    // Handle regular toggles
    Object.entries(toggles).forEach(([toggleId, settingKey]) => {
        const toggle = document.getElementById(toggleId);
        if (toggle) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card expansion when clicking toggle
                const isActive = toggle.classList.contains('active');
                
                if (isActive) {
                    toggle.classList.remove('active');
                    currentSettings[settingKey] = false;
                } else {
                    toggle.classList.add('active');
                    currentSettings[settingKey] = true;
                }
                
                // Save immediately with all current settings
                saveSettings();
                
                // Show visual feedback
                showStatus('Feature ' + (currentSettings[settingKey] ? 'enabled' : 'disabled'), 'success');
            });
        }
    });
    
    // Handle backup toggle separately (uses local storage)
    const backupToggle = document.getElementById('backupToggle');
    if (backupToggle) {
        backupToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = backupToggle.classList.contains('active');
            
            if (isActive) {
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
        
        // Load shortcuts
        const shortcutInputs = {
            'shortSeekKey': settings.shortSeekKey,
            'mediumSeekKey': settings.mediumSeekKey,
            'longSeekKey': settings.longSeekKey
        };
        
        Object.entries(shortcutInputs).forEach(([inputId, shortcut]) => {
            const input = document.getElementById(inputId);
            if (input && shortcut) {
                input.value = formatShortcut(shortcut);
                input.dataset.shortcut = JSON.stringify(shortcut);
            }
        });
        
        // Load feature toggles
        const toggles = {
            'seekToggle': 'seekEnabled',
            'qualityToggle': 'qualityEnabled',
            'audioToggle': 'audioEnabled',
            'historyToggle': 'historyEnabled',
            'scrollToggle': 'scrollEnabled',
            'shortsToggle': 'shortsEnabled',
            'rotationToggle': 'rotationEnabled',
            'playlistToggle': 'playlistEnabled'
        };
        
        // Load backup toggle separately (uses different storage)
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
        
        Object.entries(toggles).forEach(([toggleId, settingKey]) => {
            const toggle = document.getElementById(toggleId);
            if (toggle) {
                if (settings[settingKey]) {
                    toggle.classList.add('active');
                } else {
                    toggle.classList.remove('active');
                }
            }
        });
        
        // Load watched history stats
        loadWatchedHistoryStats();
    });
}

// Load watched history statistics (using legacy direct approach)
async function loadWatchedHistoryStats() {
    try {
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        if (tabs.length === 0) {
            document.getElementById('watchedCount').textContent = '0';
            document.getElementById('todayCount').textContent = '0';
            return;
        }

        const result = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
                return new Promise((resolve) => {
                    const request = indexedDB.open('YouTubeCommanderDB', 1);
                    request.onerror = () => resolve({ total: 0, today: 0 });
                    request.onsuccess = () => {
                        const db = request.result;
                        const transaction = db.transaction(['watchedVideos'], 'readonly');
                        const store = transaction.objectStore('watchedVideos');
                        const getAll = store.getAll();
                        getAll.onsuccess = () => {
                            const videos = getAll.result;
                            const today = new Date();
                            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                            const todayVideos = videos.filter(v => v.timestamp >= todayStart);
                            resolve({ total: videos.length, today: todayVideos.length });
                        };
                        getAll.onerror = () => resolve({ total: 0, today: 0 });
                    };
                });
            }
        });
        
        const stats = result[0].result;
        document.getElementById('watchedCount').textContent = stats.total;
        document.getElementById('todayCount').textContent = stats.today;
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
    
    // Save shortcuts
    ['shortSeekKey', 'mediumSeekKey', 'longSeekKey'].forEach(key => {
        const input = document.getElementById(key);
        if (input && input.dataset.shortcut) {
            try {
                settings[key] = JSON.parse(input.dataset.shortcut);
            } catch (e) {
                console.error('Error parsing shortcut:', e);
            }
        }
    });
    
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

// Handle shortcut recording
function setupShortcutRecording() {
    const shortcutInputs = document.querySelectorAll('.shortcut-input');
    
    shortcutInputs.forEach(input => {
        input.addEventListener('click', () => {
            if (isRecording && currentInput !== input) {
                // Stop previous recording
                currentInput.classList.remove('recording');
            }
            
            isRecording = true;
            currentInput = input;
            input.classList.add('recording');
            input.value = 'Press keys...';
        });
    });
}

// Handle keyboard events for shortcut recording
function handleShortcutInput(event) {
    if (!isRecording || !currentInput) return;
    
    // Ignore modifier keys by themselves
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const shortcut = {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        key: event.key
    };
    
    // Validate that we have a proper key combination
    if (!shortcut.key || shortcut.key.length === 0) {
        return;
    }
    
    currentInput.value = formatShortcut(shortcut);
    currentInput.dataset.shortcut = JSON.stringify(shortcut);
    currentInput.classList.remove('recording');
    
    // Auto-save the shortcut
    saveSettings();
    showStatus('Shortcut updated!', 'success');
    
    isRecording = false;
    currentInput = null;
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
                            a.download = `youtube-watched-history-${new Date().toISOString().split('T')[0]}.txt`;
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
        
        // Import to database
        const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
        if (tabs.length === 0) {
            showStatus('Please open YouTube to import history', 'error');
            return;
        }
        
        // Process in chunks for large files (like legacy code)
        showStatus(`Processing ${videoIds.length} video IDs...`, 'info');
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: (videoIds) => {
                return new Promise((resolve, reject) => {
                    console.log('Starting import of', videoIds.length, 'video IDs');
                    
                    const request = indexedDB.open('YouTubeCommanderDB', 1);
                    request.onerror = () => {
                        console.error('Database open failed:', request.error);
                        reject(request.error);
                    };
                    
                    request.onsuccess = () => {
                        const db = request.result;
                        
                        // Process in chunks to avoid overwhelming the database
                        const chunkSize = 1000;
                        let currentIndex = 0;
                        let totalImported = 0;
                        
                        function processChunk() {
                            const chunk = videoIds.slice(currentIndex, currentIndex + chunkSize);
                            if (chunk.length === 0) {
                                console.log('Import completed. Total imported:', totalImported);
                                resolve(totalImported);
                                return;
                            }
                            
                            console.log(`Processing chunk ${Math.floor(currentIndex/chunkSize) + 1}, items ${currentIndex + 1} to ${currentIndex + chunk.length}`);
                            
                            const transaction = db.transaction(['watchedVideos'], 'readwrite');
                            const store = transaction.objectStore('watchedVideos');
                            
                            let chunkImported = 0;
                            let chunkProcessed = 0;
                            
                            chunk.forEach(videoId => {
                                const putRequest = store.put({ 
                                    videoId: videoId, 
                                    timestamp: Date.now() 
                                });
                                
                                putRequest.onsuccess = () => {
                                    chunkImported++;
                                    chunkProcessed++;
                                    if (chunkProcessed === chunk.length) {
                                        totalImported += chunkImported;
                                        currentIndex += chunkSize;
                                        // Small delay before next chunk
                                        setTimeout(processChunk, 10);
                                    }
                                };
                                
                                putRequest.onerror = () => {
                                    chunkProcessed++;
                                    if (chunkProcessed === chunk.length) {
                                        totalImported += chunkImported;
                                        currentIndex += chunkSize;
                                        setTimeout(processChunk, 10);
                                    }
                                };
                            });
                        }
                        
                        processChunk();
                    };
                });
            },
            args: [videoIds]
        });
        
        const importedCount = result[0].result;
        showStatus(`Successfully imported ${importedCount} videos!`, 'success');
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
        console.log('Setting up toggle switches...'); // Debug log
        setupToggleSwitches();
        setupShortcutRecording();
        setupAutoSave();
        setupFeatureHeaders();
    }, 100);
    
    // Event listeners
    document.getElementById('exportHistory').addEventListener('click', exportHistory);
    document.getElementById('importHistory').addEventListener('click', importHistory);
    document.getElementById('historyFileInput').addEventListener('change', handleFileImport);
    
    // Keyboard event listener for shortcut recording
    document.addEventListener('keydown', handleShortcutInput);
    
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
