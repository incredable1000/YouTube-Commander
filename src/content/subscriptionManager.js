import { createLogger } from './utils/logger.js';
import { createBridgeClient } from './playlist-multi-select/bridge.js';
import { resolveMastheadMountPoint, isEligiblePage } from './playlist-multi-select/pageContext.js';
import { MASTHEAD_SLOT_CLASS, MASTHEAD_BUTTON_CLASS } from './playlist-multi-select/constants.js';
import { autoCategorizeSubscriptions } from './subscriptionAutoCategorize.js';

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
    SORT: 'subscriptionManagerSort',
    COOLDOWN_MINUTES: 'subscriptionManagerCooldownMinutes',
    SIDEBAR_COLLAPSED: 'subscriptionManagerSidebarCollapsed',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PENDING_COUNT: 'subscriptionSyncPendingCount'
};

const SUBSCRIPTION_BUTTON_CLASS = 'yt-commander-subscription-masthead-button';
const QUICK_ADD_PAGES = [
    /^https?:\/\/(www\.)?youtube\.com\/watch/i,
    /^https?:\/\/(www\.)?youtube\.com\/shorts/i,
    /^https?:\/\/(www\.)?youtube\.com\/@/i,
    /^https?:\/\/(www\.)?youtube\.com\/channel\//i,
    /^https?:\/\/(www\.)?youtube\.com\/c\//i,
    /^https?:\/\/(www\.)?youtube\.com\/user\//i
];
const QUICK_ADD_CONTEXT_SELECTOR = [
    'ytd-video-owner-renderer',
    'ytd-watch-metadata',
    'ytd-reel-player-header-renderer',
    'ytd-reel-player-overlay-renderer',
    'ytd-reel-channel-renderer',
    'ytd-channel-header-renderer',
    'ytd-channel-tagline-renderer',
    'ytd-channel-metadata',
    'ytd-channel-name',
    'ytd-channel-renderer',
    'ytd-c4-tabbed-header-renderer',
    'yt-flexible-actions-view-model',
    '#subscribe-button',
    '.ytReelChannelBarViewModelReelSubscribeButton'
].join(', ');
const QUICK_ADD_HOST_SELECTOR = [
    '.ytReelChannelBarViewModelReelSubscribeButton',
    '#subscribe-button',
    '.ytFlexibleActionsViewModelAction'
].join(', ');
const SUBSCRIBE_RENDERER_SELECTOR = 'ytd-subscribe-button-renderer, yt-subscribe-button-view-model, ytd-subscribe-button-view-model';
const DEFAULT_QUICK_ADD_LABEL = 'Add';
const OVERLAY_CLASS = 'yt-commander-sub-manager-overlay';
const MODAL_CLASS = 'yt-commander-sub-manager-modal';
const TABLE_CLASS = 'yt-commander-sub-manager-table';
const CARDS_CLASS = 'yt-commander-sub-manager-cards';
const BADGE_CLASS = 'yt-commander-sub-manager-badge';
const BADGE_REMOVE_CLASS = 'yt-commander-sub-manager-badge-remove';
const STATUS_CLASS = 'yt-commander-sub-manager-status';
const PICKER_CLASS = 'yt-commander-sub-manager-picker';
const FILTER_ITEM_CLASS = 'yt-commander-sub-manager-filter-item';
const FILTER_DOT_CLASS = 'yt-commander-sub-manager-filter-dot';
const FILTER_COUNT_CLASS = 'yt-commander-sub-manager-filter-count';
const QUICK_ADD_CLASS = 'yt-commander-sub-manager-quick-add';
const MODAL_VERSION = '2026-03-17-1';

const TABLE_ROW_HEIGHT_ESTIMATE = 72;
const TABLE_HEADER_HEIGHT_ESTIMATE = 44;
const CARD_ROW_HEIGHT_ESTIMATE = 312;
const CARD_MIN_WIDTH = 260;
const CARD_GAP = 14;
const VIRTUAL_OVERSCAN = 6;
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_API_COOLDOWN_MS = 5 * 60 * 1000;
const COOLDOWN_MINUTES_OPTIONS = [5, 10, 30, 60, 120, 240];
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
let mainWrap = null;
let statusEl = null;
let statusTimeoutId = 0;
let selectionBadgeEl = null;
let clearSelectionButton = null;
let selectionGroupEl = null;
let selectionHeaderEl = null;
let selectionCountEl = null;
let floatingStackEl = null;
let viewTableButton = null;
let viewCardButton = null;
let sortButton = null;
let sidebar = null;
let sidebarList = null;
let sidebarToggleButton = null;
let sidebarAddButton = null;
let sidebarCountEl = null;
let chipbarWheelTarget = null;
let chipbarWheelHandler = null;
let addCategoryButton = null;
let removeCategoryButton = null;
let unsubscribeButton = null;
let autoCategorizeButton = null;

let picker = null;
let pickerMode = 'toggle';
let pickerTargetIds = [];
let pickerAnchorEl = null;
let pickerContextAnchor = null;
let sidebarCollapsed = false;
let sidebarEditingId = '';
let sidebarEditingName = '';
let sidebarCreating = false;
let sidebarDraftName = '';
let sidebarDraftColor = '';
let confirmBackdrop = null;
let confirmTitleEl = null;
let confirmMessageEl = null;
let confirmResolve = null;
let tooltipPortal = null;
let tooltipPortalTarget = null;

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
let apiCooldownMinutes = COOLDOWN_MINUTES_OPTIONS[0];
let apiCooldownMs = DEFAULT_API_COOLDOWN_MS;
let viewMode = 'table';
let filterMode = 'all';
let sortMode = 'name';
let selectedChannelIds = new Set();
let resetScrollPending = false;
let selectionAnchorId = '';
let currentPageIds = [];
let tableRowById = new Map();
let cardById = new Map();
let quickAddRetryTimer = 0;

let quickAddObserver = null;
let quickAddPending = false;
let autoCategorizeInFlight = false;
let lastAutoCategorizeSignature = '';
let filteredChannelsCache = [];
let tableRowHeight = TABLE_ROW_HEIGHT_ESTIMATE;
let tableHeaderHeight = TABLE_HEADER_HEIGHT_ESTIMATE;
let cardRowHeight = CARD_ROW_HEIGHT_ESTIMATE;
let cardColumns = 1;
let lastTableRange = null;
let lastCardRange = null;
let virtualScrollRaf = 0;
let pendingVirtualForce = false;

/**
 * Tooltip helper.
 * @param {HTMLElement} el
 * @param {string} label
 */
function setTooltip(el, label) {
    if (!el || !label) {
        return;
    }
    el.setAttribute('aria-label', label);
    el.setAttribute('title', label);
    el.setAttribute('data-tooltip', label);
    el.classList.add('yt-commander-sub-manager-tooltip');
}

/**
 * Clear tooltip from element.
 * @param {HTMLElement} el
 */
function clearTooltip(el) {
    if (!el) {
        return;
    }
    el.removeAttribute('aria-label');
    el.removeAttribute('title');
    el.removeAttribute('data-tooltip');
    el.classList.remove('yt-commander-sub-manager-tooltip');
}

/**
 * Apply sidebar tooltip when collapsed or in chipbar mode.
 * @param {HTMLElement} el
 * @param {string} label
 * @param {{ tooltip?: string }} [options]
 */
function applySidebarTooltip(el, label, options = {}) {
    if (!el) {
        return;
    }
    const tooltipText = typeof options.tooltip === 'string' && options.tooltip.trim()
        ? options.tooltip
        : label;
    if (sidebar?.classList.contains('yt-commander-sub-manager-chipbar')) {
        setTooltip(el, tooltipText);
        return;
    }
    if (sidebarCollapsed) {
        setTooltip(el, tooltipText);
        return;
    }
    clearTooltip(el);
}

/**
 * Get single-letter initial.
 * @param {string} label
 * @returns {string}
 */
function getSidebarInitial(label) {
    if (typeof label !== 'string') {
        return '';
    }
    const trimmed = label.trim();
    if (!trimmed) {
        return '';
    }
    return trimmed[0].toUpperCase();
}

/**
 * Normalize color to hex for color input controls.
 * @param {string} value
 * @returns {string}
 */
function normalizeColorToHex(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
        return '#64748b';
    }
    if (/^#([0-9a-f]{3}){1,2}$/i.test(trimmed)) {
        if (trimmed.length === 4) {
            return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
        }
        return trimmed.toLowerCase();
    }
    if (!document?.body) {
        return '#64748b';
    }
    const sample = document.createElement('span');
    sample.style.color = trimmed;
    sample.style.position = 'absolute';
    sample.style.opacity = '0';
    sample.style.pointerEvents = 'none';
    document.body.appendChild(sample);
    const computed = getComputedStyle(sample).color || '';
    sample.remove();
    const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) {
        return '#64748b';
    }
    const [r, g, b] = match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))));
    return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function resetModalElements() {
    const existingOverlay = document.querySelector(`.${OVERLAY_CLASS}`);
    if (existingOverlay) {
        existingOverlay.remove();
    }
    const strayFilterMenu = document.querySelector('.yt-commander-sub-manager-filter-menu');
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
    if (tooltipPortal && tooltipPortal.isConnected) {
        tooltipPortal.remove();
    }

    if (mainWrap) {
        mainWrap.removeEventListener('scroll', handleMainScroll);
    }
    if (chipbarWheelTarget && chipbarWheelHandler) {
        chipbarWheelTarget.removeEventListener('wheel', chipbarWheelHandler);
    }
    window.removeEventListener('resize', handleVirtualResize);

    overlay = null;
    modal = null;
    tableWrap = null;
    cardsWrap = null;
    mainWrap = null;
    statusEl = null;
    if (statusTimeoutId) {
        window.clearTimeout(statusTimeoutId);
        statusTimeoutId = 0;
    }
    selectionBadgeEl = null;
    clearSelectionButton = null;
    selectionGroupEl = null;
    selectionHeaderEl = null;
    selectionCountEl = null;
    floatingStackEl = null;
    viewTableButton = null;
    viewCardButton = null;
    sortButton = null;
    sidebar = null;
    sidebarList = null;
    sidebarToggleButton = null;
    sidebarAddButton = null;
    sidebarCountEl = null;
    chipbarWheelTarget = null;
    chipbarWheelHandler = null;
    addCategoryButton = null;
    removeCategoryButton = null;
    unsubscribeButton = null;
    autoCategorizeButton = null;
    picker = null;
    pickerAnchorEl = null;
    pickerTargetIds = [];
    pickerMode = 'toggle';
    confirmBackdrop = null;
    confirmTitleEl = null;
    confirmMessageEl = null;
    confirmResolve = null;
    tooltipPortal = null;
    tooltipPortalTarget = null;
    resetScrollPending = false;
    selectionAnchorId = '';
    currentPageIds = [];
    tableRowById.clear();
    cardById.clear();
    filteredChannelsCache = [];
    lastTableRange = null;
    lastCardRange = null;
    tableRowHeight = TABLE_ROW_HEIGHT_ESTIMATE;
    tableHeaderHeight = TABLE_HEADER_HEIGHT_ESTIMATE;
    cardRowHeight = CARD_ROW_HEIGHT_ESTIMATE;
    cardColumns = 1;
    virtualScrollRaf = 0;
    pendingVirtualForce = false;
    resetSidebarDraftState();
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
    categoryAdd: 'M17.63 5.84 11.63 1.84C11.43 1.73 11.22 1.67 11 1.67H4C2.9 1.67 2 2.57 2 3.67v7c0 .53.21 1.04.59 1.41l6 6c.39.39.9.59 1.41.59s1.02-.2 1.41-.59l8.59-8.59c.38-.38.59-.9.59-1.41 0-.53-.21-1.04-.59-1.41l-2.38-2.34zM7 7.5C6.17 7.5 5.5 6.83 5.5 6S6.17 4.5 7 4.5 8.5 5.17 8.5 6 7.83 7.5 7 7.5zM15 10h2v2h2v2h-2v2h-2v-2h-2v-2h2z',
    categoryMove: 'M17.63 5.84 11.63 1.84C11.43 1.73 11.22 1.67 11 1.67H4C2.9 1.67 2 2.57 2 3.67v7c0 .53.21 1.04.59 1.41l6 6c.39.39.9.59 1.41.59s1.02-.2 1.41-.59l8.59-8.59c.38-.38.59-.9.59-1.41 0-.53-.21-1.04-.59-1.41l-2.38-2.34zM7 7.5C6.17 7.5 5.5 6.83 5.5 6S6.17 4.5 7 4.5 8.5 5.17 8.5 6 7.83 7.5 7 7.5zM14 11h4.17l-1.59-1.59L18 8l4 4-4 4-1.41-1.41 1.59-1.59H14v-2z',
    check: 'M9 16.2 4.8 12 3.4 13.4 9 19 21 7 19.6 5.6z',
    close: 'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29 10.59 10.6 16.89 4.29z',
    trash: 'M6 7h12v2H6V7zm2 3h8v9H8v-9zm3-7h2l1 2H10l1-2z',
    sort: 'M3 6h10v2H3V6zm0 5h7v2H3v-2zm0 5h4v2H3v-2zm15-8v8h2V8h-2zm-3 3v5h2v-5h-2z',
    spark: 'M12 2l2.2 6.6L21 9l-5 3.6L17.8 20 12 15.6 6.2 20 8 12.6 3 9l6.8-.4L12 2z',
    openNewTab: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    collapse: 'M15.41 7.41 14 6 8 12 14 18 15.41 16.59 10.83 12z',
    expand: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
    prev: 'M15.41 7.41 14 6 8 12 14 18 15.41 16.59 10.83 12z',
    next: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
    chevronDown: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z'
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
    setTooltip(button, label);
}

