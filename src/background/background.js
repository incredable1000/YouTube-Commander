
import browser from "webextension-polyfill";

// Google Drive API configuration
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Drive sync state
let driveAccessToken = null;
let syncInProgress = false;

// Extension installation and startup handling
chrome.runtime.onInstalled.addListener(async (details) => {
    // Ensure default enabled flag exists
    const result = await chrome.storage.local.get(['backupRemindersEnabled']);
    if (result.backupRemindersEnabled === undefined) {
        await chrome.storage.local.set({ backupRemindersEnabled: true });
    }
    
    // Trigger reminder check on install/startup
    if (details.reason === 'startup' || details.reason === 'install') {
        console.log('Extension startup/install detected:', details.reason);
        // Wait a bit for things to settle
        setTimeout(() => {
            checkAndShowStartupReminder();
        }, 5000);
    }
});

// Show reminder when the browser starts (if enabled)
chrome.runtime.onStartup.addListener(async () => {
    console.log('Browser startup detected');
    await checkAndShowStartupReminder();
});

// Check for first run after browser restart
async function checkAndShowStartupReminder() {
    try {
        const result = await chrome.storage.local.get(['backupRemindersEnabled', 'lastStartupReminder']);
        
        if (result.backupRemindersEnabled === false) {
            console.log('Backup reminders disabled, skipping');
            return;
        }
        
        const now = Date.now();
        const lastReminder = result.lastStartupReminder || 0;
        const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
        
        // Only show reminder if it's been more than 1 hour since last one
        if (now - lastReminder > oneHour) {
            console.log('Showing startup backup reminder');
            await chrome.storage.local.set({ lastStartupReminder: now });
            setTimeout(() => {
                showBackupReminder();
            }, 3000); // 3 second delay
        } else {
            console.log('Startup reminder shown recently, skipping');
        }
    } catch (error) {
        console.error('Error checking startup reminder:', error);
    }
}

// Fallback: Check when popup is opened (in case onStartup doesn't fire)
chrome.action.onClicked.addListener(async () => {
    await checkAndShowStartupReminder();
});

// Also check when any tab becomes active (covers more scenarios)
chrome.tabs.onActivated.addListener(async () => {
    // Only check once per session to avoid spam
    if (!chrome.runtime.startupReminderChecked) {
        chrome.runtime.startupReminderChecked = true;
        await checkAndShowStartupReminder();
    }
});

// Additional trigger: when YouTube tab is opened
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        // Only check once per session to avoid spam
        if (!chrome.runtime.youtubeReminderChecked) {
            chrome.runtime.youtubeReminderChecked = true;
            console.log('YouTube tab detected, checking for backup reminder');
            await checkAndShowStartupReminder();
        }
    }
});

// Removed time-based checks and alarms; startup reminder handles the UX now

// Show backup reminder notification
async function showBackupReminder() {
    try {
        // Get video count for the reminder
        const videoCount = await getWatchedVideoCount();
        
        chrome.notifications.create('backupReminder', {
            type: 'basic',
            iconUrl: 'assets/icon.png', // Use correct path
            title: 'YouTube Commander Backup Reminder',
            message: `You have ${videoCount} watched videos. Time to backup your history to Google Drive!`,
            buttons: [
                { title: 'Export Now' },
                { title: 'Remind Later' }
            ],
            requireInteraction: true
        }, (notificationId) => {
            if (chrome.runtime.lastError) {
                console.warn('Failed to create notification:', chrome.runtime.lastError.message);
            } else {
                console.log('Backup reminder notification created:', notificationId);
            }
        });
    } catch (error) {
        console.error('Error showing backup reminder:', error);
    }
}

