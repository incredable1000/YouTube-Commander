import { normalizeShortcutKey } from '../shared/shortcutKey.js';
import { normalizeQualityId } from '../shared/quality.js';

export const defaultSettings = {
    deleteVideosEnabled: false,
    hideSubscribedVideosEnabled: false,
    autoSwitchToOriginal: true,
    rotationShortcut: 'r',
    windowedFullscreenShortcut: 'Enter',
    windowedFullscreenAuto: false,
    openVideoNewTabShortcut: { ctrl: true, shift: false, alt: false, key: 'Enter' },
    openChannelNewTabShortcut: { ctrl: false, shift: true, alt: false, key: 'Enter' },
    shortSeek: 3,
    mediumSeek: 10,
    longSeek: 30,
    shortSeekKey: { ctrl: false, shift: false, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' },
    maxQuality: 'hd1080',
    fullWindowShortcut: 'f'
};

export const LEGACY_FEATURE_KEYS = [
    'seekEnabled',
    'qualityEnabled',
    'audioEnabled',
    'historyEnabled',
    'scrollEnabled',
    'shortsEnabled',
    'shortsUploadAgeEnabled',
    'rotationEnabled',
    'windowedFullscreenEnabled',
    'playlistEnabled'
];

export let currentSettings = {};
export let cloudflareLastSyncAt = 0;
export let cloudflareAutoEnabled = true;
export let cloudflareSyncIntervalMinutes = 30;
export let cloudflareSyncTriggered = false;
export let subscriptionLastSyncAt = 0;
export let subscriptionAutoEnabled = true;
export let subscriptionSyncIntervalMinutes = 30;
export let subscriptionSyncTriggered = false;

export const CLOUDFLARE_STORAGE_KEYS = {
    ENDPOINT: 'cloudflareSyncEndpoint',
    API_TOKEN: 'cloudflareSyncApiToken',
    AUTO_ENABLED: 'cloudflareSyncAutoEnabled',
    INTERVAL_MINUTES: 'cloudflareSyncIntervalMinutes'
};

export const SUBSCRIPTION_STORAGE_KEYS = {
    ENDPOINT: 'subscriptionSyncEndpoint',
    API_TOKEN: 'subscriptionSyncApiToken',
    AUTO_ENABLED: 'subscriptionSyncAutoEnabled',
    INTERVAL_MINUTES: 'subscriptionSyncIntervalMinutes'
};

export const SUBSCRIPTION_MANAGER_STORAGE_KEYS = {
    CATEGORIES: 'subscriptionManagerCategories',
    ASSIGNMENTS: 'subscriptionManagerAssignments',
    SNAPSHOT: 'subscriptionManagerSnapshot',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PENDING_COUNT: 'subscriptionSyncPendingCount'
};

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
    LAST_STATUS: 'subscriptionAutomationLastStatus'
};

export const SYNC_INTERVAL_OPTIONS = [15, 30, 60, 180, 720, 1440];
export const SQL_EXPORT_TABLE_NAME = 'watched_videos';
export const SQL_EXPORT_IDS_PER_FILE = 200000;
export const SQL_EXPORT_VALUES_PER_STATEMENT = 300;
export const SQL_EXPORT_DOWNLOAD_DELAY_MS = 250;
export const POPUP_UI_V2_CLASS = 'yt-commander-popup-v2';
export const POPUP_UI_V2_DEFAULT_FEATURE = 'history';
export const POPUP_UI_V2_TONES = ['red', 'cyan', 'green', 'amber'];
export const POPUP_UI_V2_NAV_ITEMS = [];

export function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    setTimeout(() => {
        status.className = 'status';
    }, 3000);
}

export function formatAccountKey(accountKey) {
    const value = typeof accountKey === 'string' ? accountKey.trim() : '';
    if (!value || value === 'default') {
        return 'Not locked';
    }
    const displayValue = value.startsWith('ytch:') ? value.slice(5) : value;
    if (displayValue.length <= 22) {
        return displayValue;
    }
    return `${displayValue.slice(0, 10)}...${displayValue.slice(-8)}`;
}

export function formatRemainingMinSec(remainingMs) {
    if (!Number.isFinite(remainingMs)) {
        return '--:--:--';
    }
    const absMs = Math.abs(remainingMs);
    const totalSeconds = Math.ceil(absMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (remainingMs < 0) {
        return formatted + '!';
    }
    return formatted;
}

export function sendRuntimeMessage(message, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('Background did not respond in time'));
        }, timeoutMs);

        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'Failed to contact background'));
                    return;
                }
                resolve(response);
            });
        } catch (error) {
            if (!settled) {
                settled = true;
                clearTimeout(timeoutId);
                reject(error);
            }
        }
    });
}

export function getUnifiedApiToken() {
    const tokenInput = document.getElementById('cloudflareSyncToken') || document.getElementById('subscriptionSyncToken');
    return typeof tokenInput?.value === 'string' ? tokenInput.value.trim() : '';
}

