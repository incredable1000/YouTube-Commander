import { createLogger } from './utils/logger.js';
import { createBridgeClient } from './playlist-multi-select/bridge.js';
import { resolveMastheadMountPoint, isEligiblePage } from './playlist-multi-select/pageContext.js';
import { MASTHEAD_SLOT_CLASS, MASTHEAD_BUTTON_CLASS } from './playlist-multi-select/constants.js';

const logger = createLogger('SubscriptionManager');

const BRIDGE_SOURCE = 'yt-commander';
const REQUEST_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_REQUEST';
const RESPONSE_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_RESPONSE';

const ACTIONS = {
    GET_SUBSCRIPTIONS: 'GET_SUBSCRIPTIONS',
    UNSUBSCRIBE_CHANNELS: 'UNSUBSCRIBE_CHANNELS'
};

const STORAGE_KEYS = {
    CATEGORIES: 'subscriptionManagerCategories',
    ASSIGNMENTS: 'subscriptionManagerAssignments',
    SNAPSHOT: 'subscriptionManagerSnapshot',
    VIEW: 'subscriptionManagerView',
    FILTER: 'subscriptionManagerFilter',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PENDING_COUNT: 'subscriptionSyncPendingCount'
};

const SUBSCRIPTION_BUTTON_CLASS = 'yt-commander-subscription-masthead-button';
const QUICK_ADD_CONTEXT_SELECTOR = 'ytd-video-owner-renderer, ytd-reel-player-overlay-renderer, ytd-reel-channel-renderer, ytd-c4-tabbed-header-renderer';
const SUBSCRIBE_RENDERER_SELECTOR = 'ytd-subscribe-button-renderer';
const OVERLAY_CLASS = 'yt-commander-sub-manager-overlay';
const MODAL_CLASS = 'yt-commander-sub-manager-modal';
const TABLE_CLASS = 'yt-commander-sub-manager-table';
const CARDS_CLASS = 'yt-commander-sub-manager-cards';
const BADGE_CLASS = 'yt-commander-sub-manager-badge';
const BADGE_REMOVE_CLASS = 'yt-commander-sub-manager-badge-remove';
const STATUS_CLASS = 'yt-commander-sub-manager-status';
const PICKER_CLASS = 'yt-commander-sub-manager-picker';
const FILTER_BUTTON_CLASS = 'yt-commander-sub-manager-filter';
const FILTER_MENU_CLASS = 'yt-commander-sub-manager-filter-menu';
const FILTER_ITEM_CLASS = 'yt-commander-sub-manager-filter-item';
const FILTER_DOT_CLASS = 'yt-commander-sub-manager-filter-dot';
const FILTER_COUNT_CLASS = 'yt-commander-sub-manager-filter-count';
const QUICK_ADD_CLASS = 'yt-commander-sub-manager-quick-add';
const MODAL_VERSION = '2026-03-13-1';

const ITEMS_PER_PAGE = 100;
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const API_COOLDOWN_MS = 5 * 60 * 1000;

const bridgeClient = createBridgeClient({
    source: BRIDGE_SOURCE,
    requestType: REQUEST_TYPE,
    responseType: RESPONSE_TYPE,
    timeoutMs: 30000,
    requestPrefix: 'ytc-subscription'
});

let isInitialized = false;
let mastheadSlot = null;
let mastheadButton = null;

let overlay = null;
let modal = null;
let tableWrap = null;
let cardsWrap = null;
let statusEl = null;
let selectionBadgeEl = null;
let pageInfoEl = null;
let pagePrevButton = null;
let pageNextButton = null;
let viewTableButton = null;
let viewCardButton = null;
let filterButton = null;
let filterLabelEl = null;
let filterMenu = null;
let addCategoryButton = null;
let removeCategoryButton = null;
let unsubscribeButton = null;

let picker = null;
let pickerMode = 'toggle';
let pickerTargetIds = [];
let pickerAnchorEl = null;
let filterMenuOpen = false;
let filterAnchorEl = null;

let channels = [];
let channelsFetchedAt = 0;
let lastFetchAttemptAt = 0;
let channelsVersion = 0;
let channelsById = new Map();
let channelsByHandle = new Map();
let channelsByUrl = new Map();
let categories = [];
let assignments = {};
let categoriesVersion = 0;
let assignmentsVersion = 0;
let assignmentCache = new Map();
let categoryCountsCache = null;
let categoryCountsCacheKey = '';
let lastSnapshotHash = '';
let viewMode = 'table';
let filterMode = 'all';
let currentPage = 1;
let selectedChannelIds = new Set();
let lastRenderState = null;
let tableRowById = new Map();
let cardById = new Map();

let quickAddObserver = null;
let quickAddPending = false;

function resetModalElements() {
    const existingOverlay = document.querySelector(`.${OVERLAY_CLASS}`);
    if (existingOverlay) {
        existingOverlay.remove();
    }
    if (filterMenu && filterMenu.isConnected) {
        filterMenu.remove();
    }
    const strayFilterMenu = document.querySelector(`.${FILTER_MENU_CLASS}`);
    if (strayFilterMenu) {
        strayFilterMenu.remove();
    }
    if (picker && picker.isConnected) {
        picker.remove();
    }
    const strayPicker = document.querySelector(`.${PICKER_CLASS}`);
    if (strayPicker) {
        strayPicker.remove();
    }

    overlay = null;
    modal = null;
    tableWrap = null;
    cardsWrap = null;
    statusEl = null;
    selectionBadgeEl = null;
    pageInfoEl = null;
    pagePrevButton = null;
    pageNextButton = null;
    viewTableButton = null;
    viewCardButton = null;
    filterButton = null;
    filterLabelEl = null;
    filterMenu = null;
    addCategoryButton = null;
    removeCategoryButton = null;
    unsubscribeButton = null;
    picker = null;
    pickerAnchorEl = null;
    pickerTargetIds = [];
    pickerMode = 'toggle';
    filterMenuOpen = false;
    filterAnchorEl = null;
    tableRowById.clear();
    cardById.clear();
}

/**
 * Storage helper.
 * @param {string[]} keys
 * @returns {Promise<object>}
 */
function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}

/**
 * Storage helper.
 * @param {object} values
 * @returns {Promise<void>}
 */
function storageSet(values) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Failed to save subscription manager data'));
                return;
            }
            resolve();
        });
    });
}

/**
 * Build SVG icon.
 * @param {string} path
 * @returns {SVGSVGElement}
 */
function createIcon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    svg.appendChild(p);
    return svg;
}

/**
 * Subscription manager icon.
 * @returns {SVGSVGElement}
 */
function createSubscriptionIcon() {
    return createIcon('M4 5h11v2H4V5zm0 4h11v2H4V9zm0 4h11v2H4v-2zm13-7h3v9h-3V6zm-1 10H4v2h12v-2z');
}
/**
 * Quick add icon.
 * @returns {SVGSVGElement}
 */
function createQuickAddIcon() {
    return createIcon('M12 5v14M5 12h14');
}

const ICONS = {
    table: 'M3 3h18v18H3V3zm2 2v6h6V5H5zm8 0v6h6V5h-6zM5 13v6h6v-6H5zm8 0v6h6v-6h-6z',
    card: 'M4 6h16v12H4V6zm2 2h12v3H6V8zm0 5h8v3H6v-3z',
    plus: 'M11 5h2v14h-2zM5 11h14v2H5z',
    minus: 'M5 11h14v2H5z',
    trash: 'M6 7h12v2H6V7zm2 3h8v9H8v-9zm3-7h2l1 2H10l1-2z',
    prev: 'M15.41 7.41 14 6 8 12 14 18 15.41 16.59 10.83 12z',
    next: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z'
};

/**
 * Apply icon-only button styling and tooltips.
 * @param {HTMLButtonElement} button
 * @param {string} iconPath
 * @param {string} label
 */
function setIconButton(button, iconPath, label) {
    if (!button) {
        return;
    }
    button.textContent = '';
    const icon = createIcon(iconPath);
    icon.classList.add('yt-commander-sub-manager-icon');
    button.appendChild(icon);
    button.classList.add('yt-commander-sub-manager-icon-btn');
    if (label) {
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('data-tooltip', label);
        button.classList.add('yt-commander-sub-manager-tooltip');
    }
}

/**
 * Normalize categories list.
 * @param {any} raw
 * @returns {Array<{id: string, name: string, color: string}>}
 */
function normalizeCategories(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }
            const id = typeof item.id === 'string' ? item.id : '';
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            const color = typeof item.color === 'string' ? item.color : '';
            if (!id || !name) {
                return null;
            }
            return {
                id,
                name,
                color: color || pickCategoryColor(name)
            };
        })
        .filter(Boolean);
}

/**
 * Normalize assignments map.
 * @param {any} raw
 * @returns {object}
 */
