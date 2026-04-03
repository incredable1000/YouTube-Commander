const YOUTUBE_TAB_URL_PATTERN = 'https://www.youtube.com/*';
const YOUTUBE_BOOTSTRAP_URL = 'https://www.youtube.com/';

const CONTENT_SCRIPT_BOOT_DELAY_MS = 900;
const TAB_READY_TIMEOUT_MS = 20000;
const MESSAGE_TIMEOUT_MS = 12000;
const TAB_RECEIVER_CHECK_RETRIES = 8;
const TAB_RECEIVER_CHECK_DELAY_MS = 350;
const CLOUDFLARE_SYNC_REQUEST_TIMEOUT_MS = 60000;

const AUTO_SYNC_ALARM_NAME = 'ytCommanderCloudflareAutoSync';
const AUTO_SYNC_CHECK_PERIOD_MINUTES = 1;
const AUTO_SYNC_CHUNK_SIZE = 300;
const AUTO_SYNC_MAX_IDS_PER_RUN = 1200;
const MANUAL_SYNC_MAX_IDS_PER_RUN = 6000;

const CLOUD_SYNC_STORAGE_KEYS = {
    ENDPOINT: 'cloudflareSyncEndpoint',
    API_TOKEN: 'cloudflareSyncApiToken',
    AUTO_ENABLED: 'cloudflareSyncAutoEnabled',
    INTERVAL_MINUTES: 'cloudflareSyncIntervalMinutes',
    LAST_AT: 'cloudflareSyncLastAt',
    STATUS: 'cloudflareSyncStatus',
    ERROR: 'cloudflareSyncError',
    COUNT: 'cloudflareSyncCount',
    PENDING_COUNT: 'cloudflareSyncPendingCount',
    PENDING_QUEUE: 'cloudflareSyncPendingVideoIds',
    PENDING_BY_ACCOUNT: 'cloudflareSyncPendingByAccount',
    PRIMARY_ACCOUNT_KEY: 'cloudflareSyncPrimaryAccountKey',
    FAILURE_COUNT: 'cloudflareSyncFailureCount',
    BACKOFF_UNTIL: 'cloudflareSyncBackoffUntil',
    QUEUE_SEEDED: 'cloudflareSyncQueueSeeded'
};

const CLOUD_SYNC_DEFAULTS = {
    autoEnabled: true,
    intervalMinutes: 30,
    failureCount: 0,
    backoffUntil: 0,
    queueSeeded: false,
    pendingCount: 0
};
const SUBSCRIPTION_SYNC_ALARM_NAME = 'ytCommanderSubscriptionAutoSync';
const EXTENSION_TITLE = 'YouTube Commander';
const SUBSCRIPTION_SYNC_CHECK_PERIOD_MINUTES = 1;

const SUBSCRIPTION_SYNC_STORAGE_KEYS = {
    ENDPOINT: 'subscriptionSyncEndpoint',
    API_TOKEN: 'subscriptionSyncApiToken',
    AUTO_ENABLED: 'subscriptionSyncAutoEnabled',
    INTERVAL_MINUTES: 'subscriptionSyncIntervalMinutes',
    LAST_AT: 'subscriptionSyncLastAt',
    STATUS: 'subscriptionSyncStatus',
    ERROR: 'subscriptionSyncError',
    COUNT: 'subscriptionSyncCount',
    PENDING_COUNT: 'subscriptionSyncPendingCount',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PRIMARY_ACCOUNT_KEY: 'subscriptionSyncPrimaryAccountKey',
    FAILURE_COUNT: 'subscriptionSyncFailureCount',
    BACKOFF_UNTIL: 'subscriptionSyncBackoffUntil'
};

const SUBSCRIPTION_SYNC_DEFAULTS = {
    autoEnabled: true,
    intervalMinutes: 60,
    failureCount: 0,
    backoffUntil: 0,
    pendingCount: 0
};

const BADGE_MAX_COUNT = 999;
const BADGE_BACKGROUND_COLOR = '#ff5b6e';
const BADGE_TEXT_COLOR = '#ffffff';

let cloudSyncInProgress = false;
let subscriptionSyncInProgress = false;
let subscriptionRestoreInProgress = false;
let pendingQueueMutationChain = Promise.resolve();
const DEFAULT_ACCOUNT_KEY = 'default';
const SUBSCRIPTION_ACCOUNT_KEY_PREFIX = 'ytch:';
let lastWatchedPendingCount = 0;
let lastSubscriptionPendingCount = 0;

/**
 * Sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Query tabs helper.
 * @param {chrome.tabs.QueryInfo} queryInfo
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function queryTabs(queryInfo) {
    return new Promise((resolve) => {
        chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
    });
}

/**
 * Format badge count text.
 * @param {number} count
 * @returns {string}
 */
function formatBadgeCount(count) {
    if (!Number.isFinite(count) || count <= 0) {
        return '';
    }
    if (count > BADGE_MAX_COUNT) {
        return `${BADGE_MAX_COUNT}+`;
    }
    return String(count);
}

/**
 * Update extension tooltip title with pending counts.
 */
function updateExtensionTitle() {
    const parts = [];
    if (lastWatchedPendingCount > 0) {
        parts.push(`Watched pending: ${lastWatchedPendingCount}`);
    }
    if (lastSubscriptionPendingCount > 0) {
        parts.push(`Subscriptions pending: ${lastSubscriptionPendingCount}`);
    }
    const title = parts.length > 0
        ? `${EXTENSION_TITLE} • ${parts.join(' | ')}`
        : EXTENSION_TITLE;
    try {
        chrome.action.setTitle({ title });
    } catch (error) {
        console.warn('[YT-Commander][Badge] Failed to update title', error);
    }
}

/**
 * Update extension badge with pending watched IDs count.
 * @param {number} count
 */
function updateWatchedHistoryBadge(count) {
    const numericCount = Number(count) || 0;
    lastWatchedPendingCount = numericCount;
    const text = formatBadgeCount(numericCount);
    try {
        chrome.action.setBadgeText({ text });
        chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
        if (chrome.action.setBadgeTextColor) {
            chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR });
        }
        updateExtensionTitle();
    } catch (error) {
        console.warn('[YT-Commander][Badge] Failed to update badge', error);
    }
}

/**
 * Refresh badge from stored pending count.
 */
function refreshWatchedHistoryBadge() {
    chrome.storage.local.get([
        CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT
    ], (result) => {
        const count = Number(result?.[CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]) || 0;
        lastSubscriptionPendingCount = Number(result?.[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]) || 0;
        updateWatchedHistoryBadge(count);
    });
}

/**
 * Create tab helper.
 * @param {chrome.tabs.CreateProperties} createProperties
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function createTab(createProperties) {
    return new Promise((resolve, reject) => {
        chrome.tabs.create(createProperties, (tab) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Failed to create tab'));
                return;
            }

            resolve(tab);
        });
    });
}

/**
 * Remove tab helper.
 * @param {number} tabId
 * @returns {Promise<void>}
 */
async function removeTab(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.remove(tabId, () => resolve());
    });
}

/**
 * Wait until tab load completes.
 * @param {number} tabId
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
async function waitForTabReady(tabId, timeoutMs = TAB_READY_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let timeoutId = null;

        const cleanup = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            chrome.tabs.onUpdated.removeListener(onUpdated);
        };

        const onUpdated = (updatedTabId, changeInfo) => {
            if (updatedTabId !== tabId) {
                return;
            }

            if (changeInfo.status === 'complete') {
                cleanup();
                resolve();
            }
        };

        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out while waiting for YouTube tab to load'));
        }, timeoutMs);

        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

/**
 * Send tab message with timeout.
 * @param {number} tabId
 * @param {any} message
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function sendMessageToTab(tabId, message, timeoutMs = MESSAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            reject(new Error('Tab did not respond in time'));
        }, timeoutMs);

        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeoutId);

            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Failed to send tab message'));
                return;
            }

            resolve(response);
        });
    });
}

/**
 * Get local storage values.
 * @param {string|string[]} keys
 * @returns {Promise<object>}
 */
async function storageLocalGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}

/**
 * Set local storage values.
 * @param {object} values
 * @returns {Promise<void>}
 */
async function storageLocalSet(values) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Failed to persist local storage'));
                return;
            }
            resolve();
        });
    });
}

/**
 * Clear alarm by name.
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function clearAlarm(name) {
    return new Promise((resolve) => {
        chrome.alarms.clear(name, (wasCleared) => resolve(Boolean(wasCleared)));
    });
}

/**
 * Get alarm by name.
 * @param {string} name
 * @returns {Promise<chrome.alarms.Alarm|null>}
 */
async function getAlarm(name) {
    return new Promise((resolve) => {
        chrome.alarms.get(name, (alarm) => resolve(alarm || null));
    });
}

/**
 * Check whether an error indicates that no content-script receiver exists on tab.
 * @param {any} error
 * @returns {boolean}
 */
function isMissingReceiverError(error) {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    return message.includes('receiving end does not exist')
        || message.includes('could not establish connection')
        || message.includes('message port closed before a response was received')
        || message.includes('tab did not respond in time');
}

/**
 * Verify that a tab has a working content-script receiver.
 * @param {number} tabId
 * @param {number} retries
 * @returns {Promise<boolean>}
 */
async function hasWatchedHistoryReceiver(tabId, retries = 1) {
    for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
            await sendMessageToTab(tabId, { type: 'GET_WATCHED_COUNT' }, 4000);
            return true;
        } catch (error) {
            if (attempt >= retries - 1) {
                return false;
            }
            await delay(TAB_RECEIVER_CHECK_DELAY_MS);
        }
    }

    return false;
}

/**
 * Build preferred YouTube tab candidates (active current-window first, non-incognito first).
 * @returns {Promise<chrome.tabs.Tab[]>}
 */
async function getYouTubeTabCandidates() {
    const activeTabs = await queryTabs({
        active: true,
        currentWindow: true,
        url: YOUTUBE_TAB_URL_PATTERN
    });
    const existingTabs = await queryTabs({ url: YOUTUBE_TAB_URL_PATTERN });

    const seen = new Set();
    const ordered = [];

    const append = (tab) => {
        if (!tab || typeof tab.id !== 'number' || seen.has(tab.id)) {
            return;
        }
        seen.add(tab.id);
        ordered.push(tab);
    };

    activeTabs.filter((tab) => tab.incognito !== true).forEach(append);
    activeTabs.forEach(append);
    existingTabs.filter((tab) => tab.incognito !== true).forEach(append);
    existingTabs.forEach(append);

    return ordered;
}

/**
 * Find an already-open YouTube tab with a working content receiver.
 * @returns {Promise<number|null>}
 */
async function findExistingYouTubeTabWithReceiver() {
    const candidates = await getYouTubeTabCandidates();
    for (const candidate of candidates) {
        if (await hasWatchedHistoryReceiver(candidate.id, 1)) {
            return candidate.id;
        }
    }
    return null;
}

/**
 * Resolve a usable YouTube tab, creating one if needed.
 * @returns {Promise<{tabId: number, created: boolean}>}
 */
async function resolveYouTubeTabForHistory() {
    const candidates = await getYouTubeTabCandidates();
    for (const candidate of candidates) {
        if (await hasWatchedHistoryReceiver(candidate.id, 1)) {
            return { tabId: candidate.id, created: false };
        }
    }

    const createdTab = await createTab({ url: YOUTUBE_BOOTSTRAP_URL, active: false });
    if (!createdTab || typeof createdTab.id !== 'number') {
        throw new Error('Failed to create a YouTube tab for sync');
    }

    await waitForTabReady(createdTab.id);
    await delay(CONTENT_SCRIPT_BOOT_DELAY_MS);

    const hasReceiver = await hasWatchedHistoryReceiver(createdTab.id, TAB_RECEIVER_CHECK_RETRIES);
    if (!hasReceiver) {
        await removeTab(createdTab.id);
        throw new Error('Could not connect to YouTube content script. Open a YouTube tab and retry sync.');
    }

    return { tabId: createdTab.id, created: true };
}

/**
 * Read account identity from a YouTube tab.
 * @param {number} tabId
 * @returns {Promise<{accountKey: string, source: string, isPrimaryCandidate: boolean}>}
 */
async function getSyncIdentityFromTab(tabId) {
    const response = await sendMessageToTab(tabId, { type: 'GET_SYNC_ACCOUNT_IDENTITY' }, 20000);
    if (!response?.success) {
        throw new Error(response?.error || 'Failed to read account identity from tab');
    }

    return {
        accountKey: normalizeAccountKey(response.accountKey),
        source: typeof response.source === 'string' ? response.source : 'unknown',
        isPrimaryCandidate: response.isPrimaryCandidate !== false
    };
}

