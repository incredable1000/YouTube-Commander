const YOUTUBE_TAB_URL_PATTERN = 'https://www.youtube.com/*';
const YOUTUBE_BOOTSTRAP_URL = 'https://www.youtube.com/';

const CONTENT_SCRIPT_BOOT_DELAY_MS = 900;
const TAB_READY_TIMEOUT_MS = 20000;
const MESSAGE_TIMEOUT_MS = 12000;
const TAB_RECEIVER_CHECK_RETRIES = 8;
const TAB_RECEIVER_CHECK_DELAY_MS = 350;
const CLOUDFLARE_SYNC_REQUEST_TIMEOUT_MS = 60000;

const AUTO_SYNC_ALARM_NAME = 'ytCommanderCloudflareAutoSync';
const AUTO_SYNC_SOON_ALARM_NAME = 'ytCommanderCloudflareAutoSyncSoon';
const AUTO_SYNC_SOON_DELAY_MS = 2 * 60 * 1000;
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

let cloudSyncInProgress = false;
const DEFAULT_ACCOUNT_KEY = 'default';

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
    const response = await sendMessageToTab(tabId, { type: 'GET_SYNC_ACCOUNT_IDENTITY' }, 8000);
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
    const accountKey = await setPrimarySyncAccountKey(identity.accountKey);
    return {
        accountKey,
        source: identity.source
    };
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
    if (currentPrimary && currentPrimary !== DEFAULT_ACCOUNT_KEY) {
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
        return currentPrimary || DEFAULT_ACCOUNT_KEY;
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

    if (senderTab?.incognito === true) {
        return;
    }

    const result = await storageLocalGet([CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    const currentPrimary = normalizeAccountKey(result[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY]);
    if (currentPrimary && currentPrimary !== DEFAULT_ACCOUNT_KEY) {
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
    return 120;
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
    if (primaryAccountKey) {
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

    if (incoming.length === 0) {
        const current = await readPendingQueue(scopedAccountKey);
        return current.length;
    }

    const current = await readPendingQueue(scopedAccountKey);
    const merged = normalizeVideoIds(current.concat(incoming));
    await writePendingQueue(merged, scopedAccountKey);
    return merged.length;
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
    if (removeSet.size === 0) {
        const current = await readPendingQueue(scopedAccountKey);
        return current.length;
    }

    const current = await readPendingQueue(scopedAccountKey);
    const next = current.filter((videoId) => !removeSet.has(videoId));
    await writePendingQueue(next, scopedAccountKey);
    return next.length;
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
 * Ensure periodic auto-sync alarm matches configured settings.
 * @returns {Promise<void>}
 */
async function ensureAutoSyncAlarm() {
    const state = await readCloudSyncState();

    if (!state.autoEnabled || !state.endpointUrl) {
        await clearAlarm(AUTO_SYNC_ALARM_NAME);
        return;
    }

    // Recreate alarm explicitly so interval changes apply deterministically.
    await clearAlarm(AUTO_SYNC_ALARM_NAME);
    chrome.alarms.create(AUTO_SYNC_ALARM_NAME, {
        delayInMinutes: state.intervalMinutes,
        periodInMinutes: state.intervalMinutes
    });
}

/**
 * Schedule a near-term one-shot auto sync.
 * @returns {Promise<void>}
 */
async function scheduleSoonAutoSync() {
    const state = await readCloudSyncState();
    if (!state.autoEnabled || !state.endpointUrl) {
        return;
    }

    // Respect user-selected long intervals; avoid forcing rapid sync cadence.
    if (state.intervalMinutes > 15) {
        return;
    }

    const targetWhen = Date.now() + AUTO_SYNC_SOON_DELAY_MS;
    const existing = await getAlarm(AUTO_SYNC_SOON_ALARM_NAME);
    if (existing && Number.isFinite(existing.scheduledTime) && existing.scheduledTime <= targetWhen) {
        return;
    }

    chrome.alarms.create(AUTO_SYNC_SOON_ALARM_NAME, {
        when: targetWhen
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
 * Post one sync batch to Cloudflare.
 * @param {URL} endpoint
 * @param {string} apiToken
 * @param {string[]} videoIds
 * @param {string} [accountKey]
 * @returns {Promise<any>}
 */
async function postCloudflareSyncBatch(endpoint, apiToken, videoIds, accountKey) {
    const payload = { videoIds };
    if (accountKey) {
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
 * Fetch one page of IDs from Cloudflare pull endpoint.
 * @param {URL} pullEndpoint
 * @param {string} apiToken
 * @param {string|null} cursor
 * @param {number} limit
 * @returns {Promise<{videoIds: string[], nextCursor: string|null, hasMore: boolean}>}
 */
async function fetchCloudflarePullPage(pullEndpoint, apiToken, cursor, limit) {
    const requestUrl = new URL(pullEndpoint.toString());
    requestUrl.searchParams.set('limit', String(Math.max(1, Math.min(limit, 1000))));
    if (typeof cursor === 'string' && cursor) {
        requestUrl.searchParams.set('cursor', cursor);
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
            const page = await fetchCloudflarePullPage(pullEndpoint, apiToken, cursor, pageLimit);
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
        : normalizeAccountKey(state.primaryAccountKey);

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
 * Read cloud sync status and refresh pending count when possible.
 * @returns {Promise<object>}
 */
async function getCloudSyncStatus() {
    const state = await readCloudSyncState();
    const syncAccountKey = normalizeAccountKey(state.primaryAccountKey);
    const pendingCount = (await readPendingQueue(syncAccountKey)).length;

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
        nextValues[CLOUD_SYNC_STORAGE_KEYS.PRIMARY_ACCOUNT_KEY] = normalizeAccountKey(config.primaryAccountKey);
    }

    if (Object.keys(nextValues).length > 0) {
        await storageLocalSet(nextValues);
    }

    await ensureAutoSyncAlarm();
    await scheduleSoonAutoSync();
    return getCloudSyncStatus();
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
    ensureAutoSyncAlarm().catch((error) => {
        console.error('[YT-Commander][CloudSync] Failed to ensure alarm on install', error);
    });
});

chrome.runtime.onStartup.addListener(() => {
    ensureAutoSyncAlarm().catch((error) => {
        console.error('[YT-Commander][CloudSync] Failed to ensure alarm on startup', error);
    });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || (alarm.name !== AUTO_SYNC_ALARM_NAME && alarm.name !== AUTO_SYNC_SOON_ALARM_NAME)) {
        return;
    }

    performCloudflareSync({
        manual: false,
        source: `alarm:${alarm.name}`
    }).catch((error) => {
        console.error('[YT-Commander][CloudSync] Alarm sync failed', error);
    });
});

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

    if (message.type === 'HISTORY_UPDATED') {
        const changedIds = normalizeVideoIds([
            ...(Array.isArray(message.videoIds) ? message.videoIds : []),
            ...(typeof message.videoId === 'string' ? [message.videoId] : [])
        ]);
        const accountKey = normalizeAccountKey(message.accountKey);

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
            })
            .catch((error) => {
                console.error('[YT-Commander][CloudSync] Failed to enqueue history updates', error);
            });

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

        scheduleSoonAutoSync().catch((error) => {
            console.error('[YT-Commander][CloudSync] Failed to schedule auto sync', error);
        });

        return false;
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

ensureAutoSyncAlarm().catch((error) => {
    console.error('[YT-Commander][CloudSync] Failed to ensure startup alarm', error);
});
