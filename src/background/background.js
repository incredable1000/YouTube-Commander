// Google Drive API configuration
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Drive sync state
let driveAccessToken = null;
let syncInProgress = false;

// Backup reminder scheduling configuration
const BACKUP_REMINDER_NOTIFICATION_ID = 'backupReminder';
const BACKUP_REMINDER_ALARM_ID = 'ytCommanderBackupReminder';
const BACKUP_REMINDER_STARTUP_ALARM_ID = 'ytCommanderBackupReminderStartup';
const BACKUP_REMINDER_INTERVAL_MINUTES = 240; // every 4 hours
const BACKUP_REMINDER_STARTUP_DELAY_MINUTES = 1;
const BACKUP_REMINDER_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

let reminderSessionChecked = false;

/**
 * Ensure backup reminder settings are initialized.
 */
async function ensureBackupReminderDefaults() {
    const result = await chrome.storage.local.get(['backupRemindersEnabled']);
    if (result.backupRemindersEnabled === undefined) {
        await chrome.storage.local.set({ backupRemindersEnabled: true });
    }
}

/**
 * Return whether backup reminders are enabled.
 * @returns {Promise<boolean>}
 */
async function isBackupReminderEnabled() {
    const result = await chrome.storage.local.get(['backupRemindersEnabled']);
    return result.backupRemindersEnabled !== false;
}

/**
 * Schedule or clear reminder alarms based on current setting.
 */
async function configureBackupReminderAlarms() {
    await chrome.alarms.clear(BACKUP_REMINDER_ALARM_ID);
    await chrome.alarms.clear(BACKUP_REMINDER_STARTUP_ALARM_ID);

    const enabled = await isBackupReminderEnabled();
    if (!enabled) {
        return;
    }

    chrome.alarms.create(BACKUP_REMINDER_ALARM_ID, {
        periodInMinutes: BACKUP_REMINDER_INTERVAL_MINUTES
    });
    chrome.alarms.create(BACKUP_REMINDER_STARTUP_ALARM_ID, {
        delayInMinutes: BACKUP_REMINDER_STARTUP_DELAY_MINUTES
    });
}

/**
 * Check cooldown and display backup reminder if eligible.
 * @param {string} trigger
 * @param {number} minIntervalMs
 */
async function maybeShowBackupReminder(trigger = 'manual', minIntervalMs = BACKUP_REMINDER_COOLDOWN_MS) {
    try {
        const result = await chrome.storage.local.get([
            'backupRemindersEnabled',
            'lastBackupReminderAt'
        ]);

        if (result.backupRemindersEnabled === false) {
            return false;
        }

        const now = Date.now();
        const lastShown = result.lastBackupReminderAt || 0;
        if (now - lastShown < minIntervalMs) {
            return false;
        }

        await showBackupReminder();
        await chrome.storage.local.set({ lastBackupReminderAt: now });
        console.log(`Backup reminder shown (${trigger})`);
        return true;
    } catch (error) {
        console.error('Error while showing backup reminder:', error);
        return false;
    }
}

// Extension installation and startup handling
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        await ensureBackupReminderDefaults();
        await configureBackupReminderAlarms();

        if (details.reason === 'install') {
            await maybeShowBackupReminder('install');
        }
    } catch (error) {
        console.error('onInstalled reminder setup failed:', error);
    }
});

chrome.runtime.onStartup.addListener(async () => {
    try {
        await ensureBackupReminderDefaults();
        await configureBackupReminderAlarms();
        await maybeShowBackupReminder('startup');
        reminderSessionChecked = true;
    } catch (error) {
        console.error('onStartup reminder setup failed:', error);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm || !alarm.name) {
        return;
    }

    if (alarm.name === BACKUP_REMINDER_ALARM_ID) {
        await maybeShowBackupReminder('periodic-alarm');
    } else if (alarm.name === BACKUP_REMINDER_STARTUP_ALARM_ID) {
        await maybeShowBackupReminder('startup-alarm');
    }
});

// Fallback trigger for sessions where startup event was missed.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url || !tab.url.includes('youtube.com')) {
        return;
    }

    if (reminderSessionChecked) {
        return;
    }

    reminderSessionChecked = true;
    await maybeShowBackupReminder('youtube-tab');
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.backupRemindersEnabled) {
        return;
    }

    void configureBackupReminderAlarms();
});

// Show backup reminder notification
async function showBackupReminder() {
    try {
        // Get video count for the reminder
        const videoCount = await getWatchedVideoCount();

        const message = videoCount > 0
            ? `You have ${videoCount} watched videos. Time to backup your history to Google Drive!`
            : 'Time to backup your watched history to Google Drive!';

        chrome.notifications.create(BACKUP_REMINDER_NOTIFICATION_ID, {
            type: 'basic',
            iconUrl: 'assets/icon.png',
            title: 'YouTube Commander Backup Reminder',
            message,
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
    const readCachedCount = () => new Promise((resolve) => {
        chrome.storage.local.get(['lastVideoCount'], (result) => {
            resolve(result.lastVideoCount || 0);
        });
    });

    const requestStatsFromTab = (tabId) => new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_WATCHED_STATS' }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }

            if (response && response.success && typeof response.total === 'number') {
                chrome.storage.local.set({ lastVideoCount: response.total });
                resolve(response.total);
                return;
            }

            resolve(null);
        });
    });

    return new Promise((resolve) => {
        chrome.tabs.query({ url: '*://www.youtube.com/*' }, async (tabs) => {
            if (!tabs || tabs.length === 0) {
                const cachedCount = await readCachedCount();
                resolve(cachedCount);
                return;
            }

            for (const tab of tabs) {
                const count = await requestStatsFromTab(tab.id);
                if (typeof count === 'number') {
                    resolve(count);
                    return;
                }
            }

            const cachedCount = await readCachedCount();
            resolve(cachedCount);
        });
    });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === BACKUP_REMINDER_NOTIFICATION_ID) {
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
        const enabled = message.enabled !== false;
        chrome.storage.local.set({ backupRemindersEnabled: enabled }, async () => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }

            await configureBackupReminderAlarms();
            sendResponse({ success: true, enabled });
        });
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