/**
 * Normalize cooldown minutes selection.
 * @param {number} value
 * @returns {number}
 */
function normalizeCooldownMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) {
        return COOLDOWN_MINUTES_OPTIONS[0];
    }
    const matched = COOLDOWN_MINUTES_OPTIONS.find((option) => option === minutes);
    return matched || COOLDOWN_MINUTES_OPTIONS[0];
}

/**
 * Resolve channel URL.
 * @param {{channelId?: string, handle?: string, url?: string}} channel
 * @returns {string}
 */
function resolveChannelUrl(channel) {
    if (!channel) {
        return '';
    }
    const rawUrl = typeof channel.url === 'string' ? channel.url.trim() : '';
    if (rawUrl) {
        try {
            return new URL(rawUrl, location.origin).toString();
        } catch (_error) {
            return rawUrl;
        }
    }
    const handle = normalizeHandle(channel.handle);
    if (handle) {
        return `https://www.youtube.com/${handle}`;
    }
    if (channel.channelId) {
        return `https://www.youtube.com/channel/${channel.channelId}`;
    }
    return '';
}

/**
 * Update open-channel button data/tooltip.
 * @param {HTMLButtonElement} button
 * @param {object} channel
 */
function updateOpenChannelButton(button, channel) {
    if (!button) {
        return;
    }
    const url = resolveChannelUrl(channel);
    if (url) {
        button.setAttribute('data-channel-url', url);
        button.disabled = false;
        setTooltip(button, 'Open channel in new tab');
    } else {
        button.removeAttribute('data-channel-url');
        button.disabled = true;
        setTooltip(button, 'Channel link unavailable');
    }
}

/**
 * Build open-channel button.
 * @param {object} channel
 * @param {string} className
 * @returns {HTMLButtonElement}
 */
function buildOpenChannelButton(channel, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `yt-commander-sub-manager-open-channel ${className || ''}`.trim();
    button.setAttribute('data-action', 'open-channel');
    setIconButton(button, ICONS.openNewTab, 'Open channel in new tab');
    updateOpenChannelButton(button, channel);
    return button;
}

/**
 * Open URL in background tab.
 * @param {string} url
 */
function openUrlInBackground(url) {
    if (!url) {
        setStatus('Channel link unavailable.', 'error');
        return;
    }
    try {
        chrome.runtime.sendMessage({ type: 'OPEN_NEW_TAB', url });
    } catch (error) {
        logger.warn('Failed to open tab', error);
        setStatus('Unable to open channel.', 'error');
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
            const unique = Array.from(new Set(list));
            next[channelId] = unique.length > 0 ? [unique[0]] : [];
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
 * Parse hex color to RGB.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number} | null}
 */
function parseHexColor(hex) {
    if (typeof hex !== 'string') {
        return null;
    }
    const clean = hex.replace('#', '');
    if (clean.length !== 6 || !/^[0-9a-f]{6}$/i.test(clean)) {
        return null;
    }
    const value = parseInt(clean, 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255
    };
}

/**
 * Compute relative luminance for contrast.
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {number}
 */
function computeLuminance(rgb) {
    const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

/**
 * Build readable colors for category backgrounds.
 * @param {string} color
 * @returns {{text: string, pillBg: string, pillBorder: string}}
 */
function computeCategoryContrast(color) {
    const hex = normalizeColorToHex(color);
    const rgb = parseHexColor(hex);
    if (!rgb) {
        return {
            text: '#e8edf5',
            pillBg: 'rgba(255, 255, 255, 0.18)',
            pillBorder: 'rgba(255, 255, 255, 0.32)'
        };
    }
    const luminance = computeLuminance(rgb);
    const isLight = luminance >= 0.6;
    return {
        text: isLight ? '#0f141d' : '#f7f9ff',
        pillBg: isLight ? 'rgba(15, 20, 29, 0.2)' : 'rgba(255, 255, 255, 0.22)',
        pillBorder: isLight ? 'rgba(15, 20, 29, 0.32)' : 'rgba(255, 255, 255, 0.38)'
    };
}

/**
 * Apply category background + contrast colors to an item.
 * @param {HTMLElement} item
 * @param {string} color
 */
function applyCategoryItemColors(item, color) {
    if (!item || !color) {
        return;
    }
    const contrast = computeCategoryContrast(color);
    item.classList.add('is-colored');
    item.style.setProperty('--ytc-category-bg', color);
    item.style.setProperty('--ytc-category-text', contrast.text);
    item.style.setProperty('--ytc-category-pill-bg', contrast.pillBg);
    item.style.setProperty('--ytc-category-pill-border', contrast.pillBorder);
}

/**
 * Reset category background + contrast colors on an item.
 * @param {HTMLElement} item
 */
function clearCategoryItemColors(item) {
    if (!item) {
        return;
    }
    item.classList.remove('is-colored');
    item.style.removeProperty('--ytc-category-bg');
    item.style.removeProperty('--ytc-category-text');
    item.style.removeProperty('--ytc-category-pill-bg');
    item.style.removeProperty('--ytc-category-pill-border');
}

/**
 * Pick a random color that differs from existing categories.
 * @returns {string}
 */
function generateRandomCategoryColor() {
    const existing = new Set(categories.map((item) => normalizeColorToHex(item.color)));
    for (let i = 0; i < 12; i += 1) {
        const hue = Math.floor(Math.random() * 360);
        const color = `hsl(${hue} 65% 45%)`;
        if (!existing.has(normalizeColorToHex(color))) {
            return color;
        }
    }
    return `hsl(${Math.floor(Math.random() * 360)} 65% 45%)`;
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
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length === 0) {
            return '';
        }
        const [first, second] = parts;
        if (first.startsWith('@')) {
            return `/${first.toLowerCase()}`;
        }
        if (first === 'channel' && second) {
            return `/channel/${second.toLowerCase()}`;
        }
        if ((first === 'c' || first === 'user') && second) {
            return `/${first}/${second.toLowerCase()}`;
        }
        return '';
    } catch (_error) {
        return '';
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
}

/**
 * Mark categories changed for memoized views.
 */
function markCategoriesDirty() {
    categoriesVersion += 1;
    categoryCountsCacheKey = '';
}

/**
 * Mark assignments changed for memoized views.
 */
function markAssignmentsDirty() {
    assignmentsVersion += 1;
    assignmentCache.clear();
    categoryCountsCacheKey = '';
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
        STORAGE_KEYS.FILTER,
        STORAGE_KEYS.SORT,
        STORAGE_KEYS.COOLDOWN_MINUTES,
        STORAGE_KEYS.SIDEBAR_COLLAPSED
    ]);

    categories = normalizeCategories(result[STORAGE_KEYS.CATEGORIES]);
    assignments = normalizeAssignments(result[STORAGE_KEYS.ASSIGNMENTS]);
    markCategoriesDirty();
    markAssignmentsDirty();
    viewMode = result[STORAGE_KEYS.VIEW] === 'card' ? 'card' : 'table';
    filterMode = typeof result[STORAGE_KEYS.FILTER] === 'string' ? result[STORAGE_KEYS.FILTER] : 'all';
    sortMode = result[STORAGE_KEYS.SORT] === 'subscribers' ? 'subscribers' : 'name';
    apiCooldownMinutes = normalizeCooldownMinutes(result[STORAGE_KEYS.COOLDOWN_MINUTES]);
    apiCooldownMs = apiCooldownMinutes * 60 * 1000;
    sidebarCollapsed = result[STORAGE_KEYS.SIDEBAR_COLLAPSED] === true;
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
        [STORAGE_KEYS.FILTER]: filterMode,
        [STORAGE_KEYS.SORT]: sortMode
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
    const singleton = normalized.length > 0 ? [normalized[0]] : [];
    assignmentCache.set(channelId, singleton);
    return singleton;
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
    const normalized = Array.from(new Set(next)).slice(0, 1);
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
    refreshQuickAddButtons();
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
function readChannelIdFromElement(element) {
    if (!element) {
        return '';
    }
    return element.getAttribute('channel-external-id')
        || element.getAttribute('channel-id')
        || element.getAttribute('data-channel-external-id')
        || element.getAttribute('data-channel-id')
        || element.dataset?.channelExternalId
        || element.dataset?.channelId
        || '';
}

function resolveChannelIdentityFromContext(renderer) {
    let channelId = '';
    let handle = '';
    let url = '';

    if (renderer) {
        channelId = readChannelIdFromElement(renderer);
    }

    if (!channelId) {
        const flexy = document.querySelector('ytd-watch-flexy');
        channelId = readChannelIdFromElement(flexy);
    }

    if (!channelId) {
        const reelHost = renderer?.closest('ytd-reel-video-renderer');
        channelId = readChannelIdFromElement(reelHost);
    }

    if (!channelId) {
        const reel = document.querySelector('ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]');
        channelId = readChannelIdFromElement(reel);
    }

    if (!channelId) {
        const reelHeader = document.querySelector('ytd-reel-player-header-renderer, ytd-reel-player-overlay-renderer');
        channelId = readChannelIdFromElement(reelHeader);
    }

    if (!channelId) {
        const owner = document.querySelector('ytd-video-owner-renderer, ytd-channel-name, ytd-channel-header-renderer');
        channelId = readChannelIdFromElement(owner);
    }

    if (!channelId) {
        const metaChannel = document.querySelector('meta[itemprop="channelId"]');
        channelId = metaChannel?.getAttribute('content') || '';
    }

    const context = renderer?.closest(QUICK_ADD_CONTEXT_SELECTOR) || renderer;
    const link = context?.querySelector('a[href^="/channel/"], a[href^="/@"]');
    if (link) {
        url = link.getAttribute('href') || '';
    }

    if (!url) {
        const ownerLink = document.querySelector('ytd-video-owner-renderer a[href^="/channel/"], ytd-video-owner-renderer a[href^="/@"], ytd-channel-name a[href^="/channel/"], ytd-channel-name a[href^="/@"]');
        url = ownerLink?.getAttribute('href') || '';
    }

    if (!url) {
        const reelLink = document.querySelector('ytd-reel-player-header-renderer a[href^="/channel/"], ytd-reel-player-header-renderer a[href^="/@"], ytd-reel-player-overlay-renderer a[href^="/channel/"], ytd-reel-player-overlay-renderer a[href^="/@"]');
        url = reelLink?.getAttribute('href') || '';
    }

    if (!url) {
        const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        url = canonical;
    }

    handle = extractHandleFromUrl(url) || '';
    if (!handle && renderer) {
        const labelText = renderer.querySelector('button[aria-label]')?.getAttribute('aria-label') || '';
        const handleMatch = labelText.match(/@[\w.-]+/i);
        handle = handleMatch ? handleMatch[0] : '';
    }
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

function getHandleAssignmentKey(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) {
        return '';
    }
    return `handle:${normalized.replace(/^@/, '')}`;
}

function getUrlAssignmentKey(url) {
    const normalized = normalizeChannelUrl(url);
    if (!normalized) {
        return '';
    }
    return `url:${normalized}`;
}

function resolveAssignmentKeyForRead(identity, channelId) {
    const handleKey = getHandleAssignmentKey(identity.handle);
    const urlKey = getUrlAssignmentKey(identity.url);
    if (channelId && readChannelAssignments(channelId).length > 0) {
        return channelId;
    }
    if (handleKey && readChannelAssignments(handleKey).length > 0) {
        return handleKey;
    }
    if (urlKey && readChannelAssignments(urlKey).length > 0) {
        return urlKey;
    }
    return channelId || handleKey || urlKey || '';
}