export function normalizeWorkerBaseUrl(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
        const url = new URL(trimmed);
        let path = url.pathname.replace(/\/+$/, '');
        if (path.endsWith('/sync')) {
            path = path.slice(0, -5);
        } else if (path.endsWith('/subscriptions')) {
            path = path.slice(0, -14);
        }
        url.pathname = path === '/' ? '' : path;
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch (_error) {
        return trimmed.replace(/\/(sync|subscriptions)\/?$/i, '').replace(/\/+$/, '');
    }
}

export function buildWorkerEndpoint(baseUrl, route) {
    if (!baseUrl) return '';
    const normalized = baseUrl.replace(/\/+$/, '');
    return `${normalized}/${route.replace(/^\/+/, '')}`;
}

export function getUnifiedAutoSyncSettings() {
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle') || document.getElementById('subscriptionAutoSyncToggle');
    const intervalSelect = document.getElementById('cloudflareSyncInterval') || document.getElementById('subscriptionSyncInterval');
    const autoEnabled = !autoToggle || autoToggle.classList.contains('active');
    const fallback = intervalSelect?.id === 'subscriptionSyncInterval' ? 60 : 30;
    const intervalMinutes = normalizeSyncIntervalMinutes(intervalSelect?.value || String(fallback), fallback);
    return { autoEnabled, intervalMinutes };
}

export function normalizeSyncIntervalMinutes(raw, fallback) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (SYNC_INTERVAL_OPTIONS.includes(parsed)) return parsed;
    return parsed;
}

