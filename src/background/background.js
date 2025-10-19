
import browser from "webextension-polyfill";

// Google Drive API configuration
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Drive sync state
let driveAccessToken = null;
let syncInProgress = false;

// Startup-only reminder: no fixed times, just once per browser launch
browser.runtime.onInstalled.addListener(async () => {
    // Ensure default enabled flag exists
    const result = await browser.storage.local.get(['backupRemindersEnabled']);
    if (result.backupRemindersEnabled === undefined) {
        await browser.storage.local.set({ backupRemindersEnabled: true });
    }
});

// Show reminder once when the browser starts (if enabled)
browser.runtime.onStartup.addListener(async () => {
    const result = await browser.storage.local.get(['backupRemindersEnabled']);
    if (result.backupRemindersEnabled !== false) {
        showBackupReminder();
    }
});

// Removed time-based checks and alarms; startup reminder handles the UX now

// Show backup reminder notification
async function showBackupReminder() {
    // Get video count for the reminder
    const videoCount = await getWatchedVideoCount();
    
    chrome.notifications.create('backupReminder', {
        type: 'basic',
        iconUrl: 'icon.png',
        title: '📥 YouTube Commander Backup Reminder',
        message: `You have ${videoCount} watched videos. Time to backup your history to Google Drive!`,
        buttons: [
            { title: '📤 Export Now' },
            { title: '⏰ Remind Later' }
        ],
        requireInteraction: true
    });
}

// Get count of watched videos
async function getWatchedVideoCount() {
    return new Promise((resolve) => {
        chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_WATCHED_COUNT' }, (response) => {
                    resolve(response?.count || 0);
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
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_EXPORT_REMINDER' });
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
                chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_BADGE' });
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
                chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
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
                    chrome.tabs.sendMessage(tab.id, { type: 'HISTORY_UPDATED' }).catch(() => {
                        // Ignore errors for tabs that might not have the content script loaded
                    });
                }
            });
        });
    }
});