function resolveAssignmentKeyForWrite(identity, channelId) {
    const handleKey = getHandleAssignmentKey(identity.handle);
    const urlKey = getUrlAssignmentKey(identity.url);
    return channelId || handleKey || urlKey || '';
}

function migrateAssignmentKeyIfNeeded(channelId, identity) {
    if (!channelId) {
        return;
    }
    const handleKey = getHandleAssignmentKey(identity.handle);
    const urlKey = getUrlAssignmentKey(identity.url);
    const fallbackKeys = [handleKey, urlKey].filter(Boolean);
    if (fallbackKeys.length === 0) {
        return;
    }
    const existing = readChannelAssignments(channelId);
    let migrated = false;
    fallbackKeys.forEach((key) => {
        const fallback = readChannelAssignments(key);
        if (fallback.length === 0) {
            return;
        }
        if (existing.length === 0) {
            writeChannelAssignments(channelId, fallback);
        }
        writeChannelAssignments(key, []);
        migrated = true;
    });
    if (migrated) {
        void persistLocalState();
    }
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

    const iconWrap = document.createElement('span');
    iconWrap.className = 'yt-commander-sub-manager-quick-add-icon';
    iconWrap.setAttribute('data-role', 'quick-add-icon');
    iconWrap.appendChild(createQuickAddIcon());

    const label = document.createElement('span');
    label.className = 'yt-commander-sub-manager-quick-add-label';
    label.setAttribute('data-role', 'quick-add-label');

    const caret = createIcon(ICONS.chevronDown);
    caret.classList.add('yt-commander-sub-manager-icon');
    caret.classList.add('yt-commander-sub-manager-quick-add-caret');

    button.appendChild(iconWrap);
    button.appendChild(label);
    button.appendChild(caret);
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
    updateQuickAddButtonState(button, identity);
    return button;
}

function getQuickAddIdentityFromButton(button) {
    if (!button) {
        return { channelId: '', handle: '', url: '' };
    }
    return {
        channelId: button.getAttribute('data-channel-id') || '',
        handle: button.getAttribute('data-channel-handle') || '',
        url: button.getAttribute('data-channel-url') || ''
    };
}

function getQuickAddAssignmentKeyFromButton(button) {
    if (!button) {
        return '';
    }
    return button.getAttribute('data-channel-key') || '';
}

function setQuickAddIcon(button, assigned, color) {
    const iconWrap = button?.querySelector('[data-role="quick-add-icon"]');
    if (!iconWrap) {
        return;
    }
    iconWrap.textContent = '';
    if (assigned && color) {
        const dot = document.createElement('span');
        dot.className = 'yt-commander-sub-manager-quick-add-dot';
        dot.style.backgroundColor = color;
        iconWrap.appendChild(dot);
        return;
    }
    iconWrap.appendChild(createQuickAddIcon());
}

function updateQuickAddButtonState(button, identityOverride = null) {
    if (!button) {
        return;
    }
    const identity = identityOverride || getQuickAddIdentityFromButton(button);
    let channelId = identity.channelId;
    let handle = identity.handle;
    let url = identity.url;
    if (!channelId) {
        const renderer = resolveSubscribeRendererForQuickAdd(button);
        const resolved = resolveChannelIdentityFromContext(renderer);
        channelId = resolveChannelIdFromIdentity(resolved);
        if (channelId) {
            button.setAttribute('data-channel-id', channelId);
        }
        if (!handle && resolved.handle) {
            handle = resolved.handle;
            button.setAttribute('data-channel-handle', resolved.handle);
        }
        if (!url && resolved.url) {
            url = resolved.url;
            button.setAttribute('data-channel-url', resolved.url);
        }
    }

    const labelEl = button.querySelector('[data-role="quick-add-label"]');
    migrateAssignmentKeyIfNeeded(channelId, { channelId, handle, url });
    const assignmentKey = resolveAssignmentKeyForRead({ channelId, handle, url }, channelId);
    if (assignmentKey) {
        button.setAttribute('data-channel-key', assignmentKey);
    } else {
        button.removeAttribute('data-channel-key');
    }
    const assignedId = assignmentKey ? readChannelAssignments(assignmentKey)[0] : '';
    const category = assignedId ? categories.find((item) => item.id === assignedId) : null;
    if (category) {
        applyCategoryItemColors(button, category.color);
        button.classList.add('is-assigned');
        button.classList.remove('is-empty');
        button.setAttribute('data-category-id', category.id);
        if (labelEl) {
            labelEl.textContent = category.name;
        }
        setQuickAddIcon(button, true, category.color);
        button.setAttribute('aria-label', `Category: ${category.name}`);
        button.setAttribute('title', `Change category (${category.name})`);
        return;
    }

    clearCategoryItemColors(button);
    button.classList.remove('is-assigned');
    button.classList.add('is-empty');
    button.removeAttribute('data-category-id');
    if (labelEl) {
        labelEl.textContent = DEFAULT_QUICK_ADD_LABEL;
    }
    setQuickAddIcon(button, false);
    button.setAttribute('aria-label', 'Add to category');
    button.setAttribute('title', 'Add to category');
}

function refreshQuickAddButtons() {
    const buttons = document.querySelectorAll(`.${QUICK_ADD_CLASS}`);
    buttons.forEach((button) => {
        updateQuickAddButtonState(button);
    });
}

function resolveSubscribeRendererForQuickAdd(button) {
    if (!button) {
        return null;
    }
    const sibling = button.previousElementSibling;
    if (sibling && sibling.matches(SUBSCRIBE_RENDERER_SELECTOR)) {
        return sibling;
    }
    const parent = button.parentElement;
    if (parent) {
        const candidate = parent.querySelector(SUBSCRIBE_RENDERER_SELECTOR);
        if (candidate) {
            return candidate;
        }
    }
    return button.closest(SUBSCRIBE_RENDERER_SELECTOR);
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
        const parent = renderer.closest(QUICK_ADD_HOST_SELECTOR) || renderer.parentElement;
        if (!parent) {
            return;
        }
        const existing = parent.querySelector(`.${QUICK_ADD_CLASS}`);
        if (existing) {
            parent.classList.add('yt-commander-sub-manager-quick-add-host');
            updateQuickAddButtonState(existing, resolveChannelIdentityFromContext(renderer));
            renderer.dataset.ytcQuickAdd = 'true';
            return;
        }

        const identity = resolveChannelIdentityFromContext(renderer);
        const button = buildQuickAddButton(identity);
        renderer.insertAdjacentElement('afterend', button);
        parent.classList.add('yt-commander-sub-manager-quick-add-host');
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

function isQuickAddPage() {
    const href = String(location.href || '');
    return QUICK_ADD_PAGES.some((pattern) => pattern.test(href));
}

async function handleQuickAddClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const renderer = resolveSubscribeRendererForQuickAdd(button);
    const identity = resolveChannelIdentityFromContext(renderer);

    let channelId = button.getAttribute('data-channel-id') || '';
    if (!channelId) {
        channelId = resolveChannelIdFromIdentity(identity);
    }

    if (!channelId && (identity.handle || identity.url)) {
        await loadSubscriptions({ force: true, background: true });
        channelId = resolveChannelIdFromIdentity(identity);
    }

    if (channelId) {
        button.setAttribute('data-channel-id', channelId);
    }
    if (identity.handle) {
        button.setAttribute('data-channel-handle', identity.handle);
    }
    if (identity.url) {
        button.setAttribute('data-channel-url', identity.url);
    }

    const assignmentKey = resolveAssignmentKeyForWrite({ channelId, handle: identity.handle, url: identity.url }, channelId);
    if (!assignmentKey) {
        if (isQuickAddPage()) {
            setStatus('Select a category to retry channel lookup.', 'info');
            ensurePicker();
            openPicker(button, 'toggle', []);
            if (quickAddRetryTimer) {
                window.clearTimeout(quickAddRetryTimer);
            }
            quickAddRetryTimer = window.setTimeout(() => {
                quickAddRetryTimer = 0;
                closePicker();
            }, 5000);
            return;
        }
        setStatus('Unable to resolve channel for category.', 'error');
        return;
    }

    button.setAttribute('data-channel-key', assignmentKey);
    updateQuickAddButtonState(button, { channelId, handle: identity.handle, url: identity.url });
    ensurePicker();
    openPicker(button, 'toggle', [assignmentKey]);
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

    titleRow.appendChild(title);
    const viewToggle = document.createElement('div');
    viewToggle.className = 'yt-commander-sub-manager-view-toggle';
    titleRow.appendChild(viewToggle);

    selectionBadgeEl = document.createElement('span');
    selectionBadgeEl.className = 'yt-commander-sub-manager-selected-badge';
    selectionBadgeEl.setAttribute('aria-live', 'polite');
    selectionBadgeEl.style.display = 'none';
    const selectionIcon = createIcon(ICONS.check);
    selectionIcon.classList.add('yt-commander-sub-manager-icon');
    selectionIcon.classList.add('yt-commander-sub-manager-selected-icon');
    selectionCountEl = document.createElement('span');
    selectionCountEl.className = 'yt-commander-sub-manager-selected-count';
    selectionBadgeEl.appendChild(selectionIcon);
    selectionBadgeEl.appendChild(selectionCountEl);

    clearSelectionButton = document.createElement('button');
    clearSelectionButton.type = 'button';
    clearSelectionButton.className = 'yt-commander-sub-manager-clear-selection';
    clearSelectionButton.setAttribute('data-action', 'clear-selection');
    setIconButton(clearSelectionButton, ICONS.close, 'Clear selection');
    clearSelectionButton.style.display = 'none';

    selectionGroupEl = document.createElement('div');
    selectionGroupEl.className = 'yt-commander-sub-manager-selection-group';
    selectionGroupEl.style.display = 'none';
    selectionGroupEl.appendChild(selectionBadgeEl);
    selectionGroupEl.appendChild(clearSelectionButton);

    const subtitle = document.createElement('div');
    subtitle.className = 'yt-commander-sub-manager-subtitle';
    subtitle.textContent = '';

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

    viewToggle.appendChild(viewTableButton);
    viewToggle.appendChild(viewCardButton);

    unsubscribeButton = document.createElement('button');
    unsubscribeButton.type = 'button';
    unsubscribeButton.className = 'yt-commander-sub-manager-btn danger';
    unsubscribeButton.setAttribute('data-action', 'unsubscribe-selected');
    setIconButton(unsubscribeButton, ICONS.trash, 'Unsubscribe selected');

    autoCategorizeButton = document.createElement('button');
    autoCategorizeButton.type = 'button';
    autoCategorizeButton.className = 'yt-commander-sub-manager-btn secondary';
    autoCategorizeButton.setAttribute('data-action', 'auto-categorize');
    setIconButton(autoCategorizeButton, ICONS.spark, 'Auto categorize');

    sortButton = document.createElement('button');
    sortButton.type = 'button';
    sortButton.className = 'yt-commander-sub-manager-toggle';
    sortButton.setAttribute('data-action', 'sort-toggle');
    updateSortButton();

    const actionGroup = document.createElement('div');
    actionGroup.className = 'yt-commander-sub-manager-action-group';
    actionGroup.appendChild(autoCategorizeButton);
    actionGroup.appendChild(unsubscribeButton);
    const headerDivider = document.createElement('div');
    headerDivider.className = 'yt-commander-sub-manager-header-divider';

    headerActions.appendChild(sortButton);
    headerActions.appendChild(headerDivider);
    headerActions.appendChild(actionGroup);


    header.appendChild(titleWrap);
    header.appendChild(headerActions);


    const content = document.createElement('div');
    content.className = 'yt-commander-sub-manager-content';

    sidebar = document.createElement('div');
    sidebar.className = 'yt-commander-sub-manager-chipbar';

    const chipbarLead = document.createElement('div');
    chipbarLead.className = 'yt-commander-sub-manager-chipbar-lead';

    sidebarAddButton = document.createElement('button');
    sidebarAddButton.type = 'button';
    sidebarAddButton.className = 'yt-commander-sub-manager-chipbar-btn';
    sidebarAddButton.setAttribute('data-action', 'new-category');
    setIconButton(sidebarAddButton, ICONS.plus, 'Add category');
    setTooltip(sidebarAddButton, 'Add category');

    sidebarCountEl = document.createElement('span');
    sidebarCountEl.className = 'yt-commander-sub-manager-chipbar-count';
    sidebarCountEl.textContent = '0';

    chipbarLead.appendChild(sidebarAddButton);
    chipbarLead.appendChild(sidebarCountEl);

    sidebarList = document.createElement('div');
    sidebarList.className = 'yt-commander-sub-manager-chip-list';

    sidebar.appendChild(chipbarLead);
    sidebar.appendChild(sidebarList);

    tableWrap = document.createElement('div');
    tableWrap.className = TABLE_CLASS;

    cardsWrap = document.createElement('div');
    cardsWrap.className = CARDS_CLASS;

    mainWrap = document.createElement('div');
    mainWrap.className = 'yt-commander-sub-manager-main';
    selectionHeaderEl = document.createElement('div');
    selectionHeaderEl.className = 'yt-commander-sub-manager-main-header';
    selectionHeaderEl.style.display = 'none';
    floatingStackEl = document.createElement('div');
    floatingStackEl.className = 'yt-commander-sub-manager-float-stack';
    floatingStackEl.appendChild(selectionGroupEl);
    selectionHeaderEl.appendChild(floatingStackEl);
    mainWrap.appendChild(sidebar);
    mainWrap.appendChild(selectionHeaderEl);
    mainWrap.appendChild(tableWrap);
    mainWrap.appendChild(cardsWrap);

    content.appendChild(mainWrap);
    attachChipbarWheelScroll();

    statusEl = document.createElement('div');
    statusEl.className = STATUS_CLASS;
    statusEl.setAttribute('aria-live', 'polite');
    if (floatingStackEl) {
        floatingStackEl.appendChild(statusEl);
    }

    modal.appendChild(header);
    modal.appendChild(content);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', handleOverlayClick);
    modal.addEventListener('click', handleModalClick);
    modal.addEventListener('contextmenu', handleModalContextMenu);
    modal.addEventListener('dblclick', handleModalDoubleClick);
    modal.addEventListener('change', handleModalChange);
    modal.addEventListener('input', handleModalInput);
    modal.addEventListener('keydown', handleModalKeydown);
    if (mainWrap) {
        mainWrap.addEventListener('scroll', handleMainScroll, { passive: true });
    }
    window.addEventListener('resize', handleVirtualResize);
    ensurePicker();
    ensureTooltipPortal();
    ensureConfirmDialog();
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
function resolvePickerActiveCategoryId() {
    if (!Array.isArray(pickerTargetIds) || pickerTargetIds.length === 0) {
        return '';
    }
    const firstAssigned = readChannelAssignments(pickerTargetIds[0]);
    const firstId = firstAssigned[0] || '';
    const allMatch = pickerTargetIds.every((channelId) => {
        const assigned = readChannelAssignments(channelId);
        return (assigned[0] || '') === firstId;
    });
    if (!allMatch) {
        return '';
    }
    return firstId || 'uncategorized';
}

function renderPicker() {
    if (!picker) {
        return;
    }

    picker.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'yt-commander-sub-manager-picker-title';
    title.textContent = pickerMode === 'remove'
        ? 'Remove from category'
        : pickerMode === 'add'
            ? 'Add to category'
            : pickerMode === 'move'
                ? 'Move to category'
                : 'Set category';

    const list = document.createElement('div');
    list.className = 'yt-commander-sub-manager-picker-list';
    const activeCategoryId = resolvePickerActiveCategoryId();

    const addPickerItem = (options) => {
        const { id, label, color, isActive, isUncategorized } = options;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'yt-commander-sub-manager-picker-item';
        button.setAttribute('data-category-id', id);
        const dot = document.createElement('span');
        dot.className = 'yt-commander-sub-manager-picker-dot';
        dot.style.backgroundColor = color || '#788195';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        button.appendChild(dot);
        button.appendChild(labelEl);
        if (isUncategorized) {
            button.classList.add('is-uncategorized');
        }
        if (isActive) {
            button.classList.add('is-active');
            const check = createIcon(ICONS.check);
            check.classList.add('yt-commander-sub-manager-icon');
            check.classList.add('yt-commander-sub-manager-picker-check');
            button.appendChild(check);
        }
        list.appendChild(button);
    };

    if (pickerMode !== 'remove') {
        addPickerItem({
            id: 'uncategorized',
            label: 'Uncategorized',
            color: '#7c8698',
            isActive: activeCategoryId === 'uncategorized',
            isUncategorized: true
        });
    }

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-picker-empty';
        empty.textContent = 'No categories yet.';
        list.appendChild(empty);
    } else {
        categories.forEach((category) => {
            addPickerItem({
                id: category.id,
                label: category.name,
                color: category.color,
                isActive: activeCategoryId === category.id,
                isUncategorized: false
            });
        });
    }

    picker.appendChild(title);
    picker.appendChild(list);
    if (overlay?.classList.contains('is-visible')) {
        const footer = document.createElement('div');
        footer.className = 'yt-commander-sub-manager-picker-footer';
        const newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.className = 'yt-commander-sub-manager-btn secondary';
        newButton.setAttribute('data-action', 'picker-new-category');
        setIconButton(newButton, ICONS.plus, 'New category');
        footer.appendChild(newButton);
        picker.appendChild(footer);
    }
}