// Get count of watched videos (using new stats approach)
async function getWatchedVideoCount() {
    return new Promise((resolve) => {
        chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_WATCHED_STATS' }, (response) => {
                    // Check for runtime errors
                    if (chrome.runtime.lastError) {
                        console.warn('Failed to get watched stats from content script:', chrome.runtime.lastError.message);
                        // Fallback to storage
                        chrome.storage.local.get(['lastVideoCount'], (result) => {
                            resolve(result.lastVideoCount || 0);
                        });
                        return;
                    }
                    
                    if (response && response.success) {
                        // Cache the count for future fallback use
                        chrome.storage.local.set({ lastVideoCount: response.total });
                        resolve(response.total || 0);
                    } else {
                        // Fallback to storage
                        chrome.storage.local.get(['lastVideoCount'], (result) => {
                            resolve(result.lastVideoCount || 0);
                        });
                    }
                });
            } else {
                // Fallback: try to get count from storage
                chrome.storage.local.get(['lastVideoCount'], (result) => {
                    resolve(result.lastVideoCount || 0);
                });
            }
        });
    });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === 'backupReminder') {
        if (buttonIndex === 0) { // Export Now
            // Open extension popup or YouTube tab
            chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { active: true });
                    // Send message to show export reminder
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_EXPORT_REMINDER' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.warn('Failed to send export reminder message:', chrome.runtime.lastError.message);
                        }
                    });
                } else {
                    chrome.tabs.create({ url: 'https://www.youtube.com' });
                }
            });
        }
        // Clear the notification
        chrome.notifications.clear(notificationId);
    }
});

// OAuth2 authentication for Google Drive
async function authenticateGoogleDrive() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            driveAccessToken = token;
            chrome.storage.local.set({ driveAccessToken: token });
            resolve(token);
        });
    });
}

// Check if user is authenticated
async function checkDriveAuth() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['driveAccessToken'], (result) => {
            if (result.driveAccessToken) {
                driveAccessToken = result.driveAccessToken;
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

// Upload watched history to Google Drive
async function uploadToGoogleDrive(content) {
    if (!driveAccessToken) {
        throw new Error('Not authenticated with Google Drive');
    }

    const fileName = `youtube-commander-history-${new Date().toISOString().split('T')[0]}.txt`;
    const metadata = {
        name: fileName,
        parents: ['appDataFolder'] // Store in app-specific folder
    };

    try {
        // First, create the file metadata
        const metadataResponse = await fetch(`${DRIVE_API_BASE}/files`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${driveAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata)
        });

        if (!metadataResponse.ok) {
            throw new Error(`Failed to create file: ${metadataResponse.statusText}`);
        }

        const fileData = await metadataResponse.json();

        // Then upload the content
        const uploadResponse = await fetch(`${UPLOAD_API_BASE}/files/${fileData.id}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${driveAccessToken}`,
                'Content-Type': 'text/plain'
            },
            body: content
        });

        if (!uploadResponse.ok) {
            throw new Error(`Failed to upload content: ${uploadResponse.statusText}`);
        }

        return fileData;
    } catch (error) {
        // If token expired, try to refresh
        if (error.message.includes('401')) {
            driveAccessToken = null;
            chrome.storage.local.remove(['driveAccessToken']);
            throw new Error('Authentication expired. Please reconnect to Google Drive.');
        }
        throw error;
    }
}

// Get watched videos and format as text
async function getWatchedHistoryText() {
    return new Promise((resolve) => {
        chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ALL_WATCHED_VIDEOS' }, (response) => {
                    // Check for runtime errors
                    if (chrome.runtime.lastError) {
                        console.warn('Failed to get watched history from content script:', chrome.runtime.lastError.message);
                        resolve('');
                        return;
                    }
                    
                    if (response && response.success) {
                        const videos = response.videos || [];
                        const textContent = videos.map(video => 
                            `${video.videoId}\t${new Date(video.timestamp).toISOString()}`
                        ).join('\n');
                        resolve(textContent);
                    } else {
                        resolve('');
                    }
                });
            } else {
                resolve('');
            }
        });
    });
}