/**
 * Read subscription sync identity from a YouTube tab.
 * @param {number} tabId
 * @returns {Promise<{accountKey: string, channelId: string, source: string, isPrimaryCandidate: boolean}>}
 */
async function getSubscriptionSyncIdentityFromTab(tabId) {
    const response = await sendMessageToTab(tabId, { type: 'GET_SUBSCRIPTION_SYNC_ACCOUNT_IDENTITY' }, 20000);
    if (!response?.success) {
        throw new Error(response?.error || 'Failed to read subscription account identity from tab');
    }

    return {
        accountKey: normalizeAccountKey(response.accountKey),
        channelId: typeof response.channelId === 'string' ? response.channelId.trim() : '',
        source: typeof response.source === 'string' ? response.source : 'unknown',
        isPrimaryCandidate: response.isPrimaryCandidate !== false
    };
}

/**
 * Check whether account key is a portable YouTube channel-based subscription key.
 * @param {any} rawAccountKey
 * @returns {boolean}
 */
function isSubscriptionChannelAccountKey(rawAccountKey) {
    const normalized = normalizeAccountKey(rawAccountKey);
    return normalized.startsWith(`${SUBSCRIPTION_ACCOUNT_KEY_PREFIX}UC`)
        && /^ytch:UC[A-Za-z0-9_-]{20,}$/.test(normalized);
}

/**
 * Persist locked primary account key.
 * @param {string} accountKey
 * @returns {Promise<string>}
 */
async function setPrimarySyncAccountKey(accountKey) {
    const normalized = normalizeAccountKey(accountKey);
    await storageLocalSet({
        [CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]: normalized
    });

    const queue = await readPendingQueue(normalized);
    await storageLocalSet({
        [CLOUD_SYNC_STORAGE_KEYS.PENDING_QUEUE]: queue,
        [CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]: queue.length
    });

    return normalized;
}

/**
 * Lock primary sync account from current/target tab.
 * @param {number} tabId
 * @returns {Promise<{accountKey: string, source: string}>}
 */
async function lockPrimarySyncAccountFromTab(tabId) {
    const identity = await getSyncIdentityFromTab(tabId);
    const accountKey = normalizeAccountKey(identity.accountKey);
    if (!isSubscriptionChannelAccountKey(accountKey)) {
        throw new Error('Failed to resolve the signed-in YouTube channel from tab');
    }
    const lockedKey = await setPrimarySyncAccountKey(accountKey);
    return {
        accountKey: lockedKey,
        source: identity.source
    };
}

/**
 * Lock subscription sync account from current/target tab.
 * @param {number} tabId
 * @returns {Promise<{accountKey: string, source: string}>}
 */
async function lockSubscriptionSyncAccountFromTab(tabId) {
    const identity = await getSubscriptionSyncIdentityFromTab(tabId);
    const accountKey = normalizeAccountKey(identity.accountKey);
    if (!isSubscriptionChannelAccountKey(accountKey)) {
        throw new Error('Failed to resolve the signed-in YouTube channel from tab');
    }
    await storageLocalSet({
        [SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]: accountKey
    });
    return {
        accountKey,
        source: identity.source
    };
}

/**
 * Persist locked subscription account key.
 * @param {string} accountKey
 * @returns {Promise<string>}
 */
async function setSubscriptionSyncAccountKey(accountKey) {
    const normalized = normalizeAccountKey(accountKey);
    if (!isSubscriptionChannelAccountKey(normalized)) {
        throw new Error('Subscription sync requires a YouTube channel-based account key');
    }

    await storageLocalSet({
        [SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]: normalized
    });

    return normalized;
}

/**
 * Resolve a portable subscription sync account key for sync/restore actions.
 * @param {{accountKey?: string, preferredTabId?: number, state?: any}} options
 * @returns {Promise<{accountKey: string, source: string, usedTabId: number, createdTab: boolean}>}
 */
async function resolveSubscriptionSyncAccountKey(options = {}) {
    const explicitAccountKey = normalizeAccountKey(options.accountKey);
    if (isSubscriptionChannelAccountKey(explicitAccountKey)) {
        return {
            accountKey: explicitAccountKey,
            source: 'provided',
            usedTabId: 0,
            createdTab: false
        };
    }

    const state = options.state || await readSubscriptionSyncState();
    const storedAccountKey = normalizeAccountKey(state.primaryAccountKey);
    if (isSubscriptionChannelAccountKey(storedAccountKey)) {
        return {
            accountKey: storedAccountKey,
            source: 'stored',
            usedTabId: 0,
            createdTab: false
        };
    }

    let createdTab = false;
    let usedTabId = 0;

    const preferredTabId = Number.isFinite(options.preferredTabId) ? Number(options.preferredTabId) : 0;
    if (preferredTabId) {
        const hasReceiver = await hasWatchedHistoryReceiver(preferredTabId, 1);
        if (hasReceiver) {
            usedTabId = preferredTabId;
        }
    }

    if (!usedTabId) {
        const tabInfo = await resolveYouTubeTabForHistory();
        createdTab = tabInfo.created;
        usedTabId = tabInfo.tabId;
    }

    try {
        const identity = await getSubscriptionSyncIdentityFromTab(usedTabId);
        const accountKey = await setSubscriptionSyncAccountKey(identity.accountKey);
        return {
            accountKey,
            source: identity.source,
            usedTabId,
            createdTab
        };
    } catch (error) {
        if (createdTab && usedTabId) {
            await removeTab(usedTabId);
        }
        throw error;
    }
}

/**
 * Resolve sync account key for manual actions.
 * If no primary account is locked yet, lock it to current active YouTube tab.
 * @param {number|undefined} preferredTabId
 * @returns {Promise<string>}
 */
