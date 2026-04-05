/**
 * Subscription automation for background script.
 */

import { storageLocalGet, storageLocalSet, clearAlarm } from './storage-utils.js';

const AUTOMATION_ALARM_NAME = 'ytCommanderSubscriptionAutomation';

export const AUTOMATION_STORAGE_KEYS = {
    ENABLED: 'subscriptionAutomationEnabled',
    TIME: 'subscriptionAutomationTime',
    LOOKBACK: 'subscriptionAutomationLookback',
    SHORTS_PLAYLIST: 'subscriptionAutomationShortsPlaylist',
    VIDEOS_MODE: 'subscriptionAutomationVideosMode',
    VIDEOS_PLAYLIST: 'subscriptionAutomationVideosPlaylist',
    SPLIT_COUNT: 'subscriptionAutomationSplitCount',
    LAST_RUN: 'subscriptionAutomationLastRun',
    LAST_VIDEOS_COUNT: 'subscriptionAutomationLastVideosCount',
    LAST_SHORTS_COUNT: 'subscriptionAutomationLastShortsCount',
    LAST_STATUS: 'subscriptionAutomationLastStatus',
};

export function showNotification(title, message) {
    try {
        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icon.png',
                title: title,
                message: message,
            });
        }
    } catch (e) {
        console.warn('[YT-Commander][Notifications] Failed to show notification:', e);
    }
}

export async function readAutomationSettings() {
    const result = await storageLocalGet([
        AUTOMATION_STORAGE_KEYS.ENABLED,
        AUTOMATION_STORAGE_KEYS.TIME,
        AUTOMATION_STORAGE_KEYS.LOOKBACK,
        AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST,
        AUTOMATION_STORAGE_KEYS.VIDEOS_MODE,
        AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST,
        AUTOMATION_STORAGE_KEYS.SPLIT_COUNT,
    ]);

    return {
        enabled: result[AUTOMATION_STORAGE_KEYS.ENABLED] === true,
        time: result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30',
        lookback: result[AUTOMATION_STORAGE_KEYS.LOOKBACK] || 'yesterday',
        shortsPlaylist: result[AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST] || 'WL',
        videosMode: result[AUTOMATION_STORAGE_KEYS.VIDEOS_MODE] || 'single',
        videosPlaylist: result[AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST] || 'WL',
        splitCount: parseInt(result[AUTOMATION_STORAGE_KEYS.SPLIT_COUNT]) || 20,
    };
}

export async function scheduleAutomation() {
    const settings = await readAutomationSettings();

    if (!settings.enabled) {
        await clearAlarm(AUTOMATION_ALARM_NAME);
        console.info('[YT-Commander][Automation] Disabled, clearing alarm');
        return;
    }

    const [hours, minutes] = settings.time.split(':').map(Number);
    const now = new Date();
    let nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);

    if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayInMinutes = (nextRun - now) / (1000 * 60);

    await clearAlarm(AUTOMATION_ALARM_NAME);
    chrome.alarms.create(AUTOMATION_ALARM_NAME, {
        delayInMinutes: delayInMinutes,
    });

    console.info(
        '[YT-Commander][Automation] Scheduled for',
        nextRun.toISOString(),
        'in',
        Math.round(delayInMinutes),
        'minutes'
    );
}