function createPickerContextAnchor(x, y) {
    if (pickerContextAnchor && pickerContextAnchor.parentNode) {
        pickerContextAnchor.remove();
    }
    const anchor = document.createElement('div');
    anchor.className = 'yt-commander-sub-manager-context-anchor';
    anchor.style.position = 'fixed';
    anchor.style.left = `${Math.max(0, x)}px`;
    anchor.style.top = `${Math.max(0, y)}px`;
    anchor.style.width = '0px';
    anchor.style.height = '0px';
    anchor.style.pointerEvents = 'none';
    anchor.style.zIndex = '2147483647';
    document.body.appendChild(anchor);
    pickerContextAnchor = anchor;
    return anchor;
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
    picker.style.display = 'block';
    picker.style.visibility = 'hidden';
    requestAnimationFrame(() => {
        positionPicker();
        picker.style.visibility = 'visible';
    });
}

/**
 * Hide picker.
 */
function closePicker() {
    if (!picker) {
        return;
    }
    picker.style.display = 'none';
    picker.style.visibility = '';
    const list = picker.querySelector('.yt-commander-sub-manager-picker-list');
    if (list) {
        list.style.maxHeight = '';
    }
    pickerAnchorEl = null;
    pickerTargetIds = [];
    if (pickerContextAnchor) {
        pickerContextAnchor.remove();
        pickerContextAnchor = null;
    }
}

/**
 * Ensure tooltip portal exists.
 */
function ensureTooltipPortal() {
    if (tooltipPortal && tooltipPortal.isConnected) {
        return;
    }

    tooltipPortal = document.createElement('div');
    tooltipPortal.className = 'yt-commander-sub-manager-tooltip-portal';
    tooltipPortal.setAttribute('role', 'tooltip');
    tooltipPortal.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipPortal);

    const handleTooltipOver = (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const tooltipTarget = target?.closest('.yt-commander-sub-manager-tooltip');
        if (!tooltipTarget || !modal?.contains(tooltipTarget)) {
            return;
        }
        const label = tooltipTarget.getAttribute('data-tooltip') || tooltipTarget.getAttribute('title') || '';
        if (!label) {
            return;
        }
        tooltipPortalTarget = tooltipTarget;
        tooltipPortal.textContent = label;
        tooltipPortal.setAttribute('data-placement', 'top');
        tooltipPortal.setAttribute('aria-hidden', 'false');
        tooltipPortal.classList.add('is-visible');
        positionTooltipPortal();
    };

    const handleTooltipOut = (event) => {
        if (!tooltipPortalTarget) {
            return;
        }
        const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (related && (tooltipPortalTarget.contains(related) || tooltipPortal.contains(related))) {
            return;
        }
        hideTooltipPortal();
    };

    modal.addEventListener('mouseover', handleTooltipOver);
    modal.addEventListener('mouseout', handleTooltipOut);
    modal.addEventListener('focusin', handleTooltipOver);
    modal.addEventListener('focusout', handleTooltipOut);
    window.addEventListener('scroll', hideTooltipPortal, true);
    window.addEventListener('resize', hideTooltipPortal);
}

/**
 * Position tooltip portal.
 */
function positionTooltipPortal() {
    if (!tooltipPortal || !tooltipPortalTarget) {
        return;
    }
    const rect = tooltipPortalTarget.getBoundingClientRect();
    tooltipPortal.style.left = '0px';
    tooltipPortal.style.top = '0px';
    tooltipPortal.style.transform = 'translate(-50%, -100%)';
    const tooltipRect = tooltipPortal.getBoundingClientRect();
    const padding = 8;
    let left = rect.left + rect.width / 2;
    let top = rect.top - 10;
    let placement = 'top';
    if (top - tooltipRect.height < padding) {
        top = rect.bottom + 10;
        placement = 'bottom';
        tooltipPortal.style.transform = 'translate(-50%, 0)';
    }
    left = Math.max(padding + tooltipRect.width / 2, Math.min(window.innerWidth - padding - tooltipRect.width / 2, left));
    tooltipPortal.style.left = `${left}px`;
    tooltipPortal.style.top = `${top}px`;
    tooltipPortal.setAttribute('data-placement', placement);
}

/**
 * Hide tooltip portal.
 */
function hideTooltipPortal() {
    if (!tooltipPortal) {
        return;
    }
    tooltipPortal.classList.remove('is-visible');
    tooltipPortal.setAttribute('aria-hidden', 'true');
    tooltipPortalTarget = null;
}

/**
 * Ensure confirm dialog exists.
 */
function ensureConfirmDialog() {
    if (confirmBackdrop && confirmBackdrop.isConnected) {
        return;
    }

    confirmBackdrop = document.createElement('div');
    confirmBackdrop.className = 'yt-commander-sub-manager-confirm-backdrop';
    confirmBackdrop.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'yt-commander-sub-manager-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    confirmTitleEl = document.createElement('div');
    confirmTitleEl.className = 'yt-commander-sub-manager-confirm-title';
    confirmTitleEl.textContent = 'Confirm action';

    confirmMessageEl = document.createElement('div');
    confirmMessageEl.className = 'yt-commander-sub-manager-confirm-message';

    const actions = document.createElement('div');
    actions.className = 'yt-commander-sub-manager-confirm-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'yt-commander-sub-manager-btn secondary';
    cancelButton.setAttribute('data-action', 'confirm-cancel');
    cancelButton.textContent = 'Cancel';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'yt-commander-sub-manager-btn danger';
    confirmButton.setAttribute('data-action', 'confirm-accept');
    confirmButton.textContent = 'Confirm';

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    dialog.appendChild(confirmTitleEl);
    dialog.appendChild(confirmMessageEl);
    dialog.appendChild(actions);

    confirmBackdrop.appendChild(dialog);
    modal.appendChild(confirmBackdrop);

    confirmBackdrop.addEventListener('click', (event) => {
        if (event.target === confirmBackdrop) {
            closeConfirmDialog(false);
        }
    });

    confirmBackdrop.addEventListener('click', (event) => {
        const action = event.target?.closest('[data-action]');
        const actionType = action?.getAttribute('data-action');
        if (actionType === 'confirm-accept') {
            closeConfirmDialog(true);
        } else if (actionType === 'confirm-cancel') {
            closeConfirmDialog(false);
        }
    });
}

/**
 * Show confirm dialog.
 * @param {{title?: string, message?: string, confirmLabel?: string, cancelLabel?: string}} options
 * @returns {Promise<boolean>}
 */
function showConfirmDialog(options = {}) {
    ensureConfirmDialog();
    if (!confirmBackdrop) {
        return Promise.resolve(false);
    }
    const { title, message, confirmLabel, cancelLabel } = options;
    if (confirmTitleEl && title) {
        confirmTitleEl.textContent = title;
    }
    if (confirmMessageEl && message) {
        confirmMessageEl.textContent = message;
    }
    const confirmButton = confirmBackdrop.querySelector('[data-action="confirm-accept"]');
    const cancelButton = confirmBackdrop.querySelector('[data-action="confirm-cancel"]');
    if (confirmButton && confirmLabel) {
        confirmButton.textContent = confirmLabel;
    }
    if (cancelButton && cancelLabel) {
        cancelButton.textContent = cancelLabel;
    }
    confirmBackdrop.classList.add('is-visible');
    confirmBackdrop.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => {
        confirmResolve = resolve;
    });
}

/**
 * Close confirm dialog.
 * @param {boolean} accepted
 */
function closeConfirmDialog(accepted) {
    if (!confirmBackdrop) {
        return;
    }
    confirmBackdrop.classList.remove('is-visible');
    confirmBackdrop.setAttribute('aria-hidden', 'true');
    if (confirmResolve) {
        const resolve = confirmResolve;
        confirmResolve = null;
        resolve(Boolean(accepted));
    }
}

/**
 * Position picker near anchor.
 */