async function resolveManualSyncAccountKey(preferredTabId) {
    const result = await storageLocalGet([CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    const currentPrimary = normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    if (isSubscriptionChannelAccountKey(currentPrimary)) {
        return currentPrimary;
    }

    let tabId = Number.isFinite(preferredTabId) ? Number(preferredTabId) : 0;
    if (!tabId) {
        const candidates = await getYouTubeTabCandidates();
        tabId = candidates.find((tab) => tab.active && typeof tab.id === 'number')?.id || 0;
    }

    if (!tabId) {
        return currentPrimary || DEFAULT_ACCOUNT_KEY;
    }

    try {
        const locked = await lockPrimarySyncAccountFromTab(tabId);
        return locked.accountKey;
    } catch (_error) {
        return DEFAULT_ACCOUNT_KEY;
    }
}

/**
 * Auto-lock first observed non-default account as primary to preserve old auto-sync behavior.
 * @param {string} accountKey
 * @param {chrome.tabs.Tab|undefined} senderTab
 * @returns {Promise<void>}
 */
async function autoLockPrimaryAccountIfMissing(accountKey, senderTab) {
    const candidateKey = normalizeAccountKey(accountKey);
    if (!candidateKey || candidateKey === DEFAULT_ACCOUNT_KEY) {
        return;
    }
    if (!isSubscriptionChannelAccountKey(candidateKey)) {
        return;
    }

    if (senderTab?.incognito === true) {
        return;
    }

    const result = await storageLocalGet([CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    const currentPrimary = normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    if (isSubscriptionChannelAccountKey(currentPrimary)) {
        return;
    }

    await setPrimarySyncAccountKey(candidateKey);
}

/**
 * Parse URL and validate protocol.
 * @param {string} rawEndpoint
 * @returns {URL}
 */
function parseCloudflareEndpoint(rawEndpoint) {
    const value = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
    if (!value) {
        throw new Error('Cloudflare endpoint is required');
    }

    let url = null;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new Error('Cloudflare endpoint URL is invalid');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Cloudflare endpoint must use http/https');
    }

    return url;
}
/**
 * Parse subscription sync endpoint.
 * @param {string} rawEndpoint
 * @returns {URL}
 */
function parseSubscriptionEndpoint(rawEndpoint) {
    const value = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
    if (!value) {
        throw new Error('Subscription sync endpoint is required');
    }

    let url = null;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new Error('Subscription sync endpoint URL is invalid');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Subscription sync endpoint must use http/https');
    }

    return url;
}

/**
 * Normalize subscription sync endpoint path.
 * @param {string} rawEndpoint
 * @returns {URL}
 */
function buildSubscriptionEndpoint(rawEndpoint) {
    const endpoint = parseSubscriptionEndpoint(rawEndpoint);
    const pathname = endpoint.pathname || '/';

    if (pathname.endsWith('/subscriptions')) {
        return endpoint;
    }

    if (pathname.endsWith('/subscriptions/')) {
        endpoint.pathname = pathname.slice(0, -1);
        return endpoint;
    }

    if (pathname.endsWith('/sync')) {
        endpoint.pathname = `${pathname.slice(0, -5)}/subscriptions`;
        return endpoint;
    }

    if (pathname.endsWith('/sync/')) {
        endpoint.pathname = `${pathname.slice(0, -6)}/subscriptions`;
        return endpoint;
    }

    if (pathname === '/' || pathname === '') {
        endpoint.pathname = '/subscriptions';
        return endpoint;
    }

    endpoint.pathname = pathname.endsWith('/') ? `${pathname}subscriptions` : `${pathname}/subscriptions`;
    return endpoint;
}

/**
 * Build pull endpoint URL from sync endpoint.
 * @param {URL} syncEndpoint
 * @returns {URL}
 */
function buildCloudflarePullEndpoint(syncEndpoint) {
    const pullUrl = new URL(syncEndpoint.toString());
    if (pullUrl.pathname.endsWith('/sync')) {
        pullUrl.pathname = `${pullUrl.pathname.slice(0, -5)}/pull`;
    } else if (pullUrl.pathname.endsWith('/sync/')) {
        pullUrl.pathname = `${pullUrl.pathname.slice(0, -6)}/pull`;
    } else if (pullUrl.pathname.endsWith('/')) {
        pullUrl.pathname = `${pullUrl.pathname}pull`;
    } else {
        pullUrl.pathname = `${pullUrl.pathname}/pull`;
    }
    return pullUrl;
}

/**
 * Parse JSON safely.
 * @param {string} text
 * @returns {any}
 */
function parseJsonSafe(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

/**
 * Normalize sync interval.
 * @param {number|string} raw
 * @returns {number}
 */
function normalizeSyncInterval(raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        return CLOUD_SYNC_DEFAULTS.intervalMinutes;
    }

    if (parsed <= 1) {
        return 1;
    }
    if (parsed <= 15) {
        return 15;
    }
    if (parsed <= 30) {
        return 30;
    }
    if (parsed <= 60) {
        return 60;
    }
    if (parsed <= 120) {
        return 120;
    }
    if (parsed <= 180) {
        return 180;
    }
    if (parsed <= 240) {
        return 240;
    }
    if (parsed <= 720) {
        return 720;
    }
    if (parsed <= 1440) {
        return 1440;
    }
    return 1440;
}
/**
 * Normalize subscription sync interval.
 * @param {number|string} raw
 * @returns {number}
 */
function normalizeSubscriptionInterval(raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        return SUBSCRIPTION_SYNC_DEFAULTS.intervalMinutes;
    }

    if (parsed <= 1) {
        return 1;
    }
    if (parsed <= 15) {
        return 15;
    }
    if (parsed <= 30) {
        return 30;
    }
    if (parsed <= 60) {
        return 60;
    }
    if (parsed <= 120) {
        return 120;
    }
    if (parsed <= 180) {
        return 180;
    }
    if (parsed <= 240) {
        return 240;
    }
    if (parsed <= 720) {
        return 720;
    }
    if (parsed <= 1440) {
        return 1440;
    }
    return 1440;
}

/**
 * Keep valid unique video IDs only.
 * @param {string[]} ids
 * @returns {string[]}
 */
function normalizeVideoIds(ids) {
    const unique = [];
    const seen = new Set();

    for (const rawId of ids || []) {
        const videoId = typeof rawId === 'string' ? rawId.trim() : '';
        if (!/^[A-Za-z0-9_-]{10,15}$/.test(videoId) || seen.has(videoId)) {
            continue;
        }

        seen.add(videoId);
        unique.push(videoId);
    }

    return unique;
}

/**
 * Serialize pending-queue mutations to avoid lost updates from concurrent
 * read-modify-write operations.
 * @template T
 * @param {() => Promise<T>} mutator
 * @returns {Promise<T>}
 */
function runPendingQueueMutation(mutator) {
    const run = pendingQueueMutationChain.then(() => mutator(), () => mutator());
    pendingQueueMutationChain = run.catch(() => undefined);
    return run;
}

/**
 * Normalize account key used for cloud-sync queue partitioning.
 * @param {any} rawAccountKey
 * @returns {string}
 */
function normalizeAccountKey(rawAccountKey) {
    const value = typeof rawAccountKey === 'string' ? rawAccountKey.trim() : '';
    if (!value) {
        return DEFAULT_ACCOUNT_KEY;
    }

    const cleaned = value.replace(/[^A-Za-z0-9:_-]/g, '');
    if (!cleaned) {
        return DEFAULT_ACCOUNT_KEY;
    }

    return cleaned.slice(0, 120);
}

/**
 * Keep only valid account queues.
 * @param {any} rawValue
 * @returns {Record<string, string[]>}
 */
function normalizePendingByAccount(rawValue) {
    const normalized = {};
    if (!rawValue || typeof rawValue !== 'object') {
        return normalized;
    }

    for (const [rawKey, rawQueue] of Object.entries(rawValue)) {
        const accountKey = normalizeAccountKey(rawKey);
        const videoIds = normalizeVideoIds(Array.isArray(rawQueue) ? rawQueue : []);
        if (videoIds.length === 0) {
            continue;
        }
        normalized[accountKey] = videoIds;
    }

    return normalized;
}

/**
 * Ensure new per-account queue exists (migrate from legacy global queue if needed).
 * @returns {Promise<void>}
 */
async function ensurePendingQueueMigration() {
    const result = await storageLocalGet([
        CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT,
        CLOUD_SYNC_STORAGE_KEYS.PENDING_QUEUE,
        CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY
    ]);
    const existingMap = normalizePendingByAccount(result[CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT]);
    if (Object.keys(existingMap).length > 0) {
        return;
    }

    const legacyQueue = normalizeVideoIds(result[CLOUD_SYNC_STORAGE_KEYS.PENDING_QUEUE]);
    if (legacyQueue.length === 0) {
        return;
    }

    const primaryAccountKey = normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    const migratedMap = {
        [primaryAccountKey]: legacyQueue
    };

    await storageLocalSet({
        [CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT]: migratedMap
    });
}

/**
 * Read pending queues for all accounts.
 * @returns {Promise<Record<string, string[]>>}
 */
async function readPendingByAccount() {
    await ensurePendingQueueMigration();
    const result = await storageLocalGet([CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT]);
    return normalizePendingByAccount(result[CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT]);
}

/**
 * Resolve account key used for syncing in current operation.
 * @returns {Promise<string>}
 */
async function resolveSyncAccountKey() {
    const result = await storageLocalGet([CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    const primaryAccountKey = normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    if (isSubscriptionChannelAccountKey(primaryAccountKey)) {
        return primaryAccountKey;
    }
    return DEFAULT_ACCOUNT_KEY;
}

/**
 * Persist pending queues and mirrored legacy status fields for popup compatibility.
 * @param {Record<string, string[]>} pendingByAccount
 * @returns {Promise<void>}
 */
async function writePendingByAccount(pendingByAccount) {
    const normalizedMap = normalizePendingByAccount(pendingByAccount);
    const activeAccountKey = normalizeAccountKey(await resolveSyncAccountKey());
    const activeQueue = normalizeVideoIds(normalizedMap[activeAccountKey] || []);

    await storageLocalSet({
        [CLOUD_SYNC_STORAGE_KEYS.PENDING_BY_ACCOUNT]: normalizedMap,
        [CLOUD_SYNC_STORAGE_KEYS.PENDING_QUEUE]: activeQueue,
        [CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]: activeQueue.length
    });
}

/**
 * Read pending queue for a single account.
 * @param {string} [accountKey]
 * @returns {Promise<string[]>}
 */
async function readPendingQueue(accountKey) {
    const pendingByAccount = await readPendingByAccount();
    const scopedAccountKey = normalizeAccountKey(accountKey || await resolveSyncAccountKey());
    return normalizeVideoIds(pendingByAccount[scopedAccountKey] || []);
}

/**
 * Persist pending queue for one account.
 * @param {string[]} videoIds
 * @param {string} [accountKey]
 * @returns {Promise<void>}
 */
async function writePendingQueue(videoIds, accountKey) {
    const pendingByAccount = await readPendingByAccount();
    const scopedAccountKey = normalizeAccountKey(accountKey || await resolveSyncAccountKey());
    const normalizedQueue = normalizeVideoIds(videoIds);

    if (normalizedQueue.length > 0) {
        pendingByAccount[scopedAccountKey] = normalizedQueue;
    } else {
        delete pendingByAccount[scopedAccountKey];
    }

    await writePendingByAccount(pendingByAccount);
}

/**
 * Add IDs to pending queue (deduped) for selected account.
 * @param {string[]} incomingVideoIds
 * @param {string} [accountKey]
 * @returns {Promise<number>}
 */
async function enqueuePendingVideoIds(incomingVideoIds, accountKey) {
    const incoming = normalizeVideoIds(incomingVideoIds);
    const scopedAccountKey = normalizeAccountKey(accountKey || await resolveSyncAccountKey());

    return runPendingQueueMutation(async () => {
        if (incoming.length === 0) {
            const current = await readPendingQueue(scopedAccountKey);
            return current.length;
        }

        const current = await readPendingQueue(scopedAccountKey);
        const merged = normalizeVideoIds(current.concat(incoming));
        await writePendingQueue(merged, scopedAccountKey);
        return merged.length;
    });
}

/**
 * Remove IDs from pending queue.
 * @param {string[]} syncedIds
 * @param {string} [accountKey]
 * @returns {Promise<number>}
 */
async function removePendingVideoIds(syncedIds, accountKey) {
    const removeSet = new Set(normalizeVideoIds(syncedIds));
    const scopedAccountKey = normalizeAccountKey(accountKey || await resolveSyncAccountKey());
    return runPendingQueueMutation(async () => {
        if (removeSet.size === 0) {
            const current = await readPendingQueue(scopedAccountKey);
            return current.length;
        }

        const current = await readPendingQueue(scopedAccountKey);
        const next = current.filter((videoId) => !removeSet.has(videoId));
        await writePendingQueue(next, scopedAccountKey);
        return next.length;
    });
}

/**
 * Compute retry backoff in minutes.
 * @param {number} failureCount
 * @returns {number}
 */
function computeBackoffMinutes(failureCount) {
    if (!Number.isFinite(failureCount) || failureCount <= 0) {
        return 0;
    }

    const minutes = 5 * (2 ** (failureCount - 1));
    return Math.min(60, Math.max(5, minutes));
}

/**
 * Read current cloud sync settings/state.
 * @returns {Promise<object>}
 */
async function readCloudSyncState() {
    const result = await storageLocalGet([
        CLOUD_SYNC_STORAGE_KEYS.ENDPOINT,
        CLOUD_SYNC_STORAGE_KEYS.API_TOKEN,
        CLOUD_SYNC_STORAGE_KEYS.AUTO_ENABLED,
        CLOUD_SYNC_STORAGE_KEYS.INTERVAL_MINUTES,
        CLOUD_SYNC_STORAGE_KEYS.LAST_AT,
        CLOUD_SYNC_STORAGE_KEYS.STATUS,
        CLOUD_SYNC_STORAGE_KEYS.ERROR,
        CLOUD_SYNC_STORAGE_KEYS.COUNT,
        CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT,
        CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY,
        CLOUD_SYNC_STORAGE_KEYS.FAILURE_COUNT,
        CLOUD_SYNC_STORAGE_KEYS.BACKOFF_UNTIL,
        CLOUD_SYNC_STORAGE_KEYS.QUEUE_SEEDED
    ]);

    return {
        endpointUrl: typeof result[CLOUD_SYNC_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[CLOUD_SYNC_STORAGE_KEYS.ENDPOINT].trim()
            : '',
        apiToken: typeof result[CLOUD_SYNC_STORAGE_KEYS.API_TOKEN] === 'string'
            ? result[CLOUD_SYNC_STORAGE_KEYS.API_TOKEN].trim()
            : '',
        autoEnabled: result[CLOUD_SYNC_STORAGE_KEYS.AUTO_ENABLED] !== false,
        intervalMinutes: normalizeSyncInterval(result[CLOUD_SYNC_STORAGE_KEYS.INTERVAL_MINUTES]),
        lastAt: Number(result[CLOUD_SYNC_STORAGE_KEYS.LAST_AT]) || 0,
        status: typeof result[CLOUD_SYNC_STORAGE_KEYS.STATUS] === 'string'
            ? result[CLOUD_SYNC_STORAGE_KEYS.STATUS]
            : '',
        error: typeof result[CLOUD_SYNC_STORAGE_KEYS.ERROR] === 'string'
            ? result[CLOUD_SYNC_STORAGE_KEYS.ERROR]
            : '',
        count: Number(result[CLOUD_SYNC_STORAGE_KEYS.COUNT]) || 0,
        pendingCount: Number(result[CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]) || 0,
        primaryAccountKey: normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]),
        failureCount: Number(result[CLOUD_SYNC_STORAGE_KEYS.FAILURE_COUNT]) || CLOUD_SYNC_DEFAULTS.failureCount,
        backoffUntil: Number(result[CLOUD_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]) || CLOUD_SYNC_DEFAULTS.backoffUntil,
        queueSeeded: result[CLOUD_SYNC_STORAGE_KEYS.QUEUE_SEEDED] === true
    };
}
/**
 * Read current subscription sync settings/state.
 * @returns {Promise<object>}
 */
async function readSubscriptionSyncState() {
    const result = await storageLocalGet([
        SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.AUTO_ENABLED,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.INTERVAL_MINUTES,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.LAST_AT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.FAILURE_COUNT,
        SUBSCRIPTION_SYNC_STORAGE_KEYS.BACKOFF_UNTIL
    ]);

    return {
        endpointUrl: typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT].trim()
            : '',
        apiToken: typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN] === 'string'
            ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN].trim()
            : '',
        autoEnabled: result[SUBSCRIPTION_SYNC_STORAGE_KEYS.AUTO_ENABLED] !== false,
        intervalMinutes: normalizeSubscriptionInterval(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.INTERVAL_MINUTES]),
        lastAt: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.LAST_AT]) || 0,
        status: typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS] === 'string'
            ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS]
            : '',
        error: typeof result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR] === 'string'
            ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR]
            : '',
        count: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.COUNT]) || 0,
        pendingCount: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]) || 0,
        pendingKeys: Array.isArray(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS])
            ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]
            : [],
        primaryAccountKey: normalizeAccountKey(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]),
        failureCount: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.FAILURE_COUNT]) || SUBSCRIPTION_SYNC_DEFAULTS.failureCount,
        backoffUntil: Number(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]) || SUBSCRIPTION_SYNC_DEFAULTS.backoffUntil
    };
}

/**
 * Read subscription pending sync keys.
 * @returns {Promise<string[]>}
 */
async function readSubscriptionPendingKeys() {
    const result = await storageLocalGet([SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]);
    const pending = Array.isArray(result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS])
        ? result[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]
        : [];
    return pending.filter((key) => typeof key === 'string' && key.trim());
}

/**
 * Ensure periodic auto-sync alarm matches configured settings.
 * @returns {Promise<void>}
 */
async function ensureAutoSyncAlarm() {
    const state = await readCloudSyncState();

    if (!state.autoEnabled || !state.endpointUrl) {
        await clearAlarm(AUTO_SYNC_ALARM_NAME);
        return;
    }

    const existingAlarm = await getAlarm(AUTO_SYNC_ALARM_NAME);
    const existingPeriod = Number(existingAlarm?.periodInMinutes) || 0;
    if (existingAlarm && Math.abs(existingPeriod - AUTO_SYNC_CHECK_PERIOD_MINUTES) < 0.0001) {
        return;
    }

    await clearAlarm(AUTO_SYNC_ALARM_NAME);
    chrome.alarms.create(AUTO_SYNC_ALARM_NAME, {
        delayInMinutes: AUTO_SYNC_CHECK_PERIOD_MINUTES,
        periodInMinutes: AUTO_SYNC_CHECK_PERIOD_MINUTES
    });
}
/**
 * Ensure periodic subscription auto-sync alarm matches configured settings.
 * @returns {Promise<void>}
 */
