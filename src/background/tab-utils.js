/**
 * Tab utilities for background script.
 */

const YOUTUBE_TAB_URL_PATTERN = 'https://www.youtube.com/*';
const YOUTUBE_BOOTSTRAP_URL = 'https://www.youtube.com/';
const TAB_READY_TIMEOUT_MS = 20000;
const MESSAGE_TIMEOUT_MS = 12000;
const TAB_RECEIVER_CHECK_RETRIES = 8;
const TAB_RECEIVER_CHECK_DELAY_MS = 350;

export async function queryTabs(queryInfo) {
    return new Promise((resolve) => {
        chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
    });
}

export async function createTab(createProperties) {
    return new Promise((resolve, reject) => {
        chrome.tabs.create(createProperties, (tab) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(tab);
            }
        });
    });
}

export async function removeTab(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.remove(tabId, () => resolve());
    });
}

export async function sendMessageToTab(tabId, message, timeoutMs = MESSAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Message timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

export async function waitForTabReady(tabId, timeoutMs = TAB_READY_TIMEOUT_MS) {
    const startTime = Date.now();
    for (let attempt = 0; attempt < TAB_RECEIVER_CHECK_RETRIES; attempt += 1) {
        if (Date.now() - startTime > timeoutMs) {
            throw new Error(`Tab ${tabId} ready check timeout`);
        }
        try {
            const response = await sendMessageToTab(tabId, { type: 'PING' }, 3000);
            if (response?.type === 'PONG') {
                return true;
            }
        } catch (_error) {
            // Tab not ready yet
        }
        await delay(TAB_RECEIVER_CHECK_DELAY_MS);
    }
    return false;
}

export async function getYouTubeTabCandidates() {
    return queryTabs({
        url: [YOUTUBE_TAB_URL_PATTERN, 'https://www.youtube.com/'],
    });
}

export async function findExistingYouTubeTabWithReceiver() {
    const tabs = await getYouTubeTabCandidates();
    for (const tab of tabs) {
        if (!tab.id || !tab.url) {
            continue;
        }
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
            continue;
        }
        try {
            const response = await sendMessageToTab(tab.id, { type: 'PING' }, 1000);
            if (response?.type === 'PONG') {
                return tab;
            }
        } catch (_error) {
            // No receiver in this tab
        }
    }
    return null;
}

export async function resolveYouTubeTabForHistory() {
    const existing = await findExistingYouTubeTabWithReceiver();
    if (existing) {
        return existing;
    }
    const tab = await createTab({ url: YOUTUBE_BOOTSTRAP_URL, active: false });
    if (tab?.id) {
        await waitForTabReady(tab.id);
        return tab;
    }
    return null;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export { delay };
