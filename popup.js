// Default settings
const defaultSettings = {
    shortSeek: 3,
    mediumSeek: 10,
    longSeek: 30,
    maxQuality: 'hd1080',
    fullWindowShortcut: 'f',  // Default full window shortcut key
    shortSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: true, shift: false, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' }
};

// Current recording state
let isRecording = false;
let currentInput = null;

// Format shortcut for display
function formatShortcut(shortcut) {
    if (!shortcut) return '';
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.key === 'ArrowRight' || shortcut.key === 'ArrowLeft') {
        parts.push(shortcut.key === 'ArrowRight' ? '→' : '←');
    } else {
        parts.push(shortcut.key);
    }
    return parts.join(' + ');
}

// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (settings) => {
        document.getElementById('shortSeek').value = settings.shortSeek;
        document.getElementById('mediumSeek').value = settings.mediumSeek;
        document.getElementById('longSeek').value = settings.longSeek;
        document.getElementById('maxQuality').value = settings.maxQuality;
        
        // Set full window shortcut
        const fullWindowInput = document.getElementById('fullWindowShortcut');
        if (fullWindowInput) {
            fullWindowInput.value = settings.fullWindowShortcut || 'f';
        }
        
        // Load shortcuts and store them in dataset
        const shortcutInputs = {
            'shortSeekKey': settings.shortSeekKey,
            'mediumSeekKey': settings.mediumSeekKey,
            'longSeekKey': settings.longSeekKey
        };

        for (const [inputId, shortcut] of Object.entries(shortcutInputs)) {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = formatShortcut(shortcut);
                input.dataset.shortcut = JSON.stringify(shortcut);
            }
        }
    });
}

// Save settings
function saveSettings() {
    const fullWindowInput = document.getElementById('fullWindowShortcut');
    const fullWindowShortcut = fullWindowInput ? 
        (fullWindowInput.value || 'f').toLowerCase() : 'f';
    
    const settings = {
        shortSeek: parseInt(document.getElementById('shortSeek').value) || 3,
        mediumSeek: parseInt(document.getElementById('mediumSeek').value) || 10,
        longSeek: parseInt(document.getElementById('longSeek').value) || 30,
        maxQuality: document.getElementById('maxQuality').value || 'hd1080',
        fullWindowShortcut: fullWindowShortcut,
        shortSeekKey: JSON.parse(document.getElementById('shortSeekKey').dataset.shortcut || '{}'),
        mediumSeekKey: JSON.parse(document.getElementById('mediumSeekKey').dataset.shortcut || '{}'),
        longSeekKey: JSON.parse(document.getElementById('longSeekKey').dataset.shortcut || '{}')
    };

    // Validate seek times
    if (settings.shortSeek < 1 || settings.mediumSeek < 1 || settings.longSeek < 1) {
        showStatus('Seek times must be at least 1 second', false);
        return;
    }

    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            showStatus('Error saving settings', false);
        } else {
            showStatus('Settings saved!', true);
        }
    });
}

// Show status message
function showStatus(message, success) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status' + (success ? ' success' : ' error');
    
    if (success) {
        setTimeout(() => {
            window.close();
        }, 1000);
    } else {
        setTimeout(() => {
            status.className = 'status';
            status.textContent = '';
        }, 3000);
    }
}

// Handle shortcut recording
function startRecording(input) {
    if (currentInput) {
        currentInput.classList.remove('recording');
    }
    currentInput = input;
    currentInput.value = 'Press keys...';
    isRecording = true;
}

function stopRecording() {
    if (currentInput) {
        currentInput.classList.remove('recording');
        if (!currentInput.value || currentInput.value === 'Press keys...') {
            // Restore previous shortcut or default
            const previousShortcut = currentInput.dataset.shortcut || 
                JSON.stringify(defaultSettings[currentInput.id]);
            currentInput.value = formatShortcut(JSON.parse(previousShortcut));
        }
    }
    currentInput = null;
    isRecording = false;
}