async function ensureSubscriptionAutoSyncAlarm() {
    const state = await readSubscriptionSyncState();

    if (!state.autoEnabled || !state.endpointUrl) {
        await clearAlarm(SUBSCRIPTION_SYNC_ALARM_NAME);
        return;
    }

    const existingAlarm = await getAlarm(SUBSCRIPTION_SYNC_ALARM_NAME);
    const existingPeriod = Number(existingAlarm?.periodInMinutes) || 0;
    if (existingAlarm && Math.abs(existingPeriod - SUBSCRIPTION_SYNC_CHECK_PERIOD_MINUTES) < 0.0001) {
        return;
    }

    await clearAlarm(SUBSCRIPTION_SYNC_ALARM_NAME);
    chrome.alarms.create(SUBSCRIPTION_SYNC_ALARM_NAME, {
        delayInMinutes: SUBSCRIPTION_SYNC_CHECK_PERIOD_MINUTES,
        periodInMinutes: SUBSCRIPTION_SYNC_CHECK_PERIOD_MINUTES
    });
}

/**
 * Compute the next due timestamp based on last successful sync + interval.
 * If there was no successful sync yet, sync is considered immediately due.
 * @param {{autoEnabled: boolean, endpointUrl: string, intervalMinutes: number, lastAt: number}} state
 * @returns {number}
 */
function getNextSyncAt(state) {
    if (!state.autoEnabled || !state.endpointUrl) {
        return 0;
    }

    const intervalMs = normalizeSyncInterval(state.intervalMinutes) * 60 * 1000;
    const lastAt = Number(state.lastAt) || 0;
    if (lastAt <= 0) {
        return Date.now();
    }
    return lastAt + intervalMs;
}

/**
 * Run auto sync only when interval has elapsed since last successful sync.
 * @param {string} source
 * @returns {Promise<void>}
 */
async function runAutoSyncIfDue(source) {
    const state = await readCloudSyncState();
    if (!state.autoEnabled || !state.endpointUrl) {
        return;
    }

    const nextSyncAt = getNextSyncAt(state);
    if (nextSyncAt > Date.now()) {
        return;
    }

    await performCloudflareSync({
        manual: false,
        source
    });
}
/**
 * Run subscription auto sync only when interval has elapsed since last successful sync.
 * @param {string} source
 * @returns {Promise<void>}
 */
async function runSubscriptionAutoSyncIfDue(source) {
    const state = await readSubscriptionSyncState();
    if (!state.autoEnabled || !state.endpointUrl) {
        return;
    }

    const nextSyncAt = getNextSyncAt(state);
    if (nextSyncAt > Date.now()) {
        return;
    }

    await performSubscriptionSync({
        manual: false,
        source
    });
}

/**
 * Request pending sync IDs from content script.
 * @param {number} tabId
 * @param {number} limit
 * @returns {Promise<string[]>}
 */
async function getPendingSyncVideoIdsFromTab(tabId, limit) {
    const response = await sendMessageToTab(tabId, {
        type: 'GET_PENDING_SYNC_VIDEO_IDS',
        limit
    });

    if (!response?.success) {
        throw new Error(response?.error || 'Failed to read pending sync IDs');
    }

    return normalizeVideoIds(response.videoIds);
}

/**
 * Ack synced IDs in content script queue.
 * @param {number} tabId
 * @param {string[]} videoIds
 * @returns {Promise<number>}
 */
async function ackSyncedVideoIdsInTab(tabId, videoIds) {
    const response = await sendMessageToTab(tabId, {
        type: 'ACK_SYNCED_VIDEO_IDS',
        videoIds
    });

    if (!response?.success) {
        throw new Error(response?.error || 'Failed to ack synced IDs');
    }

    return Number(response.removedCount) || 0;
}

/**
 * Get pending sync queue count from content script.
 * @param {number} tabId
 * @returns {Promise<number>}
 */
async function getPendingSyncCountFromTab(tabId) {
    const response = await sendMessageToTab(tabId, { type: 'GET_PENDING_SYNC_COUNT' });
    if (!response?.success) {
        throw new Error(response?.error || 'Failed to read pending sync count');
    }
    return Number(response.count) || 0;
}

/**
 * Seed sync queue from existing local watched history.
 * @param {number} tabId
 * @returns {Promise<number>}
 */
async function seedSyncQueueFromHistoryInTab(tabId) {
    const response = await sendMessageToTab(tabId, { type: 'SEED_SYNC_QUEUE_FROM_HISTORY' });
    if (!response?.success) {
        throw new Error(response?.error || 'Failed to seed sync queue');
    }
    return Number(response.seededCount) || 0;
}
/**
 * Get subscription snapshot from content script.
 * @param {number} tabId
 * @returns {Promise<{channels: object[], fetchedAt: number, hash: string}>}
 */
async function getSubscriptionSnapshotFromTab(tabId) {
    const response = await sendMessageToTab(tabId, { type: 'GET_SUBSCRIPTION_SNAPSHOT' }, 60000);
    if (!response?.success) {
        throw new Error(response?.error || 'Failed to read subscription snapshot');
    }

    return {
        channels: Array.isArray(response.channels) ? response.channels : [],
        fetchedAt: Number(response.fetchedAt) || 0,
        hash: typeof response.hash === 'string' ? response.hash : ''
    };
}

/**
 * Post one sync batch to Cloudflare.
 * @param {URL} endpoint
 * @param {string} apiToken
 * @param {string[]} videoIds
 * @param {string} [accountKey]
 * @returns {Promise<any>}
 */
