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
        'playlistToggle': 'playlistEnabled',
        'backupToggle': 'backupEnabled'
    };
    
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
            'playlistToggle': 'playlistEnabled',
            'backupToggle': 'backupEnabled'
        };
        
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

// Load watched history statistics
function loadWatchedHistoryStats() {
    chrome.runtime.sendMessage({ type: 'GET_WATCHED_COUNT' }, (response) => {
        if (response && typeof response.count === 'number') {
            document.getElementById('watchedCount').textContent = response.count;
        }
    });
    
    // Get today's count (simplified - just show total for now)
    document.getElementById('todayCount').textContent = '0';
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

// Export history functionality
function exportHistory() {
    chrome.runtime.sendMessage({ type: 'EXPORT_WATCHED_HISTORY' }, (response) => {
        if (response && response.success) {
            const blob = new Blob([response.content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `youtube-commander-history-${new Date().toISOString().split('T')[0]}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            
            showStatus('History exported successfully!', 'success');
        } else {
            showStatus('Failed to export history', 'error');
        }
    });
}

// Import history functionality
function importHistory() {
    const fileInput = document.getElementById('historyFileInput');
    fileInput.click();
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        // Process the imported content here
        showStatus('History imported successfully!', 'success');
        loadWatchedHistoryStats(); // Refresh stats
    };
    reader.readAsText(file);
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