function handleShortcutInput(e) {
    // Skip if we're in the full window shortcut input
    if (document.activeElement.id === 'fullWindowShortcut') {
        return;
    }
    
    if (!isRecording) return;
    
    e.preventDefault();
    e.stopPropagation();

    // Only allow arrow keys for seek shortcuts
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
        showStatus('Only arrow keys are allowed for seek shortcuts', false);
        return;
    }

    const shortcut = {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        key: e.key
    };

    currentInput.value = formatShortcut(shortcut);
    currentInput.dataset.shortcut = JSON.stringify(shortcut);
    
    // Show success message
    showStatus('Shortcut saved!', true);
    
    // Stop recording after a short delay to allow the message to be seen
    setTimeout(() => {
        stopRecording();
    }, 500);
}

// Show history status message
function showHistoryStatus(message) {
    const status = document.getElementById('historyStatus');
    status.textContent = message;
    status.style.display = 'block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

// Drive status functions removed - using backup reminders instead

// Toggle backup reminders
async function toggleBackupReminders() {
    const checkbox = document.getElementById('backupReminders');
    const status = document.getElementById('reminderStatus');
    
    try {
        await chrome.storage.local.set({ backupRemindersEnabled: checkbox.checked });
        
        // Send message to background script to update alarms
        chrome.runtime.sendMessage({ 
            type: 'TOGGLE_BACKUP_REMINDERS', 
            enabled: checkbox.checked 
        });
        
        status.textContent = checkbox.checked ? 
            '✅ Startup backup reminders enabled' : 
            '❌ Backup reminders disabled';
        status.className = 'status success';
        status.style.display = 'block';
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('Error toggling backup reminders:', error);
        status.textContent = 'Error updating reminder setting';
        status.className = 'status error';
        status.style.display = 'block';
        checkbox.checked = !checkbox.checked; // Revert
    }
}


// Handle full window shortcut input
function handleFullWindowShortcutInput(e) {
    // Only allow single character input
    if (e.target.value.length > 1) {
        e.target.value = e.target.value.slice(-1);
    }
    
    // Only allow alphanumeric characters
    e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/, '').toLowerCase();
    
    // Only proceed if we have a valid character
    if (e.target.value) {
        // Save the setting immediately when changed
        const settings = {};
        settings.fullWindowShortcut = e.target.value;
        
        chrome.storage.sync.set(settings, () => {
            if (!chrome.runtime.lastError) {
                // Notify the content script about the shortcut change
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    if (tabs[0]?.url?.includes('youtube.com')) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'updateFullWindowShortcut',
                            shortcut: settings.fullWindowShortcut
                        });
                    }
                });
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    
    // Handle full window shortcut input
    const fullWindowInput = document.getElementById('fullWindowShortcut');
    if (fullWindowInput) {
        // Load current shortcut
        chrome.storage.sync.get({fullWindowShortcut: 'f'}, (result) => {
            fullWindowInput.value = result.fullWindowShortcut;
        });
        
        // Handle input changes
        fullWindowInput.addEventListener('input', handleFullWindowShortcutInput);
        
        // Select all text when focused for better UX
        fullWindowInput.addEventListener('focus', () => fullWindowInput.select());
        
        // Handle keydown events to prevent conflicts
        fullWindowInput.addEventListener('keydown', function(e) {
            // Allow all printable characters
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // Only allow alphanumeric
                if (!e.key.match(/[a-zA-Z0-9]/i)) {
                    e.preventDefault();
                }
                return;
            }
            
            // Allow navigation and control keys
            if (['Tab', 'Escape', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                return;
            }
            
            // Prevent other special keys from interfering
            e.stopPropagation();
        }, true); // Use capture phase to ensure we get the event first
    }
    
    // Set up shortcut recording
    const shortcutInputs = document.querySelectorAll('.shortcut-input');
    shortcutInputs.forEach(input => {
        input.addEventListener('focus', () => startRecording(input));
        input.addEventListener('blur', stopRecording);
    });

    document.addEventListener('keydown', handleShortcutInput);
    document.getElementById('save').addEventListener('click', saveSettings);

    // Google Drive functionality removed - using backup reminders instead

    // Load backup reminder setting
    chrome.storage.local.get(['backupRemindersEnabled'], (result) => {
        const enabled = result.backupRemindersEnabled !== false;
        document.getElementById('backupReminders').checked = enabled;
    });

    // Handle backup reminder toggle
    document.getElementById('backupReminders').addEventListener('change', toggleBackupReminders);

    // Load auto-switch to original audio setting
    chrome.storage.local.get(['autoSwitchToOriginal'], (result) => {
        const enabled = result.autoSwitchToOriginal !== false; // Default to true
        document.getElementById('autoSwitchToOriginal').checked = enabled;
    });

    // Handle auto-switch to original audio toggle
    document.getElementById('autoSwitchToOriginal').addEventListener('change', toggleAutoSwitchToOriginal);

    // Handle watched history export
    document.getElementById('exportHistory').addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url.includes('youtube.com')) {
                showHistoryStatus('Please open YouTube to export history');
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
                                const content = videos.map(v => v.videoId).join('\n');
                                const blob = new Blob([content], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'youtube-watched-history.txt';
                                a.click();
                                URL.revokeObjectURL(url);
                                resolve(videos.length);
                            };
                            getAll.onerror = () => reject(getAll.error);
                        };
                    });
                }
            });
            
            showHistoryStatus(`Exported ${result[0].result} videos`);
        } catch (error) {
            console.error('Export error:', error);
            showHistoryStatus('Error exporting history');
        }
    });

    // Handle watched history import
    document.getElementById('importHistory').addEventListener('click', () => {
        document.getElementById('historyFileInput').click();
    });

    document.getElementById('historyFileInput').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab.url.includes('youtube.com')) {
                showHistoryStatus('Please open YouTube to import history');
                return;
            }

            const content = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsText(file);
            });

            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (fileContent) => {
                    return new Promise((resolve, reject) => {
                        const request = indexedDB.open('YouTubeCommanderDB', 1);
                        request.onerror = () => reject(request.error);
                        request.onsuccess = async () => {
                            const db = request.result;
                            const transaction = db.transaction(['watchedVideos'], 'readwrite');
                            const store = transaction.objectStore('watchedVideos');
                            
                            const ids = fileContent.split('\n').filter(id => id.trim());
                            let imported = 0;
                            
                            for (const videoId of ids) {
                                if (!videoId.trim()) continue;
                                
                                try {
                                    await new Promise((resolve, reject) => {
                                        const request = store.put({
                                            videoId: videoId.trim(),
                                            timestamp: Date.now()
                                        });
                                        request.onsuccess = () => {
                                            imported++;
                                            resolve();
                                        };
                                        request.onerror = () => resolve(); // Skip duplicates
                                    });
                                } catch (error) {
                                    console.error('Error importing video:', videoId, error);
                                }
                            }
                            
                            resolve(imported);
                        };
                    });
                },
                args: [content]
            });

            showHistoryStatus(`Imported ${result[0].result} new videos`);
        } catch (error) {
            console.error('Import error:', error);
            showHistoryStatus('Error importing history');
        }

        event.target.value = '';
    });

    // Auto-switch to original audio track setting
    async function toggleAutoSwitchToOriginal() {
        const checkbox = document.getElementById('autoSwitchToOriginal');
        
        try {
            await chrome.storage.local.set({ autoSwitchToOriginal: checkbox.checked });
            
            // Notify content script about the setting change
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url?.includes('youtube.com')) {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'updateAutoSwitchSetting',
                    enabled: checkbox.checked
                }).catch(() => {
                    // Ignore errors if content script isn't ready
                });
            }
            
        } catch (error) {
            console.error('Error updating auto-switch setting:', error);
            checkbox.checked = !checkbox.checked; // Revert on error
        }
    }


});

// Stop recording when popup loses focus
window.addEventListener('blur', stopRecording);