async function postCloudflareSyncBatch(endpoint, apiToken, videoIds, accountKey) {
    const payload = { videoIds };
    if (isSubscriptionChannelAccountKey(accountKey)) {
        payload.accountKey = accountKey;
    }
    console.info('[YT-Commander][CloudSync] Sending batch to API', {
        endpoint: endpoint.toString(),
        count: videoIds.length,
        firstIds: videoIds.slice(0, 5),
        lastIds: videoIds.slice(-3)
    });

    const headers = {
        'Content-Type': 'application/json',
        'X-YT-Commander-Client': 'chrome-extension'
    };

    if (apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
        headers['X-YT-Commander-Key'] = apiToken;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLOUDFLARE_SYNC_REQUEST_TIMEOUT_MS);

    let response = null;
    try {
        response = await fetch(endpoint.toString(), {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error('Cloudflare request timed out');
        }
        const rawMessage = typeof error?.message === 'string' ? error.message : '';
        if (error instanceof TypeError || /failed to fetch|networkerror|fetch/i.test(rawMessage)) {
            throw new Error(
                'Failed to establish connection to Cloudflare. Verify Worker URL (use https://.../sync), deployment, and network access.'
            );
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }

    let rawBody = '';
    try {
        rawBody = await response.text();
    } catch (_error) {
        rawBody = '';
    }

    const parsedBody = parseJsonSafe(rawBody);
    if (!response.ok) {
        const bodyMessage = typeof parsedBody?.error === 'string'
            ? parsedBody.error
            : (rawBody.replace(/\s+/g, ' ').trim().slice(0, 220) || 'Unknown error');
        throw new Error(`Cloudflare sync failed (${response.status}): ${bodyMessage}`);
    }

    console.info('[YT-Commander][CloudSync] API response received', {
        status: response.status,
        count: videoIds.length,
        body: parsedBody || rawBody || null
    });

    return parsedBody || rawBody || null;
}
/**
 * Post subscription sync payload to Cloudflare worker.
 * @param {URL} endpoint
 * @param {string} apiToken
 * @param {object} payload
 * @returns {Promise<any>}
 */
async function postSubscriptionSyncPayload(endpoint, apiToken, payload) {
    const headers = {
        'Content-Type': 'application/json',
        'X-YT-Commander-Client': 'chrome-extension'
    };

    if (apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
        headers['X-YT-Commander-Key'] = apiToken;
    }

    const response = await fetch(endpoint.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    const parsedBody = parseJsonSafe(rawBody);

    if (!response.ok) {
        const message = typeof parsedBody?.error === 'string'
            ? parsedBody.error
            : (rawBody.replace(/\s+/g, ' ').trim().slice(0, 220) || 'Unknown error');
        throw new Error(`Subscription sync failed (${response.status}): ${message}`);
    }

    return parsedBody || { ok: true };
}

/**
 * Fetch subscription payload from Cloudflare.
 * @param {URL} endpoint
 * @param {string} apiToken
 * @param {string} accountKey
 * @returns {Promise<any>}
 */
async function fetchSubscriptionRestorePayload(endpoint, apiToken, accountKey) {
    const requestUrl = new URL(endpoint.toString());
    if (accountKey) {
        requestUrl.searchParams.set('accountKey', accountKey);
    }

    const headers = {
        'X-YT-Commander-Client': 'chrome-extension'
    };

    if (apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
        headers['X-YT-Commander-Key'] = apiToken;
    }

    const response = await fetch(requestUrl.toString(), {
        method: 'GET',
        headers
    });

    const rawBody = await response.text();
    const parsedBody = parseJsonSafe(rawBody);

    if (!response.ok) {
        const message = typeof parsedBody?.error === 'string'
            ? parsedBody.error
            : (rawBody.replace(/\s+/g, ' ').trim().slice(0, 220) || 'Unknown error');
        throw new Error(`Subscription restore failed (${response.status}): ${message}`);
    }

    return parsedBody || {};
}

/**
 * Fetch one page of IDs from Cloudflare pull endpoint.
 * @param {URL} pullEndpoint
 * @param {string} apiToken
 * @param {string|null} cursor
 * @param {number} limit
 * @returns {Promise<{videoIds: string[], nextCursor: string|null, hasMore: boolean}>}
 */
async function fetchCloudflarePullPage(pullEndpoint, apiToken, cursor, limit, accountKey) {
    const requestUrl = new URL(pullEndpoint.toString());
    requestUrl.searchParams.set('limit', String(Math.max(1, Math.min(limit, 1000))));
    if (typeof cursor === 'string' && cursor) {
        requestUrl.searchParams.set('cursor', cursor);
    }
    if (accountKey) {
        requestUrl.searchParams.set('accountKey', accountKey);
    }

    const headers = {
        'X-YT-Commander-Client': 'chrome-extension'
    };
    if (apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
        headers['X-YT-Commander-Key'] = apiToken;
    }

    let response = null;
    try {
        response = await fetch(requestUrl.toString(), {
            method: 'GET',
            headers
        });
    } catch (error) {
        const message = typeof error?.message === 'string' ? error.message : 'Network error';
        throw new Error(`Failed to download from Cloudflare pull endpoint: ${message}`);
    }

    const rawBody = await response.text().catch(() => '');
    const parsedBody = parseJsonSafe(rawBody);

    if (response.status === 404) {
        throw new Error('Cloudflare /pull endpoint not found. Update your Worker script to support GET /pull.');
    }

    if (!response.ok) {
        const bodyMessage = typeof parsedBody?.error === 'string'
            ? parsedBody.error
            : (rawBody.replace(/\s+/g, ' ').trim().slice(0, 220) || 'Unknown error');
        throw new Error(`Cloudflare pull failed (${response.status}): ${bodyMessage}`);
    }

    const rawIds = Array.isArray(parsedBody?.videoIds)
        ? parsedBody.videoIds
        : Array.isArray(parsedBody?.records)
            ? parsedBody.records.map((item) => item?.videoId)
            : [];

    const videoIds = normalizeVideoIds(rawIds);
    const nextCursor = typeof parsedBody?.nextCursor === 'string'
        ? parsedBody.nextCursor
        : (parsedBody?.nextCursor != null ? String(parsedBody.nextCursor) : null);
    const hasMore = parsedBody?.hasMore === true || (videoIds.length >= limit && Boolean(nextCursor));

    return { videoIds, nextCursor, hasMore };
}

/**
 * Import IDs into local watched IndexedDB through content script.
 * @param {number} tabId
 * @param {string[]} videoIds
 * @returns {Promise<number>}
 */
async function importVideoIdsIntoLocalHistory(tabId, videoIds) {
    const response = await sendMessageToTab(tabId, {
        type: 'IMPORT_WATCHED_VIDEOS',
        videoIds,
        options: { skipSyncQueue: true }
    }, 45000);

    if (!response?.success) {
        throw new Error(response?.error || 'Failed to import IDs into local watched history');
    }

    return Number(response.count) || 0;
}

/**
 * Download IDs from Cloudflare and import into local IndexedDB.
 * @param {{endpointUrl?: string, apiToken?: string}} options
 * @returns {Promise<{pulledCount: number, importedCount: number, pageCount: number}>}
 */
async function downloadFromCloudflare(options = {}) {
    if (cloudSyncInProgress) {
        throw new Error('Sync is already in progress');
    }

    const state = await readCloudSyncState();
    const endpointRaw = typeof options.endpointUrl === 'string' && options.endpointUrl.trim()
        ? options.endpointUrl.trim()
        : state.endpointUrl;
    const apiToken = typeof options.apiToken === 'string'
        ? options.apiToken.trim()
        : state.apiToken;

    const syncEndpoint = parseCloudflareEndpoint(endpointRaw);
    const pullEndpoint = buildCloudflarePullEndpoint(syncEndpoint);
    const resolvedAccountKey = await resolveSyncAccountKey();
    const accountKey = isSubscriptionChannelAccountKey(resolvedAccountKey)
        ? resolvedAccountKey
        : '';

    cloudSyncInProgress = true;

    let createdTab = false;
    let tabId = 0;

    try {
        const tabInfo = await resolveYouTubeTabForHistory();
        createdTab = tabInfo.created;
        tabId = tabInfo.tabId;

        let cursor = null;
        let pageCount = 0;
        let pulledCount = 0;
        let importedCount = 0;
        const pageLimit = 1000;
        const maxPages = 5000;

        while (pageCount < maxPages) {
            const page = await fetchCloudflarePullPage(pullEndpoint, apiToken, cursor, pageLimit, accountKey);
            pageCount += 1;

            if (page.videoIds.length === 0) {
                break;
            }

            pulledCount += page.videoIds.length;
            importedCount += await importVideoIdsIntoLocalHistory(tabId, page.videoIds);

            console.info('[YT-Commander][CloudSync] Pulled page from Cloudflare', {
                page: pageCount,
                pulled: page.videoIds.length,
                importedTotal: importedCount,
                cursor: page.nextCursor || null
            });

            if (!page.hasMore) {
                break;
            }

            if (!page.nextCursor || page.nextCursor === cursor) {
                break;
            }

            cursor = page.nextCursor;
        }

        return { pulledCount, importedCount, pageCount };
    } finally {
        if (createdTab && tabId) {
            await removeTab(tabId);
        }
        cloudSyncInProgress = false;
    }
}

/**
 * Perform queue-based cloud sync.
 * @param {{manual?: boolean, endpointUrl?: string, apiToken?: string, source?: string, activeTabId?: number}} options
 * @returns {Promise<object>}
 */
async function performCloudflareSync(options = {}) {
    if (cloudSyncInProgress) {
        return {
            success: true,
            skipped: true,
            reason: 'Sync already in progress',
            syncedCount: 0
        };
    }

    const manual = options.manual === true;
    const source = typeof options.source === 'string' ? options.source : 'cloud-sync';

    const state = await readCloudSyncState();
    const endpointRaw = typeof options.endpointUrl === 'string' && options.endpointUrl.trim()
        ? options.endpointUrl.trim()
        : state.endpointUrl;
    const apiToken = typeof options.apiToken === 'string'
        ? options.apiToken.trim()
        : state.apiToken;
    const syncAccountKey = manual
        ? await resolveManualSyncAccountKey(options.activeTabId)
        : await resolveSyncAccountKey();

    const endpoint = parseCloudflareEndpoint(endpointRaw);

    if (!manual && !state.autoEnabled) {
        return {
            success: true,
            skipped: true,
            reason: 'Auto sync disabled',
            syncedCount: 0
        };
    }

    if (!manual && state.backoffUntil > Date.now()) {
        return {
            success: true,
            skipped: true,
            reason: 'Backoff active',
            syncedCount: 0,
            retryAt: state.backoffUntil
        };
    }

    const pendingBefore = await readPendingQueue(syncAccountKey);
    if (pendingBefore.length === 0) {
        await storageLocalSet({
            [CLOUD_SYNC_STORAGE_KEYS.STATUS]: 'idle',
            [CLOUD_SYNC_STORAGE_KEYS.ERROR]: '',
            [CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]: 0
        });

        return {
            success: true,
            skipped: true,
            reason: 'No changes to sync',
            pendingCount: 0
        };
    }

    cloudSyncInProgress = true;
    console.info('[YT-Commander][CloudSync] Sync started', {
        endpoint: endpoint.origin + endpoint.pathname,
        manual,
        source,
        accountKey: syncAccountKey
    });

    try {
        const maxPerRun = manual ? MANUAL_SYNC_MAX_IDS_PER_RUN : AUTO_SYNC_MAX_IDS_PER_RUN;
        let syncedCount = 0;
        let batchCount = 0;
        let lastServerResult = null;

        while (syncedCount < maxPerRun) {
            const pendingQueue = await readPendingQueue(syncAccountKey);
            if (pendingQueue.length === 0) {
                break;
            }

            const remaining = maxPerRun - syncedCount;
            const chunkLimit = Math.min(AUTO_SYNC_CHUNK_SIZE, remaining, pendingQueue.length);
            const videoIds = pendingQueue.slice(0, chunkLimit);

            lastServerResult = await postCloudflareSyncBatch(endpoint, apiToken, videoIds, syncAccountKey);
            await removePendingVideoIds(videoIds, syncAccountKey);

            syncedCount += videoIds.length;
            batchCount += 1;

            if (videoIds.length < chunkLimit) {
                break;
            }
        }

        const pendingCount = (await readPendingQueue(syncAccountKey)).length;

        await storageLocalSet({
            [CLOUD_SYNC_STORAGE_KEYS.ENDPOINT]: endpoint.toString(),
            [CLOUD_SYNC_STORAGE_KEYS.API_TOKEN]: apiToken,
            [CLOUD_SYNC_STORAGE_KEYS.LAST_AT]: Date.now(),
            [CLOUD_SYNC_STORAGE_KEYS.STATUS]: 'success',
            [CLOUD_SYNC_STORAGE_KEYS.ERROR]: '',
            [CLOUD_SYNC_STORAGE_KEYS.COUNT]: syncedCount,
            [CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]: pendingCount,
            [CLOUD_SYNC_STORAGE_KEYS.FAILURE_COUNT]: 0,
            [CLOUD_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]: 0
        });

        return {
            success: true,
            accountKey: syncAccountKey,
            syncedCount,
            pendingCount,
            endpointHost: endpoint.host,
            endpointPath: endpoint.pathname || '/',
            batchCount,
            serverResult: lastServerResult
        };
    } catch (error) {
        const failureCount = (state.failureCount || 0) + 1;
        const backoffMinutes = manual ? 0 : computeBackoffMinutes(failureCount);
        const backoffUntil = backoffMinutes > 0
            ? Date.now() + (backoffMinutes * 60 * 1000)
            : 0;

        await storageLocalSet({
            [CLOUD_SYNC_STORAGE_KEYS.STATUS]: 'error',
            [CLOUD_SYNC_STORAGE_KEYS.ERROR]: error?.message || 'Cloudflare sync failed',
            [CLOUD_SYNC_STORAGE_KEYS.FAILURE_COUNT]: failureCount,
            [CLOUD_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]: backoffUntil
        });

        console.error('[YT-Commander][CloudSync] Sync failed', error);
        throw error;
    } finally {
        cloudSyncInProgress = false;
    }
}
/**
 * Perform subscription sync.
 * @param {{manual?: boolean, endpointUrl?: string, apiToken?: string, source?: string, activeTabId?: number}} options
 * @returns {Promise<object>}
 */
async function performSubscriptionSync(options = {}) {
    if (subscriptionSyncInProgress) {
        return {
            success: true,
            skipped: true,
            reason: 'Sync already in progress',
            syncedCount: 0
        };
    }

    const manual = options.manual === true;
    const source = typeof options.source === 'string' ? options.source : 'subscription-sync';

    const state = await readSubscriptionSyncState();
    const endpointRaw = typeof options.endpointUrl === 'string' && options.endpointUrl.trim()
        ? options.endpointUrl.trim()
        : state.endpointUrl;
    const apiToken = typeof options.apiToken === 'string'
        ? options.apiToken.trim()
        : state.apiToken;

    const endpoint = buildSubscriptionEndpoint(endpointRaw);

    if (!manual && !state.autoEnabled) {
        return {
            success: true,
            skipped: true,
            reason: 'Auto sync disabled',
            syncedCount: 0
        };
    }

    if (!manual && state.backoffUntil > Date.now()) {
        return {
            success: true,
            skipped: true,
            reason: 'Backoff active',
            syncedCount: 0,
            retryAt: state.backoffUntil
        };
    }

    const pendingBefore = await readSubscriptionPendingKeys();
    if (pendingBefore.length === 0) {
        await storageLocalSet({
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS]: 'idle',
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR]: '',
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]: 0
        });

        return {
            success: true,
            skipped: true,
            reason: 'No changes to sync',
            pendingCount: 0
        };
    }

    subscriptionSyncInProgress = true;

    console.info('[YT-Commander][SubscriptionSync] Sync started', {
        endpoint: endpoint.origin + endpoint.pathname,
        manual,
        source
    });

    let createdTab = false;
    let tabId = 0;

    try {
        const requestedTabId = Number.isFinite(options.activeTabId) ? Number(options.activeTabId) : 0;
        const accountResolution = await resolveSubscriptionSyncAccountKey({
            preferredTabId: requestedTabId,
            state
        });

        let accountKey = accountResolution.accountKey;
        if (accountResolution.usedTabId) {
            tabId = accountResolution.usedTabId;
            createdTab = accountResolution.createdTab;
        }

        if (!tabId) {
            if (requestedTabId) {
                const hasReceiver = await hasWatchedHistoryReceiver(requestedTabId, 1);
                if (hasReceiver) {
                    tabId = requestedTabId;
                }
            }

            if (!tabId) {
                const tabInfo = await resolveYouTubeTabForHistory();
                createdTab = tabInfo.created;
                tabId = tabInfo.tabId;
            }
        }

        const snapshot = await getSubscriptionSnapshotFromTab(tabId);
        const pendingKeys = await readSubscriptionPendingKeys();

        const local = await storageLocalGet([
            'subscriptionManagerCategories',
            'subscriptionManagerAssignments'
        ]);

        const categories = Array.isArray(local.subscriptionManagerCategories)
            ? local.subscriptionManagerCategories
                .map((item) => {
                    if (!item || typeof item !== 'object') {
                        return null;
                    }
                    const id = typeof item.id === 'string' ? item.id.trim() : '';
                    const name = typeof item.name === 'string' ? item.name.trim() : '';
                    const color = typeof item.color === 'string' ? item.color : '';
                    if (!id || !name) {
                        return null;
                    }
                    return { id, name, color };
                })
                .filter(Boolean)
            : [];

        const categoryIds = new Set(categories.map((item) => item.id));
        const assignments = {};
        const rawAssignments = local.subscriptionManagerAssignments;
        if (rawAssignments && typeof rawAssignments === 'object') {
            Object.entries(rawAssignments).forEach(([channelId, list]) => {
                if (typeof channelId !== 'string' || !channelId) {
                    return;
                }
                const next = Array.isArray(list)
                    ? list.filter((id) => typeof id === 'string' && id && categoryIds.has(id))
                    : [];
                if (next.length > 0) {
                    assignments[channelId] = Array.from(new Set(next));
                }
            });
        }

        const payload = {
            accountKey,
            syncedAt: Date.now(),
            pendingKeys,
            snapshot: {
                hash: typeof snapshot.hash === 'string' ? snapshot.hash : '',
                fetchedAt: Number(snapshot.fetchedAt) || Date.now(),
                total: Array.isArray(snapshot.channels) ? snapshot.channels.length : 0,
                channels: Array.isArray(snapshot.channels) ? snapshot.channels : []
            },
            categories,
            assignments
        };

        const serverResult = await postSubscriptionSyncPayload(endpoint, apiToken, payload);

        await storageLocalSet({
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT]: endpoint.toString(),
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN]: apiToken,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.LAST_AT]: Date.now(),
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS]: 'success',
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR]: '',
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.COUNT]: payload.snapshot.total,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]: 0,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]: [],
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]: accountKey,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.FAILURE_COUNT]: 0,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]: 0
        });

        return {
            success: true,
            accountKey,
            syncedCount: payload.snapshot.total,
            pendingCount: 0,
            endpointHost: endpoint.host,
            endpointPath: endpoint.pathname || '/',
            serverResult
        };
    } catch (error) {
        const failureCount = (state.failureCount || 0) + 1;
        const backoffMinutes = manual ? 0 : computeBackoffMinutes(failureCount);
        const backoffUntil = backoffMinutes > 0
            ? Date.now() + (backoffMinutes * 60 * 1000)
            : 0;

        await storageLocalSet({
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.STATUS]: 'error',
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.ERROR]: error?.message || 'Subscription sync failed',
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.FAILURE_COUNT]: failureCount,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.BACKOFF_UNTIL]: backoffUntil
        });

        console.error('[YT-Commander][SubscriptionSync] Sync failed', error);
        throw error;
    } finally {
        if (createdTab && tabId) {
            await removeTab(tabId);
        }
        subscriptionSyncInProgress = false;
    }
}