// Perform the actual sync operation
async function performDriveSync() {
    if (syncInProgress) return;
    
    syncInProgress = true;
    
    try {
        const isAuthenticated = await checkDriveAuth();
        if (!isAuthenticated) {
            console.log('Not authenticated with Google Drive, skipping sync');
            return;
        }

        const historyText = await getWatchedHistoryText();
        if (!historyText) {
            console.log('No watch history to sync');
            return;
        }

        await uploadToGoogleDrive(historyText);
        
        // Update last sync time
        chrome.storage.local.set({ 
            lastDriveSync: Date.now(),
            driveSyncStatus: 'success'
        });
        
        console.log('Drive sync completed successfully');
    } catch (error) {
        console.error('Drive sync failed:', error);
        chrome.storage.local.set({ 
            driveSyncStatus: 'error',
            driveSyncError: error.message 
        });
    } finally {
        syncInProgress = false;
    }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'OPEN_NEW_TAB') {
        chrome.tabs.create({ url: message.url, active: false });
    }
    else if (message.type === 'GET_WATCHED_IDS') {
        chrome.storage.local.get(['watchedIds'], (result) => {
            sendResponse(result.watchedIds || []);
        });
        return true;
    }
    else if (message.type === 'REFRESH_BADGES') {
        chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_BADGE' }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Ignore connection errors for inactive tabs
                        console.debug('Tab not responsive for badge refresh:', tab.id);
                    }
                });
            });
        });
    }
    else if (message.type === 'AUTHENTICATE_DRIVE') {
        authenticateGoogleDrive()
            .then(token => sendResponse({ success: true, token }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    else if (message.type === 'SYNC_TO_DRIVE') {
        performDriveSync()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    else if (message.type === 'CHECK_DRIVE_AUTH') {
        checkDriveAuth()
            .then(isAuth => sendResponse({ authenticated: isAuth }))
            .catch(() => sendResponse({ authenticated: false }));
        return true;
    }
    else if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
        chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Failed to get watched videos:', chrome.runtime.lastError.message);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        sendResponse(response);
                    }
                });
            } else {
                sendResponse({ success: false, error: 'No YouTube tabs found' });
            }
        });
        return true;
    }
    else if (message.type === 'TOGGLE_BACKUP_REMINDERS') {
        // No alarms to manage anymore; just acknowledge the toggle
        sendResponse({ success: true });
        return true;
    }
    else if (message.type === 'HISTORY_UPDATED') {
        // Broadcast to all YouTube tabs that history was updated
        chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
            tabs.forEach(tab => {
                // Don't send back to the sender tab
                if (tab.id !== sender.tab?.id) {
                    chrome.tabs.sendMessage(tab.id, { type: 'HISTORY_UPDATED' }, (response) => {
                        if (chrome.runtime.lastError) {
                            // Ignore connection errors for inactive tabs
                            console.debug('Tab not responsive for history update:', tab.id);
                        }
                    });
                }
            });
        });
    }
    else if (message.type === 'PROCESS_IMPORT_BATCH') {
        // Handle import batch processing when script injection fails
        chrome.storage.local.get([message.storageKey], async (result) => {
            const batchData = result[message.storageKey];
            if (!batchData) {
                sendResponse({ success: false, error: 'Batch data not found' });
                return;
            }
            
            // Try to send to content script on the specified tab
            chrome.tabs.sendMessage(message.tabId, {
                type: 'IMPORT_WATCHED_VIDEOS',
                videoIds: batchData.videoIds
            }, (response) => {
                // Clean up storage
                chrome.storage.local.remove([message.storageKey]);
                
                if (chrome.runtime.lastError) {
                    console.warn('Background script import failed:', chrome.runtime.lastError.message);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message, count: 0 });
                } else {
                    sendResponse({ success: true, count: response?.count || 0 });
                }
            });
        });
        return true;
    }
    else if (message.type === 'GET_WATCHED_STATS') {
        // Handle stats requests when content script communication fails
        chrome.tabs.sendMessage(message.tabId, {
            type: 'GET_WATCHED_STATS'
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Background script stats failed:', chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse(response || { success: false, error: 'No response from content script' });
            }
        });
        return true;
    }
});


