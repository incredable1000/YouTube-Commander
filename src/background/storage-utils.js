/**
 * Storage utilities for background script.
 */

export async function storageLocalGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result));
    });
}

export async function storageLocalSet(values) {
    return new Promise((resolve) => {
        chrome.storage.local.set(values, resolve);
    });
}

export async function clearAlarm(name) {
    return new Promise((resolve) => {
        chrome.alarms.clear(name, (wasCleared) => resolve(wasCleared));
    });
}

export async function getAlarm(name) {
    return new Promise((resolve) => {
        chrome.alarms.get(name, (alarm) => resolve(alarm));
    });
}

export async function createAlarm(name, alarmInfo) {
    return new Promise((resolve) => {
        chrome.alarms.create(name, alarmInfo, resolve);
    });
}

export function parseJsonSafe(text) {
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}