function normalizeAssignments(raw) {
    if (!raw || typeof raw !== 'object') {
        return {};
    }

    const next = {};
    Object.entries(raw).forEach(([channelId, value]) => {
        if (typeof channelId !== 'string' || !channelId) {
            return;
        }
        const list = Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : [];
        if (list.length > 0) {
            next[channelId] = Array.from(new Set(list));
        }
    });
    return next;
}

/**
 * Pick deterministic category color.
 * @param {string} name
 * @returns {string}
 */
function pickCategoryColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 65% 42%)`;
}
/**
 * Normalize handle for lookups.
 * @param {string} handle
 * @returns {string}
 */
function normalizeHandle(handle) {
    if (typeof handle !== 'string') {
        return '';
    }
    const trimmed = handle.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed.startsWith('@') ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}
/**
 * Normalize channel URL for lookups.
 * @param {string} url
 * @returns {string}
 */
function normalizeChannelUrl(url) {
    if (typeof url !== 'string') {
        return '';
    }
    const trimmed = url.trim();
    if (!trimmed) {
        return '';
    }
    try {
        const parsed = new URL(trimmed, location.origin);
        return parsed.pathname.replace(/\/+$/, '').toLowerCase();
    } catch (_error) {
        return trimmed.toLowerCase();
    }
}

/**
 * Rebuild channel lookup maps.
 * @param {Array<object>} list
 */
function rebuildChannelIndexes(list) {
    channelsById = new Map();
    channelsByHandle = new Map();
    channelsByUrl = new Map();

    (list || []).forEach((channel) => {
        const channelId = typeof channel?.channelId === 'string' ? channel.channelId : '';
        const handle = typeof channel?.handle === 'string' ? channel.handle : '';
        const url = typeof channel?.url === 'string' ? channel.url : '';
        if (channelId) {
            channelsById.set(channelId, channel);
        }
        const normalizedHandle = normalizeHandle(handle);
        if (normalizedHandle) {
            channelsByHandle.set(normalizedHandle, channelId || channelsByHandle.get(normalizedHandle) || '');
            channelsByHandle.set(normalizedHandle.replace(/^@/, ''), channelId || channelsByHandle.get(normalizedHandle.replace(/^@/, '')) || '');
        }
        const normalizedUrl = normalizeChannelUrl(url);
        if (normalizedUrl) {
            channelsByUrl.set(normalizedUrl, channelId || channelsByUrl.get(normalizedUrl) || '');
        }
    });

    channelsVersion += 1;
    categoryCountsCacheKey = '';
    lastRenderState = null;
}

/**
 * Mark categories changed for memoized views.
 */
function markCategoriesDirty() {
    categoriesVersion += 1;
    categoryCountsCacheKey = '';
    lastRenderState = null;
}

/**
 * Mark assignments changed for memoized views.
 */
function markAssignmentsDirty() {
    assignmentsVersion += 1;
    assignmentCache.clear();
    categoryCountsCacheKey = '';
    lastRenderState = null;
}

/**
 * Memoized category counts.
 * @returns {Record<string, number>}
 */
function getCategoryCounts() {
    const key = `${channelsVersion}:${assignmentsVersion}:${categoriesVersion}`;
    if (categoryCountsCacheKey === key && categoryCountsCache) {
        return categoryCountsCache;
    }

    const counts = { all: channels.length, uncategorized: 0 };
    categories.forEach((category) => {
        counts[category.id] = 0;
    });

    channels.forEach((channel) => {
        const channelId = channel?.channelId || '';
        if (!channelId) {
            return;
        }
        const assigned = readChannelAssignments(channelId);
        if (!assigned || assigned.length === 0) {
            counts.uncategorized += 1;
            return;
        }
        assigned.forEach((categoryId) => {
            if (typeof counts[categoryId] === 'number') {
                counts[categoryId] += 1;
            }
        });
    });

    categoryCountsCache = counts;
    categoryCountsCacheKey = key;
    return counts;
}

/**
 * Load stored category and assignment data.
 * @returns {Promise<void>}
 */
async function loadLocalState() {
    const result = await storageGet([
        STORAGE_KEYS.CATEGORIES,
        STORAGE_KEYS.ASSIGNMENTS,
        STORAGE_KEYS.VIEW,
        STORAGE_KEYS.FILTER
    ]);

    categories = normalizeCategories(result[STORAGE_KEYS.CATEGORIES]);
    assignments = normalizeAssignments(result[STORAGE_KEYS.ASSIGNMENTS]);
    markCategoriesDirty();
    markAssignmentsDirty();
    viewMode = result[STORAGE_KEYS.VIEW] === 'card' ? 'card' : 'table';
    filterMode = typeof result[STORAGE_KEYS.FILTER] === 'string' ? result[STORAGE_KEYS.FILTER] : 'all';
}

/**
 * Persist categories + assignments.
 * @returns {Promise<void>}
 */
async function persistLocalState() {
    await storageSet({
        [STORAGE_KEYS.CATEGORIES]: categories,
        [STORAGE_KEYS.ASSIGNMENTS]: assignments
    });
}

/**
 * Persist view and filter settings.
 * @returns {Promise<void>}
 */
async function persistViewState() {
    await storageSet({
        [STORAGE_KEYS.VIEW]: viewMode,
        [STORAGE_KEYS.FILTER]: filterMode
    });
}

/**
 * Read channel assignments.
 * @param {string} channelId
 * @returns {string[]}
 */
function readChannelAssignments(channelId) {
    if (!channelId) {
        return [];
    }
    if (assignmentCache.has(channelId)) {
        return assignmentCache.get(channelId);
    }
    const list = assignments[channelId];
    const normalized = Array.isArray(list) ? list : [];
    assignmentCache.set(channelId, normalized);
    return normalized;
}

/**
 * Update assignments for channel.
 * @param {string} channelId
 * @param {string[]} next
 */
function writeChannelAssignments(channelId, next) {
    if (!channelId) {
        return;
    }
    const normalized = Array.from(new Set(next));
    if (normalized.length === 0) {
        delete assignments[channelId];
        assignmentCache.delete(channelId);
        markAssignmentsDirty();
        return;
    }
    assignments[channelId] = normalized;
    assignmentCache.set(channelId, normalized);
    markAssignmentsDirty();
}

/**
 * Compute a stable hash for subscription IDs.
 * @param {Array<{channelId: string}>} list
 * @returns {string}
 */
function computeSnapshotHash(list) {
    if (!Array.isArray(list)) {
        return '';
    }
    return list
        .map((item) => item?.channelId)
        .filter((id) => typeof id === 'string' && id)
        .sort()
        .join('|');
}

/**
 * Save snapshot to storage.
 * @param {Array<object>} list
 * @param {string} hash
 * @returns {Promise<void>}
 */
async function persistSnapshot(list, hash) {
    await storageSet({
        [STORAGE_KEYS.SNAPSHOT]: {
            channels: list,
            fetchedAt: Date.now(),
            hash
        }
    });
}
/**
 * Hydrate snapshot from storage for fast rendering.
 * @returns {Promise<boolean>}
 */
async function hydrateSnapshotFromStorage() {
    const stored = await storageGet([STORAGE_KEYS.SNAPSHOT]);
    const snapshot = stored?.[STORAGE_KEYS.SNAPSHOT];
    if (!snapshot || !Array.isArray(snapshot.channels)) {
        return false;
    }

    const fetchedAt = Number(snapshot.fetchedAt) || 0;
    if (channels.length > 0 && fetchedAt <= channelsFetchedAt) {
        return true;
    }

    channels = snapshot.channels;
    channelsFetchedAt = fetchedAt;
    lastSnapshotHash = typeof snapshot.hash === 'string' ? snapshot.hash : computeSnapshotHash(channels);
    rebuildChannelIndexes(channels);
    return true;
}

/**
 * Mark pending sync keys.
 * @param {string[]} keys
 * @returns {Promise<void>}
 */
async function markPending(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
        return;
    }
    const result = await storageGet([STORAGE_KEYS.PENDING_KEYS]);
    const existing = Array.isArray(result[STORAGE_KEYS.PENDING_KEYS])
        ? result[STORAGE_KEYS.PENDING_KEYS]
        : [];
    const set = new Set(existing);
    keys.forEach((key) => {
        if (typeof key === 'string' && key) {
            set.add(key);
        }
    });
    const next = Array.from(set);
    await storageSet({
        [STORAGE_KEYS.PENDING_KEYS]: next,
        [STORAGE_KEYS.PENDING_COUNT]: next.length
    });

    chrome.runtime.sendMessage({
        type: 'SUBSCRIPTION_MANAGER_UPDATED',
        pendingCount: next.length
    }, () => {
        if (chrome.runtime.lastError) {
            return;
        }
    });
}

/**
 * Ensure masthead slot exists.
 */
function ensureMastheadSlot() {
    if (mastheadSlot && mastheadSlot.isConnected) {
        return;
    }

    mastheadSlot = document.querySelector(`.${MASTHEAD_SLOT_CLASS}`);
    if (!mastheadSlot) {
        mastheadSlot = document.createElement('div');
        mastheadSlot.className = MASTHEAD_SLOT_CLASS;
    }

    const mountPoint = resolveMastheadMountPoint();
    if (mountPoint && mastheadSlot.parentElement !== mountPoint.parent) {
        mountPoint.parent.insertBefore(mastheadSlot, mountPoint.anchor);
    } else if (!mountPoint && !mastheadSlot.isConnected) {
        document.body.appendChild(mastheadSlot);
    }
}

/**
 * Ensure masthead button exists.
 */
function ensureMastheadButton() {
    ensureMastheadSlot();

    if (!mastheadButton) {
        mastheadButton = document.createElement('button');
        mastheadButton.type = 'button';
        mastheadButton.className = `${MASTHEAD_BUTTON_CLASS} ${SUBSCRIPTION_BUTTON_CLASS}`;
        mastheadButton.setAttribute('aria-label', 'Subscription manager');
        mastheadButton.setAttribute('title', 'Subscription manager');
        mastheadButton.setAttribute('data-tooltip', 'Subscription manager');
        mastheadButton.appendChild(createSubscriptionIcon());
        mastheadButton.addEventListener('click', handleOpenManagerClick);
    }

    if (!mastheadButton.parentElement || mastheadButton.parentElement !== mastheadSlot) {
        mastheadSlot.appendChild(mastheadButton);
    }

    updateMastheadVisibility();
}

/**
 * Update masthead visibility based on page eligibility.
 */
function updateMastheadVisibility() {
    if (!mastheadSlot) {
        return;
    }
    mastheadSlot.style.display = isEligiblePage() ? '' : 'none';
}
/**
 * Extract channel ID from a YouTube URL.
 * @param {string} url
 * @returns {string}
 */
function extractChannelIdFromUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }
    try {
        const parsed = new URL(url, location.origin);
        if (parsed.pathname.startsWith('/channel/')) {
            return parsed.pathname.split('/')[2] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

/**
 * Extract handle from a YouTube URL.
 * @param {string} url
 * @returns {string}
 */
function extractHandleFromUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }
    try {
        const parsed = new URL(url, location.origin);
        if (parsed.pathname.startsWith('/@')) {
            return parsed.pathname.split('/')[1] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

/**
 * Resolve channel identity near a subscribe renderer.
 * @param {Element|null} renderer
 * @returns {{channelId: string, handle: string, url: string}}
 */
function resolveChannelIdentityFromContext(renderer) {
    let channelId = '';
    let handle = '';
    let url = '';

    if (renderer) {
        channelId = renderer.getAttribute('channel-external-id')
            || renderer.getAttribute('channel-id')
            || renderer.dataset?.channelExternalId
            || renderer.dataset?.channelId
            || '';
    }

    if (!channelId) {
        const flexy = document.querySelector('ytd-watch-flexy[channel-id]');
        channelId = flexy?.getAttribute('channel-id') || '';
    }

    if (!channelId) {
        const reel = document.querySelector('ytd-reel-video-renderer[is-active][channel-id]');
        channelId = reel?.getAttribute('channel-id') || '';
    }

    const context = renderer?.closest(QUICK_ADD_CONTEXT_SELECTOR) || renderer;
    const link = context?.querySelector('a[href^="/channel/"], a[href^="/@@"]');
    if (link) {
        url = link.getAttribute('href') || '';
    }

    if (!url) {
        const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        url = canonical;
    }

    handle = extractHandleFromUrl(url) || '';
    if (!channelId) {
        channelId = extractChannelIdFromUrl(url);
    }

    return { channelId, handle, url };
}

/**
 * Resolve channel ID from cached indexes.
 * @param {{channelId: string, handle: string, url: string}} identity
 * @returns {string}
 */
function resolveChannelIdFromIdentity(identity) {
    if (identity.channelId && channelsById.has(identity.channelId)) {
        return identity.channelId;
    }
    const normalizedHandle = normalizeHandle(identity.handle);
    if (normalizedHandle && channelsByHandle.has(normalizedHandle)) {
        return channelsByHandle.get(normalizedHandle) || '';
    }
    if (normalizedHandle && channelsByHandle.has(normalizedHandle.replace(/^@/, ''))) {
        return channelsByHandle.get(normalizedHandle.replace(/^@/, '')) || '';
    }
    const normalizedUrl = normalizeChannelUrl(identity.url);
    if (normalizedUrl && channelsByUrl.has(normalizedUrl)) {
        return channelsByUrl.get(normalizedUrl) || '';
    }
    return identity.channelId || '';
}

/**
 * Build quick add button.
 * @param {{channelId: string, handle: string, url: string}} identity
 * @returns {HTMLButtonElement}
 */
function buildQuickAddButton(identity) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = QUICK_ADD_CLASS;
    button.setAttribute('aria-label', 'Add to category');
    button.setAttribute('title', 'Add to category');
    button.appendChild(createQuickAddIcon());
    if (identity.channelId) {
        button.setAttribute('data-channel-id', identity.channelId);
    }
    if (identity.handle) {
        button.setAttribute('data-channel-handle', identity.handle);
    }
    if (identity.url) {
        button.setAttribute('data-channel-url', identity.url);
    }
    button.addEventListener('click', handleQuickAddClick);
    return button;
}

/**
 * Ensure quick add buttons on subscribe renderers.
 */
function ensureQuickAddButtons() {
    const renderers = Array.from(document.querySelectorAll(SUBSCRIBE_RENDERER_SELECTOR));
    renderers.forEach((renderer) => {
        if (!renderer.closest(QUICK_ADD_CONTEXT_SELECTOR)) {
            return;
        }
        if (renderer.dataset.ytcQuickAdd === 'true') {
            return;
        }
        const parent = renderer.parentElement;
        if (!parent) {
            return;
        }
        if (parent.querySelector(`.${QUICK_ADD_CLASS}`)) {
            renderer.dataset.ytcQuickAdd = 'true';
            return;
        }

        const identity = resolveChannelIdentityFromContext(renderer);
        const button = buildQuickAddButton(identity);
        renderer.insertAdjacentElement('afterend', button);
        renderer.dataset.ytcQuickAdd = 'true';
    });
}

function scheduleQuickAddScan() {
    if (quickAddPending) {
        return;
    }
    quickAddPending = true;
    window.requestAnimationFrame(() => {
        quickAddPending = false;
        ensureQuickAddButtons();
    });
}

function startQuickAddObserver() {
    if (quickAddObserver) {
        return;
    }
    quickAddObserver = new MutationObserver(scheduleQuickAddScan);
    quickAddObserver.observe(document.body, { childList: true, subtree: true });
    scheduleQuickAddScan();
}

async function handleQuickAddClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const renderer = button.closest(SUBSCRIBE_RENDERER_SELECTOR);
    const identity = resolveChannelIdentityFromContext(renderer);

    let channelId = button.getAttribute('data-channel-id') || '';
    if (!channelId) {
        channelId = resolveChannelIdFromIdentity(identity);
    }

    if (!channelId && (identity.handle || identity.url)) {
        await loadSubscriptions({ force: true, background: true });
        channelId = resolveChannelIdFromIdentity(identity);
    }

    if (!channelId) {
        setStatus('Unable to resolve channel for category.', 'error');
        return;
    }

    ensurePicker();
    openPicker(button, 'toggle', [channelId]);
}

/**
 * Ensure modal elements exist.
 */
function ensureModal() {
    if (overlay && overlay.isConnected && overlay.dataset?.ytcVersion === MODAL_VERSION) {
        return;
    }

    resetModalElements();

    overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.dataset.ytcVersion = MODAL_VERSION;

    modal = document.createElement('div');
    modal.className = MODAL_CLASS;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Subscription manager');

    const header = document.createElement('div');
    header.className = 'yt-commander-sub-manager-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yt-commander-sub-manager-title-wrap';

    const titleRow = document.createElement('div');
    titleRow.className = 'yt-commander-sub-manager-title-row';

    const title = document.createElement('div');
    title.className = 'yt-commander-sub-manager-title';
    title.textContent = 'Subscription Manager';

    selectionBadgeEl = document.createElement('span');
    selectionBadgeEl.className = 'yt-commander-sub-manager-selected-badge';
    selectionBadgeEl.setAttribute('aria-live', 'polite');
    selectionBadgeEl.style.display = 'none';

    titleRow.appendChild(title);
    titleRow.appendChild(selectionBadgeEl);

    const subtitle = document.createElement('div');
    subtitle.className = 'yt-commander-sub-manager-subtitle';
    subtitle.textContent = 'Manage subscriptions with categories and bulk actions.';

    titleWrap.appendChild(titleRow);
    titleWrap.appendChild(subtitle);

    const headerActions = document.createElement('div');
    headerActions.className = 'yt-commander-sub-manager-header-actions';

    viewTableButton = document.createElement('button');
    viewTableButton.type = 'button';
    viewTableButton.className = 'yt-commander-sub-manager-toggle';
    viewTableButton.setAttribute('data-action', 'view-table');
    setIconButton(viewTableButton, ICONS.table, 'Table view');

    viewCardButton = document.createElement('button');
    viewCardButton.type = 'button';
    viewCardButton.className = 'yt-commander-sub-manager-toggle';
    viewCardButton.setAttribute('data-action', 'view-card');
    setIconButton(viewCardButton, ICONS.card, 'Card view');

    filterButton = document.createElement('button');
    filterButton.type = 'button';
    filterButton.className = FILTER_BUTTON_CLASS;
    filterButton.setAttribute('data-action', 'filter-toggle');
    filterLabelEl = document.createElement('span');
    filterLabelEl.className = 'yt-commander-sub-manager-filter-label';
    filterLabelEl.textContent = 'All categories';
    const filterAdd = document.createElement('span');
    filterAdd.className = 'yt-commander-sub-manager-filter-add';
    filterAdd.setAttribute('data-action', 'new-category');
    filterAdd.setAttribute('role', 'button');
    filterAdd.setAttribute('aria-label', 'New category');
    filterAdd.setAttribute('title', 'New category');
    filterAdd.setAttribute('data-tooltip', 'New category');
    filterAdd.classList.add('yt-commander-sub-manager-tooltip');
    const filterAddIcon = createIcon(ICONS.plus);
    filterAddIcon.classList.add('yt-commander-sub-manager-icon');
    filterAdd.appendChild(filterAddIcon);
    filterButton.appendChild(filterLabelEl);
    filterButton.appendChild(filterAdd);

    unsubscribeButton = document.createElement('button');
    unsubscribeButton.type = 'button';
    unsubscribeButton.className = 'yt-commander-sub-manager-btn danger';
    unsubscribeButton.setAttribute('data-action', 'unsubscribe-selected');
    setIconButton(unsubscribeButton, ICONS.trash, 'Unsubscribe selected');

    addCategoryButton = document.createElement('button');
    addCategoryButton.type = 'button';
    addCategoryButton.className = 'yt-commander-sub-manager-btn';
    addCategoryButton.setAttribute('data-action', 'add-category-selected');
    setIconButton(addCategoryButton, ICONS.plus, 'Add category');

    removeCategoryButton = document.createElement('button');
    removeCategoryButton.type = 'button';
    removeCategoryButton.className = 'yt-commander-sub-manager-btn secondary';
    removeCategoryButton.setAttribute('data-action', 'remove-category-selected');
    setIconButton(removeCategoryButton, ICONS.minus, 'Remove category');

    headerActions.appendChild(viewTableButton);
    headerActions.appendChild(viewCardButton);
    headerActions.appendChild(filterButton);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'yt-commander-sub-manager-action-group';
    actionGroup.appendChild(unsubscribeButton);
    actionGroup.appendChild(addCategoryButton);
    actionGroup.appendChild(removeCategoryButton);
    headerActions.appendChild(actionGroup);
    if (!filterMenu || !filterMenu.isConnected) {
        filterMenu = document.createElement('div');
        filterMenu.className = FILTER_MENU_CLASS;
        filterMenu.setAttribute('role', 'menu');
        filterMenu.style.display = 'none';
        filterMenu.addEventListener('click', handleFilterMenuClick);
        document.body.appendChild(filterMenu);
    }

    header.appendChild(titleWrap);
    header.appendChild(headerActions);

    const content = document.createElement('div');
    content.className = 'yt-commander-sub-manager-content';

    tableWrap = document.createElement('div');
    tableWrap.className = TABLE_CLASS;

    cardsWrap = document.createElement('div');
    cardsWrap.className = CARDS_CLASS;

    content.appendChild(tableWrap);
    content.appendChild(cardsWrap);

    statusEl = document.createElement('div');
    statusEl.className = STATUS_CLASS;
    statusEl.setAttribute('aria-live', 'polite');

    const footer = document.createElement('div');
    footer.className = 'yt-commander-sub-manager-footer';

    pagePrevButton = document.createElement('button');
    pagePrevButton.type = 'button';
    pagePrevButton.className = 'yt-commander-sub-manager-btn secondary';
    pagePrevButton.setAttribute('data-action', 'page-prev');
    setIconButton(pagePrevButton, ICONS.prev, 'Previous page');

    pageInfoEl = document.createElement('div');
    pageInfoEl.className = 'yt-commander-sub-manager-page-info';
    pageInfoEl.textContent = 'Page 1 of 1';

    pageNextButton = document.createElement('button');
    pageNextButton.type = 'button';
    pageNextButton.className = 'yt-commander-sub-manager-btn secondary';
    pageNextButton.setAttribute('data-action', 'page-next');
    setIconButton(pageNextButton, ICONS.next, 'Next page');

    footer.appendChild(pagePrevButton);
    footer.appendChild(pageInfoEl);
    footer.appendChild(pageNextButton);

    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(statusEl);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', handleOverlayClick);
    modal.addEventListener('click', handleModalClick);
    modal.addEventListener('change', handleModalChange);

    ensurePicker();
}

/**
 * Ensure category picker exists.
 */
function ensurePicker() {
    if (picker && picker.isConnected) {
        return;
    }

    picker = document.createElement('div');
    picker.className = PICKER_CLASS;
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', 'Category picker');
    picker.style.display = 'none';

    picker.addEventListener('click', handlePickerClick);
    document.body.appendChild(picker);
}

/**
 * Render category picker options.
 */
function renderPicker() {
    if (!picker) {
        return;
    }

    picker.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'yt-commander-sub-manager-picker-title';
    title.textContent = pickerMode === 'remove' ? 'Remove category' : 'Add category';

    const list = document.createElement('div');
    list.className = 'yt-commander-sub-manager-picker-list';

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-picker-empty';
        empty.textContent = 'No categories yet.';
        list.appendChild(empty);
    } else {
        categories.forEach((category) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'yt-commander-sub-manager-picker-item';
            button.setAttribute('data-category-id', category.id);
            const dot = document.createElement('span');
            dot.className = 'yt-commander-sub-manager-picker-dot';
            dot.style.backgroundColor = category.color;
            const label = document.createElement('span');
            label.textContent = category.name;
            button.appendChild(dot);
            button.appendChild(label);
            list.appendChild(button);
        });
    }

    const footer = document.createElement('div');
    footer.className = 'yt-commander-sub-manager-picker-footer';
    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'yt-commander-sub-manager-btn secondary';
    newButton.setAttribute('data-action', 'picker-new-category');
    setIconButton(newButton, ICONS.plus, 'New category');
    footer.appendChild(newButton);

    picker.appendChild(title);
    picker.appendChild(list);
    picker.appendChild(footer);
}

/**
 * Show picker.
 * @param {HTMLElement} anchor
 * @param {string} mode
 * @param {string[]} channelIds
 */
function openPicker(anchor, mode, channelIds) {
    if (!picker) {
        return;
    }
    pickerMode = mode;
    pickerTargetIds = Array.isArray(channelIds) ? channelIds : [];
    pickerAnchorEl = anchor;
    renderPicker();
    positionPicker();
    picker.style.display = 'block';
}

/**
 * Hide picker.
 */
function closePicker() {
    if (!picker) {
        return;
    }
    picker.style.display = 'none';
    pickerAnchorEl = null;
    pickerTargetIds = [];
}

/**
 * Position picker near anchor.
 */
function positionPicker() {
    if (!picker || !pickerAnchorEl) {
        return;
    }
    const rect = pickerAnchorEl.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();
    const padding = 8;
    let top = rect.bottom + padding;
    let left = rect.left;

    if (top + pickerRect.height > window.innerHeight - padding) {
        top = rect.top - pickerRect.height - padding;
    }

    if (left + pickerRect.width > window.innerWidth - padding) {
        left = window.innerWidth - pickerRect.width - padding;
    }

    picker.style.top = `${Math.max(padding, top)}px`;
    picker.style.left = `${Math.max(padding, left)}px`;
}

/**
 * Create a category.
 * @param {string} name
 * @returns {{id: string, name: string, color: string}}
 */
function createCategory(name) {
    const trimmed = name.trim();
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return {
        id,
        name: trimmed,
        color: pickCategoryColor(trimmed)
    };
}

/**
 * Update categories dropdown options.
 */
function getFilterLabel(value) {
    if (value === 'all') {
        return 'All categories';
    }
    if (value === 'uncategorized') {
        return 'Uncategorized';
    }
    const category = categories.find((item) => item.id === value);
    return category ? category.name : 'All categories';
}

function updateFilterButtonLabel() {
    if (!filterButton) {
        return;
    }
    const counts = getCategoryCounts();
    const label = getFilterLabel(filterMode);
    const count = typeof counts[filterMode] === 'number' ? counts[filterMode] : counts.all || 0;
    const text = `${label} (${count})`;
    if (filterLabelEl) {
        filterLabelEl.textContent = text;
        return;
    }
    filterButton.textContent = text;
}

function renderFilterMenu() {
    if (!filterButton || !filterMenu) {
        return;
    }

    const counts = getCategoryCounts();
    const validIds = new Set(['all', 'uncategorized', ...categories.map((category) => category.id)]);
    if (!validIds.has(filterMode)) {
        filterMode = 'all';
        persistViewState().catch(() => undefined);
    }

    filterMenu.innerHTML = '';

    const addItem = (id, label, color, options = {}) => {
        const item = document.createElement('div');
        item.className = FILTER_ITEM_CLASS;
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '0');
        item.setAttribute('data-filter-id', id);
        if (filterMode === id) {
            item.classList.add('active');
        }

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const dot = document.createElement('span');
        dot.className = FILTER_DOT_CLASS;
        dot.style.backgroundColor = color;

        const name = document.createElement('span');
        name.className = 'yt-commander-sub-manager-filter-name';
        name.textContent = label;

        left.appendChild(dot);
        left.appendChild(name);

        const right = document.createElement('span');
        right.className = 'yt-commander-sub-manager-filter-right';

        const count = document.createElement('span');
        count.className = FILTER_COUNT_CLASS;
        count.textContent = String(typeof counts[id] === 'number' ? counts[id] : 0);

        right.appendChild(count);

        if (options.removable) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'yt-commander-sub-manager-filter-remove';
            remove.setAttribute('data-action', 'filter-remove');
            remove.setAttribute('data-category-id', id);
            remove.setAttribute('aria-label', `Remove ${label}`);
            remove.setAttribute('title', `Remove ${label}`);
            remove.setAttribute('data-tooltip', `Remove ${label}`);
            remove.classList.add('yt-commander-sub-manager-tooltip');
            const removeIcon = createIcon(ICONS.trash);
            removeIcon.classList.add('yt-commander-sub-manager-icon');
            remove.appendChild(removeIcon);
            right.appendChild(remove);
        }

        item.appendChild(left);
        item.appendChild(right);
        filterMenu.appendChild(item);
    };

    addItem('all', 'All categories', '#616b7f');
    addItem('uncategorized', 'Uncategorized', '#3b4457');
    categories.forEach((category) => addItem(category.id, category.name, category.color, { removable: true }));

    updateFilterButtonLabel();
}

function positionFilterMenu() {
    if (!filterMenu) {
        return;
    }
    const anchor = filterAnchorEl || filterButton;
    if (!anchor) {
        return;
    }
    const rect = anchor.getBoundingClientRect();
    const menuRect = filterMenu.getBoundingClientRect();
    const padding = 8;
    let top = rect.bottom + padding;
    let left = rect.left;

    if (top + menuRect.height > window.innerHeight - padding) {
        top = rect.top - menuRect.height - padding;
    }

    if (left + menuRect.width > window.innerWidth - padding) {
        left = window.innerWidth - menuRect.width - padding;
    }

    filterMenu.style.top = `${Math.max(padding, top)}px`;
    filterMenu.style.left = `${Math.max(padding, left)}px`;
}

function openFilterMenu(anchor) {
    if (!filterMenu) {
        return;
    }
    filterMenuOpen = true;
    filterAnchorEl = anchor || filterButton;
    renderFilterMenu();
    positionFilterMenu();
    filterMenu.style.display = 'block';
}

function closeFilterMenu() {
    if (!filterMenu) {
        return;
    }
    filterMenuOpen = false;
    filterMenu.style.display = 'none';
    filterAnchorEl = null;
}

function toggleFilterMenu(anchor) {
    if (filterMenuOpen) {
        closeFilterMenu();
        return;
    }
    openFilterMenu(anchor);
}

function handleFilterMenuClick(event) {
    const baseTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const removeTarget = baseTarget?.closest('[data-action="filter-remove"]');
    if (removeTarget) {
        event.preventDefault();
        event.stopPropagation();
        const categoryId = removeTarget.getAttribute('data-category-id') || '';
        removeCategory(categoryId).catch(() => undefined);
        return;
    }
    const target = baseTarget?.closest('[data-filter-id]');
    if (!target) {
        return;
    }
    filterMode = target.getAttribute('data-filter-id') || 'all';
    currentPage = 1;
    persistViewState().catch(() => undefined);
    closeFilterMenu();
    renderList();
}

/**
 * Remove category and associated assignments.
 * @param {string} categoryId
 * @returns {Promise<void>}
 */
async function removeCategory(categoryId) {
    if (!categoryId) {
        return;
    }
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
        return;
    }
    const confirmText = `Remove category "${category.name}"? This will unassign it from all channels.`;
    if (!window.confirm(confirmText)) {
        return;
    }

    categories = categories.filter((item) => item.id !== categoryId);
    markCategoriesDirty();

    const updatedKeys = [`category:${categoryId}`];
    let affected = 0;
    Object.entries(assignments).forEach(([channelId, list]) => {
        if (!Array.isArray(list) || !list.includes(categoryId)) {
            return;
        }
        const next = list.filter((id) => id !== categoryId);
        if (next.length > 0) {
            assignments[channelId] = next;
        } else {
            delete assignments[channelId];
        }
        updatedKeys.push(`channel:${channelId}`);
        affected += 1;
    });

    if (affected > 0) {
        markAssignmentsDirty();
    }

    await persistLocalState();
    await markPending(updatedKeys);
    setStatus(`Removed "${category.name}" from ${affected} channel(s).`, 'success');
    renderFilterMenu();
    renderList();
}

/**
 * Render status message.
 * @param {string} message
 * @param {string} [kind]
 */
function setStatus(message, kind = 'info') {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message;
    statusEl.setAttribute('data-status', kind);
}

/**
 * Format subscription load errors for the UI.
 * @param {any} error
 * @returns {string}
 */
function formatSubscriptionError(error) {
    const raw = typeof error?.message === 'string' ? error.message : '';
    if (!raw) {
        return 'Failed to load subscriptions.';
    }

    if (/precondition check failed/i.test(raw)) {
        return 'YouTube blocked this request (precondition check failed). Make sure you are signed in, open a normal YouTube page, then try again.';
    }

    if (/api key is unavailable/i.test(raw)) {
        return 'YouTube API key is unavailable on this page. Open a standard YouTube page and retry.';
    }

    if (/timed out/i.test(raw)) {
        return 'Subscription request timed out. Please try again.';
    }

    return raw;
}
/**
 * Update selection UI.
 */
function updateSelectionSummary() {
    if (selectionBadgeEl) {
        const count = selectedChannelIds.size;
        if (count > 0) {
            selectionBadgeEl.textContent = String(count);
            selectionBadgeEl.setAttribute('aria-label', `${count} selected`);
            selectionBadgeEl.setAttribute('title', `${count} selected`);
            selectionBadgeEl.setAttribute('data-tooltip', `${count} selected`);
            selectionBadgeEl.classList.add('yt-commander-sub-manager-tooltip');
            selectionBadgeEl.style.display = 'inline-flex';
        } else {
            selectionBadgeEl.textContent = '';
            selectionBadgeEl.style.display = 'none';
        }
    }

    const disabled = selectedChannelIds.size === 0;
    if (unsubscribeButton) {
        unsubscribeButton.disabled = disabled;
    }
    if (addCategoryButton) {
        addCategoryButton.disabled = disabled;
    }
    if (removeCategoryButton) {
        removeCategoryButton.disabled = disabled;
    }
}

/**
 * Toggle a channel selection state.
 * @param {string} channelId
 * @param {boolean} [nextState]
 */
function toggleChannelSelection(channelId, nextState) {
    if (!channelId) {
        return;
    }
    const shouldSelect = typeof nextState === 'boolean'
        ? nextState
        : !selectedChannelIds.has(channelId);
    if (shouldSelect) {
        selectedChannelIds.add(channelId);
    } else {
        selectedChannelIds.delete(channelId);
    }
    const row = tableRowById.get(channelId);
    if (row) {
        const checkbox = row.querySelector('input[type="checkbox"][data-channel-id]');
        if (checkbox) {
            checkbox.checked = shouldSelect;
        }
        row.classList.toggle('is-selected', shouldSelect);
    }
    const card = cardById.get(channelId);
    if (card) {
        card.classList.toggle('is-selected', shouldSelect);
    }
    updateSelectionSummary();
}

/**
 * Apply category update for channels.
 * @param {string[]} channelIds
 * @param {string} categoryId
 * @param {'add'|'remove'|'toggle'} mode
 */
async function applyCategoryUpdate(channelIds, categoryId, mode) {
    if (!categoryId) {
        return;
    }

    const ids = (channelIds || []).filter((id) => typeof id === 'string' && id);
    if (ids.length === 0) {
        setStatus('Select at least one channel.', 'error');
        return;
    }

    const updatedKeys = [];
    const total = ids.length;
    const batchSize = Math.min(50, Math.max(5, Math.ceil(total / 6)));
    let processed = 0;

    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        batch.forEach((channelId) => {
            const current = readChannelAssignments(channelId);
            const hasCategory = current.includes(categoryId);
            let next = current;
            let changed = false;

            if (mode === 'add' && !hasCategory) {
                next = [...current, categoryId];
                changed = true;
            } else if (mode === 'remove' && hasCategory) {
                next = current.filter((id) => id !== categoryId);
                changed = true;
            } else if (mode === 'toggle') {
                next = hasCategory ? current.filter((id) => id !== categoryId) : [...current, categoryId];
                changed = true;
            }

            if (changed) {
                writeChannelAssignments(channelId, next);
                updatedKeys.push(`channel:${channelId}`);
            }
        });

        processed += batch.length;
        if (total > batchSize) {
            const label = mode === 'remove' ? 'Removing' : mode === 'add' ? 'Adding' : 'Updating';
            setStatus(`${label} ${processed}/${total}...`, 'info');
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    if (updatedKeys.length === 0) {
        setStatus('No category changes.', 'info');
        return;
    }

    await persistLocalState();
    await markPending(updatedKeys);
    setStatus(`Updated ${updatedKeys.length} channel(s).`, 'success');
    renderList();
}

/**
 * Handle overlay click.
 * @param {MouseEvent} event
 */
function handleOverlayClick(event) {
    if (event.target === overlay) {
        closeModal();
    }
}
/**
 * Close picker/filter when clicking outside.
 * @param {MouseEvent} event
 */
function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (picker && picker.style.display === 'block') {
        const inPicker = (target && picker.contains(target)) || path.includes(picker);
        const inAnchor = (target && pickerAnchorEl && pickerAnchorEl.contains(target))
            || (pickerAnchorEl && path.includes(pickerAnchorEl));
        if (!inPicker && !inAnchor) {
            closePicker();
        }
    }

    if (filterMenuOpen) {
        const inMenu = (target && filterMenu?.contains(target)) || (filterMenu && path.includes(filterMenu));
        const inButton = (target && filterButton && filterButton.contains(target))
            || (filterButton && path.includes(filterButton));
        if (!inMenu && !inButton) {
            closeFilterMenu();
        }
    }
}

/**
 * Handle modal button clicks.
 * @param {MouseEvent} event
 */
function handleModalClick(event) {
    const baseTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const actionTarget = baseTarget?.closest('[data-action]');
    const action = actionTarget?.getAttribute('data-action');
    if (action) {
        if (action === 'close-modal') {
            closeModal();
            return;
        }

        if (action === 'filter-toggle') {
            toggleFilterMenu(actionTarget);
            return;
        }

        if (action === 'view-table') {
            viewMode = 'table';
            persistViewState().catch(() => undefined);
            renderList();
            return;
        }

        if (action === 'view-card') {
            viewMode = 'card';
            persistViewState().catch(() => undefined);
            renderList();
            return;
        }

        if (action === 'page-prev') {
            currentPage = Math.max(1, currentPage - 1);
            renderList();
            return;
        }

        if (action === 'page-next') {
            currentPage = currentPage + 1;
            renderList();
            return;
        }

        if (action === 'unsubscribe-selected') {
            unsubscribeSelected().catch((error) => {
                setStatus(error?.message || 'Failed to unsubscribe', 'error');
            });
            return;
        }

        if (action === 'add-category-selected') {
            openPicker(actionTarget, 'add', Array.from(selectedChannelIds));
            return;
        }

        if (action === 'remove-category-selected') {
            openPicker(actionTarget, 'remove', Array.from(selectedChannelIds));
            return;
        }

        if (action === 'new-category') {
            createNewCategory().catch(() => undefined);
            return;
        }

        if (action === 'category-add') {
            const channelId = actionTarget.getAttribute('data-channel-id') || '';
            if (!channelId) {
                return;
            }
            openPicker(actionTarget, 'toggle', [channelId]);
            return;
        }

        if (action === 'remove-category') {
            const channelId = actionTarget.getAttribute('data-channel-id') || '';
            const categoryId = actionTarget.getAttribute('data-category-id') || '';
            if (!channelId || !categoryId) {
                return;
            }
            applyCategoryUpdate([channelId], categoryId, 'remove').catch(() => undefined);
            return;
        }
    }

    const interactive = baseTarget?.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-filter-menu, .yt-commander-sub-manager-picker'
    );
    if (interactive) {
        return;
    }

    const row = baseTarget?.closest('.yt-commander-sub-manager-row');
    if (row && !row.classList.contains('header')) {
        const channelId = row.getAttribute('data-channel-id') || '';
        toggleChannelSelection(channelId);
        return;
    }

    const card = baseTarget?.closest('.yt-commander-sub-manager-card');
    if (card) {
        const channelId = card.getAttribute('data-channel-id') || '';
        toggleChannelSelection(channelId);
    }
}

/**
 * Handle modal change events.
 * @param {Event} event
 */
function handleModalChange(event) {
    const checkbox = event.target.closest('input[type="checkbox"][data-channel-id]');
    if (!checkbox) {
        return;
    }
    const channelId = checkbox.getAttribute('data-channel-id') || '';
    if (!channelId) {
        return;
    }
    toggleChannelSelection(channelId, checkbox.checked);
}

/**
 * Handle picker clicks.
 * @param {MouseEvent} event
 */
function handlePickerClick(event) {
    const baseTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const target = baseTarget?.closest('[data-category-id]');
    if (target) {
        const categoryId = target.getAttribute('data-category-id') || '';
        if (pickerMode === 'remove') {
            applyCategoryUpdate(pickerTargetIds, categoryId, 'remove').catch(() => undefined);
        } else if (pickerMode === 'add') {
            applyCategoryUpdate(pickerTargetIds, categoryId, 'add').catch(() => undefined);
        } else {
            applyCategoryUpdate(pickerTargetIds, categoryId, 'toggle').catch(() => undefined);
        }
        closePicker();
        return;
    }

    const action = baseTarget?.closest('[data-action]')?.getAttribute('data-action');
    if (action === 'picker-new-category') {
        createNewCategory().catch(() => undefined);
    }
}

/**
 * Create a new category via prompt.
 */
async function createNewCategory() {
    const name = window.prompt('New category name');
    if (!name || !name.trim()) {
        return;
    }

    if (categories.some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) {
        setStatus('Category already exists.', 'error');
        return;
    }

    const category = createCategory(name);
    categories.push(category);
    markCategoriesDirty();
    await persistLocalState();
    await markPending([`category:${category.id}`]);
    renderFilterMenu();
    renderList();
}

/**
 * Load subscriptions list from main world.
 * @param {boolean | {force?: boolean, background?: boolean}} [options]
 * @returns {Promise<{status: 'skipped' | 'fetched' | 'error', cooldownRemainingMs?: number}>}
 */
async function loadSubscriptions(options = {}) {
    const resolved = typeof options === 'boolean' ? { force: options } : (options || {});
    const force = Boolean(resolved.force);
    const background = Boolean(resolved.background);
    const now = Date.now();
    const stored = await storageGet([STORAGE_KEYS.SNAPSHOT]);
    const prevSnapshot = stored?.[STORAGE_KEYS.SNAPSHOT];
    const lastSnapshotAt = Number(prevSnapshot?.fetchedAt) || 0;
    const lastCallAt = Math.max(channelsFetchedAt, lastSnapshotAt, lastFetchAttemptAt);

    if (!force && channels.length > 0 && (now - lastCallAt) < SNAPSHOT_TTL_MS) {
        return { status: 'skipped' };
    }

    const cooldownRemainingMs = API_COOLDOWN_MS - (now - lastCallAt);
    const shouldUpdateStatus = !background || overlay?.classList.contains('is-visible');
    if (cooldownRemainingMs > 0) {
        if (shouldUpdateStatus) {
            const waitMinutes = Math.ceil(cooldownRemainingMs / 60000);
            setStatus(`Refresh cooldown: try again in ${waitMinutes} min.`, 'info');
        }
        return { status: 'skipped', cooldownRemainingMs };
    }

    lastFetchAttemptAt = now;
    if (shouldUpdateStatus) {
        setStatus(background ? 'Refreshing subscriptions...' : 'Loading subscriptions...', 'info');
    }

    try {
        const response = await bridgeClient.sendRequest(ACTIONS.GET_SUBSCRIPTIONS, { limit: 60000 });
        const list = Array.isArray(response?.channels) ? response.channels : [];
        list.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));

        channels = list;
        channelsFetchedAt = Date.now();
        const hash = computeSnapshotHash(list);
        const prevHash = prevSnapshot?.hash || '';
        await persistSnapshot(list, hash);
        if (hash && hash !== prevHash) {
            await markPending(['snapshot']);
        }

        if (shouldUpdateStatus) {
            setStatus(`Loaded ${channels.length} channels.`, 'success');
        }
        return { status: 'fetched' };
    } catch (error) {
        logger.warn('Failed to load subscriptions', error);
        if (shouldUpdateStatus) {
            setStatus(formatSubscriptionError(error), 'error');
        }
        return { status: 'error' };
    }
}
/**
 * Build meta label for channel.
 * @param {object} channel
 * @returns {string}
 */
function buildChannelMeta(channel) {
    const bits = [];
    if (channel?.handle) {
        bits.push(channel.handle);
    }
    if (channel?.subscriberCount) {
        bits.push(channel.subscriberCount);
    }
    if (channel?.videoCount) {
        bits.push(channel.videoCount);
    }
    return bits.join(' | ');
}

/**
 * Normalize count labels for display.
 * @param {string | number | null | undefined} value
 * @param {'subscribers' | 'videos'} kind
 * @returns {string}
 */
function formatCountLabel(value, kind) {
    if (value === null || value === undefined) {
        return '-';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toLocaleString();
    }
    let text = String(value).trim();
    if (!text) {
        return '-';
    }
    if (text.startsWith('@')) {
        return '-';
    }
    if (kind === 'subscribers') {
        text = text.replace(/subscribers?/i, '').trim();
    } else if (kind === 'videos') {
        text = text.replace(/videos?/i, '').trim();
    }
    return text || '-';
}

/**
 * Resolve subscriber/video counts even if source fields are swapped.
 * @param {object} channel
 * @returns {{subscribers: string, videos: string}}
 */
function resolveChannelCounts(channel) {
    const subRaw = typeof channel?.subscriberCount === 'string' ? channel.subscriberCount.trim() : '';
    const vidRaw = typeof channel?.videoCount === 'string' ? channel.videoCount.trim() : '';
    const subHasHandle = subRaw.startsWith('@');
    const subHasSubscribers = /subscribers?/i.test(subRaw);
    const subHasVideos = /videos?/i.test(subRaw);
    const vidHasSubscribers = /subscribers?/i.test(vidRaw);
    const vidHasVideos = /videos?/i.test(vidRaw);
    const subIsCount = !subHasHandle && /\d/.test(subRaw);
    const vidIsCount = !vidRaw.startsWith('@') && /\d/.test(vidRaw);

    let subscriberValue = '';
    let videoValue = '';

    if (subHasSubscribers) {
        subscriberValue = subRaw;
    } else if (vidHasSubscribers) {
        subscriberValue = vidRaw;
    } else if (subIsCount) {
        subscriberValue = subRaw;
    } else if (vidIsCount && subHasHandle) {
        subscriberValue = vidRaw;
    }

    if (vidHasVideos) {
        videoValue = vidRaw;
    } else if (subHasVideos) {
        videoValue = subRaw;
    } else if (vidIsCount && !vidHasSubscribers) {
        videoValue = vidRaw;
    }

    return {
        subscribers: formatCountLabel(subscriberValue, 'subscribers'),
        videos: formatCountLabel(videoValue, 'videos')
    };
}

/**
 * Build category badges.
 * @param {string} channelId
 * @returns {HTMLElement}
 */
function buildCategoryBadges(channelId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'yt-commander-sub-manager-categories';

    const assigned = readChannelAssignments(channelId);
    assigned.forEach((categoryId) => {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) {
            return;
        }
        const badge = document.createElement('span');
        badge.className = BADGE_CLASS;
        badge.style.backgroundColor = category.color;
        badge.textContent = category.name;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = BADGE_REMOVE_CLASS;
        remove.setAttribute('data-action', 'remove-category');
        remove.setAttribute('data-channel-id', channelId);
        remove.setAttribute('data-category-id', category.id);
        remove.setAttribute('aria-label', `Remove ${category.name}`);
        remove.setAttribute('title', `Remove ${category.name}`);
        remove.setAttribute('data-tooltip', `Remove ${category.name}`);
        remove.classList.add('yt-commander-sub-manager-tooltip');
        remove.textContent = 'x';

        badge.appendChild(remove);
        wrapper.appendChild(badge);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'yt-commander-sub-manager-category-add';
    add.setAttribute('data-action', 'category-add');
    add.setAttribute('data-channel-id', channelId);
    add.setAttribute('aria-label', 'Add category');
    add.setAttribute('title', 'Add category');
    add.setAttribute('data-tooltip', 'Add category');
    add.classList.add('yt-commander-sub-manager-tooltip');
    const addIcon = createIcon(ICONS.plus);
    addIcon.classList.add('yt-commander-sub-manager-icon');
    add.appendChild(addIcon);
    wrapper.appendChild(add);

    return wrapper;
}
function buildTableHeader(pageItems) {
    const header = document.createElement('div');
    header.className = 'yt-commander-sub-manager-row header';

    const headerCheckbox = document.createElement('input');
    headerCheckbox.type = 'checkbox';
    headerCheckbox.className = 'yt-commander-sub-manager-checkbox';
    headerCheckbox.checked = pageItems.length > 0
        && pageItems.every((item) => selectedChannelIds.has(item.channelId));
    headerCheckbox.addEventListener('change', () => {
        pageItems.forEach((item) => {
            if (!item?.channelId) {
                return;
            }
            if (headerCheckbox.checked) {
                selectedChannelIds.add(item.channelId);
            } else {
                selectedChannelIds.delete(item.channelId);
            }
        });
        updateSelectionSummary();
        renderList();
    });

    header.appendChild(headerCheckbox);

    const headerLabels = ['Channel', 'Subscribers', 'Categories'];
    headerLabels.forEach((label) => {
        const cell = document.createElement('div');
        cell.className = 'yt-commander-sub-manager-cell header';
        cell.textContent = label;
        header.appendChild(cell);
    });

    return header;
}

function buildTableRow(channel) {
    const row = document.createElement('div');
    row.className = 'yt-commander-sub-manager-row';
    row.setAttribute('data-channel-id', channel.channelId || '');
    if (selectedChannelIds.has(channel.channelId)) {
        row.classList.add('is-selected');
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'yt-commander-sub-manager-checkbox';
    checkbox.setAttribute('data-channel-id', channel.channelId || '');
    checkbox.checked = selectedChannelIds.has(channel.channelId);
    row.appendChild(checkbox);

    const channelCell = document.createElement('div');
    channelCell.className = 'yt-commander-sub-manager-cell';

    const avatar = document.createElement('img');
    avatar.className = 'yt-commander-sub-manager-avatar';
    avatar.alt = channel.title || 'Channel';
    avatar.loading = 'lazy';
    if (channel.avatar) {
        avatar.src = channel.avatar;
    }
    channelCell.appendChild(avatar);

    const nameWrap = document.createElement('div');
    nameWrap.className = 'yt-commander-sub-manager-name-wrap';
    const name = document.createElement('div');
    name.className = 'yt-commander-sub-manager-name';
    name.setAttribute('data-field', 'name');
    name.textContent = channel.title || 'Untitled channel';
    const handle = document.createElement('div');
    handle.className = 'yt-commander-sub-manager-handle';
    handle.setAttribute('data-field', 'handle');
    handle.textContent = channel.handle || channel.url || '';
    nameWrap.appendChild(name);
    nameWrap.appendChild(handle);
    channelCell.appendChild(nameWrap);

    row.appendChild(channelCell);

    const counts = resolveChannelCounts(channel);
    const subCell = document.createElement('div');
    subCell.className = 'yt-commander-sub-manager-cell';
    subCell.setAttribute('data-field', 'subscribers');
    subCell.textContent = counts.subscribers;
    row.appendChild(subCell);

    const catCell = document.createElement('div');
    catCell.className = 'yt-commander-sub-manager-cell';
    catCell.setAttribute('data-field', 'categories');
    catCell.appendChild(buildCategoryBadges(channel.channelId));
    row.appendChild(catCell);

    return row;
}

function updateTableRow(row, channel) {
    const checkbox = row.querySelector('input[type="checkbox"][data-channel-id]');
    if (checkbox) {
        checkbox.checked = selectedChannelIds.has(channel.channelId);
    }
    const name = row.querySelector('[data-field="name"]');
    if (name) {
        name.textContent = channel.title || 'Untitled channel';
    }
    const handle = row.querySelector('[data-field="handle"]');
    if (handle) {
        handle.textContent = channel.handle || channel.url || '';
    }
    const avatar = row.querySelector('img.yt-commander-sub-manager-avatar');
    if (avatar && channel.avatar) {
        avatar.src = channel.avatar;
    }
    const counts = resolveChannelCounts(channel);
    const subCell = row.querySelector('[data-field="subscribers"]');
    if (subCell) {
        subCell.textContent = counts.subscribers;
    }
    const catCell = row.querySelector('[data-field="categories"]');
    if (catCell) {
        catCell.innerHTML = '';
        catCell.appendChild(buildCategoryBadges(channel.channelId));
    }
}

function buildCard(channel) {
    const card = document.createElement('div');
    card.className = 'yt-commander-sub-manager-card';
    card.setAttribute('data-channel-id', channel.channelId || '');
    if (selectedChannelIds.has(channel.channelId)) {
        card.classList.add('is-selected');
    }

    const media = document.createElement('div');
    media.className = 'yt-commander-sub-manager-card-media';
    const avatar = document.createElement('img');
    avatar.className = 'yt-commander-sub-manager-card-image';
    avatar.alt = channel.title || 'Channel';
    avatar.loading = 'lazy';
    if (channel.avatar) {
        avatar.src = channel.avatar;
    }
    media.appendChild(avatar);
    card.appendChild(media);

    const stats = document.createElement('div');
    stats.className = 'yt-commander-sub-manager-card-stats';
    const name = document.createElement('div');
    name.className = 'yt-commander-sub-manager-name';
    name.setAttribute('data-field', 'name');
    name.textContent = channel.title || 'Untitled channel';
    const handle = document.createElement('div');
    handle.className = 'yt-commander-sub-manager-handle';
    handle.setAttribute('data-field', 'handle');
    handle.textContent = channel.handle || channel.url || '';

    const metrics = document.createElement('div');
    metrics.className = 'yt-commander-sub-manager-card-metrics';
    const counts = resolveChannelCounts(channel);
    const subscribers = document.createElement('div');
    subscribers.className = 'yt-commander-sub-manager-card-metric';
    subscribers.setAttribute('data-field', 'subscribers');
    subscribers.textContent = counts.subscribers;
    metrics.appendChild(subscribers);

    stats.appendChild(name);
    stats.appendChild(handle);
    stats.appendChild(metrics);
    card.appendChild(stats);

    const categoriesWrap = document.createElement('div');
    categoriesWrap.className = 'yt-commander-sub-manager-card-categories';
    categoriesWrap.setAttribute('data-field', 'categories');
    categoriesWrap.appendChild(buildCategoryBadges(channel.channelId));
    card.appendChild(categoriesWrap);

    return card;
}

function updateCard(card, channel) {
    const name = card.querySelector('[data-field="name"]');
    if (name) {
        name.textContent = channel.title || 'Untitled channel';
    }
    const handle = card.querySelector('[data-field="handle"]');
    if (handle) {
        handle.textContent = channel.handle || channel.url || '';
    }
    const avatar = card.querySelector('img.yt-commander-sub-manager-card-image');
    if (avatar && channel.avatar) {
        avatar.src = channel.avatar;
    }
    const counts = resolveChannelCounts(channel);
    const subscribers = card.querySelector('[data-field="subscribers"]');
    if (subscribers) {
        subscribers.textContent = counts.subscribers;
    }
    const categoriesWrap = card.querySelector('[data-field="categories"]');
    if (categoriesWrap) {
        categoriesWrap.innerHTML = '';
        categoriesWrap.appendChild(buildCategoryBadges(channel.channelId));
    }
}

/**
 * Render table rows.
 * @param {Array<object>} pageItems
 */
function renderTable(pageItems) {
    if (!tableWrap) {
        return;
    }

    tableWrap.innerHTML = '';
    tableRowById.clear();

    const fragment = document.createDocumentFragment();
    fragment.appendChild(buildTableHeader(pageItems));

    if (pageItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-empty';
        empty.textContent = 'No channels found.';
        fragment.appendChild(empty);
        tableWrap.appendChild(fragment);
        return;
    }

    pageItems.forEach((channel) => {
        const row = buildTableRow(channel);
        if (channel.channelId) {
            tableRowById.set(channel.channelId, row);
        }
        fragment.appendChild(row);
    });

    tableWrap.appendChild(fragment);
}

/**
 * Render card view.
 * @param {Array<object>} pageItems
 */
function renderCards(pageItems) {
    if (!cardsWrap) {
        return;
    }
    cardsWrap.innerHTML = '';
    cardById.clear();

    if (pageItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-empty';
        empty.textContent = 'No channels found.';
        cardsWrap.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    pageItems.forEach((channel) => {
        const card = buildCard(channel);
        if (channel.channelId) {
            cardById.set(channel.channelId, card);
        }
        fragment.appendChild(card);
    });

    cardsWrap.appendChild(fragment);
}

/**
 * Filter channels by category.
 * @returns {Array<object>}
 */
function filterChannels() {
    if (filterMode === 'all') {
        return channels;
    }
    if (filterMode === 'uncategorized') {
        return channels.filter((channel) => readChannelAssignments(channel.channelId).length === 0);
    }
    return channels.filter((channel) => readChannelAssignments(channel.channelId).includes(filterMode));
}

/**
 * Render list based on view mode.
 */
function renderList() {
    if (!modal) {
        return;
    }

    renderFilterMenu();

    const filtered = filterChannels();
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

    tableWrap.style.display = viewMode === 'table' ? 'block' : 'none';
    cardsWrap.style.display = viewMode === 'card' ? 'grid' : 'none';
    viewTableButton.classList.toggle('active', viewMode === 'table');
    viewCardButton.classList.toggle('active', viewMode === 'card');

    renderTable(pageItems);
    renderCards(pageItems);

    if (pageInfoEl) {
        pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    if (pagePrevButton) {
        pagePrevButton.disabled = currentPage <= 1;
    }
    if (pageNextButton) {
        pageNextButton.disabled = currentPage >= totalPages;
    }

    updateSelectionSummary();
}

/**
 * Close modal.
 */
function closeModal() {
    if (!overlay) {
        return;
    }
    overlay.classList.remove('is-visible');
    closePicker();
    closeFilterMenu();
}

/**
 * Open modal and load data.
 */
async function openModal() {
    ensureModal();
    await loadLocalState();
    const hydrated = await hydrateSnapshotFromStorage();
    overlay.classList.add('is-visible');
    if (hydrated) {
        renderList();
        loadSubscriptions({ force: true, background: true }).then(() => {
            renderList();
        }).catch(() => undefined);
        return;
    }
    await loadSubscriptions({ force: true });
    renderList();
}

/**
 * Handle masthead button click.
 */
function handleOpenManagerClick() {
    openModal().catch((error) => {
        logger.warn('Failed to open subscription manager', error);
        setStatus(error?.message || 'Failed to open manager', 'error');
    });
}

/**
 * Unsubscribe selected channels.
 */
async function unsubscribeSelected() {
    const ids = Array.from(selectedChannelIds);
    if (ids.length === 0) {
        return;
    }

    const confirmText = `Unsubscribe from ${ids.length} channel(s)?`;
    if (!window.confirm(confirmText)) {
        return;
    }

    setStatus('Unsubscribing...', 'info');
    const result = await bridgeClient.sendRequest(ACTIONS.UNSUBSCRIBE_CHANNELS, { channelIds: ids });
    const removed = Number(result?.unsubscribedCount) || 0;

    channels = channels.filter((item) => !selectedChannelIds.has(item.channelId));
    selectedChannelIds = new Set();

    ids.forEach((id) => {
        delete assignments[id];
    });

    await persistLocalState();
    await markPending([...ids.map((id) => `channel:${id}`), 'snapshot']);

    setStatus(`Unsubscribed ${removed} channel(s).`, 'success');
    renderList();
}

/**
 * Handle ESC key.
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }
    if (picker && picker.style.display === 'block') {
        closePicker();
        return;
    }
    if (filterMenuOpen) {
        closeFilterMenu();
        return;
    }
    if (overlay?.classList.contains('is-visible')) {
        closeModal();
    }
}

/**
 * Initialize subscription manager.
 */
export async function initSubscriptionManager() {
    if (isInitialized) {
        return;
    }

    await loadLocalState();
    ensureMastheadButton();

    window.addEventListener('yt-navigate-finish', () => {
        ensureMastheadButton();
    });

    window.addEventListener('resize', () => {
        positionPicker();
    });

    window.addEventListener('message', bridgeClient.handleResponse);
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', handleDocumentClick, true);

    isInitialized = true;
    logger.info('Subscription manager initialized');
}

/**
 * Open subscription manager modal.
 */
export async function openSubscriptionManager() {
    await openModal();
}

/**
 * Return latest subscription snapshot for background sync.
 * @returns {Promise<{channels: object[], fetchedAt: number, hash: string}>}
 */
export async function getSubscriptionSnapshot() {
    const now = Date.now();
    const stored = await storageGet([STORAGE_KEYS.SNAPSHOT]);
    const snapshot = stored?.[STORAGE_KEYS.SNAPSHOT];
    const fetchedAt = Number(snapshot?.fetchedAt) || 0;
    if (snapshot && Array.isArray(snapshot.channels) && (now - fetchedAt) < SNAPSHOT_TTL_MS) {
        return snapshot;
    }

    await loadSubscriptions({ force: true, background: true });
    const nextStored = await storageGet([STORAGE_KEYS.SNAPSHOT]);
    return nextStored?.[STORAGE_KEYS.SNAPSHOT] || { channels: [], fetchedAt: Date.now(), hash: '' };
}