/**
 * Restore subscription manager data from Cloudflare.
 * @param {{endpointUrl?: string, apiToken?: string, accountKey?: string}} options
 * @returns {Promise<{channelCount: number, categoryCount: number, assignmentCount: number, endpointHost: string}>}
 */
async function restoreSubscriptionsFromCloudflare(options = {}) {
    if (subscriptionRestoreInProgress) {
        throw new Error('Restore is already in progress');
    }
    if (subscriptionSyncInProgress) {
        throw new Error('Subscription sync is already in progress');
    }

    const state = await readSubscriptionSyncState();
    const endpointRaw = typeof options.endpointUrl === 'string' && options.endpointUrl.trim()
        ? options.endpointUrl.trim()
        : state.endpointUrl;
    const apiToken = typeof options.apiToken === 'string'
        ? options.apiToken.trim()
        : state.apiToken;

    const endpoint = buildSubscriptionEndpoint(endpointRaw);

    subscriptionRestoreInProgress = true;

    let createdTab = false;
    let cleanupTabId = 0;

    try {
        const accountResolution = await resolveSubscriptionSyncAccountKey({
            accountKey: options.accountKey,
            preferredTabId: options.activeTabId,
            state
        });
        const accountKey = accountResolution.accountKey;
        createdTab = accountResolution.createdTab;
        cleanupTabId = accountResolution.usedTabId;

        const payload = await fetchSubscriptionRestorePayload(endpoint, apiToken, accountKey);
        const snapshot = payload && typeof payload.snapshot === 'object' ? payload.snapshot : {};
        const rawChannels = Array.isArray(payload.channels)
            ? payload.channels
            : (Array.isArray(snapshot.channels) ? snapshot.channels : []);
        const rawCategories = Array.isArray(payload.categories) ? payload.categories : [];
        const rawAssignments = payload && typeof payload.assignments === 'object'
            ? payload.assignments
            : {};

        const channels = rawChannels.filter((channel) => channel && typeof channel.channelId === 'string' && channel.channelId);

        const categories = rawCategories
            .map((item) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }
                const id = typeof item.id === 'string' ? item.id.trim() : '';
                const name = typeof item.name === 'string' ? item.name.trim() : '';
                const color = typeof item.color === 'string' ? item.color : '';
                if (!id || !name) {
                    return null;
                }
                return { id, name, color };
            })
            .filter(Boolean);

        const categoryIds = new Set(categories.map((item) => item.id));
        const assignments = {};
        let assignmentCount = 0;
        if (rawAssignments && typeof rawAssignments === 'object') {
            Object.entries(rawAssignments).forEach(([channelId, list]) => {
                if (typeof channelId !== 'string' || !channelId) {
                    return;
                }
                const next = Array.isArray(list)
                    ? list.filter((id) => typeof id === 'string' && id && categoryIds.has(id))
                    : [];
                if (next.length > 0) {
                    const unique = Array.from(new Set(next));
                    assignments[channelId] = unique;
                    assignmentCount += unique.length;
                }
            });
        }

        const fetchedAt = Number(snapshot.fetchedAt) || Date.now();
        const hash = typeof snapshot.hash === 'string' ? snapshot.hash : '';

        await storageLocalSet({
            subscriptionManagerCategories: categories,
            subscriptionManagerAssignments: assignments,
            subscriptionManagerSnapshot: {
                channels,
                fetchedAt,
                hash
            },
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_KEYS]: [],
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]: 0,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.COUNT]: channels.length,
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]: accountKey
        });

        return {
            channelCount: channels.length,
            categoryCount: categories.length,
            assignmentCount,
            endpointHost: endpoint.host
        };
    } finally {
        if (createdTab && cleanupTabId) {
            await removeTab(cleanupTabId);
        }
        subscriptionRestoreInProgress = false;
    }
}

/**
 * Read cloud sync status and refresh pending count when possible.
 * @returns {Promise<object>}
 */
async function getCloudSyncStatus() {
    const state = await readCloudSyncState();
    const syncAccountKey = isSubscriptionChannelAccountKey(state.primaryAccountKey)
        ? normalizeAccountKey(state.primaryAccountKey)
        : DEFAULT_ACCOUNT_KEY;
    const pendingCount = (await readPendingQueue(syncAccountKey)).length;
    const nextSyncAt = getNextSyncAt(state);

    return {
        success: true,
        endpointUrl: state.endpointUrl,
        autoEnabled: state.autoEnabled,
        intervalMinutes: state.intervalMinutes,
        lastAt: state.lastAt,
        status: state.status,
        error: state.error,
        syncedCount: state.count,
        pendingCount,
        primaryAccountKey: syncAccountKey,
        nextSyncAt,
        backoffUntil: state.backoffUntil
    };
}
/**
 * Read subscription sync status and refresh pending count when possible.
 * @returns {Promise<object>}
 */
async function getSubscriptionSyncStatus() {
    const state = await readSubscriptionSyncState();
    const pendingKeys = await readSubscriptionPendingKeys();
    const pendingCount = pendingKeys.length;
    const nextSyncAt = getNextSyncAt(state);
    const primaryAccountKey = isSubscriptionChannelAccountKey(state.primaryAccountKey)
        ? normalizeAccountKey(state.primaryAccountKey)
        : DEFAULT_ACCOUNT_KEY;

    return {
        success: true,
        endpointUrl: state.endpointUrl,
        autoEnabled: state.autoEnabled,
        intervalMinutes: state.intervalMinutes,
        lastAt: state.lastAt,
        status: state.status,
        error: state.error,
        syncedCount: state.count,
        pendingCount,
        primaryAccountKey,
        nextSyncAt,
        backoffUntil: state.backoffUntil
    };
}

/**
 * Update cloud sync config and re-arm alarms.
 * @param {{endpointUrl?: string, apiToken?: string, autoEnabled?: boolean, intervalMinutes?: number, primaryAccountKey?: string}} config
 * @returns {Promise<object>}
 */
async function updateCloudSyncConfig(config = {}) {
    const nextValues = {};

    if (typeof config.endpointUrl === 'string') {
        nextValues[CLOUD_SYNC_STORAGE_KEYS.ENDPOINT] = config.endpointUrl.trim();
    }

    if (typeof config.apiToken === 'string') {
        nextValues[CLOUD_SYNC_STORAGE_KEYS.API_TOKEN] = config.apiToken.trim();
    }

    if (typeof config.autoEnabled === 'boolean') {
        nextValues[CLOUD_SYNC_STORAGE_KEYS.AUTO_ENABLED] = config.autoEnabled;
    }

    if (config.intervalMinutes !== undefined) {
        nextValues[CLOUD_SYNC_STORAGE_KEYS.INTERVAL_MINUTES] = normalizeSyncInterval(config.intervalMinutes);
    }

    if (typeof config.primaryAccountKey === 'string') {
        const normalizedKey = normalizeAccountKey(config.primaryAccountKey);
        if (normalizedKey === DEFAULT_ACCOUNT_KEY || isSubscriptionChannelAccountKey(normalizedKey)) {
            nextValues[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY] = normalizedKey;
        }
    }

    if (Object.keys(nextValues).length > 0) {
        await storageLocalSet(nextValues);
    }

    await ensureAutoSyncAlarm();
    return getCloudSyncStatus();
}
/**
 * Update subscription sync config and re-arm alarms.
 * @param {{endpointUrl?: string, apiToken?: string, autoEnabled?: boolean, intervalMinutes?: number}} config
 * @returns {Promise<object>}
 */
async function updateSubscriptionSyncConfig(config = {}) {
    const nextValues = {};

    if (typeof config.endpointUrl === 'string') {
        nextValues[SUBSCRIPTION_SYNC_STORAGE_KEYS.ENDPOINT] = config.endpointUrl.trim();
    }

    if (typeof config.apiToken === 'string') {
        nextValues[SUBSCRIPTION_SYNC_STORAGE_KEYS.API_TOKEN] = config.apiToken.trim();
    }

    if (typeof config.autoEnabled === 'boolean') {
        nextValues[SUBSCRIPTION_SYNC_STORAGE_KEYS.AUTO_ENABLED] = config.autoEnabled;
    }

    if (config.intervalMinutes !== undefined) {
        nextValues[SUBSCRIPTION_SYNC_STORAGE_KEYS.INTERVAL_MINUTES] = normalizeSubscriptionInterval(config.intervalMinutes);
    }

    if (Object.keys(nextValues).length > 0) {
        await storageLocalSet(nextValues);
    }

    await ensureSubscriptionAutoSyncAlarm();
    return getSubscriptionSyncStatus();
}

/**
 * Proxy watched videos from first available YouTube tab.
 * @returns {Promise<any>}
 */