function positionPicker() {
    if (!picker || !pickerAnchorEl) {
        return;
    }
    if (picker.style.display !== 'block') {
        return;
    }
    const rect = pickerAnchorEl.getBoundingClientRect();
    const list = picker.querySelector('.yt-commander-sub-manager-picker-list');
    if (list) {
        list.style.maxHeight = '';
    }
    const initialPickerRect = picker.getBoundingClientRect();
    const initialListRect = list ? list.getBoundingClientRect() : { height: 0 };
    const padding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const openAbove = spaceAbove > spaceBelow;
    const available = Math.max(openAbove ? spaceAbove : spaceBelow, 0);
    const nonListHeight = Math.max(0, initialPickerRect.height - initialListRect.height);
    if (list) {
        const maxListHeight = Math.max(0, Math.floor(available - nonListHeight));
        list.style.maxHeight = `${maxListHeight}px`;
    }
    const pickerRect = picker.getBoundingClientRect();
    let top = openAbove
        ? rect.top - pickerRect.height - padding
        : rect.bottom + padding;
    let left = rect.left;

    if (left + pickerRect.width > window.innerWidth - padding) {
        left = window.innerWidth - pickerRect.width - padding;
    }

    picker.style.top = `${Math.max(padding, top)}px`;
    picker.style.left = `${Math.max(padding, left)}px`;
}

/**
 * Create a category.
 * @param {string} name
 * @param {string} [colorOverride]
 * @returns {{id: string, name: string, color: string}}
 */
function createCategory(name, colorOverride = '') {
    const trimmed = name.trim();
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const color = typeof colorOverride === 'string' && colorOverride.trim()
        ? colorOverride.trim()
        : generateRandomCategoryColor();
    return {
        id,
        name: trimmed,
        color
    };
}

/**
 * Persist sidebar state.
 * @returns {Promise<void>}
 */
async function persistSidebarState() {
    await storageSet({
        [STORAGE_KEYS.SIDEBAR_COLLAPSED]: sidebarCollapsed
    });
}

function updateSidebarToggleButton() {
    if (!sidebarToggleButton) {
        return;
    }
    const icon = sidebarCollapsed ? ICONS.expand : ICONS.collapse;
    const label = sidebarCollapsed ? 'Expand categories' : 'Collapse categories';
    setIconButton(sidebarToggleButton, icon, label);
}

function updateSortButton() {
    if (!sortButton) {
        return;
    }
    const isSubscribers = sortMode === 'subscribers';
    const label = isSubscribers ? 'Sort by name' : 'Sort by subscribers';
    setIconButton(sortButton, ICONS.sort, label);
    sortButton.classList.toggle('active', isSubscribers);
}

function updateRemoveCategoryButton() {
    if (!removeCategoryButton) {
        return;
    }
    const hasSelection = selectedChannelIds.size > 0;
    removeCategoryButton.disabled = !hasSelection;
    const label = hasSelection ? 'Move to category' : 'Select channels to move';
    setIconButton(removeCategoryButton, ICONS.categoryMove, label);
}

function attachChipbarWheelScroll() {
    if (!sidebar || !sidebarList) {
        return;
    }
    if (!sidebar.classList.contains('yt-commander-sub-manager-chipbar')) {
        return;
    }
    if (chipbarWheelTarget && chipbarWheelHandler) {
        chipbarWheelTarget.removeEventListener('wheel', chipbarWheelHandler);
    }
    chipbarWheelTarget = sidebar;
    chipbarWheelHandler = (event) => {
        if (!sidebarList) {
            return;
        }
        if (event.ctrlKey) {
            return;
        }
        if (sidebarList.scrollWidth <= sidebarList.clientWidth) {
            return;
        }
        const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
            ? event.deltaY
            : event.deltaX;
        if (!dominantDelta) {
            return;
        }
        event.preventDefault();
        sidebarList.scrollLeft += dominantDelta;
    };
    chipbarWheelTarget.addEventListener('wheel', chipbarWheelHandler, { passive: false });
}

function updateCategoryActionButtons() {
    const showAddButton = filterMode === 'all' || filterMode === 'uncategorized';
    if (addCategoryButton) {
        addCategoryButton.style.display = showAddButton ? 'inline-flex' : 'none';
    }
    updateRemoveCategoryButton();
}

function applySidebarState() {
    if (!sidebar) {
        return;
    }
    if (sidebar.classList.contains('yt-commander-sub-manager-chipbar')) {
        sidebarCollapsed = false;
        sidebar.classList.remove('is-collapsed');
        return;
    }
    sidebar.classList.toggle('is-collapsed', sidebarCollapsed);
    updateSidebarToggleButton();
}

function resetSidebarDraftState() {
    sidebarEditingId = '';
    sidebarEditingName = '';
    sidebarCreating = false;
    sidebarDraftName = '';
    sidebarDraftColor = '';
}

function captureSidebarDraftState() {
    if (!sidebarList) {
        return;
    }
    const input = sidebarList.querySelector('.yt-commander-sub-manager-sidebar-input');
    if (!input) {
        return;
    }
    if (sidebarCreating) {
        sidebarDraftName = input.value;
        return;
    }
    if (sidebarEditingId) {
        sidebarEditingName = input.value;
    }
}

function focusSidebarInput() {
    if (!sidebarList) {
        return;
    }
    const input = sidebarList.querySelector('.yt-commander-sub-manager-sidebar-input');
    if (!input) {
        return;
    }
    input.focus();
    input.select();
    input.scrollIntoView({ block: 'nearest' });
}

function ensureSidebarExpanded() {
    if (!sidebarCollapsed) {
        return;
    }
    sidebarCollapsed = false;
    applySidebarState();
    persistSidebarState().catch(() => undefined);
}

function startSidebarCreate() {
    ensureSidebarExpanded();
    sidebarCreating = true;
    sidebarEditingId = '';
    sidebarEditingName = '';
    sidebarDraftName = '';
    sidebarDraftColor = generateRandomCategoryColor();
    renderSidebarCategories();
    focusSidebarInput();
}

function startSidebarEdit(categoryId) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
        return;
    }
    ensureSidebarExpanded();
    sidebarEditingId = categoryId;
    sidebarEditingName = category.name;
    sidebarCreating = false;
    sidebarDraftName = '';
    sidebarDraftColor = '';
    renderSidebarCategories();
    focusSidebarInput();
}

async function commitSidebarCreate(name) {
    const trimmed = name.trim();
    if (!trimmed) {
        resetSidebarDraftState();
        renderSidebarCategories();
        return false;
    }
    if (categories.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
        setStatus('Category already exists.', 'error');
        focusSidebarInput();
        return false;
    }
    const category = createCategory(trimmed, sidebarDraftColor);
    categories.push(category);
    markCategoriesDirty();
    await persistLocalState();
    await markPending([`category:${category.id}`]);
    setStatus(`Created category "${category.name}".`, 'success');
    resetSidebarDraftState();
    renderList();
    return true;
}

async function commitSidebarRename(categoryId, name) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
        resetSidebarDraftState();
        renderSidebarCategories();
        return false;
    }
    const trimmed = name.trim();
    if (!trimmed) {
        setStatus('Category name required.', 'error');
        focusSidebarInput();
        return false;
    }
    if (categories.some((item) => item.id !== categoryId && item.name.toLowerCase() === trimmed.toLowerCase())) {
        setStatus('Category already exists.', 'error');
        focusSidebarInput();
        return false;
    }
    if (category.name !== trimmed) {
        category.name = trimmed;
        markCategoriesDirty();
        await persistLocalState();
        await markPending([`category:${categoryId}`]);
        setStatus(`Renamed category to "${trimmed}".`, 'success');
    }
    resetSidebarDraftState();
    renderList();
    return true;
}

async function commitSidebarInput(input, reason) {
    if (!input) {
        return false;
    }
    const mode = input.getAttribute('data-mode');
    if (mode === 'create') {
        if (reason === 'blur' && !input.value.trim()) {
            resetSidebarDraftState();
            renderSidebarCategories();
            return false;
        }
        return commitSidebarCreate(input.value);
    }
    const categoryId = input.getAttribute('data-category-id') || '';
    if (reason === 'blur' && !input.value.trim()) {
        resetSidebarDraftState();
        renderSidebarCategories();
        return false;
    }
    return commitSidebarRename(categoryId, input.value);
}

async function updateCategoryColor(categoryId, nextColor) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category || !nextColor) {
        return;
    }
    if (category.color === nextColor) {
        return;
    }
    category.color = nextColor;
    markCategoriesDirty();
    await persistLocalState();
    await markPending([`category:${categoryId}`]);
    setStatus(`Updated color for "${category.name}".`, 'success');
    renderList();
}