export function normalizeVideoIdList(videoIds) {
    const unique = [];
    const seen = new Set();
    for (const rawId of videoIds || []) {
        const videoId = typeof rawId === 'string' ? rawId.trim() : '';
        if (!/^[A-Za-z0-9_-]{10,15}$/.test(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        unique.push(videoId);
    }
    return unique;
}

export function normalizeChannelUrl(url) {
    if (typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    try {
        const parsed = new URL(trimmed, 'https://www.youtube.com');
        return parsed.pathname.replace(/\/+$/, '').toLowerCase();
    } catch (_error) {
        return trimmed.toLowerCase();
    }
}

export function normalizeHandle(handle) {
    if (typeof handle !== 'string') return '';
    const trimmed = handle.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('@') ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

export function extractChannelIdFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    try {
        const parsed = new URL(url, 'https://www.youtube.com');
        if (parsed.pathname.startsWith('/channel/')) {
            return parsed.pathname.split('/')[2] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

export function extractHandleFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    try {
        const parsed = new URL(url, 'https://www.youtube.com');
        if (parsed.pathname.startsWith('/@')) {
            return parsed.pathname.split('/')[1] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

export function resolveChannelUrl(channel) {
    if (!channel) return '';
    const rawUrl = typeof channel.url === 'string' ? channel.url.trim() : '';
    if (rawUrl) {
        try {
            return new URL(rawUrl, 'https://www.youtube.com').toString();
        } catch (_error) {
            return rawUrl;
        }
    }
    const handle = normalizeHandle(channel.handle);
    if (handle) return `https://www.youtube.com/${handle}`;
    if (channel.channelId) return `https://www.youtube.com/channel/${channel.channelId}`;
    return '';
}

export function buildChannelIndexes(list) {
    const byId = new Map();
    const byHandle = new Map();
    const byUrl = new Map();
    (list || []).forEach((channel) => {
        const channelId = typeof channel?.channelId === 'string' ? channel.channelId : '';
        const handle = typeof channel?.handle === 'string' ? channel.handle : '';
        const url = typeof channel?.url === 'string' ? channel.url : '';
        if (channelId) byId.set(channelId, channel);
        const normalizedHandle = normalizeHandle(handle);
        if (normalizedHandle) {
            byHandle.set(normalizedHandle, channelId || byHandle.get(normalizedHandle) || '');
            byHandle.set(normalizedHandle.replace(/^@/, ''), channelId || byHandle.get(normalizedHandle.replace(/^@/, '')) || '');
        }
        const normalizedUrl = normalizeChannelUrl(url);
        if (normalizedUrl) byUrl.set(normalizedUrl, channelId || byUrl.get(normalizedUrl) || '');
    });
    return { byId, byHandle, byUrl };
}

export function resolveChannelIdFromIdentity(identity, indexes) {
    if (identity.channelId && indexes.byId.has(identity.channelId)) return identity.channelId;
    const normalizedHandle = normalizeHandle(identity.handle);
    if (normalizedHandle && indexes.byHandle.has(normalizedHandle)) {
        return indexes.byHandle.get(normalizedHandle) || '';
    }
    if (normalizedHandle && indexes.byHandle.has(normalizedHandle.replace(/^@/, ''))) {
        return indexes.byHandle.get(normalizedHandle.replace(/^@/, '')) || '';
    }
    const normalizedUrl = normalizeChannelUrl(identity.url);
    if (normalizedUrl && indexes.byUrl.has(normalizedUrl)) {
        return indexes.byUrl.get(normalizedUrl) || '';
    }
    return identity.channelId || '';
}

export function normalizeCategories(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const id = typeof item.id === 'string' ? item.id : '';
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const color = typeof item.color === 'string' ? item.color : '';
            if (!id || !name) return null;
            return { id, name, color: color || `hsl(${Math.floor(Math.random() * 360)} 65% 45%)` };
        })
        .filter(Boolean);
}

export function normalizeAssignments(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const next = {};
    Object.entries(raw).forEach(([channelId, value]) => {
        if (typeof channelId !== 'string' || !channelId) return;
        const list = Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : [];
        if (list.length > 0) next[channelId] = Array.from(new Set(list));
    });
    return next;
}

export function createCategory(name, color) {
    const trimmed = name.trim();
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return { id, name: trimmed, color };
}

export function generateRandomCategoryColor(existingColors = []) {
    const existing = new Set(existingColors.map((color) => String(color).toLowerCase().trim()));
    for (let i = 0; i < 12; i += 1) {
        const hue = Math.floor(Math.random() * 360);
        const color = `hsl(${hue} 65% 45%)`;
        if (!existing.has(color.toLowerCase())) return color;
    }
    return `hsl(${Math.floor(Math.random() * 360)} 65% 45%)`;
}

export function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function escapeCsvValue(value) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    values.push(current);
    return values;
}

export function parseSubscriptionCsv(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return { rows: [], skipped: 0 };
    const header = lines[0].toLowerCase();
    if (header.includes('channel') && header.includes('category')) lines.shift();
    const rows = [];
    let skipped = 0;
    lines.forEach((line) => {
        const parts = parseCsvLine(line);
        const url = (parts[0] || '').trim();
        const category = (parts.slice(1).join(',') || '').trim();
        if (!url) { skipped += 1; return; }
        rows.push({ url, category });
    });
    return { rows, skipped };
}

export function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

export async function markSubscriptionPending(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;
    const result = await chrome.storage.local.get([SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS]);
    const existing = Array.isArray(result[SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS])
        ? result[SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS]
        : [];
    const set = new Set(existing);
    keys.forEach((key) => { if (typeof key === 'string' && key) set.add(key); });
    const next = Array.from(set);
    await chrome.storage.local.set({
        [SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS]: next,
        [SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_COUNT]: next.length
    });
    chrome.runtime.sendMessage({ type: 'SUBSCRIPTION_MANAGER_UPDATED', pendingCount: next.length }, () => {
        if (chrome.runtime.lastError) return;
    });
}

export async function resolveYouTubeTabForHistory() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
    if (activeTab?.id) return activeTab;
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    if (!tabs.length || !tabs[0]?.id) throw new Error('Open a YouTube tab first');
    return tabs[0];
}

export async function getAllWatchedVideoIdsForSqlExport() {
    const targetTab = await resolveYouTubeTabForHistory();
    try {
        const response = await chrome.tabs.sendMessage(targetTab.id, { type: 'GET_ALL_WATCHED_VIDEO_IDS' });
        if (response?.success && Array.isArray(response.videoIds)) return normalizeVideoIdList(response.videoIds);
    } catch (_error) {
        // Fallback to legacy shape below.
    }
    const legacy = await chrome.tabs.sendMessage(targetTab.id, { type: 'GET_ALL_WATCHED_VIDEOS' });
    if (!legacy?.success || !Array.isArray(legacy.videos)) {
        throw new Error(legacy?.error || 'Failed to read watched history from YouTube tab');
    }
    return normalizeVideoIdList(legacy.videos.map((entry) => entry?.videoId));
}

export function buildSqlInsertStatements(videoIds) {
    const statements = [];
    for (let index = 0; index < videoIds.length; index += SQL_EXPORT_VALUES_PER_STATEMENT) {
        const chunk = videoIds.slice(index, index + SQL_EXPORT_VALUES_PER_STATEMENT);
        if (!chunk.length) continue;
        const values = chunk.map((videoId) => `    ('${videoId}')`).join(',\n');
        statements.push(`INSERT OR IGNORE INTO ${SQL_EXPORT_TABLE_NAME} (video_id)\nVALUES\n${values};`);
    }
    return statements.join('\n\n');
}

export function buildSqlMigrationFile(videoIds, partIndex, totalParts) {
    const header = [
        '-- YouTube Commander D1 migration export',
        `-- part: ${partIndex}/${totalParts}`,
        `-- ids_in_part: ${videoIds.length}`,
        '-- generated_at: ' + new Date().toISOString(),
        '',
        `CREATE TABLE IF NOT EXISTS ${SQL_EXPORT_TABLE_NAME} (`,
        '    video_id TEXT PRIMARY KEY,',
        '    created_at INTEGER NOT NULL DEFAULT (unixepoch())',
        ');',
        ''
    ];
    const body = buildSqlInsertStatements(videoIds);
    const footer = ['', ''];
    return `${header.join('\n')}${body}${footer.join('\n')}`;
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_error) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (_err) {
            return false;
        }
    }
}

export { normalizeShortcutKey, normalizeQualityId };