async function proxyGetAllWatchedVideos() {
    const tabs = await queryTabs({ url: YOUTUBE_TAB_URL_PATTERN });
    if (tabs.length === 0 || typeof tabs[0].id !== 'number') {
        return { success: false, error: 'No YouTube tabs found' };
    }

    try {
        const response = await sendMessageToTab(tabs[0].id, { type: 'GET_ALL_WATCHED_VIDEOS' });
        return response || { success: false, error: 'No response from content script' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

chrome.runtime.onInstalled.addListener(() => {
    refreshWatchedHistoryBadge();
    ensureAutoSyncAlarm().catch((error) => {
        console.error('[YT-Commander][CloudSync] Failed to ensure alarm on install', error);
    });
    ensureSubscriptionAutoSyncAlarm().catch((error) => {
        console.error('[YT-Commander][SubscriptionSync] Failed to ensure alarm on install', error);
    });
    runAutoSyncIfDue('install-check').catch((error) => {
        console.error('[YT-Commander][CloudSync] Install due-check failed', error);
    });
    runSubscriptionAutoSyncIfDue('install-check').catch((error) => {
        console.error('[YT-Commander][SubscriptionSync] Install due-check failed', error);
    });
});

chrome.runtime.onStartup.addListener(() => {
    refreshWatchedHistoryBadge();
    ensureAutoSyncAlarm().catch((error) => {
        console.error('[YT-Commander][CloudSync] Failed to ensure alarm on startup', error);
    });
    ensureSubscriptionAutoSyncAlarm().catch((error) => {
        console.error('[YT-Commander][SubscriptionSync] Failed to ensure alarm on startup', error);
    });
    runAutoSyncIfDue('startup-check').catch((error) => {
        console.error('[YT-Commander][CloudSync] Startup due-check failed', error);
    });
    runSubscriptionAutoSyncIfDue('startup-check').catch((error) => {
        console.error('[YT-Commander][SubscriptionSync] Startup due-check failed', error);
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm) {
        return;
    }

    if (alarm.name === AUTO_SYNC_ALARM_NAME) {
        runAutoSyncIfDue(`alarm:${alarm.name}`).catch((error) => {
            console.error('[YT-Commander][CloudSync] Alarm due-check failed', error);
        });
        return;
    }

    if (alarm.name === SUBSCRIPTION_SYNC_ALARM_NAME) {
        runSubscriptionAutoSyncIfDue(`alarm:${alarm.name}`).catch((error) => {
            console.error('[YT-Commander][SubscriptionSync] Alarm due-check failed', error);
        });
    }
});

const GEMINI_MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let geminiModelCache = { fetchedAt: 0, models: [] };

function normalizeGeminiModelName(name) {
    if (typeof name !== 'string') {
        return '';
    }
    return name.replace(/^models\//i, '').trim();
}

function buildGeminiEndpoint(endpoint, model, apiKey) {
    const fallbackBase = 'https://generativelanguage.googleapis.com/v1beta/models';
    const base = typeof endpoint === 'string' && endpoint.trim()
        ? endpoint.trim()
        : fallbackBase;
    let url = base.replace(/\/+$/, '');
    if (!url.includes(':generateContent')) {
        const normalizedModel = normalizeGeminiModelName(model);
        const safeModel = normalizedModel && normalizedModel.toLowerCase() !== 'auto'
            ? normalizedModel
            : 'gemini-1.5-pro';
        url = `${url}/${safeModel}:generateContent`;
    }
    if (apiKey && !url.includes('key=')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}key=${encodeURIComponent(apiKey)}`;
    }
    return url;
}

function buildGeminiModelsEndpoint(endpoint, apiKey) {
    const fallbackBase = 'https://generativelanguage.googleapis.com/v1beta/models';
    let base = typeof endpoint === 'string' && endpoint.trim()
        ? endpoint.trim()
        : fallbackBase;

    if (base.includes('/models/')) {
        base = `${base.split('/models/')[0]}/models`;
    } else if (base.includes('/models')) {
        base = `${base.split('/models')[0]}/models`;
    } else if (base.endsWith('/v1beta')) {
        base = `${base}/models`;
    } else if (!base.includes('/v1beta')) {
        base = fallbackBase;
    }

    if (apiKey && !base.includes('key=')) {
        const separator = base.includes('?') ? '&' : '?';
        base = `${base}${separator}key=${encodeURIComponent(apiKey)}`;
    }
    return base;
}

function scoreGeminiModel(modelName) {
    const name = modelName.toLowerCase();
    const versionMatch = name.match(/gemini-(\d+)(?:\.(\d+))?/);
    let score = 0;
    if (versionMatch) {
        const major = Number(versionMatch[1]) || 0;
        const minor = Number(versionMatch[2]) || 0;
        score += (major * 100) + (minor * 10);
    }
    if (name.includes('pro')) {
        score += 20;
    }
    if (name.includes('flash')) {
        score += 10;
    }
    if (name.includes('lite')) {
        score -= 5;
    }
    if (name.includes('latest')) {
        score += 5;
    }
    return score;
}

async function listGeminiModels(apiKey, endpoint) {
    const urlBase = buildGeminiModelsEndpoint(endpoint, apiKey);
    const models = [];
    let pageToken = '';
    let pageCount = 0;

    while (pageCount < 4) {
        const url = pageToken ? `${urlBase}&pageToken=${encodeURIComponent(pageToken)}` : urlBase;
        const response = await fetch(url);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = data?.error?.message || `ListModels failed (${response.status})`;
            throw new Error(message);
        }
        const items = Array.isArray(data?.models) ? data.models : [];
        items.forEach((model) => {
            if (model?.name && Array.isArray(model?.supportedGenerationMethods)) {
                models.push(model);
            }
        });
        pageToken = data?.nextPageToken || '';
        if (!pageToken) {
            break;
        }
        pageCount += 1;
    }

    return models;
}

async function resolveGeminiModel(requestedModel, apiKey, endpoint) {
    const requested = normalizeGeminiModelName(requestedModel);
    const requestedIsAuto = !requested || requested.toLowerCase() === 'auto';
    const now = Date.now();
    if (now - geminiModelCache.fetchedAt > GEMINI_MODEL_CACHE_TTL_MS) {
        try {
            const models = await listGeminiModels(apiKey, endpoint);
            geminiModelCache = { fetchedAt: now, models };
        } catch (_error) {
            geminiModelCache = { fetchedAt: now, models: [] };
        }
    }

    const available = geminiModelCache.models
        .filter((model) => model.supportedGenerationMethods.includes('generateContent'))
        .map((model) => normalizeGeminiModelName(model.name))
        .filter(Boolean);

    if (!requestedIsAuto && available.includes(requested)) {
        return requested;
    }

    if (available.length > 0) {
        const sorted = available.slice().sort((a, b) => scoreGeminiModel(b) - scoreGeminiModel(a));
        return sorted[0];
    }

    if (!requestedIsAuto && requested) {
        return requested;
    }
    return 'gemini-1.5-pro';
}

async function resolveGeminiFallbackModel(primaryModel, apiKey, endpoint) {
    const normalizedPrimary = normalizeGeminiModelName(primaryModel);
    const now = Date.now();
    if (now - geminiModelCache.fetchedAt > GEMINI_MODEL_CACHE_TTL_MS) {
        try {
            const models = await listGeminiModels(apiKey, endpoint);
            geminiModelCache = { fetchedAt: now, models };
        } catch (_error) {
            geminiModelCache = { fetchedAt: now, models: [] };
        }
    }

    const available = geminiModelCache.models
        .filter((model) => model.supportedGenerationMethods.includes('generateContent'))
        .map((model) => normalizeGeminiModelName(model.name))
        .filter(Boolean);

    const filtered = available.filter((name) => name.includes('flash') || name.includes('lite'));
    if (filtered.length > 0) {
        const sorted = filtered.slice().sort((a, b) => scoreGeminiModel(b) - scoreGeminiModel(a));
        const pick = sorted.find((name) => name !== normalizedPrimary);
        if (pick) {
            return pick;
        }
    }

    const fallback = available.find((name) => name !== normalizedPrimary);
    return fallback || 'gemini-1.5-flash';
}

function isGeminiQuotaError(message) {
    const text = typeof message === 'string' ? message.toLowerCase() : '';
    return text.includes('quota') || text.includes('free_tier') || text.includes('free tier');
}

async function requestGeminiGenerate(url, contentParts, generationConfig, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: contentParts
                    }
                ],
                generationConfig
            }),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }

    let data = null;
    try {
        data = await response.json();
    } catch (_error) {
        data = null;
    }

    if (!response.ok) {
        const message = data?.error?.message || `Gemini request failed (${response.status})`;
        throw new Error(message);
    }
    return data || {};
}

async function requestGeminiAutoCategorize(payload) {
    const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
    if (!apiKey) {
        throw new Error('Missing Gemini API key');
    }
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
    const parts = Array.isArray(payload?.parts) ? payload.parts.filter(Boolean) : [];
    if (!prompt && parts.length === 0) {
        throw new Error('Missing Gemini prompt');
    }

    const temperature = Number.isFinite(payload?.temperature) ? payload.temperature : 0.2;
    const maxOutputTokens = Number.isFinite(payload?.maxOutputTokens) ? payload.maxOutputTokens : 1024;
    const timeoutMs = Number.isFinite(payload?.timeoutMs) ? payload.timeoutMs : 20000;

    const resolvedModel = await resolveGeminiModel(payload?.model, apiKey, payload?.endpoint);
    const contentParts = parts.length > 0 ? parts : [{ text: prompt }];
    const generationConfig = {
        temperature,
        maxOutputTokens
    };

    const primaryUrl = buildGeminiEndpoint(payload?.endpoint, resolvedModel, apiKey);
    try {
        return await requestGeminiGenerate(primaryUrl, contentParts, generationConfig, timeoutMs);
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!isGeminiQuotaError(message)) {
            throw error;
        }

        const fallbackModel = await resolveGeminiFallbackModel(resolvedModel, apiKey, payload?.endpoint);
        if (fallbackModel === resolvedModel) {
            throw error;
        }
        const fallbackUrl = buildGeminiEndpoint(payload?.endpoint, fallbackModel, apiKey);
        return await requestGeminiGenerate(fallbackUrl, contentParts, generationConfig, timeoutMs);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
        return false;
    }

    if (message.type === 'OPEN_NEW_TAB') {
        chrome.tabs.create({ url: message.url, active: false });
        return false;
    }

    if (message.type === 'GET_WATCHED_IDS') {
        chrome.storage.local.get(['watchedIds'], (result) => {
            sendResponse(result.watchedIds || []);
        });
        return true;
    }

    if (message.type === 'REFRESH_BADGES') {
        chrome.tabs.query({ url: YOUTUBE_TAB_URL_PATTERN }, (tabs) => {
            tabs.forEach((tab) => {
                if (typeof tab.id !== 'number') {
                    return;
                }

                chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_BADGE' }, () => {
                    if (chrome.runtime.lastError) {
                        return;
                    }
                });
            });
        });
        return false;
    }

    if (message.type === 'UPDATE_CLOUDFLARE_SYNC_CONFIG') {
        updateCloudSyncConfig({
            endpointUrl: message.endpointUrl,
            apiToken: message.apiToken,
            autoEnabled: message.autoEnabled,
            intervalMinutes: message.intervalMinutes,
            primaryAccountKey: message.primaryAccountKey
        })
            .then((status) => sendResponse({ success: true, ...status }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'GET_CLOUDFLARE_SYNC_STATUS') {
        getCloudSyncStatus()
            .then((status) => sendResponse(status))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'SYNC_TO_CLOUDFLARE') {
        performCloudflareSync({
            manual: true,
            endpointUrl: message.endpointUrl,
            apiToken: message.apiToken,
            source: 'popup-manual-sync',
            activeTabId: Number.isFinite(message.activeTabId) ? Number(message.activeTabId) : undefined
        })
            .then((result) => sendResponse({ success: true, ...result }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'UPDATE_SUBSCRIPTION_SYNC_CONFIG') {
        updateSubscriptionSyncConfig({
            endpointUrl: message.endpointUrl,
            apiToken: message.apiToken,
            autoEnabled: message.autoEnabled,
            intervalMinutes: message.intervalMinutes
        })
            .then((status) => sendResponse({ success: true, ...status }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'GET_SUBSCRIPTION_SYNC_STATUS') {
        getSubscriptionSyncStatus()
            .then((status) => sendResponse(status))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'SYNC_SUBSCRIPTIONS_TO_CLOUDFLARE') {
        performSubscriptionSync({
            manual: true,
            endpointUrl: message.endpointUrl,
            apiToken: message.apiToken,
            source: 'popup-manual-sync',
            activeTabId: Number.isFinite(message.activeTabId) ? Number(message.activeTabId) : undefined
        })
            .then((result) => sendResponse({ success: true, ...result }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'RESTORE_SUBSCRIPTIONS_FROM_CLOUDFLARE') {
        restoreSubscriptionsFromCloudflare({
            endpointUrl: message.endpointUrl,
            apiToken: message.apiToken,
            accountKey: message.accountKey,
            activeTabId: Number.isFinite(message.activeTabId) ? Number(message.activeTabId) : undefined
        })
            .then((result) => sendResponse({ success: true, ...result }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (message.type === 'LOCK_SUBSCRIPTION_SYNC_ACCOUNT') {
        const tabId = Number.isFinite(message.tabId) ? Number(message.tabId) : 0;
        if (!tabId) {
            sendResponse({ success: false, error: 'A valid YouTube tab is required to lock account' });
            return false;
        }

        lockSubscriptionSyncAccountFromTab(tabId)
            .then(async (result) => {
                const status = await getSubscriptionSyncStatus();
                sendResponse({
                    success: true,
                    ...status,
                    accountKey: result.accountKey,
                    source: result.source
                });
            })
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (message.type === 'LOCK_PRIMARY_SYNC_ACCOUNT') {
        const tabId = Number.isFinite(message.tabId) ? Number(message.tabId) : 0;
        if (!tabId) {
            sendResponse({ success: false, error: 'A valid YouTube tab is required to lock account' });
            return false;
        }

        lockPrimarySyncAccountFromTab(tabId)
            .then(async (result) => {
                const status = await getCloudSyncStatus();
                sendResponse({
                    success: true,
                    ...status,
                    accountKey: result.accountKey,
                    source: result.source
                });
            })
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'DOWNLOAD_FROM_CLOUDFLARE') {
        downloadFromCloudflare({
            endpointUrl: message.endpointUrl,
            apiToken: message.apiToken
        })
            .then((result) => sendResponse({ success: true, ...result }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.type === 'GET_ALL_WATCHED_VIDEOS') {
        proxyGetAllWatchedVideos().then(sendResponse);
        return true;
    }

    if (message.type === 'AUTO_CATEGORIZE_SUBSCRIPTIONS') {
        requestGeminiAutoCategorize(message)
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    
    if (message.type === 'SUBSCRIPTION_MANAGER_UPDATED') {
        const pendingCount = Number.isFinite(message.pendingCount) ? Number(message.pendingCount) : 0;
        storageLocalSet({
            [SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]: pendingCount
        }).catch((error) => {
            console.warn('[YT-Commander][SubscriptionSync] Failed to update pending count', error);
        });

        runSubscriptionAutoSyncIfDue('subscription-updated').catch((error) => {
            console.error('[YT-Commander][SubscriptionSync] Update due-check failed', error);
        });

        sendResponse({ success: true, pendingCount });
        return true;
    }

    if (message.type === 'HISTORY_UPDATED') {
        const changedIds = normalizeVideoIds([
            ...(Array.isArray(message.videoIds) ? message.videoIds : []),
            ...(typeof message.videoId === 'string' ? [message.videoId] : [])
        ]);
        const rawAccountKey = normalizeAccountKey(message.accountKey);
        const accountKey = isSubscriptionChannelAccountKey(rawAccountKey)
            ? rawAccountKey
            : DEFAULT_ACCOUNT_KEY;

        autoLockPrimaryAccountIfMissing(accountKey, sender.tab).catch((error) => {
            console.warn('[YT-Commander][CloudSync] Could not auto-lock primary account', error);
        });

        enqueuePendingVideoIds(changedIds, accountKey)
            .then((pendingCount) => {
                if (changedIds.length > 0) {
                    console.info('[YT-Commander][CloudSync] Queued watched IDs', {
                        added: changedIds.length,
                        accountKey,
                        pendingCount
                    });
                }

                chrome.tabs.query({ url: YOUTUBE_TAB_URL_PATTERN }, (tabs) => {
                    tabs.forEach((tab) => {
                        if (typeof tab.id !== 'number' || tab.id === sender.tab?.id) {
                            return;
                        }

                        chrome.tabs.sendMessage(tab.id, { type: 'HISTORY_UPDATED' }, () => {
                            if (chrome.runtime.lastError) {
                                return;
                            }
                        });
                    });
                });

                runAutoSyncIfDue('history-updated').catch((error) => {
                    console.error('[YT-Commander][CloudSync] History due-check failed', error);
                });

                sendResponse({ success: true, pendingCount });
            })
            .catch((error) => {
                console.error('[YT-Commander][CloudSync] Failed to enqueue history updates', error);
                sendResponse({ success: false, error: error?.message || 'Failed to enqueue history update' });
            });

        return true;
    }

    if (message.type === 'PROCESS_IMPORT_BATCH') {
        chrome.storage.local.get([message.storageKey], (result) => {
            const batchData = result[message.storageKey];
            if (!batchData) {
                sendResponse({ success: false, error: 'Batch data not found' });
                return;
            }

            chrome.tabs.sendMessage(message.tabId, {
                type: 'IMPORT_WATCHED_VIDEOS',
                videoIds: batchData.videoIds
            }, (response) => {
                chrome.storage.local.remove([message.storageKey]);

                if (chrome.runtime.lastError) {
                    sendResponse({
                        success: false,
                        error: chrome.runtime.lastError.message,
                        count: 0
                    });
                    return;
                }

                sendResponse({
                    success: true,
                    count: response?.count || 0
                });
            });
        });
        return true;
    }

    if (message.type === 'GET_WATCHED_STATS') {
        chrome.tabs.sendMessage(message.tabId, { type: 'GET_WATCHED_STATS' }, (response) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }

            sendResponse(response || { success: false, error: 'No response from content script' });
        });
        return true;
    }

    return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }
    if (changes[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]) {
        lastSubscriptionPendingCount = Number(changes[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT].newValue) || 0;
    }
    if (changes[CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT]) {
        const next = Number(changes[CLOUD_SYNC_STORAGE_KEYS.PENDING_COUNT].newValue) || 0;
        updateWatchedHistoryBadge(next);
        return;
    }
    if (changes[SUBSCRIPTION_SYNC_STORAGE_KEYS.PENDING_COUNT]) {
        updateExtensionTitle();
    }
});

refreshWatchedHistoryBadge();

ensureAutoSyncAlarm().catch((error) => {
    console.error('[YT-Commander][CloudSync] Failed to ensure startup alarm', error);
});

runAutoSyncIfDue('startup-bootstrap').catch((error) => {
    console.error('[YT-Commander][CloudSync] Startup bootstrap due-check failed', error);
});
ensureSubscriptionAutoSyncAlarm().catch((error) => {
    console.error('[YT-Commander][SubscriptionSync] Failed to ensure startup alarm', error);
});

runSubscriptionAutoSyncIfDue('startup-bootstrap').catch((error) => {
    console.error('[YT-Commander][SubscriptionSync] Startup bootstrap due-check failed', error);
});

const AUTOMATION_ALARM_NAME = 'ytCommanderSubscriptionAutomation';

function showNotification(title, message) {
    try {
        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icon.png',
                title: title,
                message: message
            });
        }
    } catch (e) {
        console.warn('[YT-Commander][Notifications] Failed to show notification:', e);
    }
}

const AUTOMATION_STORAGE_KEYS = {
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
    LAST_STATUS: 'subscriptionAutomationLastStatus'
};

async function readAutomationSettings() {
    const result = await storageLocalGet([
        AUTOMATION_STORAGE_KEYS.ENABLED,
        AUTOMATION_STORAGE_KEYS.TIME,
        AUTOMATION_STORAGE_KEYS.LOOKBACK,
        AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST,
        AUTOMATION_STORAGE_KEYS.VIDEOS_MODE,
        AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST,
        AUTOMATION_STORAGE_KEYS.SPLIT_COUNT
    ]);
    
    return {
        enabled: result[AUTOMATION_STORAGE_KEYS.ENABLED] === true,
        time: result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30',
        lookback: result[AUTOMATION_STORAGE_KEYS.LOOKBACK] || 'yesterday',
        shortsPlaylist: result[AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST] || 'WL',
        videosMode: result[AUTOMATION_STORAGE_KEYS.VIDEOS_MODE] || 'single',
        videosPlaylist: result[AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST] || 'WL',
        splitCount: parseInt(result[AUTOMATION_STORAGE_KEYS.SPLIT_COUNT]) || 20
    };
}

async function scheduleAutomation() {
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
        delayInMinutes: delayInMinutes
    });
    
    console.info('[YT-Commander][Automation] Scheduled for', nextRun.toISOString(), 'in', Math.round(delayInMinutes), 'minutes');
}

async function runSubscriptionAutomation() {
    console.info('[YT-Commander][Automation] Starting subscription automation...');
    
    try {
        const settings = await readAutomationSettings();
        console.info('[YT-Commander][Automation] Settings:', settings);
        
        const now = new Date();
        
        await storageLocalSet({
            [AUTOMATION_STORAGE_KEYS.LAST_RUN]: now.toISOString(),
            [AUTOMATION_STORAGE_KEYS.LAST_VIDEOS_COUNT]: 0,
            [AUTOMATION_STORAGE_KEYS.LAST_SHORTS_COUNT]: 0,
            [AUTOMATION_STORAGE_KEYS.LAST_STATUS]: 'running'
        });
        
        const SUBSCRIPTIONS_URL = 'https://www.youtube.com/feed/subscriptions';
        
        let tab = await createTab({ url: SUBSCRIPTIONS_URL, active: true });
        await waitForTabReady(tab.id);
        await delay(4000);
        
        let lookbackMs = 24 * 60 * 60 * 1000;
        switch (settings.lookback) {
            case 'yesterday':
            case '24h':
                lookbackMs = 24 * 60 * 60 * 1000;
                break;
            case '48h':
                lookbackMs = 48 * 60 * 60 * 1000;
                break;
            default:
                lookbackMs = 24 * 60 * 60 * 1000;
        }
        
        const automationScript = function(lookbackMsParam) {
            function parsePublishedTime(publishedText) {
                if (!publishedText) return null;
                const now = new Date();
                const match = publishedText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
                if (!match) return null;
                const value = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                let ms;
                switch (unit) {
                    case 'second': ms = value * 1000; break;
                    case 'minute': ms = value * 60 * 1000; break;
                    case 'hour': ms = value * 60 * 60 * 1000; break;
                    case 'day': ms = value * 24 * 60 * 60 * 1000; break;
                    case 'week': ms = value * 7 * 24 * 60 * 60 * 1000; break;
                    case 'month': ms = value * 30 * 24 * 60 * 60 * 1000; break;
                    case 'year': ms = value * 365 * 24 * 60 * 60 * 1000; break;
                    default: return null;
                }
return new Date(now.getTime() - ms);
            }
            
            async function getWatchedVideoIds() {
                return new Promise((resolve) => {
                    try {
                        const request = indexedDB.open('YouTubeCommanderDB');
                        request.onsuccess = () => {
                            const db = request.result;
                            if (!db.objectStoreNames.contains('watchedVideos')) {
                                resolve([]);
                                return;
                            }
                            const tx = db.transaction(['watchedVideos'], 'readonly');
                            const store = tx.objectStore('watchedVideos');
                            const getAll = store.getAll();
                            getAll.onsuccess = () => resolve(getAll.result.map(v => v.videoId));
                            getAll.onerror = () => resolve([]);
                        };
                        request.onerror = () => resolve([]);
                    } catch (e) { resolve([]); }
                });
            }
            
            return (async function() {
                const watchedIds = new Set(await getWatchedVideoIds());
                const lookbackDate = new Date(Date.now() - lookbackMsParam);
                
                const videos = [];
                const shorts = [];
                
                const data = window.ytInitialData;
                
                if (!data) {
                    return { success: false, error: 'No ytInitialData found', videos: [], shorts: [] };
                }
                
                const items = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
                
                for (const section of items) {
                    const sectionItems = section?.itemSectionRenderer?.contents || [];
                    for (const item of sectionItems) {
                        const video = item?.richItemRenderer?.content?.videoRenderer;
                        const short = item?.richItemRenderer?.content?.reelItemRenderer;
                        
                        if (video?.videoId) {
                            const publishedTime = video?.publishedTimeText?.simpleText || '';
                            const videoDate = parsePublishedTime(publishedTime);
                            if (!watchedIds.has(video.videoId) && (!videoDate || videoDate >= lookbackDate)) {
                                videos.push({ videoId: video.videoId, title: video.title?.runs?.[0]?.text || 'Unknown', publishedTime });
                            }
                        }
                        
                        if (short?.videoId) {
                            const publishedTime = short?.publishedTimeText?.simpleText || '';
                            const videoDate = parsePublishedTime(publishedTime);
                            if (!watchedIds.has(short.videoId) && (!videoDate || videoDate >= lookbackDate)) {
                                shorts.push({ videoId: short.videoId, title: short.headline?.simpleText || 'Short', publishedTime });
                            }
                        }
                    }
                }
                
                return { success: true, videos, shorts };
            })();
        };
        
        const result = await new Promise((resolve, reject) => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: automationScript,
                args: [lookbackMs],
                world: 'MAIN'
            }, (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(results?.[0]?.result || { success: false, error: 'No result', videos: [], shorts: [] });
                }
            });
        });
        
        if (result?.error) {
            console.error('[YT-Commander][Automation] API Error:', result.error);
            throw new Error('API Error: ' + result.error);
        }
        
        const videosCount = result?.videos?.length || 0;
        const shortsCount = result?.shorts?.length || 0;
        
        console.info('[YT-Commander][Automation] Found', videosCount, 'videos and', shortsCount, 'shorts');
        
        await storageLocalSet({
            [AUTOMATION_STORAGE_KEYS.LAST_VIDEOS_COUNT]: videosCount,
            [AUTOMATION_STORAGE_KEYS.LAST_SHORTS_COUNT]: shortsCount,
            [AUTOMATION_STORAGE_KEYS.LAST_STATUS]: 'success'
        });
        
        await scheduleAutomation();
        
        showNotification('YouTube Commander', `Found ${videosCount} videos and ${shortsCount} shorts from subscriptions`);
        
        return {
            success: true,
            videosCount,
            shortsCount
        };
    } catch (error) {
        console.error('[YT-Commander][Automation] Error:', error);
        
        await storageLocalSet({
            [AUTOMATION_STORAGE_KEYS.LAST_STATUS]: 'failed'
        });
        
        showNotification('YouTube Commander', 'Subscription automation failed: ' + error.message);
        
        return {
            success: false,
            error: error.message
        };
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTOMATION_ALARM_NAME) {
        console.info('[YT-Commander][Automation] Alarm triggered, running automation...');
        runSubscriptionAutomation().catch((error) => {
            console.error('[YT-Commander][Automation] Alarm handler error:', error);
        });
    }
});

chrome.runtime.onStartup.addListener(async () => {
    console.info('[YT-Commander][Automation] Browser started, checking if automation was missed...');
    
    const settings = await readAutomationSettings();
    if (!settings.enabled) {
        return;
    }
    
    const [hours, minutes] = settings.time.split(':').map(Number);
    const now = new Date();
    const scheduledToday = new Date(now);
    scheduledToday.setHours(hours, minutes, 0, 0);
    
    if (scheduledToday <= now) {
        console.info('[YT-Commander][Automation] Missed today\'s scheduled run, executing now...');
        runSubscriptionAutomation().catch((error) => {
            console.error('[YT-Commander][Automation] Startup automation error:', error);
        });
    }
    
    await scheduleAutomation();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCHEDULE_AUTOMATION') {
        scheduleAutomation()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.type === 'RUN_SUBSCRIPTION_AUTOMATION') {
        runSubscriptionAutomation()
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    return false;
});

scheduleAutomation().catch((error) => {
    console.error('[YT-Commander][Automation] Initial schedule error:', error);
});