function renderSidebarCategories() {
    if (!sidebarList) {
        return;
    }
    const previousScrollTop = sidebarList.scrollTop;
    const wasAtBottom = sidebarList.scrollHeight > sidebarList.clientHeight
        && (sidebarList.scrollHeight - sidebarList.scrollTop - sidebarList.clientHeight) < 4;

    if (sidebarCountEl) {
        sidebarCountEl.textContent = String(categories.length);
    }

    const counts = getCategoryCounts();
    const validIds = new Set(['all', 'uncategorized', ...categories.map((category) => category.id)]);
    if (!validIds.has(filterMode)) {
        filterMode = 'all';
        persistViewState().catch(() => undefined);
    }

    sidebarList.innerHTML = '';

    if (sidebarEditingId && !categories.some((item) => item.id === sidebarEditingId)) {
        resetSidebarDraftState();
    }

    const buildColorInput = (value, options = {}) => {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'yt-commander-sub-manager-color-input';
        input.value = normalizeColorToHex(value);
        if (options.categoryId) {
            input.setAttribute('data-category-id', options.categoryId);
        }
        if (options.mode) {
            input.setAttribute('data-mode', options.mode);
        }
        input.setAttribute('data-action', 'category-color');
        setTooltip(input, options.tooltip || 'Change color');
        return input;
    };

    const addItem = (id, label, color, options = {}) => {
        const countValue = typeof counts[id] === 'number' ? counts[id] : 0;
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item`;
        item.setAttribute('data-action', 'filter-select');
        item.setAttribute('data-filter-id', id);
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        if (filterMode === id) {
            item.classList.add('active');
        }
        applySidebarTooltip(item, label, {
            tooltip: `${label} (${countValue})`
        });

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const initial = document.createElement('span');
        initial.className = 'yt-commander-sub-manager-filter-initial';
        initial.textContent = getSidebarInitial(label);

        const name = document.createElement('span');
        name.className = 'yt-commander-sub-manager-filter-name';
        name.textContent = label;

        left.appendChild(initial);
        left.appendChild(name);

        const right = document.createElement('span');
        right.className = 'yt-commander-sub-manager-filter-right';

        const count = document.createElement('span');
        count.className = FILTER_COUNT_CLASS;
        count.textContent = String(countValue);

        right.appendChild(count);

        if (options.removable) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'yt-commander-sub-manager-filter-remove';
            remove.setAttribute('data-action', 'filter-remove');
            remove.setAttribute('data-category-id', id);
            setTooltip(remove, `Delete ${label}`);
            const removeIcon = createIcon(ICONS.trash);
            removeIcon.classList.add('yt-commander-sub-manager-icon');
            remove.appendChild(removeIcon);
            right.appendChild(remove);
        }

        item.appendChild(left);
        item.appendChild(right);
        sidebarList.appendChild(item);
    };

    const addEditableItem = (category) => {
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item is-editing`;

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const color = buildColorInput(category.color, { categoryId: category.id, tooltip: 'Change color' });
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'yt-commander-sub-manager-sidebar-input';
        input.value = sidebarEditingName || category.name;
        input.placeholder = 'Category name';
        input.setAttribute('data-category-id', category.id);
        input.setAttribute('data-mode', 'edit');

        left.appendChild(color);
        left.appendChild(input);
        item.appendChild(left);
        sidebarList.appendChild(item);
        applyCategoryItemColors(item, category.color);
    };

    const addCreateItem = () => {
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item is-creating`;

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const colorValue = sidebarDraftColor || pickCategoryColor(sidebarDraftName || 'New category');
        const color = buildColorInput(colorValue, { mode: 'create', tooltip: 'Pick color' });
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'yt-commander-sub-manager-sidebar-input';
        input.value = sidebarDraftName;
        input.placeholder = 'New category';
        input.setAttribute('data-mode', 'create');

        left.appendChild(color);
        left.appendChild(input);
        item.appendChild(left);
        sidebarList.appendChild(item);
        applyCategoryItemColors(item, colorValue);
    };

    addItem('all', 'All categories', '#616b7f');
    addItem('uncategorized', 'Uncategorized', '#3b4457');
    categories.forEach((category) => {
        if (sidebarEditingId === category.id) {
            addEditableItem(category);
            return;
        }
        const countValue = typeof counts[category.id] === 'number' ? counts[category.id] : 0;
        const item = document.createElement('div');
        item.className = `${FILTER_ITEM_CLASS} yt-commander-sub-manager-sidebar-item`;
        item.setAttribute('data-action', 'filter-select');
        item.setAttribute('data-filter-id', category.id);
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        if (filterMode === category.id) {
            item.classList.add('active');
        }
        applySidebarTooltip(item, category.name, {
            tooltip: `${category.name} (${countValue})`
        });

        const left = document.createElement('span');
        left.className = 'yt-commander-sub-manager-filter-left';

        const initial = document.createElement('span');
        initial.className = 'yt-commander-sub-manager-filter-initial';
        initial.textContent = getSidebarInitial(category.name);

        const name = document.createElement('span');
        name.className = 'yt-commander-sub-manager-filter-name';
        name.textContent = category.name;
        name.setAttribute('data-category-id', category.id);

        left.appendChild(initial);
        left.appendChild(name);

        const right = document.createElement('span');
        right.className = 'yt-commander-sub-manager-filter-right';

        const count = document.createElement('span');
        count.className = FILTER_COUNT_CLASS;
        count.textContent = String(countValue);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'yt-commander-sub-manager-filter-remove';
        remove.setAttribute('data-action', 'filter-remove');
        remove.setAttribute('data-category-id', category.id);
        setTooltip(remove, `Delete ${category.name}`);
        const removeIcon = createIcon(ICONS.trash);
        removeIcon.classList.add('yt-commander-sub-manager-icon');
        remove.appendChild(removeIcon);

        right.appendChild(count);
        right.appendChild(remove);

        item.appendChild(left);
        item.appendChild(right);
        sidebarList.appendChild(item);
        applyCategoryItemColors(item, category.color);
    });
    if (sidebarCreating) {
        addCreateItem();
    }
    if (!sidebarCreating && !sidebarEditingId) {
        const nextScrollTop = wasAtBottom ? sidebarList.scrollHeight : previousScrollTop;
        window.requestAnimationFrame(() => {
            if (!sidebarList) {
                return;
            }
            sidebarList.scrollTop = Math.min(nextScrollTop, sidebarList.scrollHeight);
        });
    }
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
    setStatus(`Deleted "${category.name}" and unassigned ${affected} channel(s).`, 'success');
    renderSidebarCategories();
    renderList();
}

function getCategoryLabel(categoryId) {
    if (categoryId === 'all') {
        return 'All categories';
    }
    if (categoryId === 'uncategorized') {
        return 'Uncategorized';
    }
    const category = categories.find((item) => item.id === categoryId);
    return category ? category.name : 'category';
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
    if (statusTimeoutId) {
        window.clearTimeout(statusTimeoutId);
        statusTimeoutId = 0;
    }
    if (message) {
        statusTimeoutId = window.setTimeout(() => {
            if (!statusEl) {
                return;
            }
            statusEl.textContent = '';
            statusEl.removeAttribute('data-status');
            statusTimeoutId = 0;
            updateFloatingHeaderVisibility();
        }, 3000);
    }
    updateFloatingHeaderVisibility();
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
    const count = selectedChannelIds.size;
    if (selectionBadgeEl) {
        if (count > 0) {
            if (selectionCountEl) {
                selectionCountEl.textContent = String(count);
            } else {
                selectionBadgeEl.textContent = String(count);
            }
            const tooltipLabel = buildSelectionTooltip() || `${count} selected`;
            selectionBadgeEl.setAttribute('aria-label', `${count} selected`);
            selectionBadgeEl.setAttribute('title', tooltipLabel);
            selectionBadgeEl.setAttribute('data-tooltip', tooltipLabel);
            selectionBadgeEl.classList.add('yt-commander-sub-manager-tooltip');
            selectionBadgeEl.style.display = 'inline-flex';
        } else {
            if (selectionCountEl) {
                selectionCountEl.textContent = '';
            } else {
                selectionBadgeEl.textContent = '';
            }
            selectionBadgeEl.style.display = 'none';
        }
    }
    if (selectedChannelIds.size === 0) {
        selectionAnchorId = '';
    }

    const disabled = selectedChannelIds.size === 0;
    if (unsubscribeButton) {
        unsubscribeButton.disabled = disabled;
    }
    if (addCategoryButton) {
        addCategoryButton.disabled = disabled;
    }
    updateCategoryActionButtons();
    if (clearSelectionButton) {
        clearSelectionButton.style.display = disabled ? 'none' : 'inline-flex';
    }

    updateFloatingHeaderVisibility();
}

function buildSelectionTooltip() {
    if (selectedChannelIds.size === 0) {
        return '';
    }
    const nameById = new Map(categories.map((category) => [category.id, category.name]));
    const countsById = new Map();
    let uncategorizedCount = 0;
    let otherCount = 0;

    selectedChannelIds.forEach((channelId) => {
        const assigned = readChannelAssignments(channelId);
        if (!assigned || assigned.length === 0) {
            uncategorizedCount += 1;
            return;
        }
        assigned.forEach((categoryId) => {
            if (!nameById.has(categoryId)) {
                otherCount += 1;
                return;
            }
            countsById.set(categoryId, (countsById.get(categoryId) || 0) + 1);
        });
    });

    const lines = [];
    categories.forEach((category) => {
        const count = countsById.get(category.id);
        if (count) {
            lines.push(`${category.name}: ${count}`);
        }
    });
    if (uncategorizedCount) {
        lines.push(`Uncategorized: ${uncategorizedCount}`);
    }
    if (otherCount) {
        lines.push(`Other: ${otherCount}`);
    }
    return lines.join('\n');
}

function updateFloatingHeaderVisibility() {
    const hasSelection = selectedChannelIds.size > 0;
    const hasStatus = Boolean(statusEl && statusEl.textContent);
    if (selectionGroupEl) {
        selectionGroupEl.style.display = hasSelection ? 'inline-flex' : 'none';
    }
    if (selectionHeaderEl) {
        selectionHeaderEl.style.display = hasSelection || hasStatus ? 'flex' : 'none';
    }
}

/**
 * Toggle a channel selection state.
 * @param {string} channelId
 * @param {boolean} [nextState]
 */
function applyChannelSelection(channelId, shouldSelect) {
    if (!channelId) {
        return;
    }
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
}

/**
 * Toggle a channel selection state.
 * @param {string} channelId
 * @param {boolean} [nextState]
 */
function toggleChannelSelection(channelId, nextState) {
    const shouldSelect = typeof nextState === 'boolean'
        ? nextState
        : !selectedChannelIds.has(channelId);
    applyChannelSelection(channelId, shouldSelect);
    updateSelectionSummary();
}

/**
 * Handle selection interaction (shift+click range).
 * @param {string} channelId
 * @param {{shiftKey?: boolean}} [options]
 */
function handleChannelSelectionInteraction(channelId, options = {}) {
    if (!channelId) {
        return;
    }
    const shiftKey = Boolean(options.shiftKey);
    if (shiftKey && selectionAnchorId && currentPageIds.length > 0) {
        const startIndex = currentPageIds.indexOf(selectionAnchorId);
        const endIndex = currentPageIds.indexOf(channelId);
        if (startIndex !== -1 && endIndex !== -1) {
            const [from, to] = startIndex < endIndex
                ? [startIndex, endIndex]
                : [endIndex, startIndex];
            const range = currentPageIds.slice(from, to + 1);
            range.forEach((id) => {
                if (!selectedChannelIds.has(id)) {
                    applyChannelSelection(id, true);
                }
            });
            updateSelectionSummary();
            selectionAnchorId = channelId;
            return;
        }
    }
    toggleChannelSelection(channelId);
    selectionAnchorId = channelId;
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
    const isUncategorized = categoryId === 'uncategorized';
    const categoryLabel = getCategoryLabel(categoryId);
    const categoryDisplay = isUncategorized
        ? 'Uncategorized'
        : (categoryLabel === 'category' ? 'selected category' : `"${categoryLabel}"`);

    const ids = (channelIds || []).filter((id) => typeof id === 'string' && id);
    if (ids.length === 0) {
        setStatus('Select at least one channel.', 'error');
        return;
    }

    const updatedKeys = [];
    const total = ids.length;
    const batchSize = Math.min(50, Math.max(5, Math.ceil(total / 6)));
    let processed = 0;
    let assignedCount = 0;
    let clearedCount = 0;

    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        batch.forEach((channelId) => {
            const current = readChannelAssignments(channelId);
            const hasCategory = current.includes(categoryId);
            let next = current;
            let changed = false;

            if (mode === 'add' && (!hasCategory || current.length > 1)) {
                next = isUncategorized ? [] : [categoryId];
                changed = true;
            } else if (mode === 'remove' && hasCategory) {
                next = [];
                changed = true;
            } else if (mode === 'toggle') {
                next = isUncategorized ? [] : (hasCategory ? [] : [categoryId]);
                changed = true;
            }

            if (changed) {
                writeChannelAssignments(channelId, next);
                updatedKeys.push(`channel:${channelId}`);
                if (next.length === 0) {
                    clearedCount += 1;
                } else {
                    assignedCount += 1;
                }
            }
        });

        processed += batch.length;
        if (total > batchSize) {
            const label = isUncategorized
                ? 'Clearing category'
                : (mode === 'remove'
                    ? `Removing ${categoryDisplay}`
                    : mode === 'add'
                        ? `Assigning ${categoryDisplay}`
                        : `Updating ${categoryDisplay}`);
            setStatus(`${label} ${processed}/${total}...`, 'info');
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    if (updatedKeys.length === 0) {
        if (isUncategorized) {
            setStatus('No changes: already uncategorized.', 'info');
        } else if (mode === 'remove') {
            setStatus(`No changes: not in ${categoryDisplay}.`, 'info');
        } else if (mode === 'add') {
            setStatus(`No changes: already in ${categoryDisplay}.`, 'info');
        } else {
            setStatus('No category changes.', 'info');
        }
        return;
    }

    await persistLocalState();
    await markPending(updatedKeys);
    let successMessage = '';
    if (isUncategorized) {
        successMessage = `Moved ${clearedCount || updatedKeys.length} channel(s) to Uncategorized.`;
    } else if (assignedCount && !clearedCount) {
        successMessage = `Assigned ${categoryDisplay} to ${assignedCount} channel(s).`;
    } else if (clearedCount && !assignedCount) {
        successMessage = `Removed ${categoryDisplay} from ${clearedCount} channel(s).`;
    } else {
        successMessage = `Updated ${categoryDisplay}: assigned ${assignedCount}, cleared ${clearedCount} channel(s).`;
    }
    setStatus(successMessage, 'success');
    selectedChannelIds = new Set();
    selectionAnchorId = '';
    renderList();
}

/**
 * Handle overlay click.
 * @param {MouseEvent} event
 */
function handleOverlayClick(event) {
    if (event.target === overlay) {
        if (confirmBackdrop?.classList.contains('is-visible')) {
            closeConfirmDialog(false);
            return;
        }
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

        if (action === 'sort-toggle') {
            sortMode = sortMode === 'subscribers' ? 'name' : 'subscribers';
            persistViewState().catch(() => undefined);
            renderList();
            return;
        }

        if (action === 'auto-categorize') {
            maybeAutoCategorizeSubscriptions().catch(() => undefined);
            return;
        }

        if (action === 'unsubscribe-selected') {
            unsubscribeSelected().catch((error) => {
                setStatus(error?.message || 'Failed to unsubscribe', 'error');
            });
            return;
        }

    if (action === 'clear-selection') {
        selectedChannelIds = new Set();
        selectionAnchorId = '';
        renderList();
        return;
    }

        if (action === 'new-category') {
            startSidebarCreate();
            return;
        }

        if (action === 'sidebar-toggle') {
            sidebarCollapsed = !sidebarCollapsed;
            applySidebarState();
            persistSidebarState().catch(() => undefined);
            return;
        }

        if (action === 'category-color') {
            return;
        }

        if (action === 'filter-select') {
            const nextFilter = actionTarget.getAttribute('data-filter-id') || 'all';
            if (sidebarCreating || sidebarEditingId) {
                resetSidebarDraftState();
            }
            if (filterMode !== nextFilter) {
                filterMode = nextFilter;
                resetScrollPending = true;
                persistViewState().catch(() => undefined);
                renderList();
            }
            return;
        }

        if (action === 'filter-remove') {
            const categoryId = actionTarget.getAttribute('data-category-id') || '';
            removeCategory(categoryId).catch(() => undefined);
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

        if (action === 'open-channel') {
            const url = actionTarget.getAttribute('data-channel-url') || '';
            openUrlInBackground(url);
            return;
        }
    }

    const interactive = baseTarget?.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-picker'
    );
    if (interactive) {
        return;
    }

    const row = baseTarget?.closest('.yt-commander-sub-manager-row');
    if (row && !row.classList.contains('header')) {
        const channelId = row.getAttribute('data-channel-id') || '';
        handleChannelSelectionInteraction(channelId, { shiftKey: event.shiftKey });
        return;
    }

    const card = baseTarget?.closest('.yt-commander-sub-manager-card');
    if (card) {
        const channelId = card.getAttribute('data-channel-id') || '';
        handleChannelSelectionInteraction(channelId, { shiftKey: event.shiftKey });
    }
}

/**
 * Handle modal right-clicks to open category picker.
 * @param {MouseEvent} event
 */
function handleModalContextMenu(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !modal?.contains(target)) {
        return;
    }
    const interactive = target.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-picker'
    );
    if (interactive) {
        return;
    }

    const row = target.closest('.yt-commander-sub-manager-row');
    if (row && row.classList.contains('header')) {
        return;
    }
    const card = target.closest('.yt-commander-sub-manager-card');
    const anchorItem = row || card;
    if (!anchorItem) {
        return;
    }
    const channelId = anchorItem.getAttribute('data-channel-id') || '';
    if (!channelId) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!selectedChannelIds.has(channelId) || selectedChannelIds.size <= 1) {
        selectedChannelIds = new Set([channelId]);
        selectionAnchorId = channelId;
        renderList();
    }

    const ids = Array.from(selectedChannelIds);
    if (ids.length === 0) {
        return;
    }

    ensurePicker();
    const contextAnchor = createPickerContextAnchor(event.clientX, event.clientY);
    openPicker(contextAnchor, 'move', ids);
}

/**
 * Handle modal double-clicks for category rename.
 * @param {MouseEvent} event
 */
function handleModalDoubleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
        return;
    }
    const nameEl = target.closest('.yt-commander-sub-manager-filter-name');
    if (!nameEl) {
        return;
    }
    const categoryId = nameEl.getAttribute('data-category-id') || '';
    if (!categoryId) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    startSidebarEdit(categoryId);
}

/**
 * Handle modal change events.
 * @param {Event} event
 */
function handleModalChange(event) {
    const target = event.target instanceof Element ? event.target : null;
    const colorInput = target?.closest('input[type="color"][data-action="category-color"]');
    if (colorInput) {
        const mode = colorInput.getAttribute('data-mode') || '';
        if (mode === 'create') {
            sidebarDraftColor = colorInput.value;
            return;
        }
        const categoryId = colorInput.getAttribute('data-category-id') || '';
        if (categoryId) {
            captureSidebarDraftState();
            updateCategoryColor(categoryId, colorInput.value).catch(() => undefined);
        }
        return;
    }

    const checkbox = target?.closest('input[type="checkbox"][data-channel-id]');
    if (!checkbox) {
        return;
    }
    const channelId = checkbox.getAttribute('data-channel-id') || '';
    if (!channelId) {
        return;
    }
    toggleChannelSelection(channelId, checkbox.checked);
    selectionAnchorId = channelId;
}

/**
 * Handle modal input events.
 * @param {Event} event
 */
function handleModalInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }
    if (!target.classList.contains('yt-commander-sub-manager-sidebar-input')) {
        return;
    }
    if (target.getAttribute('data-mode') === 'create') {
        sidebarDraftName = target.value;
        return;
    }
    if (sidebarEditingId) {
        sidebarEditingName = target.value;
    }
}

/**
 * Handle modal keydown events for inline category edits.
 * @param {KeyboardEvent} event
 */
function handleModalKeydown(event) {
    const target = event.target;
    const isSidebarInput = target instanceof HTMLInputElement
        && target.classList.contains('yt-commander-sub-manager-sidebar-input');

    if (event.key === 'Escape' && (sidebarCreating || sidebarEditingId)) {
        event.preventDefault();
        event.stopPropagation();
        resetSidebarDraftState();
        renderSidebarCategories();
        return;
    }

    if (!isSidebarInput) {
        return;
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        commitSidebarInput(target, 'enter').catch(() => undefined);
    }
}

/**
 * Handle picker clicks.
 * @param {MouseEvent} event
 */
async function handlePickerClick(event) {
    const baseTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const target = baseTarget?.closest('[data-category-id]');
    if (target) {
        const categoryId = target.getAttribute('data-category-id') || '';
        let targetIds = pickerTargetIds;
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            const anchor = pickerAnchorEl;
            const anchorKey = getQuickAddAssignmentKeyFromButton(anchor);
            if (anchorKey) {
                targetIds = [anchorKey];
            }
        }
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            const anchor = pickerAnchorEl;
            const renderer = resolveSubscribeRendererForQuickAdd(anchor);
            const anchorIdentity = anchor?.classList.contains(QUICK_ADD_CLASS)
                ? getQuickAddIdentityFromButton(anchor)
                : null;
            const identity = anchorIdentity && (anchorIdentity.channelId || anchorIdentity.handle || anchorIdentity.url)
                ? anchorIdentity
                : resolveChannelIdentityFromContext(renderer);
            let channelId = resolveChannelIdFromIdentity(identity);
            if (!channelId && (identity.handle || identity.url)) {
                await loadSubscriptions({ force: true, background: true });
                channelId = resolveChannelIdFromIdentity(identity);
            }
            const assignmentKey = resolveAssignmentKeyForWrite(identity, channelId);
            if (assignmentKey) {
                if (anchor) {
                    anchor.setAttribute('data-channel-key', assignmentKey);
                }
                targetIds = [assignmentKey];
            }
        }
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
            setStatus('Unable to resolve channel for category.', 'error');
            closePicker();
            return;
        }
        if (pickerMode === 'remove') {
            applyCategoryUpdate(targetIds, categoryId, 'remove').catch(() => undefined);
        } else if (pickerMode === 'add' || pickerMode === 'move') {
            applyCategoryUpdate(targetIds, categoryId, 'add').catch(() => undefined);
        } else {
            applyCategoryUpdate(targetIds, categoryId, 'toggle').catch(() => undefined);
        }
        closePicker();
        return;
    }

    const action = baseTarget?.closest('[data-action]')?.getAttribute('data-action');
    if (action === 'picker-new-category') {
        closePicker();
        startSidebarCreate();
    }
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

    const cooldownRemainingMs = apiCooldownMs - (now - lastCallAt);
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
        rebuildChannelIndexes(channels);
        refreshQuickAddButtons();
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

function buildAutoCategorizeSignature() {
    const categoryKey = categories.map((category) => category.id).join('|');
    return `${lastSnapshotHash}:${channels.length}:${categoriesVersion}:${assignmentsVersion}:${categoryKey}`;
}

async function maybeAutoCategorizeSubscriptions() {
    if (autoCategorizeInFlight) {
        return;
    }
    if (!overlay?.classList.contains('is-visible')) {
        return;
    }
    if (!channels.length || !categories.length) {
        return;
    }

    const signature = buildAutoCategorizeSignature();
    if (signature && signature === lastAutoCategorizeSignature) {
        return;
    }

    autoCategorizeInFlight = true;
    lastAutoCategorizeSignature = signature;
    try {
        const result = await autoCategorizeSubscriptions({
            channels,
            categories,
            assignments,
            applyCategoryUpdate,
            setStatus
        });
        if (result?.appliedCount) {
            renderList();
        }
    } catch (error) {
        logger.warn('Auto-categorize failed', error);
        setStatus(error?.message || 'Auto-categorize failed.', 'error');
    } finally {
        autoCategorizeInFlight = false;
        lastAutoCategorizeSignature = buildAutoCategorizeSignature();
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
 * Parse count label to numeric value.
 * @param {string | number | null | undefined} value
 * @returns {number}
 */
function parseCountValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const text = String(value ?? '').trim();
    if (!text || text === '-' || text.startsWith('@')) {
        return 0;
    }
    const cleaned = text.replace(/,/g, '').replace(/subscribers?/i, '').trim();
    const match = cleaned.match(/([\d.]+)\s*([kmb])?/i);
    if (!match) {
        return 0;
    }
    let numberValue = parseFloat(match[1]);
    if (!Number.isFinite(numberValue)) {
        return 0;
    }
    const suffix = (match[2] || '').toLowerCase();
    if (suffix === 'k') {
        numberValue *= 1000;
    } else if (suffix === 'm') {
        numberValue *= 1000000;
    } else if (suffix === 'b') {
        numberValue *= 1000000000;
    }
    return numberValue;
}

/**
 * Compare channel names.
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareChannelName(a, b) {
    return (a?.title || '').localeCompare(b?.title || '', undefined, { sensitivity: 'base' });
}

/**
 * Sort channels based on active mode.
 * @param {Array<object>} list
 * @returns {Array<object>}
 */
function sortChannels(list) {
    if (sortMode !== 'subscribers') {
        return list;
    }
    return [...list].sort((a, b) => {
        const aValue = parseCountValue(resolveChannelCounts(a).subscribers);
        const bValue = parseCountValue(resolveChannelCounts(b).subscribers);
        if (bValue !== aValue) {
            return bValue - aValue;
        }
        return compareChannelName(a, b);
    });
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
        remove.setAttribute('aria-label', `Remove from ${category.name}`);
        remove.setAttribute('title', `Remove from ${category.name}`);
        remove.setAttribute('data-tooltip', `Remove from ${category.name}`);
        remove.classList.add('yt-commander-sub-manager-tooltip');
        remove.textContent = 'x';

        badge.appendChild(remove);
        wrapper.appendChild(badge);
    });

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

function createVirtualSpacer(height) {
    const spacer = document.createElement('div');
    spacer.className = 'yt-commander-sub-manager-virtual-spacer';
    spacer.style.height = `${Math.max(0, height)}px`;
    return spacer;
}

function buildTableRow(channel, rowIndex) {
    const row = document.createElement('div');
    row.className = 'yt-commander-sub-manager-row';
    row.setAttribute('data-channel-id', channel.channelId || '');
    if (Number.isFinite(rowIndex) && (rowIndex + 1) % 2 === 0) {
        row.classList.add('is-even');
    }
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
    const nameRow = document.createElement('div');
    nameRow.className = 'yt-commander-sub-manager-name-row';
    const name = document.createElement('div');
    name.className = 'yt-commander-sub-manager-name';
    name.setAttribute('data-field', 'name');
    name.textContent = channel.title || 'Untitled channel';
    const openButton = buildOpenChannelButton(channel, '');
    const handle = document.createElement('div');
    handle.className = 'yt-commander-sub-manager-handle';
    handle.setAttribute('data-field', 'handle');
    nameRow.appendChild(name);
    nameRow.appendChild(openButton);
    nameWrap.appendChild(nameRow);
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
    const openButton = row.querySelector('.yt-commander-sub-manager-open-channel');
    if (openButton) {
        updateOpenChannelButton(openButton, channel);
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
    const cardOpenButton = buildOpenChannelButton(channel, 'is-card');
    media.appendChild(cardOpenButton);
    card.appendChild(media);

    const stats = document.createElement('div');
    stats.className = 'yt-commander-sub-manager-card-stats';
    const name = document.createElement('div');
    name.className = 'yt-commander-sub-manager-name yt-commander-sub-manager-card-name';
    name.setAttribute('data-field', 'name');
    name.textContent = channel.title || 'Untitled channel';
    setTooltip(name, channel.title || 'Untitled channel');
    const counts = resolveChannelCounts(channel);
    const subscribers = document.createElement('div');
    subscribers.className = 'yt-commander-sub-manager-card-metric';
    subscribers.setAttribute('data-field', 'subscribers');
    subscribers.textContent = counts.subscribers;
    const nameRow = document.createElement('div');
    nameRow.className = 'yt-commander-sub-manager-card-title-row';
    nameRow.appendChild(name);
    nameRow.appendChild(subscribers);

    stats.appendChild(nameRow);
    card.appendChild(stats);

    return card;
}

function updateCard(card, channel) {
    const name = card.querySelector('[data-field="name"]');
    if (name) {
        name.textContent = channel.title || 'Untitled channel';
        setTooltip(name, channel.title || 'Untitled channel');
    }
    const handle = card.querySelector('[data-field="handle"]');
    if (handle) {
        handle.remove();
    }
    const openButton = card.querySelector('.yt-commander-sub-manager-open-channel');
    if (openButton) {
        updateOpenChannelButton(openButton, channel);
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
}

/**
 * Render table rows.
 * @param {Array<object>} pageItems
 * @param {{totalCount?: number, startIndex?: number, topSpacerHeight?: number, bottomSpacerHeight?: number}} [options]
 */
function renderTable(pageItems, options = {}) {
    if (!tableWrap) {
        return;
    }

    tableWrap.innerHTML = '';
    tableRowById.clear();
    const totalCount = Number.isFinite(options.totalCount) ? options.totalCount : pageItems.length;
    const startIndex = Number.isFinite(options.startIndex) ? options.startIndex : 0;
    const topSpacerHeight = Number.isFinite(options.topSpacerHeight) ? options.topSpacerHeight : 0;
    const bottomSpacerHeight = Number.isFinite(options.bottomSpacerHeight) ? options.bottomSpacerHeight : 0;

    const fragment = document.createDocumentFragment();
    fragment.appendChild(buildTableHeader(pageItems));

    if (totalCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-empty';
        empty.textContent = 'No channels found.';
        fragment.appendChild(empty);
        tableWrap.appendChild(fragment);
        return;
    }

    if (topSpacerHeight > 0) {
        fragment.appendChild(createVirtualSpacer(topSpacerHeight));
    }

    pageItems.forEach((channel, index) => {
        const row = buildTableRow(channel, startIndex + index);
        if (channel.channelId) {
            tableRowById.set(channel.channelId, row);
        }
        fragment.appendChild(row);
    });

    if (bottomSpacerHeight > 0) {
        fragment.appendChild(createVirtualSpacer(bottomSpacerHeight));
    }

    tableWrap.appendChild(fragment);
}

/**
 * Render card view.
 * @param {Array<object>} pageItems
 * @param {{totalCount?: number, topSpacerHeight?: number, bottomSpacerHeight?: number}} [options]
 */
function renderCards(pageItems, options = {}) {
    if (!cardsWrap) {
        return;
    }
    cardsWrap.innerHTML = '';
    cardById.clear();
    const totalCount = Number.isFinite(options.totalCount) ? options.totalCount : pageItems.length;
    const topSpacerHeight = Number.isFinite(options.topSpacerHeight) ? options.topSpacerHeight : 0;
    const bottomSpacerHeight = Number.isFinite(options.bottomSpacerHeight) ? options.bottomSpacerHeight : 0;

    if (totalCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-empty';
        empty.textContent = 'No channels found.';
        cardsWrap.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    if (topSpacerHeight > 0) {
        fragment.appendChild(createVirtualSpacer(topSpacerHeight));
    }
    pageItems.forEach((channel) => {
        const card = buildCard(channel);
        if (channel.channelId) {
            cardById.set(channel.channelId, card);
        }
        fragment.appendChild(card);
    });
    if (bottomSpacerHeight > 0) {
        fragment.appendChild(createVirtualSpacer(bottomSpacerHeight));
    }

    cardsWrap.appendChild(fragment);
}

/**
 * Filter channels by category.
 * @returns {Array<object>}
 */
function filterChannels() {
    let list = channels;
    if (filterMode === 'all') {
        list = channels;
    } else if (filterMode === 'uncategorized') {
        list = channels.filter((channel) => readChannelAssignments(channel.channelId).length === 0);
    } else {
        list = channels.filter((channel) => readChannelAssignments(channel.channelId).includes(filterMode));
    }
    return sortChannels(list);
}

function resolveCardColumns() {
    const width = cardsWrap?.clientWidth || mainWrap?.clientWidth || 0;
    if (!width) {
        return cardColumns || 1;
    }
    const columns = Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)));
    return columns;
}

function computeTableRange(totalCount) {
    if (!mainWrap || totalCount === 0) {
        return {
            startIndex: 0,
            endIndex: 0,
            topSpacerHeight: 0,
            bottomSpacerHeight: 0,
            totalCount
        };
    }
    const rowHeight = tableRowHeight || TABLE_ROW_HEIGHT_ESTIMATE;
    const headerHeight = tableHeaderHeight || TABLE_HEADER_HEIGHT_ESTIMATE;
    const viewportHeight = Math.max(0, mainWrap.clientHeight - headerHeight);
    const scrollTop = Math.max(0, mainWrap.scrollTop - headerHeight);
    let startIndex = Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN;
    startIndex = Math.max(0, startIndex);
    let endIndex = Math.ceil((scrollTop + viewportHeight) / rowHeight) + VIRTUAL_OVERSCAN;
    endIndex = Math.min(totalCount, Math.max(endIndex, startIndex + 1));
    const topSpacerHeight = startIndex * rowHeight;
    const bottomSpacerHeight = Math.max(0, (totalCount - endIndex) * rowHeight);
    return {
        startIndex,
        endIndex,
        topSpacerHeight,
        bottomSpacerHeight,
        totalCount
    };
}

function computeCardRange(totalCount) {
    if (!mainWrap || totalCount === 0) {
        const columns = resolveCardColumns();
        return {
            startIndex: 0,
            endIndex: 0,
            topSpacerHeight: 0,
            bottomSpacerHeight: 0,
            totalCount,
            columns
        };
    }
    const columns = resolveCardColumns();
    const rowHeight = cardRowHeight || CARD_ROW_HEIGHT_ESTIMATE;
    const rowStride = rowHeight + CARD_GAP;
    const totalRows = Math.ceil(totalCount / columns);
    const viewportHeight = mainWrap.clientHeight;
    const scrollTop = mainWrap.scrollTop;
    let startRow = Math.floor(scrollTop / rowStride) - VIRTUAL_OVERSCAN;
    startRow = Math.max(0, startRow);
    let endRow = Math.ceil((scrollTop + viewportHeight) / rowStride) + VIRTUAL_OVERSCAN;
    endRow = Math.min(totalRows - 1, Math.max(endRow, startRow));
    const startIndex = startRow * columns;
    const endIndex = Math.min(totalCount, (endRow + 1) * columns);
    let topSpacerHeight = startRow * rowStride;
    const remainingRows = Math.max(0, totalRows - endRow - 1);
    let bottomSpacerHeight = remainingRows * rowStride;
    if (startRow > 0) {
        topSpacerHeight = Math.max(0, topSpacerHeight - CARD_GAP);
    }
    if (remainingRows > 0) {
        bottomSpacerHeight = Math.max(0, bottomSpacerHeight - CARD_GAP);
    }
    return {
        startIndex,
        endIndex,
        topSpacerHeight,
        bottomSpacerHeight,
        totalCount,
        columns
    };
}

function isSameRange(nextRange, prevRange) {
    if (!prevRange) {
        return false;
    }
    return nextRange.startIndex === prevRange.startIndex
        && nextRange.endIndex === prevRange.endIndex
        && nextRange.topSpacerHeight === prevRange.topSpacerHeight
        && nextRange.bottomSpacerHeight === prevRange.bottomSpacerHeight
        && nextRange.totalCount === prevRange.totalCount
        && (nextRange.columns || 0) === (prevRange.columns || 0);
}

function measureTableMetrics() {
    if (!tableWrap) {
        return false;
    }
    let changed = false;
    const header = tableWrap.querySelector('.yt-commander-sub-manager-row.header');
    if (header) {
        const height = Math.round(header.getBoundingClientRect().height);
        if (height > 0 && Math.abs(height - tableHeaderHeight) > 1) {
            tableHeaderHeight = height;
            changed = true;
        }
    }
    const row = tableWrap.querySelector('.yt-commander-sub-manager-row:not(.header)');
    if (row) {
        const height = Math.round(row.getBoundingClientRect().height);
        if (height > 0 && Math.abs(height - tableRowHeight) > 1) {
            tableRowHeight = height;
            changed = true;
        }
    }
    return changed;
}

function measureCardMetrics() {
    if (!cardsWrap) {
        return false;
    }
    let changed = false;
    const card = cardsWrap.querySelector('.yt-commander-sub-manager-card');
    if (card) {
        const height = Math.round(card.getBoundingClientRect().height);
        if (height > 0 && Math.abs(height - cardRowHeight) > 2) {
            cardRowHeight = height;
            changed = true;
        }
    }
    const nextColumns = resolveCardColumns();
    if (nextColumns !== cardColumns) {
        cardColumns = nextColumns;
        changed = true;
    }
    return changed;
}

function renderVirtualizedList(force = false) {
    if (!modal) {
        refreshQuickAddButtons();
        return;
    }
    if (force) {
        lastTableRange = null;
        lastCardRange = null;
    }
    const totalCount = filteredChannelsCache.length;
    if (viewMode === 'table') {
        const range = computeTableRange(totalCount);
        if (!force && isSameRange(range, lastTableRange)) {
            return;
        }
        lastTableRange = range;
        const pageItems = filteredChannelsCache.slice(range.startIndex, range.endIndex);
        currentPageIds = pageItems
            .map((channel) => channel?.channelId)
            .filter((id) => typeof id === 'string' && id);
        renderTable(pageItems, {
            totalCount,
            startIndex: range.startIndex,
            topSpacerHeight: range.topSpacerHeight,
            bottomSpacerHeight: range.bottomSpacerHeight
        });
        if (measureTableMetrics()) {
            queueVirtualRender(true);
        }
    } else {
        const range = computeCardRange(totalCount);
        if (!force && isSameRange(range, lastCardRange)) {
            return;
        }
        cardColumns = range.columns || cardColumns;
        lastCardRange = range;
        const pageItems = filteredChannelsCache.slice(range.startIndex, range.endIndex);
        currentPageIds = pageItems
            .map((channel) => channel?.channelId)
            .filter((id) => typeof id === 'string' && id);
        renderCards(pageItems, {
            totalCount,
            topSpacerHeight: range.topSpacerHeight,
            bottomSpacerHeight: range.bottomSpacerHeight
        });
        if (measureCardMetrics()) {
            queueVirtualRender(true);
        }
    }
}

function queueVirtualRender(force = false) {
    if (force) {
        pendingVirtualForce = true;
    }
    if (virtualScrollRaf) {
        return;
    }
    virtualScrollRaf = window.requestAnimationFrame(() => {
        virtualScrollRaf = 0;
        const shouldForce = pendingVirtualForce;
        pendingVirtualForce = false;
        renderVirtualizedList(shouldForce);
    });
}

function handleMainScroll() {
    queueVirtualRender(false);
}

function handleVirtualResize() {
    queueVirtualRender(true);
}

/**
 * Render list based on view mode.
 */
function renderList() {
    if (!modal) {
        refreshQuickAddButtons();
        return;
    }

    captureSidebarDraftState();
    renderSidebarCategories();

    filteredChannelsCache = filterChannels();

    tableWrap.style.display = viewMode === 'table' ? 'block' : 'none';
    cardsWrap.style.display = viewMode === 'card' ? 'grid' : 'none';
    viewTableButton.classList.toggle('active', viewMode === 'table');
    viewCardButton.classList.toggle('active', viewMode === 'card');
    updateSortButton();

    if (resetScrollPending && mainWrap) {
        mainWrap.scrollTop = 0;
        resetScrollPending = false;
    }

    renderVirtualizedList(true);

    updateSelectionSummary();

    refreshQuickAddButtons();
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
    closeConfirmDialog(false);
    hideTooltipPortal();
    resetSidebarDraftState();
}

/**
 * Open modal and load data.
 */
async function openModal() {
    ensureModal();
    await loadLocalState();
    applySidebarState();
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

    const confirmed = await showConfirmDialog({
        title: 'Unsubscribe selected channels?',
        message: `Unsubscribe from ${ids.length} channel(s)? This action cannot be undone.`,
        confirmLabel: 'Unsubscribe',
        cancelLabel: 'Cancel'
    });
    if (!confirmed) {
        return;
    }

    setStatus('Unsubscribing...', 'info');
    const result = await bridgeClient.sendRequest(ACTIONS.UNSUBSCRIBE_CHANNELS, { channelIds: ids });
    const removed = Number(result?.unsubscribedCount) || 0;

    channels = channels.filter((item) => !selectedChannelIds.has(item.channelId));
    selectedChannelIds = new Set();
    selectionAnchorId = '';

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
    if (confirmBackdrop?.classList.contains('is-visible')) {
        closeConfirmDialog(false);
        return;
    }
    if (picker && picker.style.display === 'block') {
        closePicker();
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
    await hydrateSnapshotFromStorage();
    ensureMastheadButton();
    startQuickAddObserver();

    window.addEventListener('yt-navigate-finish', () => {
        ensureMastheadButton();
    });

    window.addEventListener('resize', () => {
        positionPicker();
        positionFilterMenu();
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






