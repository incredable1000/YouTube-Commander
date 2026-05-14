import { normalizeShortcutKey } from '../shared/shortcutKey.js';
import { normalizeQualityId } from '../shared/quality.js';

// Modern YouTube Commander Popup Script
const defaultSettings = {
    // Popup-managed settings
    deleteVideosEnabled: false,
    hideSubscribedVideosEnabled: false,
    autoSwitchToOriginal: true,
    rotationShortcut: 'r',
    windowedFullscreenShortcut: 'Enter',
    windowedFullscreenAuto: false,
    openVideoNewTabShortcut: { ctrl: true, shift: false, alt: false, key: 'Enter' },
    openChannelNewTabShortcut: { ctrl: false, shift: true, alt: false, key: 'Enter' },
    
    // Seek settings
    shortSeek: 3,
    mediumSeek: 10,
    longSeek: 30,
    shortSeekKey: { ctrl: false, shift: false, key: 'ArrowRight' },
    mediumSeekKey: { ctrl: false, shift: true, key: 'ArrowRight' },
    longSeekKey: { ctrl: true, shift: true, key: 'ArrowRight' },
    
    // Quality settings
    maxQuality: 'hd1080',
    
    // Legacy settings
    fullWindowShortcut: 'f'
};

const LEGACY_FEATURE_KEYS = [
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

// Current settings
let currentSettings = {};
let cloudflareLastSyncAt = 0;
let cloudflareAutoEnabled = true;
let cloudflareSyncIntervalMinutes = 30;
let cloudflareSyncTriggered = false;
let subscriptionLastSyncAt = 0;
let subscriptionAutoEnabled = true;
let subscriptionSyncIntervalMinutes = 30;
let subscriptionSyncTriggered = false;
const CLOUDFLARE_STORAGE_KEYS = {
    ENDPOINT: 'cloudflareSyncEndpoint',
    API_TOKEN: 'cloudflareSyncApiToken',
    AUTO_ENABLED: 'cloudflareSyncAutoEnabled',
    INTERVAL_MINUTES: 'cloudflareSyncIntervalMinutes'
};
const SUBSCRIPTION_STORAGE_KEYS = {
    ENDPOINT: 'subscriptionSyncEndpoint',
    API_TOKEN: 'subscriptionSyncApiToken',
    AUTO_ENABLED: 'subscriptionSyncAutoEnabled',
    INTERVAL_MINUTES: 'subscriptionSyncIntervalMinutes'
};
const SUBSCRIPTION_MANAGER_STORAGE_KEYS = {
    CATEGORIES: 'subscriptionManagerCategories',
    ASSIGNMENTS: 'subscriptionManagerAssignments',
    SNAPSHOT: 'subscriptionManagerSnapshot',
    PENDING_KEYS: 'subscriptionSyncPendingKeys',
    PENDING_COUNT: 'subscriptionSyncPendingCount'
};

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
const SYNC_INTERVAL_OPTIONS = [15, 30, 60, 180, 720, 1440];
const SQL_EXPORT_TABLE_NAME = 'watched_videos';
const SQL_EXPORT_IDS_PER_FILE = 200000;
const SQL_EXPORT_VALUES_PER_STATEMENT = 300;
const SQL_EXPORT_DOWNLOAD_DELAY_MS = 250;
const HISTORY_IMPORT_BATCH_SIZE = 5000;
const HISTORY_SEED_SYNC_TIMEOUT_MS = 10 * 60 * 1000;
const POPUP_UI_V2_CLASS = 'yt-commander-popup-v2';
const POPUP_UI_V2_DEFAULT_FEATURE = 'history';
const POPUP_UI_V2_TONES = ['red', 'cyan', 'green', 'amber'];
const POPUP_UI_V2_NAV_ITEMS = [];

// Setup delete videos toggle
function setupDeleteVideosToggle() {
    const deleteVideosToggle = document.getElementById('deleteVideosToggle');
    if (deleteVideosToggle) {
        deleteVideosToggle.addEventListener('click', (e) => {
            e.stopPropagation();

            const enabled = !deleteVideosToggle.classList.contains('active');
            setToggleState(deleteVideosToggle, enabled);
            currentSettings.deleteVideosEnabled = enabled;
            showStatus(
                enabled ? 'Delete videos enabled - removing watched cards' : 'Delete videos disabled - showing markers',
                'success'
            );
            saveSyncSettings();
        });
    }
}

// Setup hide subscribed videos toggle
function setupHideSubscribedToggle() {
    const hideSubscribedToggle = document.getElementById('hideSubscribedToggle');
    if (!hideSubscribedToggle) {
        return;
    }

    hideSubscribedToggle.addEventListener('click', (event) => {
        event.stopPropagation();

        const enabled = !hideSubscribedToggle.classList.contains('active');
        setToggleState(hideSubscribedToggle, enabled);
        currentSettings.hideSubscribedVideosEnabled = enabled;
        saveSyncSettings();
    });
}

/**
 * Setup show/hide toggle for sensitive token inputs.
 * @param {string} inputId
 * @param {string} buttonId
 */
function setupTokenVisibilityToggle(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) {
        return;
    }

    const updateState = () => {
        const isVisible = input.type === 'text';
        button.classList.toggle('active', isVisible);
        button.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
        const label = isVisible ? 'Hide token' : 'Show token';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
    };

    button.addEventListener('click', (event) => {
        event.preventDefault();
        input.type = input.type === 'password' ? 'text' : 'password';
        updateState();
    });

    updateState();
}

/**
 * Toggle feature card expanded state.
 * @param {Element|null} card
 * @param {boolean} expanded
 */
function setFeatureCardExpanded(card, expanded) {
    const header = card?.querySelector('.feature-header');
    const content = card?.querySelector('.feature-content');
    header?.classList.toggle('expanded', expanded === true);
    content?.classList.toggle('expanded', expanded === true);
}

/**
 * Get feature card by internal name.
 * @param {string} featureName
 * @returns {Element|null}
 */
function findFeatureCard(featureName) {
    return document.querySelector(`.feature-header[data-feature='${featureName}']`)?.closest('.feature-card') || null;
}

/**
 * Activate one feature card in popup v2 and hide the rest.
 * @param {string} featureName
 */
function setPopupUiV2ActiveFeature(featureName) {
    const scope = document.querySelector('.ytc-v2-content') || document.querySelector('.container');
    const cards = Array.from(scope?.querySelectorAll('.feature-card') || []);
    if (!cards.length) {
        return;
    }

    let resolvedFeature = featureName;
    if (!findFeatureCard(featureName)) {
        resolvedFeature = POPUP_UI_V2_DEFAULT_FEATURE;
    }
    if (!findFeatureCard(resolvedFeature)) {
        const firstFeature = cards[0].querySelector('.feature-header')?.dataset?.feature || '';
        resolvedFeature = firstFeature;
    }

    cards.forEach((card) => {
        const header = card.querySelector('.feature-header');
        const featureName = header?.dataset?.feature || '';
        const isActive = featureName === resolvedFeature;
        card.classList.toggle('ytc-v2-feature-active', isActive);
        setFeatureCardExpanded(card, isActive);
    });

    document.querySelectorAll('.ytc-v2-nav-button').forEach((button) => {
        const isActive = button.getAttribute('data-feature') === resolvedFeature;
        button.classList.toggle('active', isActive);
    });
}

/**
 * Build top feature switcher for popup v2.
 */
function initializePopupUiV2Navigator() {
    if (!POPUP_UI_V2_NAV_ITEMS.length) {
        return;
    }

    const container = document.querySelector('.container');
    const firstCard = container?.querySelector('.feature-card');
    if (!container || !firstCard || document.querySelector('.ytc-v2-nav')) {
        return;
    }

    const navWrap = document.createElement('div');
    navWrap.className = 'ytc-v2-nav-wrap';

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'ytc-v2-nav-arrow';
    prevButton.setAttribute('data-direction', 'prev');
    prevButton.setAttribute('aria-label', 'Scroll left');
    prevButton.innerHTML = '<span class="ytc-v2-nav-arrow-icon" aria-hidden="true">◀</span>';

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'ytc-v2-nav-arrow';
    nextButton.setAttribute('data-direction', 'next');
    nextButton.setAttribute('aria-label', 'Scroll right');
    nextButton.innerHTML = '<span class="ytc-v2-nav-arrow-icon" aria-hidden="true">▶</span>';

    const scrollArea = document.createElement('div');
    scrollArea.className = 'ytc-v2-nav-scroll';

    const nav = document.createElement('div');
    nav.className = 'ytc-v2-nav';

    POPUP_UI_V2_NAV_ITEMS.forEach((item) => {
        if (!findFeatureCard(item.feature)) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ytc-v2-nav-button';
        button.setAttribute('data-feature', item.feature);
        button.setAttribute('data-label', item.label);
        button.setAttribute('aria-label', item.label);
        button.innerHTML = buildV2NavIcon(item.feature);
        const label = document.createElement('span');
        label.className = 'ytc-v2-nav-label';
        label.textContent = item.label;
        button.appendChild(label);
        button.addEventListener('click', () => {
            setPopupUiV2ActiveFeature(item.feature);
        });
        nav.appendChild(button);
    });

    scrollArea.appendChild(nav);
    navWrap.appendChild(prevButton);
    navWrap.appendChild(scrollArea);
    navWrap.appendChild(nextButton);
    document.body.insertBefore(navWrap, container);

    const tooltip = ensurePopupUiV2Tooltip();

    const showTooltip = (button) => {
        if (!tooltip || !button) {
            return;
        }
        const label = button.getAttribute('data-label') || '';
        if (!label) {
            return;
        }
        tooltip.textContent = label;
        tooltip.classList.add('visible');
        const rect = button.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        const top = rect.top - tooltipRect.height - 8;
        tooltip.style.left = `${Math.max(8, left)}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
    };

    const hideTooltip = () => {
        if (!tooltip) {
            return;
        }
        tooltip.classList.remove('visible');
    };

    nav.querySelectorAll('.ytc-v2-nav-button').forEach((button) => {
        button.addEventListener('mouseenter', () => showTooltip(button));
        button.addEventListener('focus', () => showTooltip(button));
        button.addEventListener('mouseleave', hideTooltip);
        button.addEventListener('blur', hideTooltip);
    });

    scrollArea.addEventListener('scroll', hideTooltip);

    const scrollByAmount = (direction) => {
        const delta = direction === 'prev' ? -120 : 120;
        scrollArea.scrollBy({ left: delta, behavior: 'smooth' });
    };

    prevButton.addEventListener('click', () => scrollByAmount('prev'));
    nextButton.addEventListener('click', () => scrollByAmount('next'));

    const updateArrows = () => {
        const maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
        prevButton.disabled = scrollArea.scrollLeft <= 2;
        nextButton.disabled = scrollArea.scrollLeft >= maxScroll - 2;
    };

    scrollArea.addEventListener('scroll', updateArrows);
    window.requestAnimationFrame(updateArrows);
    setPopupUiV2ActiveFeature(POPUP_UI_V2_DEFAULT_FEATURE);
}

/**
 * Build icon SVG for popup v2 navigator.
 * @param {string} feature
 * @returns {string}
 */
function buildV2NavIcon(feature) {
    const icons = {
        seek: 'M5 6v12l8-6zM15 6v12l8-6z',
        quality: 'M4 7h16v2H4V7zm0 8h16v2H4v-2zM7 4h10v2H7V4zm0 14h10v2H7v-2z',
        audio: 'M5 9v6h4l5 4V5l-5 4H5zm12 0a4 4 0 010 6',
        history: 'M12 4a8 8 0 108 8h-2a6 6 0 11-6-6V4zm-1 4h2v5l4 2-1 1.7-5-2.7V8z',
        subscriptionManager: 'M4 5h11v2H4V5zm0 4h11v2H4V9zm0 4h11v2H4v-2zm13-7h3v9h-3V6zm-1 10H4v2h12v-2z',
        playlist: 'M4 6h10v2H4V6zm0 5h10v2H4v-2zm0 5h6v2H4v-2zm13-8h3v3h-3v-3zm0 5h3v3h-3v-3z',
        windowedFullscreen: 'M5 6h14v12H5V6zm2 2v8h10V8H7z',
        shortcuts: 'M4 7h10v2H4V7zm0 4h16v2H4v-2zm0 4h10v2H4v-2zm14-8h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z',
        settings: 'M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.65l-1.92-3.32a.5.5 0 00-.61-.22l-2.39.96a7.07 7.07 0 00-1.63-.94l-.36-2.54A.5.5 0 0014.39 2h-3.78a.5.5 0 00-.5.43l-.36 2.54c-.58.22-1.12.52-1.63.94l-2.39-.96a.5.5 0 00-.61.22L2.2 8.49a.5.5 0 00.12.65l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.32 14.18a.5.5 0 00-.12.65l1.92 3.32c.13.23.4.32.61.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.04.24.25.43.5.43h3.78c.25 0 .46-.19.5-.43l.36-2.54c.58-.22 1.12-.52 1.63-.94l2.39.96c.23.1.48.01.61-.22l1.92-3.32a.5.5 0 00-.12-.65l-2.03-1.58zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z',
        rotation: 'M12 6V3l4 4-4 4V8a4 4 0 104 4h2a6 6 0 11-6-6z',
        shorts: 'M8 4h8v16H8V4zm2 3l5 2.5L10 12V7z',
        shortsUploadAge: 'M6 4h12v3H6V4zm0 5h12v9H6V9zm3 2h2v2H9v-2zm4 0h2v2h-2v-2z',
        subscriptions: 'M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3zm0 2c-2.7 0-8 1.3-8 4v2h10v-2c0-1.1.4-2.1 1.1-2.9C10.3 13.6 9 13 8 13zm8 0c-1.1 0-2.4.3-3.5 1 1 .9 1.5 2 1.5 3v2h10v-2c0-2.7-5.3-4-8-4z',
        scroll: 'M12 5l-6 6h4v8h4v-8h4l-6-6z'
    };
    const path = icons[feature] || icons.seek;
    return `
        <span class="ytc-v2-nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true">
                <path d="${path}"></path>
            </svg>
        </span>
    `;
}

/**
 * Ensure popup v2 tooltip element exists.
 * @returns {HTMLElement|null}
 */
function ensurePopupUiV2Tooltip() {
    if (!document.body.classList.contains(POPUP_UI_V2_CLASS)) {
        return null;
    }

    let tooltip = document.querySelector('.ytc-v2-tooltip');
    if (tooltip) {
        return tooltip;
    }

    tooltip = document.createElement('div');
    tooltip.className = 'ytc-v2-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
    return tooltip;
}

/**
 * Prepare compact no-scroll layout for popup v2.
 * @param {boolean} enabled
 */
function initializePopupUiV2Layout() {
    const cards = document.querySelectorAll('.feature-card');
    cards.forEach((card, index) => {
        card.dataset.tone = POPUP_UI_V2_TONES[index % POPUP_UI_V2_TONES.length];
    });

    initializePopupUiV2Navigator();
    ensurePopupUiV2ContentWrapper();
}

/**
 * Wrap feature cards in a scrollable container for popup v2.
 */
function ensurePopupUiV2ContentWrapper() {
    const container = document.querySelector('.container');
    if (!container || container.querySelector('.ytc-v2-content')) {
        return;
    }

    const content = document.createElement('div');
    content.className = 'ytc-v2-content';

    const cards = Array.from(container.querySelectorAll('.feature-card'));
    cards.forEach((card) => content.appendChild(card));

    const status = container.querySelector('#status');
    if (status) {
        container.insertBefore(content, status);
    } else {
        container.appendChild(content);
    }
}

/**
 * Setup audio behavior toggle.
 */
function setupAudioSettingToggle() {
    const toggle = document.getElementById('autoSwitchToOriginalToggle');
    if (!toggle) {
        return;
    }

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();

        const enabled = !toggle.classList.contains('active');
        setToggleState(toggle, enabled);
        currentSettings.autoSwitchToOriginal = enabled;
        saveSyncSettings();
        showStatus(
            enabled ? 'Auto switch to original audio enabled' : 'Auto switch to original audio disabled',
            'success'
        );
    });
}

/**
 * Setup windowed fullscreen auto-mode toggle.
 */
function setupWindowedAutoToggle() {
    const toggle = document.getElementById('windowedFullscreenAutoToggle');
    if (!toggle) {
        return;
    }

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();

        const enabled = !toggle.classList.contains('active');
        setToggleState(toggle, enabled);
        currentSettings.windowedFullscreenAuto = enabled;
        saveSyncSettings();
        showStatus(
            enabled ? 'Auto windowed mode enabled' : 'Auto windowed mode disabled',
            'success'
        );
    });
}

/**
 * Update toggle visual state.
 * @param {HTMLElement|null} toggle
 * @param {boolean} enabled
 */
function setToggleState(toggle, enabled) {
    if (!toggle) {
        return;
    }
    toggle.classList.toggle('active', Boolean(enabled));
}

/**
 * Parse a numeric input safely.
 * @param {string} id
 * @param {number} fallback
 * @returns {number}
 */
function parseNumberInput(id, fallback) {
    const input = document.getElementById(id);
    const parsed = Number.parseInt(input?.value || '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parse shortcut input from popup text field.
 * @param {string} id
 * @param {string} fallback
 * @returns {string}
 */
function parseShortcutInput(id, fallback) {
    const input = document.getElementById(id);
    const rawValue = typeof input?.value === 'string' ? input.value.trim() : '';
    return normalizeShortcutKey(rawValue, fallback);
}

/**
 * Parse shortcut combo input from popup text field.
 * @param {string} id
 * @param {{ctrl:boolean,shift:boolean,alt:boolean,key:string}} fallback
 * @returns {{ctrl:boolean,shift:boolean,alt:boolean,key:string}}
 */
function parseShortcutComboInput(id, fallback) {
    const input = document.getElementById(id);
    const rawValue = typeof input?.value === 'string' ? input.value.trim() : '';
    return parseShortcutCombo(rawValue, fallback);
}

function parseSeekShortcutComboInput(id, fallback) {
    const parsed = parseShortcutComboInput(id, fallback);
    return { ...parsed, key: fallback.key };
}

function parseShortcutCombo(rawValue, fallback) {
    if (!rawValue) {
        return { ...fallback };
    }

    const parts = rawValue.split('+').map((part) => part.trim()).filter(Boolean);
    let ctrl = false;
    let shift = false;
    let alt = false;
    let key = '';

    parts.forEach((part) => {
        const normalized = part.toLowerCase();
        if (normalized === 'ctrl' || normalized === 'control') {
            ctrl = true;
            return;
        }
        if (normalized === 'shift') {
            shift = true;
            return;
        }
        if (normalized === 'alt' || normalized === 'option') {
            alt = true;
            return;
        }
        if (normalized === 'cmd' || normalized === 'meta') {
            ctrl = true;
            return;
        }
        key = part;
    });

    const normalizedKey = normalizeShortcutKey(key || fallback.key, fallback.key);
    if (!ctrl && !shift && !alt && normalizedKey === 'Enter') {
        return { ...fallback };
    }
    return { ctrl, shift, alt, key: normalizedKey };
}

function formatShortcutCombo(value, fallback) {
    const config = (!value || typeof value !== 'object')
        ? { ...fallback }
        : parseShortcutCombo(
            `${value.ctrl ? 'Ctrl+' : ''}${value.shift ? 'Shift+' : ''}${value.alt ? 'Alt+' : ''}${value.key || ''}`,
            fallback
        );
    const parts = [];
    if (config.ctrl) parts.push('Ctrl');
    if (config.shift) parts.push('Shift');
    if (config.alt) parts.push('Alt');
    const keyLabel = config.key.length === 1 ? config.key.toUpperCase() : config.key;
    parts.push(keyLabel);
    return parts.join('+');
}

function formatSeekShortcutCombo(value, fallback) {
    const normalized = (!value || typeof value !== 'object') ? { ...fallback } : value;
    return formatShortcutCombo({ ...normalized, key: fallback.key }, fallback);
}

// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (settings) => {
        currentSettings = sanitizeSettings(settings);

        document.getElementById('shortSeek').value = currentSettings.shortSeek;
        document.getElementById('mediumSeek').value = currentSettings.mediumSeek;
        document.getElementById('longSeek').value = currentSettings.longSeek;
        document.getElementById('shortSeekKey').value = formatSeekShortcutCombo(
            currentSettings.shortSeekKey,
            defaultSettings.shortSeekKey
        );
        document.getElementById('mediumSeekKey').value = formatSeekShortcutCombo(
            currentSettings.mediumSeekKey,
            defaultSettings.mediumSeekKey
        );
        document.getElementById('longSeekKey').value = formatSeekShortcutCombo(
            currentSettings.longSeekKey,
            defaultSettings.longSeekKey
        );
        document.getElementById('maxQuality').value = normalizeQualityId(
            currentSettings.maxQuality,
            defaultSettings.maxQuality
        );
        updateDropdownSelection('maxQualityDropdown', document.getElementById('maxQuality').value);
        document.getElementById('rotationShortcut').value = currentSettings.rotationShortcut || defaultSettings.rotationShortcut;
        document.getElementById('windowedFullscreenShortcut').value = currentSettings.windowedFullscreenShortcut || defaultSettings.windowedFullscreenShortcut;
        document.getElementById('openVideoNewTabShortcut').value = formatShortcutCombo(
            currentSettings.openVideoNewTabShortcut,
            defaultSettings.openVideoNewTabShortcut
        );
        document.getElementById('openChannelNewTabShortcut').value = formatShortcutCombo(
            currentSettings.openChannelNewTabShortcut,
            defaultSettings.openChannelNewTabShortcut
        );

        setToggleState(document.getElementById('deleteVideosToggle'), currentSettings.deleteVideosEnabled === true);
        setToggleState(
            document.getElementById('hideSubscribedToggle'),
            currentSettings.hideSubscribedVideosEnabled === true
        );
        setToggleState(
            document.getElementById('autoSwitchToOriginalToggle'),
            currentSettings.autoSwitchToOriginal !== false
        );
        setToggleState(
            document.getElementById('windowedFullscreenAutoToggle'),
            currentSettings.windowedFullscreenAuto === true
        );

        loadWatchedHistoryStats();
        loadCloudflareSyncSettings().catch((error) => {
            showStatus(error?.message || 'Failed to load Cloudflare sync settings', 'error');
        });
        loadSubscriptionSyncSettings().catch((error) => {
            showStatus(error?.message || 'Failed to load subscription sync settings', 'error');
        });
        cleanupLegacyFeatureFlags();
    });
}

/**
 * Remove deprecated feature-flag settings from storage.
 */
function cleanupLegacyFeatureFlags() {
    chrome.storage.sync.remove(LEGACY_FEATURE_KEYS, () => {
        if (chrome.runtime.lastError) {
            console.warn('Failed to cleanup legacy feature keys:', chrome.runtime.lastError.message);
        }
    });
}

/**
 * Drop legacy keys from settings object.
 * @param {object} settings
 * @returns {object}
 */
function sanitizeSettings(settings) {
    const sanitized = { ...settings };
    LEGACY_FEATURE_KEYS.forEach((key) => {
        delete sanitized[key];
    });
    sanitized.maxQuality = normalizeQualityId(
        sanitized.maxQuality,
        defaultSettings.maxQuality
    );
    return sanitized;
}

// Load watched history statistics (using content script approach)
async function loadWatchedHistoryStats() {
    try {
        // Get the active tab specifically
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.url.includes('youtube.com')) {
            // Try to find any YouTube tab as fallback
            const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
            if (tabs.length === 0) {
                document.getElementById('watchedCount').textContent = '0';
                document.getElementById('todayCount').textContent = '0';
                return;
            }
            // Use first YouTube tab found
            const targetTab = tabs[0];
            
            try {
                // Try content script message first
                const response = await chrome.tabs.sendMessage(targetTab.id, {
                    type: 'GET_WATCHED_STATS'
                });
                
                if (response && response.success) {
                    document.getElementById('watchedCount').textContent = response.total || 0;
                    document.getElementById('todayCount').textContent = response.today || 0;
                    return;
                }
            } catch (messageError) {
                console.warn('Stats via content script failed:', messageError);
            }
            
            // Fallback to background script
            try {
                const bgResponse = await chrome.runtime.sendMessage({
                    type: 'GET_WATCHED_STATS',
                    tabId: targetTab.id
                });
                
                if (bgResponse && bgResponse.success) {
                    document.getElementById('watchedCount').textContent = bgResponse.total || 0;
                    document.getElementById('todayCount').textContent = bgResponse.today || 0;
                    return;
                }
            } catch (bgError) {
                console.warn('Stats via background script failed:', bgError);
            }
        } else {
            // We're on a YouTube tab, try content script directly
            try {
                const response = await chrome.tabs.sendMessage(activeTab.id, {
                    type: 'GET_WATCHED_STATS'
                });
                
                if (response && response.success) {
                    document.getElementById('watchedCount').textContent = response.total || 0;
                    document.getElementById('todayCount').textContent = response.today || 0;
                    return;
                }
            } catch (messageError) {
                console.warn('Stats via content script failed:', messageError);
                
                // Fallback to background script
                try {
                    const bgResponse = await chrome.runtime.sendMessage({
                        type: 'GET_WATCHED_STATS',
                        tabId: activeTab.id
                    });
                    
                    if (bgResponse && bgResponse.success) {
                        document.getElementById('watchedCount').textContent = bgResponse.total || 0;
                        document.getElementById('todayCount').textContent = bgResponse.today || 0;
                        return;
                    }
                } catch (bgError) {
                    console.warn('Stats via background script failed:', bgError);
                }
            }
        }
        
        // If all methods fail, show 0
        document.getElementById('watchedCount').textContent = '0';
        document.getElementById('todayCount').textContent = '0';
        
    } catch (error) {
        console.error('Stats loading error:', error);
        document.getElementById('watchedCount').textContent = '0';
        document.getElementById('todayCount').textContent = '0';
    }
}

// Save sync settings and notify all YouTube tabs.
function saveSyncSettings(showMessage = false) {
    const settings = sanitizeSettings({
        ...currentSettings,
        shortSeek: parseNumberInput('shortSeek', defaultSettings.shortSeek),
        mediumSeek: parseNumberInput('mediumSeek', defaultSettings.mediumSeek),
        longSeek: parseNumberInput('longSeek', defaultSettings.longSeek),
        maxQuality: document.getElementById('maxQuality')?.value || defaultSettings.maxQuality,
        rotationShortcut: parseShortcutInput('rotationShortcut', defaultSettings.rotationShortcut),
        windowedFullscreenShortcut: parseShortcutInput('windowedFullscreenShortcut', defaultSettings.windowedFullscreenShortcut),
        windowedFullscreenAuto: currentSettings.windowedFullscreenAuto === true,
        openVideoNewTabShortcut: parseShortcutComboInput(
            'openVideoNewTabShortcut',
            defaultSettings.openVideoNewTabShortcut
        ),
        openChannelNewTabShortcut: parseShortcutComboInput(
            'openChannelNewTabShortcut',
            defaultSettings.openChannelNewTabShortcut
        ),
        shortSeekKey: parseSeekShortcutComboInput('shortSeekKey', defaultSettings.shortSeekKey),
        mediumSeekKey: parseSeekShortcutComboInput('mediumSeekKey', defaultSettings.mediumSeekKey),
        longSeekKey: parseSeekShortcutComboInput('longSeekKey', defaultSettings.longSeekKey)
    });

    currentSettings = settings;
    broadcastSettings(settings);

    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            showStatus('Failed to save settings', 'error');
            return;
        }
        if (showMessage) {
            showStatus('Settings saved', 'success');
        }
    });
}

/**
 * Broadcast fresh settings to all YouTube tabs.
 * @param {object} settings
 */
function broadcastSettings(settings) {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings
            }, () => {
                // Ignore tabs without active content scripts.
                if (chrome.runtime.lastError) {
                    return;
                }
            });
        });
    });
}

// Auto-save when input values change
function setupAutoSave() {
    // Auto-save for number inputs
    [
        'shortSeek',
        'mediumSeek',
        'longSeek',
        'shortSeekKey',
        'mediumSeekKey',
        'longSeekKey',
        'rotationShortcut',
        'windowedFullscreenShortcut',
        'openVideoNewTabShortcut',
        'openChannelNewTabShortcut'
    ].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                saveSyncSettings();
            });
            input.addEventListener('change', () => {
                saveSyncSettings();
            });
        }
    });
    
    // Auto-save for quality select
    const qualitySelect = document.getElementById('maxQuality');
    if (qualitySelect) {
        qualitySelect.addEventListener('change', () => {
            saveSyncSettings();
        });
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    setTimeout(() => {
        status.className = 'status';
    }, 3000);
}

/**
 * Format account key for compact popup display.
 * @param {string} accountKey
 * @returns {string}
 */
function formatAccountKey(accountKey) {
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

/**
 * Format remaining milliseconds to mm:ss.
 * @param {number} remainingMs
 * @returns {string}
 */
function formatRemainingMinSec(remainingMs) {
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

/**
 * Render countdown to next cloudflare sync.
 */
function renderCloudflareNextSyncCountdown() {
    const nextSyncEl = document.getElementById('cloudflareNextSyncIn');
    if (!nextSyncEl) {
        return;
    }

    if (!cloudflareAutoEnabled) {
        nextSyncEl.textContent = 'Off';
        cloudflareSyncTriggered = false;
        return;
    }

    if (!Number.isFinite(cloudflareLastSyncAt) || cloudflareLastSyncAt <= 0) {
        nextSyncEl.textContent = '--:--:--';
        cloudflareSyncTriggered = false;
        return;
    }

    const intervalMs = cloudflareSyncIntervalMinutes * 60 * 1000;
    const nextSyncAt = cloudflareLastSyncAt + intervalMs;
    const remainingMs = nextSyncAt - Date.now();
    
    nextSyncEl.textContent = formatRemainingMinSec(remainingMs);
    
    if (remainingMs <= 0 && cloudflareAutoEnabled && !cloudflareSyncTriggered) {
        cloudflareSyncTriggered = true;
        syncToCloudflare().catch(() => {
            cloudflareSyncTriggered = false;
        });
    }
    
    if (remainingMs > 0) {
        cloudflareSyncTriggered = false;
    }
}

/**
 * Render countdown to next subscription sync.
 */
function renderSubscriptionNextSyncCountdown() {
    const nextSyncEl = document.getElementById('subscriptionNextSyncIn');
    if (!nextSyncEl) {
        return;
    }

    if (!subscriptionAutoEnabled) {
        nextSyncEl.textContent = 'Off';
        subscriptionSyncTriggered = false;
        return;
    }

    if (!Number.isFinite(subscriptionLastSyncAt) || subscriptionLastSyncAt <= 0) {
        nextSyncEl.textContent = '--:--:--';
        subscriptionSyncTriggered = false;
        return;
    }

    const intervalMs = subscriptionSyncIntervalMinutes * 60 * 1000;
    const nextSyncAt = subscriptionLastSyncAt + intervalMs;
    const remainingMs = nextSyncAt - Date.now();
    
    nextSyncEl.textContent = formatRemainingMinSec(remainingMs);
    
    if (remainingMs <= 0 && subscriptionAutoEnabled && !subscriptionSyncTriggered) {
        subscriptionSyncTriggered = true;
        syncSubscriptionsNow().catch(() => {
            subscriptionSyncTriggered = false;
        });
    }
    
    if (remainingMs > 0) {
        subscriptionSyncTriggered = false;
    }
}

/**
 * Send runtime message with timeout and callback error handling.
 * @param {object} message
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function sendRuntimeMessage(message, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            reject(new Error('Background did not respond in time'));
        }, timeoutMs);

        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (settled) {
                    return;
                }

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

/**
 * Read shared Cloudflare API token from unified input.
 * @returns {string}
 */
function getUnifiedApiToken() {
    const tokenInput = document.getElementById('cloudflareSyncToken') || document.getElementById('subscriptionSyncToken');
    return typeof tokenInput?.value === 'string' ? tokenInput.value.trim() : '';
}

/**
 * Normalize worker base URL (strip /sync or /subscriptions).
 * @param {string} raw
 * @returns {string}
 */
function normalizeWorkerBaseUrl(raw) {
    if (typeof raw !== 'string') {
        return '';
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return '';
    }
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
        return trimmed
            .replace(/\/(sync|subscriptions)\/?$/i, '')
            .replace(/\/+$/, '');
    }
}

/**
 * Build a worker endpoint from base URL + route.
 * @param {string} baseUrl
 * @param {string} route
 * @returns {string}
 */
function buildWorkerEndpoint(baseUrl, route) {
    if (!baseUrl) {
        return '';
    }
    const normalized = baseUrl.replace(/\/+$/, '');
    return `${normalized}/${route.replace(/^\/+/, '')}`;
}

/**
 * Read unified auto sync settings (shared across history + subscriptions).
 * @returns {{ autoEnabled: boolean, intervalMinutes: number }}
 */
function getUnifiedAutoSyncSettings() {
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle') || document.getElementById('subscriptionAutoSyncToggle');
    const intervalSelect = document.getElementById('cloudflareSyncInterval') || document.getElementById('subscriptionSyncInterval');
    const autoEnabled = !autoToggle || autoToggle.classList.contains('active');
    const fallback = intervalSelect?.id === 'subscriptionSyncInterval' ? 60 : 30;
    const intervalMinutes = normalizeSyncIntervalMinutes(intervalSelect?.value || String(fallback), fallback);
    return { autoEnabled, intervalMinutes };
}

/**
 * Load Cloudflare sync settings from local storage.
 */
async function loadCloudflareSyncSettings() {
    const result = await chrome.storage.local.get([
        CLOUDFLARE_STORAGE_KEYS.ENDPOINT,
        CLOUDFLARE_STORAGE_KEYS.API_TOKEN,
        CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED,
        CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES,
        SUBSCRIPTION_STORAGE_KEYS.API_TOKEN,
        SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED,
        SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES
    ]);

    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');

    if (endpointInput) {
        const cloudEndpoint = typeof result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT]
            : '';
        const subscriptionEndpoint = typeof result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT]
            : '';
        const baseUrl = normalizeWorkerBaseUrl(cloudEndpoint || subscriptionEndpoint);
        endpointInput.value = baseUrl;
    }

    if (tokenInput) {
        const cloudToken = typeof result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN] === 'string'
            ? result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN]
            : '';
        const subscriptionToken = typeof result[SUBSCRIPTION_STORAGE_KEYS.API_TOKEN] === 'string'
            ? result[SUBSCRIPTION_STORAGE_KEYS.API_TOKEN]
            : '';
        tokenInput.value = cloudToken || subscriptionToken || '';
    }

    if (intervalSelect) {
        const cloudInterval = normalizeSyncIntervalMinutes(result[CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES], Number.NaN);
        const subscriptionInterval = normalizeSyncIntervalMinutes(result[SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES], Number.NaN);
        const interval = Number.isFinite(cloudInterval)
            ? cloudInterval
            : (Number.isFinite(subscriptionInterval) ? subscriptionInterval : 30);
        intervalSelect.value = String(interval);
        cloudflareSyncIntervalMinutes = interval;
        subscriptionSyncIntervalMinutes = interval;
        updateDropdownSelection('cloudflareSyncIntervalDropdown', intervalSelect.value);
    }

    const cloudAutoEnabled = result[CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED];
    const subscriptionAutoEnabled = result[SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED];
    const resolvedAutoEnabled = cloudAutoEnabled === undefined
        ? subscriptionAutoEnabled !== false
        : cloudAutoEnabled !== false;
    setToggleState(autoToggle, resolvedAutoEnabled);

    await refreshCloudflareSyncStatus();
}
/**
 * Load subscription sync settings from local storage.
 */
async function loadSubscriptionSyncSettings() {
    const result = await chrome.storage.local.get([
        SUBSCRIPTION_STORAGE_KEYS.ENDPOINT,
        SUBSCRIPTION_STORAGE_KEYS.API_TOKEN,
        SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED,
        SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES
    ]);

    const endpointInput = document.getElementById('subscriptionSyncEndpoint');
    const intervalSelect = document.getElementById('subscriptionSyncInterval');
    const autoToggle = document.getElementById('subscriptionAutoSyncToggle');

    if (endpointInput) {
        endpointInput.value = typeof result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT]
            : '';
    }

    if (intervalSelect) {
        const interval = normalizeSyncIntervalMinutes(result[SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES], 60);
        intervalSelect.value = String(interval);
        subscriptionSyncIntervalMinutes = interval;
    }

    setToggleState(autoToggle, result[SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED] !== false);

    await refreshSubscriptionSyncStatus();
}

/**
 * Persist Cloudflare sync settings from inputs.
 * @returns {Promise<{ endpointUrl: string, apiToken: string, autoEnabled: boolean, intervalMinutes: number }>}
 */
async function saveCloudflareSyncSettings() {
    const endpointInput = document.getElementById('cloudflareSyncEndpoint');

    let baseUrl = normalizeWorkerBaseUrl(typeof endpointInput?.value === 'string' ? endpointInput.value : '');
    if (!baseUrl && !endpointInput) {
        const stored = await chrome.storage.local.get([
            CLOUDFLARE_STORAGE_KEYS.ENDPOINT,
            SUBSCRIPTION_STORAGE_KEYS.ENDPOINT
        ]);
        baseUrl = normalizeWorkerBaseUrl(
            stored[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] || stored[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] || ''
        );
    }
    const endpointUrl = buildWorkerEndpoint(baseUrl, 'sync');
    const subscriptionEndpoint = buildWorkerEndpoint(baseUrl, 'subscriptions');
    const apiToken = getUnifiedApiToken();
    const { autoEnabled, intervalMinutes } = getUnifiedAutoSyncSettings();

    await chrome.storage.local.set({
        [CLOUDFLARE_STORAGE_KEYS.ENDPOINT]: endpointUrl,
        [CLOUDFLARE_STORAGE_KEYS.API_TOKEN]: apiToken,
        [SUBSCRIPTION_STORAGE_KEYS.API_TOKEN]: apiToken,
        [CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED]: autoEnabled,
        [CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES]: intervalMinutes,
        [SUBSCRIPTION_STORAGE_KEYS.ENDPOINT]: subscriptionEndpoint,
        [SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED]: autoEnabled,
        [SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES]: intervalMinutes
    });

    const updateResponse = await sendRuntimeMessage({
        type: 'UPDATE_CLOUDFLARE_SYNC_CONFIG',
        endpointUrl,
        apiToken,
        autoEnabled,
        intervalMinutes
    }, 20000);

    if (!updateResponse?.success) {
        throw new Error(updateResponse?.error || 'Failed to update Cloudflare sync config');
    }

    return { endpointUrl, apiToken, autoEnabled, intervalMinutes };
}
/**
 * Persist subscription sync settings from inputs.
 * @returns {Promise<{ endpointUrl: string, apiToken: string, autoEnabled: boolean, intervalMinutes: number }>}
 */
async function saveSubscriptionSyncSettings() {
    const endpointInput = document.getElementById('subscriptionSyncEndpoint');

    let baseUrl = normalizeWorkerBaseUrl(typeof endpointInput?.value === 'string' ? endpointInput.value : '');
    if (!baseUrl) {
        const stored = await chrome.storage.local.get([
            CLOUDFLARE_STORAGE_KEYS.ENDPOINT,
            SUBSCRIPTION_STORAGE_KEYS.ENDPOINT
        ]);
        baseUrl = normalizeWorkerBaseUrl(
            stored[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] || stored[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] || ''
        );
    }
    const endpointUrl = buildWorkerEndpoint(baseUrl, 'subscriptions');
    const cloudEndpoint = buildWorkerEndpoint(baseUrl, 'sync');
    const apiToken = getUnifiedApiToken();
    const { autoEnabled, intervalMinutes } = getUnifiedAutoSyncSettings();

    await chrome.storage.local.set({
        [SUBSCRIPTION_STORAGE_KEYS.ENDPOINT]: endpointUrl,
        [SUBSCRIPTION_STORAGE_KEYS.API_TOKEN]: apiToken,
        [CLOUDFLARE_STORAGE_KEYS.API_TOKEN]: apiToken,
        [CLOUDFLARE_STORAGE_KEYS.ENDPOINT]: cloudEndpoint,
        [SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED]: autoEnabled,
        [SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES]: intervalMinutes
    });

    const updateResponse = await sendRuntimeMessage({
        type: 'UPDATE_SUBSCRIPTION_SYNC_CONFIG',
        endpointUrl,
        apiToken,
        autoEnabled,
        intervalMinutes
    }, 20000);

    if (!updateResponse?.success) {
        throw new Error(updateResponse?.error || 'Failed to update subscription sync config');
    }

    return { endpointUrl, apiToken, autoEnabled, intervalMinutes };
}

/**
 * Normalize sync interval minutes to allowed options.
 * @param {number|string} raw
 * @param {number} fallback
 * @returns {number}
 */
function normalizeSyncIntervalMinutes(raw, fallback) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    if (SYNC_INTERVAL_OPTIONS.includes(parsed)) {
        return parsed;
    }
    return parsed;
}

/**
 * Render cloud sync status in popup.
 * @param {object} status
 */
function renderCloudflareSyncStatus(status = {}) {
    const pendingEl = document.getElementById('cloudflarePendingCount');
    const lastSyncEl = document.getElementById('cloudflareLastSyncAt');
    const infoEl = document.getElementById('cloudflareLastSyncInfo');
    const primaryAccountEl = document.getElementById('cloudflarePrimaryAccount');
    cloudflareAutoEnabled = status.autoEnabled !== false;
    cloudflareLastSyncAt = Number(status.lastAt) || 0;

    if (pendingEl) {
        pendingEl.textContent = String(Number(status.pendingCount) || 0);
    }

    if (primaryAccountEl) {
        primaryAccountEl.textContent = formatAccountKey(status.primaryAccountKey);
    }

    if (lastSyncEl) {
        const timestamp = cloudflareLastSyncAt;
        lastSyncEl.textContent = timestamp > 0
            ? new Date(timestamp).toLocaleString()
            : 'Never';
    }

    if (infoEl) {
        if (status.status === 'error') {
            infoEl.textContent = status.error || 'Error';
            return;
        }

        if (status.status === 'success') {
            infoEl.textContent = `Success (${Number(status.syncedCount) || 0} ids)`;
            return;
        }

        infoEl.textContent = status.status || 'Idle';
    }

    renderCloudflareNextSyncCountdown();
}
/**
 * Render subscription sync status in popup.
 * @param {object} status
 */
function renderSubscriptionSyncStatus(status = {}) {
    const pendingEl = document.getElementById('subscriptionPendingCount');
    const lastSyncEl = document.getElementById('subscriptionLastSyncAt');
    const infoEl = document.getElementById('subscriptionLastSyncInfo');
    const primaryAccountEl = document.getElementById('subscriptionPrimaryAccount');
    subscriptionAutoEnabled = status.autoEnabled !== false;
    subscriptionLastSyncAt = Number(status.lastAt) || 0;

    if (pendingEl) {
        pendingEl.textContent = String(Number(status.pendingCount) || 0);
    }

    if (primaryAccountEl) {
        primaryAccountEl.textContent = formatAccountKey(status.primaryAccountKey);
    }

    if (lastSyncEl) {
        const timestamp = subscriptionLastSyncAt;
        lastSyncEl.textContent = timestamp > 0
            ? new Date(timestamp).toLocaleString()
            : 'Never';
    }

    if (infoEl) {
        if (status.status === 'error') {
            infoEl.textContent = status.error || 'Error';
            return;
        }

        if (status.status === 'success') {
            infoEl.textContent = `Success (${Number(status.syncedCount) || 0} channels)`;
            return;
        }

        infoEl.textContent = status.status || 'Idle';
    }

    renderSubscriptionNextSyncCountdown();
}

/**
 * Refresh cloud sync status from background.
 */
async function refreshCloudflareSyncStatus() {
    try {
        const status = await sendRuntimeMessage({
            type: 'GET_CLOUDFLARE_SYNC_STATUS'
        }, 30000);

        if (status?.success) {
            renderCloudflareSyncStatus(status);
        }
    } catch (_error) {
        // Keep existing UI values when background status is unavailable.
    }
}
/**
 * Refresh subscription sync status from background.
 */
async function refreshSubscriptionSyncStatus() {
    try {
        const status = await sendRuntimeMessage({
            type: 'GET_SUBSCRIPTION_SYNC_STATUS'
        }, 30000);

        if (status?.success) {
            renderSubscriptionSyncStatus(status);
        }
    } catch (_error) {
        // Keep existing UI values when background status is unavailable.
    }
}

/**
 * Setup Cloudflare auto-sync controls.
 */
function setupCloudflareSyncControls() {
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');
    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');

    if (autoToggle) {
        autoToggle.addEventListener('click', async (event) => {
            event.stopPropagation();
            setToggleState(autoToggle, !autoToggle.classList.contains('active'));
            try {
                await saveCloudflareSyncSettings();
                await saveSubscriptionSyncSettings();
                await refreshCloudflareSyncStatus();
                await refreshSubscriptionSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to save Cloudflare settings', 'error');
            }
        });
    }

    if (intervalSelect) {
        intervalSelect.addEventListener('change', async () => {
            try {
                await saveCloudflareSyncSettings();
                await saveSubscriptionSyncSettings();
                await refreshCloudflareSyncStatus();
                await refreshSubscriptionSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to update sync interval', 'error');
            }
        });
    }

    const saveOnBlur = async () => {
        try {
            await saveCloudflareSyncSettings();
            await saveSubscriptionSyncSettings();
            await refreshCloudflareSyncStatus();
            await refreshSubscriptionSyncStatus();
        } catch (error) {
            showStatus(error?.message || 'Failed to update Cloudflare settings', 'error');
        }
    };

    const saveTokenOnBlur = async () => {
        try {
            await saveCloudflareSyncSettings();
            await saveSubscriptionSyncSettings();
            await refreshCloudflareSyncStatus();
            await refreshSubscriptionSyncStatus();
        } catch (error) {
            showStatus(error?.message || 'Failed to update Cloudflare settings', 'error');
        }
    };

    endpointInput?.addEventListener('blur', saveOnBlur);
    tokenInput?.addEventListener('blur', saveTokenOnBlur);
}
/**
 * Setup subscription auto-sync controls.
 */
function setupSubscriptionSyncControls() {
    const autoToggle = document.getElementById('subscriptionAutoSyncToggle');
    const intervalSelect = document.getElementById('subscriptionSyncInterval');
    const endpointInput = document.getElementById('subscriptionSyncEndpoint');

    if (autoToggle) {
        autoToggle.addEventListener('click', async (event) => {
            event.stopPropagation();
            setToggleState(autoToggle, !autoToggle.classList.contains('active'));
            try {
                await saveSubscriptionSyncSettings();
                await refreshSubscriptionSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to save subscription settings', 'error');
            }
        });
    }

    if (intervalSelect) {
        intervalSelect.addEventListener('change', async () => {
            try {
                await saveSubscriptionSyncSettings();
                await refreshSubscriptionSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to update subscription sync interval', 'error');
            }
        });
    }

    const saveOnBlur = async () => {
        try {
            await saveSubscriptionSyncSettings();
            await refreshSubscriptionSyncStatus();
        } catch (error) {
            showStatus(error?.message || 'Failed to update subscription settings', 'error');
        }
    };

    endpointInput?.addEventListener('blur', saveOnBlur);
}

/**
 * Setup subscription automation controls.
 */
function setupSubscriptionAutomationControls() {
    const toggle = document.getElementById('subscriptionAutomationToggle');
    const timeInput = document.getElementById('subscriptionAutomationTime');
    const lookbackDropdown = document.getElementById('automationLookbackDropdown');
    const shortsPlaylistDropdown = document.getElementById('automationShortsPlaylistDropdown');
    const videosModeDropdown = document.getElementById('automationVideosModeDropdown');
    const videosPlaylistRow = document.getElementById('automationVideosPlaylistRow');
    const videosPlaylistDropdown = document.getElementById('automationVideosPlaylistDropdown');
    const splitCountRow = document.getElementById('automationSplitCountRow');
    const splitCountInput = document.getElementById('automationSplitCount');
    const runNowBtn = document.getElementById('runAutomationNow');

    if (toggle) {
        toggle.addEventListener('click', async (e) => {
            e.stopPropagation();
            setToggleState(toggle, !toggle.classList.contains('active'));
            await saveAutomationSettings();
            showStatus(toggle.classList.contains('active') ? 'Automation enabled' : 'Automation disabled', 'success');
        });
    }

    if (timeInput) {
        timeInput.addEventListener('change', async () => {
            await saveAutomationSettings();
        });
    }

    if (lookbackDropdown) {
        lookbackDropdown.querySelectorAll('.ytc-dropdown-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                lookbackDropdown.querySelectorAll('.ytc-dropdown-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                lookbackDropdown.querySelector('.ytc-dropdown-label').textContent = opt.textContent;
                lookbackDropdown.dataset.value = opt.dataset.value;
                await saveAutomationSettings();
            });
        });
    }

    if (videosModeDropdown) {
        videosModeDropdown.querySelectorAll('.ytc-dropdown-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                videosModeDropdown.querySelectorAll('.ytc-dropdown-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                videosModeDropdown.querySelector('.ytc-dropdown-label').textContent = opt.textContent;
                videosModeDropdown.dataset.value = opt.dataset.value;
                
                const isSplit = opt.dataset.value === 'split';
                if (videosPlaylistRow) videosPlaylistRow.style.display = isSplit ? 'none' : 'flex';
                if (splitCountRow) splitCountRow.style.display = isSplit ? 'flex' : 'none';
                
                await saveAutomationSettings();
            });
        });
    }

    if (splitCountInput) {
        splitCountInput.addEventListener('change', async () => {
            await saveAutomationSettings();
        });
    }

    if (runNowBtn) {
        runNowBtn.addEventListener('click', async () => {
            runNowBtn.disabled = true;
            runNowBtn.textContent = 'Running...';
            showStatus('Running automation...', 'info');
            
            try {
                const response = await chrome.runtime.sendMessage({ type: 'RUN_SUBSCRIPTION_AUTOMATION' });
                if (response?.success) {
                    showStatus(`Added ${response.videosCount || 0} videos, ${response.shortsCount || 0} shorts`, 'success');
                } else {
                    showStatus(response?.error || 'Automation failed', 'error');
                }
            } catch (error) {
                showStatus('Failed to run automation', 'error');
            } finally {
                runNowBtn.disabled = false;
                runNowBtn.textContent = 'Run Now (Debug)';
                await loadAutomationStats();
            }
        });
    }
}

async function saveAutomationSettings() {
    const toggle = document.getElementById('subscriptionAutomationToggle');
    const timeInput = document.getElementById('subscriptionAutomationTime');
    const lookbackDropdown = document.getElementById('automationLookbackDropdown');
    const shortsPlaylistDropdown = document.getElementById('automationShortsPlaylistDropdown');
    const videosModeDropdown = document.getElementById('automationVideosModeDropdown');
    const videosPlaylistDropdown = document.getElementById('automationVideosPlaylistDropdown');
    const splitCountInput = document.getElementById('automationSplitCount');
    
    const settings = {
        [AUTOMATION_STORAGE_KEYS.ENABLED]: toggle?.classList.contains('active') || false,
        [AUTOMATION_STORAGE_KEYS.TIME]: timeInput?.value || '19:30',
        [AUTOMATION_STORAGE_KEYS.LOOKBACK]: lookbackDropdown?.dataset.value || 'yesterday',
        [AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST]: shortsPlaylistDropdown?.dataset.value || 'WL',
        [AUTOMATION_STORAGE_KEYS.VIDEOS_MODE]: videosModeDropdown?.dataset.value || 'single',
        [AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST]: videosPlaylistDropdown?.dataset.value || 'WL',
        [AUTOMATION_STORAGE_KEYS.SPLIT_COUNT]: parseInt(splitCountInput?.value) || 20
    };
    
    await chrome.storage.local.set(settings);
    
    chrome.runtime.sendMessage({ type: 'SCHEDULE_AUTOMATION' }).catch(() => {});
}

async function loadAutomationSettings() {
    const result = await chrome.storage.local.get([
        AUTOMATION_STORAGE_KEYS.ENABLED,
        AUTOMATION_STORAGE_KEYS.TIME,
        AUTOMATION_STORAGE_KEYS.LOOKBACK,
        AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST,
        AUTOMATION_STORAGE_KEYS.VIDEOS_MODE,
        AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST,
        AUTOMATION_STORAGE_KEYS.SPLIT_COUNT
    ]);
    
    const toggle = document.getElementById('subscriptionAutomationToggle');
    const timeInput = document.getElementById('subscriptionAutomationTime');
    const lookbackDropdown = document.getElementById('automationLookbackDropdown');
    const shortsPlaylistDropdown = document.getElementById('automationShortsPlaylistDropdown');
    const videosModeDropdown = document.getElementById('automationVideosModeDropdown');
    const videosPlaylistRow = document.getElementById('automationVideosPlaylistRow');
    const videosPlaylistDropdown = document.getElementById('automationVideosPlaylistDropdown');
    const splitCountRow = document.getElementById('automationSplitCountRow');
    const splitCountInput = document.getElementById('automationSplitCount');
    
    if (toggle) {
        setToggleState(toggle, result[AUTOMATION_STORAGE_KEYS.ENABLED] === true);
    }
    
    if (timeInput) {
        timeInput.value = result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30';
    }
    
    if (lookbackDropdown) {
        const lookbackValue = result[AUTOMATION_STORAGE_KEYS.LOOKBACK] || 'yesterday';
        lookbackDropdown.dataset.value = lookbackValue;
        const option = lookbackDropdown.querySelector(`[data-value="${lookbackValue}"]`);
        lookbackDropdown.querySelectorAll('.ytc-dropdown-option').forEach(o => o.classList.remove('selected'));
        if (option) {
            option.classList.add('selected');
            lookbackDropdown.querySelector('.ytc-dropdown-label').textContent = option.textContent;
        }
    }
    
    if (shortsPlaylistDropdown) {
        shortsPlaylistDropdown.dataset.value = result[AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST] || 'WL';
    }
    
    if (videosModeDropdown) {
        const modeValue = result[AUTOMATION_STORAGE_KEYS.VIDEOS_MODE] || 'single';
        videosModeDropdown.dataset.value = modeValue;
        const option = videosModeDropdown.querySelector(`[data-value="${modeValue}"]`);
        videosModeDropdown.querySelectorAll('.ytc-dropdown-option').forEach(o => o.classList.remove('selected'));
        if (option) {
            option.classList.add('selected');
            videosModeDropdown.querySelector('.ytc-dropdown-label').textContent = option.textContent;
        }
        
        if (videosPlaylistRow) videosModeDropdown.style.display = modeValue === 'split' ? 'none' : 'flex';
        if (splitCountRow) splitCountRow.style.display = modeValue === 'split' ? 'flex' : 'none';
    }
    
    if (videosPlaylistDropdown) {
        videosPlaylistDropdown.dataset.value = result[AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST] || 'WL';
    }
    
    if (splitCountInput) {
        splitCountInput.value = result[AUTOMATION_STORAGE_KEYS.SPLIT_COUNT] || 20;
    }
}

async function loadAutomationStats() {
    const result = await chrome.storage.local.get([
        AUTOMATION_STORAGE_KEYS.LAST_RUN,
        AUTOMATION_STORAGE_KEYS.LAST_VIDEOS_COUNT,
        AUTOMATION_STORAGE_KEYS.LAST_SHORTS_COUNT,
        AUTOMATION_STORAGE_KEYS.LAST_STATUS,
        AUTOMATION_STORAGE_KEYS.TIME
    ]);
    
    const lastRunEl = document.getElementById('automationLastRun');
    const statusEl = document.getElementById('automationStatus');
    const videosEl = document.getElementById('automationVideosAdded');
    const shortsEl = document.getElementById('automationShortsAdded');
    const nextRunEl = document.getElementById('automationNextRun');
    
    if (lastRunEl) {
        const lastRun = result[AUTOMATION_STORAGE_KEYS.LAST_RUN];
        if (lastRun) {
            const date = new Date(lastRun);
            const formatted = date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            lastRunEl.textContent = formatted;
        } else {
            lastRunEl.textContent = 'Never';
        }
    }
    
    if (statusEl) {
        const status = result[AUTOMATION_STORAGE_KEYS.LAST_STATUS];
        if (status === 'success') {
            statusEl.textContent = 'Success';
            statusEl.style.color = 'var(--ytc-v2-green)';
        } else if (status === 'partial') {
            statusEl.textContent = 'Partial';
            statusEl.style.color = 'var(--ytc-v2-amber)';
        } else if (status === 'failed') {
            statusEl.textContent = 'Failed';
            statusEl.style.color = 'var(--ytc-v2-red)';
        } else {
            statusEl.textContent = '-';
            statusEl.style.color = 'var(--ytc-v2-text)';
        }
    }
    
    if (videosEl) {
        videosEl.textContent = result[AUTOMATION_STORAGE_KEYS.LAST_VIDEOS_COUNT] || 0;
    }
    
    if (shortsEl) {
        shortsEl.textContent = result[AUTOMATION_STORAGE_KEYS.LAST_SHORTS_COUNT] || 0;
    }
    
    if (nextRunEl) {
        const now = new Date();
        const timeStr = result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30';
        const [hours, minutes] = timeStr.split(':').map(Number);
        
        let nextRun = new Date(now);
        nextRun.setHours(hours, minutes, 0, 0);
        
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
            nextRunEl.textContent = `Tomorrow ${timeStr}`;
        } else {
            const todayOrTomorrow = nextRun.toDateString() === now.toDateString() ? 'Today' : 'Tomorrow';
            nextRunEl.textContent = `${todayOrTomorrow} ${timeStr}`;
        }
    }
}

function renderAutomationNextRunCountdown() {
    const nextRunEl = document.getElementById('automationNextRun');
    if (!nextRunEl) return;
    
    chrome.storage.local.get([AUTOMATION_STORAGE_KEYS.TIME, AUTOMATION_STORAGE_KEYS.ENABLED], (result) => {
        if (!result[AUTOMATION_STORAGE_KEYS.ENABLED]) {
            nextRunEl.textContent = 'Disabled';
            nextRunEl.style.color = 'var(--ytc-v2-muted)';
            return;
        }
        
        const now = new Date();
        const timeStr = result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30';
        const [hours, minutes] = timeStr.split(':').map(Number);
        
        let nextRun = new Date(now);
        nextRun.setHours(hours, minutes, 0, 0);
        
        if (nextRun <= now) {
            nextRun.setDate(nextRun.getDate() + 1);
        }
        
        const diff = nextRun - now;
        const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
        const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        nextRunEl.textContent = `in ${hoursLeft}h ${minutesLeft}m`;
        nextRunEl.style.color = 'var(--ytc-v2-amber)';
    });
}

/**
 * Initialize tab switching for Settings modal.
 */
function initializeSettingsModalTabs() {
    const modal = document.getElementById('popupSettingsModal');
    if (!modal || modal.dataset.tabsInitialized === 'true') {
        return;
    }
    modal.dataset.tabsInitialized = 'true';

    modal.addEventListener('click', (event) => {
        const tab = event.target.closest('.ytc-v2-settings-tab');
        if (!tab) {
            return;
        }

        const paneName = tab.getAttribute('data-pane');
        modal.querySelectorAll('.ytc-v2-settings-tab').forEach((item) => {
            item.classList.toggle('active', item === tab);
        });
        modal.querySelectorAll('.ytc-v2-settings-pane').forEach((pane) => {
            pane.classList.toggle('active', pane.getAttribute('data-pane') === paneName);
        });
    });
}

/**
 * Setup popup settings modal toggles.
 */
function setupPopupSettingsModal() {
    const modal = document.getElementById('popupSettingsModal');
    const openButton = document.getElementById('popupSettingsButton');
    if (!modal || !openButton) {
        return;
    }

    const openModal = () => {
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
    };

    openButton.addEventListener('click', () => {
        openModal();
    });

    modal.addEventListener('click', (event) => {
        const action = event.target?.closest('[data-action="close-settings"]');
        if (action) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
            closeModal();
        }
    });
}

/**
 * Setup popup about modal toggles.
 */
function setupPopupAboutModal() {
    const modal = document.getElementById('popupAboutModal');
    const openButton = document.getElementById('popupAboutButton');
    if (!modal || !openButton) {
        return;
    }

    const openModal = () => {
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
    };

    openButton.addEventListener('click', () => {
        openModal();
    });

    modal.addEventListener('click', (event) => {
        const action = event.target?.closest('[data-action="close-about"]');
        if (action) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
            closeModal();
        }
    });
}


// Export history functionality (using legacy direct approach)
async function exportHistory() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url.includes('youtube.com')) {
            showStatus('Please open YouTube to export history', 'error');
            return;
        }

        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                return new Promise((resolve, reject) => {
                    const request = indexedDB.open('YouTubeCommanderDB');
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        const db = request.result;
                        const transaction = db.transaction(['watchedVideos'], 'readonly');
                        const store = transaction.objectStore('watchedVideos');
                        const getAll = store.getAll();
                        getAll.onsuccess = () => {
                            const videos = getAll.result;
                            // Create simple TXT content with just video IDs (legacy format)
                            const content = videos.map(v => v.videoId).join('\n');
                            
                            const blob = new Blob([content], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `youtube-watched-history.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                            resolve(videos.length);
                        };
                        getAll.onerror = () => reject(getAll.error);
                    };
                });
            }
        });
        
        showStatus(`Exported ${result[0].result} videos`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showStatus('Error exporting history', 'error');
    }
}

/**
 * Keep valid unique video IDs only.
 * @param {string[]} videoIds
 * @returns {string[]}
 */
function normalizeVideoIdList(videoIds) {
    const unique = [];
    const seen = new Set();

    for (const rawId of videoIds || []) {
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
        const parsed = new URL(trimmed, 'https://www.youtube.com');
        return parsed.pathname.replace(/\/+$/, '').toLowerCase();
    } catch (_error) {
        return trimmed.toLowerCase();
    }
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
 * Extract channel ID from a YouTube URL.
 * @param {string} url
 * @returns {string}
 */
function extractChannelIdFromUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }
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
        const parsed = new URL(url, 'https://www.youtube.com');
        if (parsed.pathname.startsWith('/@')) {
            return parsed.pathname.split('/')[1] || '';
        }
    } catch (_error) {
        return '';
    }
    return '';
}

/**
 * Resolve channel URL for export.
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
            return new URL(rawUrl, 'https://www.youtube.com').toString();
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
 * Build channel lookup indexes from snapshot.
 * @param {Array<object>} list
 * @returns {{byId: Map<string, object>, byHandle: Map<string, string>, byUrl: Map<string, string>}}
 */
function buildChannelIndexes(list) {
    const byId = new Map();
    const byHandle = new Map();
    const byUrl = new Map();

    (list || []).forEach((channel) => {
        const channelId = typeof channel?.channelId === 'string' ? channel.channelId : '';
        const handle = typeof channel?.handle === 'string' ? channel.handle : '';
        const url = typeof channel?.url === 'string' ? channel.url : '';
        if (channelId) {
            byId.set(channelId, channel);
        }
        const normalizedHandle = normalizeHandle(handle);
        if (normalizedHandle) {
            byHandle.set(normalizedHandle, channelId || byHandle.get(normalizedHandle) || '');
            byHandle.set(normalizedHandle.replace(/^@/, ''), channelId || byHandle.get(normalizedHandle.replace(/^@/, '')) || '');
        }
        const normalizedUrl = normalizeChannelUrl(url);
        if (normalizedUrl) {
            byUrl.set(normalizedUrl, channelId || byUrl.get(normalizedUrl) || '');
        }
    });

    return { byId, byHandle, byUrl };
}

/**
 * Resolve channel ID from identity and indexes.
 * @param {{channelId: string, handle: string, url: string}} identity
 * @param {{byId: Map<string, object>, byHandle: Map<string, string>, byUrl: Map<string, string>}} indexes
 * @returns {string}
 */
function resolveChannelIdFromIdentity(identity, indexes) {
    if (identity.channelId && indexes.byId.has(identity.channelId)) {
        return identity.channelId;
    }
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
                color: color || `hsl(${Math.floor(Math.random() * 360)} 65% 45%)`
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
 * Create a category object.
 * @param {string} name
 * @param {string} color
 * @returns {{id: string, name: string, color: string}}
 */
function createCategory(name, color) {
    const trimmed = name.trim();
    const id = `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return {
        id,
        name: trimmed,
        color
    };
}

/**
 * Generate random category color avoiding existing values.
 * @param {string[]} existingColors
 * @returns {string}
 */
function generateRandomCategoryColor(existingColors = []) {
    const existing = new Set(existingColors.map((color) => String(color).toLowerCase().trim()));
    for (let i = 0; i < 12; i += 1) {
        const hue = Math.floor(Math.random() * 360);
        const color = `hsl(${hue} 65% 45%)`;
        if (!existing.has(color.toLowerCase())) {
            return color;
        }
    }
    return `hsl(${Math.floor(Math.random() * 360)} 65% 45%)`;
}

/**
 * Trigger download for text content.
 * @param {string} content
 * @param {string} filename
 * @param {string} [mimeType]
 */
function downloadTextFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Escape CSV cell value.
 * @param {string} value
 * @returns {string}
 */
function escapeCsvValue(value) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

/**
 * Parse a CSV line into fields (simple CSV with quotes).
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
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

/**
 * Parse subscription CSV file content.
 * @param {string} text
 * @returns {{rows: Array<{url: string, category: string}>, skipped: number}}
 */
function parseSubscriptionCsv(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        return { rows: [], skipped: 0 };
    }
    const header = lines[0].toLowerCase();
    if (header.includes('channel') && header.includes('category')) {
        lines.shift();
    }
    const rows = [];
    let skipped = 0;
    lines.forEach((line) => {
        const parts = parseCsvLine(line);
        const url = (parts[0] || '').trim();
        const category = (parts.slice(1).join(',') || '').trim();
        if (!url) {
            skipped += 1;
            return;
        }
        rows.push({ url, category });
    });
    return { rows, skipped };
}

/**
 * Read file as text.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

/**
 * Mark pending subscription sync keys.
 * @param {string[]} keys
 */
async function markSubscriptionPending(keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
        return;
    }
    const result = await chrome.storage.local.get([SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS]);
    const existing = Array.isArray(result[SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS])
        ? result[SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS]
        : [];
    const set = new Set(existing);
    keys.forEach((key) => {
        if (typeof key === 'string' && key) {
            set.add(key);
        }
    });
    const next = Array.from(set);
    await chrome.storage.local.set({
        [SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_KEYS]: next,
        [SUBSCRIPTION_MANAGER_STORAGE_KEYS.PENDING_COUNT]: next.length
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
 * Resolve a usable YouTube tab for watched-history operations.
 * @returns {Promise<chrome.tabs.Tab>}
 */
async function resolveYouTubeTabForHistory() {
    const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        url: '*://*.youtube.com/*'
    });

    if (activeTab?.id) {
        return activeTab;
    }

    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    if (!tabs.length || !tabs[0]?.id) {
        throw new Error('Open a YouTube tab first');
    }

    return tabs[0];
}

/**
 * Read all watched video IDs from content script cache.
 * @returns {Promise<string[]>}
 */
async function getAllWatchedVideoIdsForSqlExport() {
    const targetTab = await resolveYouTubeTabForHistory();

    try {
        const response = await chrome.tabs.sendMessage(targetTab.id, {
            type: 'GET_ALL_WATCHED_VIDEO_IDS'
        });
        if (response?.success && Array.isArray(response.videoIds)) {
            return normalizeVideoIdList(response.videoIds);
        }
    } catch (_error) {
        // Fallback to legacy shape below.
    }

    const legacy = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'GET_ALL_WATCHED_VIDEOS'
    });
    if (!legacy?.success || !Array.isArray(legacy.videos)) {
        throw new Error(legacy?.error || 'Failed to read watched history from YouTube tab');
    }

    return normalizeVideoIdList(legacy.videos.map((entry) => entry?.videoId));
}

/**
 * Build SQL insert statements for a list of video IDs.
 * @param {string[]} videoIds
 * @returns {string}
 */
function buildSqlInsertStatements(videoIds) {
    const statements = [];
    for (let index = 0; index < videoIds.length; index += SQL_EXPORT_VALUES_PER_STATEMENT) {
        const chunk = videoIds.slice(index, index + SQL_EXPORT_VALUES_PER_STATEMENT);
        if (!chunk.length) {
            continue;
        }

        const values = chunk
            .map((videoId) => `    ('${videoId}')`)
            .join(',\n');

        statements.push(
            `INSERT OR IGNORE INTO ${SQL_EXPORT_TABLE_NAME} (video_id)\nVALUES\n${values};`
        );
    }

    return statements.join('\n\n');
}

/**
 * Build one SQL migration file for a chunk of IDs.
 * @param {string[]} videoIds
 * @param {number} partIndex
 * @param {number} totalParts
 * @returns {string}
 */
function buildSqlMigrationFile(videoIds, partIndex, totalParts) {
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

/**
 * Export watched IDs as chunked SQL migration files for Cloudflare D1.
 */
async function exportSqlMigration() {
    const button = document.getElementById('exportSqlMigration');
    if (!button) {
        return;
    }

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Generating...';

    try {
        showStatus('Reading watched IDs from local history...', 'info');
        const allVideoIds = await getAllWatchedVideoIdsForSqlExport();

        if (allVideoIds.length === 0) {
            showStatus('No watched IDs found for SQL export', 'error');
            return;
        }

        const totalParts = Math.max(1, Math.ceil(allVideoIds.length / SQL_EXPORT_IDS_PER_FILE));
        let exportedIds = 0;

        for (let part = 0; part < totalParts; part += 1) {
            const start = part * SQL_EXPORT_IDS_PER_FILE;
            const idsChunk = allVideoIds.slice(start, start + SQL_EXPORT_IDS_PER_FILE);
            if (!idsChunk.length) {
                continue;
            }

            const partIndex = part + 1;
            const sqlContent = buildSqlMigrationFile(idsChunk, partIndex, totalParts);
            const filename = totalParts === 1
                ? 'youtube-watched-history-d1.sql'
                : `youtube-watched-history-d1-part-${String(partIndex).padStart(3, '0')}-of-${String(totalParts).padStart(3, '0')}.sql`;

            downloadTextFile(sqlContent, filename, 'application/sql;charset=utf-8');
            exportedIds += idsChunk.length;

            if (partIndex < totalParts) {
                await new Promise((resolve) => setTimeout(resolve, SQL_EXPORT_DOWNLOAD_DELAY_MS));
            }
        }

        showStatus(`Exported ${exportedIds} IDs as ${totalParts} SQL file(s)`, 'success');
        
        const defaultCmd = document.getElementById('sqlDefaultCmd');
        const multiFileCmd = document.getElementById('sqlMultiFileCmd');
        if (totalParts === 1) {
            if (defaultCmd) defaultCmd.textContent = 'npx wrangler d1 execute YOUR_DB --file=youtube-watched-history-d1.sql';
            if (multiFileCmd) multiFileCmd.parentElement.style.display = 'none';
        } else {
            const loopCmd = `for f in youtube-watched-history-d1-part-*.sql; do npx wrangler d1 execute YOUR_DB --file="$f"; done`;
            if (defaultCmd) defaultCmd.textContent = loopCmd;
            if (multiFileCmd) multiFileCmd.textContent = loopCmd;
        }
    } catch (error) {
        showStatus(error?.message || 'Failed to export SQL migration', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

/**
 * Show SQL commands section after export.
 * @param {number} totalParts
 */
function showSqlCommands(totalParts) {
    const section = document.getElementById('sqlCommandsSection');
    const code = document.getElementById('sqlCommandsCode');
    if (!section || !code) {
        return;
    }

    let commands = '# Run these commands in your wrangler project folder:\n';
    commands += '# Replace YOUR_DB with your D1 database name\n\n';

    if (totalParts === 1) {
        commands += `npx wrangler d1 execute YOUR_DB --file=youtube-watched-history-d1.sql\n`;
    } else {
        commands += '# For loop to run all part files:\n';
        commands += `for f in youtube-watched-history-d1-part-*.sql; do npx wrangler d1 execute YOUR_DB --file="$f"; done\n`;
        commands += '\n# Or run them individually:\n';
        for (let i = 1; i <= totalParts; i++) {
            const padded = String(i).padStart(3, '0');
            commands += `# npx wrangler d1 execute YOUR_DB --file=youtube-watched-history-d1-part-${padded}-of-${String(totalParts).padStart(3, '0')}.sql\n`;
        }
    }

    code.textContent = commands;
    section.style.display = 'block';
}

/**
 * Copy text to clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
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

/**
 * Setup SQL export copy button.
 */
function setupSqlCopyButton() {
    const button = document.getElementById('copySqlDefaultCmd');
    if (!button) {
        return;
    }

    button.addEventListener('click', async () => {
        const code = document.getElementById('sqlDefaultCmd');
        if (!code) {
            return;
        }

        const copied = await copyToClipboard(code.textContent);
        if (copied) {
            button.classList.add('copied');
            button.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied!
            `;
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                    </svg>
                    Copy
                `;
            }, 2000);
        }
    });
}

/**
 * Sync watched history to Cloudflare worker endpoint.
 */
async function syncToCloudflare() {
    const syncButton = document.getElementById('syncToCloudflare');
    if (!syncButton) {
        showStatus('Sync button not found', 'error');
        return;
    }

    showStatus('Sync button clicked!', 'info');
    
    const initialLabel = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.textContent = 'Syncing...';

    try {
        showStatus('Syncing watched history to Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        if (!endpointUrl) {
            throw new Error('Cloudflare Worker URL is required');
        }

        showStatus('Uploading pending unsynced IDs to Cloudflare...', 'info');
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'SYNC_TO_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 90000);

        if (!response?.success) {
            throw new Error(response?.error || 'Cloudflare sync failed');
        }

        const syncedCount = Number.isFinite(response.syncedCount) ? response.syncedCount : 0;
        const host = typeof response.endpointHost === 'string' && response.endpointHost
            ? response.endpointHost
            : 'Cloudflare';
        showStatus(
            `Synced ${syncedCount} IDs to ${host}. Pending: ${Number(response.pendingCount) || 0}`,
            'success'
        );
        await refreshCloudflareSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to sync watched history', 'error');
        cloudflareSyncTriggered = false;
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = initialLabel;
    }
}
/**
 * Sync subscription manager data to Cloudflare worker endpoint.
 */
async function syncSubscriptionsNow() {
    const syncButton = document.getElementById('syncSubscriptionsNow');
    if (!syncButton) {
        return;
    }

    const initialLabel = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.textContent = 'Syncing...';

    try {
        showStatus('Syncing subscriptions to Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveSubscriptionSyncSettings();

        if (!endpointUrl) {
            throw new Error('Cloudflare Worker URL is required');
        }

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'SYNC_SUBSCRIPTIONS_TO_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 120000);

        if (!response?.success) {
            throw new Error(response?.error || 'Subscription sync failed');
        }

        const syncedCount = Number.isFinite(response.syncedCount) ? response.syncedCount : 0;
        const host = typeof response.endpointHost === 'string' && response.endpointHost
            ? response.endpointHost
            : 'Cloudflare';
        showStatus(
            `Synced ${syncedCount} channels to ${host}. Pending: ${Number(response.pendingCount) || 0}`,
            'success'
        );
        await refreshSubscriptionSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to sync subscriptions', 'error');
        subscriptionSyncTriggered = false;
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = initialLabel;
    }
}

/**
 * Restore subscription manager data from Cloudflare.
 */
async function restoreSubscriptionsFromCloudflare() {
    const restoreButton = document.getElementById('restoreSubscriptions');
    if (!restoreButton) {
        return;
    }

    const initialLabel = restoreButton.textContent;
    restoreButton.disabled = true;
    restoreButton.textContent = 'Restoring...';

    try {
        showStatus('Restoring subscriptions from Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveSubscriptionSyncSettings();

        if (!endpointUrl) {
            throw new Error('Cloudflare Worker URL is required');
        }

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'RESTORE_SUBSCRIPTIONS_FROM_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 240000);

        if (!response?.success) {
            throw new Error(response?.error || 'Subscription restore failed');
        }

        const host = typeof response.endpointHost === 'string' && response.endpointHost
            ? response.endpointHost
            : 'Cloudflare';
        const channelCount = Number(response.channelCount) || 0;
        const categoryCount = Number(response.categoryCount) || 0;
        const assignmentCount = Number(response.assignmentCount) || 0;

        showStatus(
            `Restored ${channelCount} channels, ${categoryCount} categories, ${assignmentCount} assignments from ${host}.`,
            'success'
        );
        await refreshSubscriptionSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to restore subscriptions', 'error');
    } finally {
        restoreButton.disabled = false;
        restoreButton.textContent = initialLabel;
    }
}

/**
 * Export subscription manager data to CSV.
 */
async function exportSubscriptionCsvFromPopup() {
    const button = document.getElementById('exportSubscriptionCsv');
    if (!button) {
        return;
    }
    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Exporting...';

    try {
        const stored = await chrome.storage.local.get([
            SUBSCRIPTION_MANAGER_STORAGE_KEYS.SNAPSHOT,
            SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES,
            SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS
        ]);
        const snapshot = stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.SNAPSHOT];
        const channels = Array.isArray(snapshot?.channels) ? snapshot.channels : [];
        if (!channels.length) {
            throw new Error('Open the subscription manager in a YouTube tab first to fetch channels.');
        }
        const categories = normalizeCategories(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES]);
        const assignments = normalizeAssignments(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS]);
        const categoryLookup = new Map(categories.map((category) => [category.id, category.name]));

        const rows = [];
        const rowMap = new Map();
        channels.forEach((channel) => {
            const channelId = channel?.channelId || '';
            if (!channelId) {
                return;
            }
            const url = resolveChannelUrl(channel);
            if (!url) {
                return;
            }
            const assigned = Array.isArray(assignments[channelId]) ? assignments[channelId] : [];
            if (assigned.length === 0) {
                if (!rowMap.has(url)) {
                    rowMap.set(url, new Set());
                }
                return;
            }
            const set = rowMap.get(url) || new Set();
            assigned.forEach((categoryId) => {
                const name = categoryLookup.get(categoryId);
                if (name) {
                    set.add(name);
                }
            });
            if (!rowMap.has(url)) {
                rowMap.set(url, set);
            }
        });

        rowMap.forEach((set, url) => {
            const categoryList = Array.isArray(set) ? set : Array.from(set || []);
            const category = categoryList.length > 0 ? categoryList.sort().join('; ') : '';
            rows.push({ url, category });
        });

        if (rows.length === 0) {
            throw new Error('No channels found to export.');
        }

        const lines = ['channel_url,category'];
        rows.forEach((row) => {
            lines.push(`${escapeCsvValue(row.url)},${escapeCsvValue(row.category)}`);
        });

        downloadTextFile(lines.join('\n'), 'yt-commander-subscriptions.csv', 'text/csv;charset=utf-8');
        showStatus(`Exported ${rows.length} row(s).`, 'success');
    } catch (error) {
        showStatus(error?.message || 'Failed to export CSV', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

/**
 * Import subscription manager data from CSV.
 * @param {File} file
 */
async function importSubscriptionCsvFromPopup(file) {
    if (!file) {
        return;
    }
    showStatus('Importing CSV...', 'info');

    const stored = await chrome.storage.local.get([
        SUBSCRIPTION_MANAGER_STORAGE_KEYS.SNAPSHOT,
        SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES,
        SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS
    ]);
    const snapshot = stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.SNAPSHOT];
    const channels = Array.isArray(snapshot?.channels) ? snapshot.channels : [];
    if (!channels.length) {
        throw new Error('Open the subscription manager in a YouTube tab first to fetch channels.');
    }

    const categories = normalizeCategories(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES]);
    const assignments = normalizeAssignments(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS]);
    const indexes = buildChannelIndexes(channels);

    const text = await readFileText(file);
    const { rows, skipped } = parseSubscriptionCsv(text);
    if (rows.length === 0) {
        throw new Error('No valid rows found in CSV.');
    }

    const categoryLookup = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
    const existingColors = categories.map((category) => category.color);
    const newCategoryIds = [];
    const updatedChannelIds = new Set();
    let missingChannels = 0;
    let applied = 0;

    rows.forEach((row) => {
        const rawUrl = row.url.trim();
        const rawCategory = row.category.trim();
        const identity = {
            channelId: extractChannelIdFromUrl(rawUrl),
            handle: extractHandleFromUrl(rawUrl),
            url: rawUrl
        };
        const channelId = resolveChannelIdFromIdentity(identity, indexes);
        if (!channelId) {
            missingChannels += 1;
            return;
        }
        if (!rawCategory) {
            return;
        }
        const categoryNames = rawCategory
            .split(/[;|]+/)
            .map((name) => name.trim())
            .filter(Boolean);
        if (categoryNames.length === 0) {
            return;
        }
        categoryNames.forEach((categoryName) => {
            const key = categoryName.toLowerCase();
            let categoryId = categoryLookup.get(key);
            if (!categoryId) {
                const color = generateRandomCategoryColor(existingColors);
                const created = createCategory(categoryName, color);
                categories.push(created);
                existingColors.push(color);
                categoryId = created.id;
                categoryLookup.set(key, categoryId);
                newCategoryIds.push(categoryId);
            }
            const current = Array.isArray(assignments[channelId]) ? assignments[channelId] : [];
            if (!current.includes(categoryId)) {
                assignments[channelId] = Array.from(new Set([...current, categoryId]));
                updatedChannelIds.add(channelId);
                applied += 1;
            }
        });
    });

    if (newCategoryIds.length === 0 && updatedChannelIds.size === 0) {
        showStatus('No changes to import.', 'info');
        return;
    }

    await chrome.storage.local.set({
        [SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES]: categories,
        [SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS]: assignments
    });

    const pendingKeys = [
        ...newCategoryIds.map((id) => `category:${id}`),
        ...Array.from(updatedChannelIds).map((id) => `channel:${id}`)
    ];
    await markSubscriptionPending(pendingKeys);
    refreshSubscriptionSyncStatus().catch(() => undefined);

    const summary = [`Imported ${applied} assignment(s)`];
    if (newCategoryIds.length > 0) {
        summary.push(`Added ${newCategoryIds.length} category(s)`);
    }
    if (missingChannels > 0) {
        summary.push(`${missingChannels} channel(s) not found`);
    }
    if (skipped > 0) {
        summary.push(`${skipped} invalid row(s) skipped`);
    }
    showStatus(`${summary.join('. ')}.`, 'success');
}

/**
 * Handle CSV file input change.
 * @param {Event} event
 */
function handleSubscriptionCsvImport(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (input) {
        input.value = '';
    }
    if (!file) {
        return;
    }
    importSubscriptionCsvFromPopup(file).catch((error) => {
        showStatus(error?.message || 'Failed to import CSV.', 'error');
    });
}

/**
 * Lock cloud sync to currently active YouTube account context.
 */
async function lockPrimarySyncAccount() {
    const button = document.getElementById('lockPrimarySyncAccount');
    if (!button) {
        return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
    if (!activeTab?.id) {
        showStatus('Open a YouTube tab first to lock account', 'error');
        return;
    }

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Locking...';

    try {
        const errors = [];
        let cloudResponse = null;
        let subscriptionResponse = null;

        try {
            cloudResponse = await sendRuntimeMessage({
                type: 'LOCK_PRIMARY_SYNC_ACCOUNT',
                tabId: activeTab.id
            }, 30000);
            if (!cloudResponse?.success) {
                throw new Error(cloudResponse?.error || 'Failed to lock watched history account');
            }
            renderCloudflareSyncStatus(cloudResponse);
        } catch (error) {
            errors.push(error?.message || 'Failed to lock watched history account');
        }

        try {
            subscriptionResponse = await sendRuntimeMessage({
                type: 'LOCK_SUBSCRIPTION_SYNC_ACCOUNT',
                tabId: activeTab.id
            }, 30000);
            if (!subscriptionResponse?.success) {
                throw new Error(subscriptionResponse?.error || 'Failed to lock subscription account');
            }
            renderSubscriptionSyncStatus(subscriptionResponse);
        } catch (error) {
            errors.push(error?.message || 'Failed to lock subscription account');
        }

        if (errors.length > 0) {
            showStatus(errors[0], 'error');
        } else {
            showStatus('Sync accounts locked to current YouTube tab', 'success');
        }
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

/**
 * Download IDs from Cloudflare and import to local IndexedDB.
 */
async function downloadFromCloudflare() {
    const button = document.getElementById('downloadFromCloudflare');
    if (!button) {
        return;
    }

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Downloading...';

    try {
        showStatus('Downloading IDs from Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        if (!endpointUrl) {
            throw new Error('Cloudflare Worker URL is required');
        }

        const response = await sendRuntimeMessage({
            type: 'DOWNLOAD_FROM_CLOUDFLARE',
            endpointUrl,
            apiToken
        }, 240000);

        if (!response?.success) {
            throw new Error(response?.error || 'Cloudflare download failed');
        }

        showStatus(
            `Downloaded ${Number(response.pulledCount) || 0} IDs, imported ${Number(response.importedCount) || 0} new IDs`,
            'success'
        );
        await refreshCloudflareSyncStatus();
        await loadWatchedHistoryStats();
    } catch (error) {
        showStatus(error?.message || 'Failed to download from Cloudflare', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

// Import history functionality
function importHistory() {
    const fileInput = document.getElementById('historyFileInput');
    fileInput.click();
}

async function handleFileImport(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (input) {
        input.value = '';
    }
    if (!file) {
        return;
    }

    try {
        const content = await readFileText(file);
        const videoIds = parseWatchedVideoIdsFromFileText(content, file.name);
        if (videoIds.length === 0) {
            showStatus('No valid video IDs found in file', 'error');
            return;
        }

        const targetTab = await resolveYouTubeTabForHistory();
        const totalImported = await importWatchedVideoIdsInBatches(targetTab.id, videoIds, {
            progressLabel: 'Importing to local history'
        });

        showStatus(`Imported ${totalImported} new IDs to local history.`, 'success');
        await loadWatchedHistoryStats();
        await refreshCloudflareSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Error importing file', 'error');
    }
}

/**
 * Seed missing watched IDs from file to local IndexedDB + Cloudflare D1.
 */
async function seedHistoryToLocalAndCloudflare() {
    const button = document.getElementById('seedHistoryLocalCloudflare');
    const fileInput = document.getElementById('historySeedFileInput');
    const file = fileInput?.files?.[0];

    if (!button || !fileInput) {
        return;
    }

    if (!file) {
        showStatus('Choose a TXT or CSV file first', 'error');
        return;
    }

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Seeding...';

    try {
        const content = await readFileText(file);
        const videoIds = parseWatchedVideoIdsFromFileText(content, file.name);

        if (videoIds.length === 0) {
            throw new Error('No valid video IDs found in selected file');
        }

        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
            url: '*://*.youtube.com/*'
        });

        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        showStatus(`Seeding ${videoIds.length} IDs to local + Cloudflare...`, 'info');

        const response = await sendRuntimeMessage({
            type: 'SEED_HISTORY_TO_LOCAL_AND_CLOUDFLARE',
            videoIds,
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, HISTORY_SEED_SYNC_TIMEOUT_MS);

        if (!response?.success) {
            throw new Error(response?.error || 'Failed to seed missing history IDs');
        }

        const importedCount = Number(response.importedCount) || 0;
        const syncedCount = Number(response.syncedCount) || 0;
        const pendingCount = Number(response.pendingCount) || 0;

        showStatus(
            `Seed complete. Local imported: ${importedCount}. Cloudflare synced: ${syncedCount}. Pending: ${pendingCount}.`,
            'success'
        );

        await loadWatchedHistoryStats();
        await refreshCloudflareSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to seed missing data', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}


/**
 * Resolve hidden select/input associated with a custom dropdown.
 * Supports both nested controls and sibling controls with matching id sans "Dropdown".
 * @param {HTMLElement} dropdown
 * @returns {HTMLSelectElement|null}
 */
function getBoundDropdownControl(dropdown) {
    if (!dropdown) {
        return null;
    }

    const nestedControl = dropdown.querySelector('select');
    if (nestedControl) {
        return nestedControl;
    }

    if (typeof dropdown.id === 'string' && dropdown.id.endsWith('Dropdown')) {
        const controlId = dropdown.id.replace(/Dropdown$/, '');
        const siblingControl = document.getElementById(controlId);
        if (siblingControl && siblingControl.tagName === 'SELECT') {
            return siblingControl;
        }
    }

    return null;
}

/**
 * Check whether a string looks like a valid YouTube video ID.
 * @param {string} value
 * @returns {boolean}
 */
function isValidVideoId(value) {
    return /^[A-Za-z0-9_-]{10,15}$/.test(value);
}

/**
 * Extract one YouTube video ID from a raw cell/token.
 * Supports direct IDs and common YouTube URL formats.
 * @param {string} rawValue
 * @returns {string}
 */
function extractVideoIdFromText(rawValue) {
    const value = typeof rawValue === 'string' ? rawValue.trim().replace(/^['"]|['"]$/g, '') : '';
    if (!value) {
        return '';
    }

    if (isValidVideoId(value)) {
        return value;
    }

    const urlPattern = /(?:v=|\/shorts\/|\/embed\/|\/live\/|youtu\.be\/)([A-Za-z0-9_-]{10,15})/i;
    const quickMatch = value.match(urlPattern);
    if (quickMatch?.[1] && isValidVideoId(quickMatch[1])) {
        return quickMatch[1];
    }

    try {
        const parsed = new URL(value, 'https://www.youtube.com');
        const watchId = parsed.searchParams.get('v');
        if (watchId && isValidVideoId(watchId)) {
            return watchId;
        }

        const host = parsed.hostname.toLowerCase();
        const segments = parsed.pathname.split('/').filter(Boolean);

        if (host.includes('youtu.be') && segments[0] && isValidVideoId(segments[0])) {
            return segments[0];
        }

        for (let i = 0; i < segments.length - 1; i += 1) {
            const segment = segments[i].toLowerCase();
            const next = segments[i + 1];
            if ((segment === 'shorts' || segment === 'embed' || segment === 'live' || segment === 'v')
                && isValidVideoId(next)) {
                return next;
            }
        }
    } catch (_error) {
        return '';
    }

    return '';
}

/**
 * Parse watched-history IDs from TXT/CSV content.
 * Keeps only unique video IDs.
 * @param {string} text
 * @param {string} fileName
 * @returns {string[]}
 */
function parseWatchedVideoIdsFromFileText(text, fileName) {
    const rawLines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const rawLowerName = typeof fileName === 'string' ? fileName.toLowerCase() : '';
    const looksLikeCsv = rawLowerName.endsWith('.csv');
    const collected = [];

    rawLines.forEach((line) => {
        const trimmedLine = typeof line === 'string' ? line.trim() : '';
        if (!trimmedLine) {
            return;
        }

        const candidates = looksLikeCsv
            ? parseCsvLine(trimmedLine)
            : trimmedLine.split(/[,\t;| ]+/).filter(Boolean);

        candidates.forEach((candidate) => {
            const videoId = extractVideoIdFromText(candidate);
            if (videoId) {
                collected.push(videoId);
            }
        });
    });

    return normalizeVideoIdList(collected);
}

/**
 * Import watched IDs in batches into local history via content script.
 * @param {number} tabId
 * @param {string[]} videoIds
 * @param {{progressLabel?: string}} [options]
 * @returns {Promise<number>}
 */
async function importWatchedVideoIdsInBatches(tabId, videoIds, options = {}) {
    const progressLabel = typeof options?.progressLabel === 'string' && options.progressLabel.trim()
        ? options.progressLabel.trim()
        : 'Importing watched IDs';

    let totalImported = 0;
    let currentIndex = 0;

    while (currentIndex < videoIds.length) {
        const batch = videoIds.slice(currentIndex, currentIndex + HISTORY_IMPORT_BATCH_SIZE);
        const batchNumber = Math.floor(currentIndex / HISTORY_IMPORT_BATCH_SIZE) + 1;
        const progress = Math.min(100, Math.round((currentIndex / videoIds.length) * 100));

        showStatus(`${progressLabel}: batch ${batchNumber} (${progress}%)`, 'info');

        let batchImported = 0;
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'IMPORT_WATCHED_VIDEOS',
                videoIds: batch
            });

            if (!response?.success) {
                throw new Error(response?.error || 'Content script import failed');
            }
            batchImported = Number(response.count) || 0;
        } catch (_messageError) {
            const storageKey = `import_batch_${Date.now()}_${Math.random()}`;
            await chrome.storage.local.set({
                [storageKey]: {
                    videoIds: batch,
                    timestamp: Date.now()
                }
            });

            const bgResponse = await sendRuntimeMessage({
                type: 'PROCESS_IMPORT_BATCH',
                storageKey,
                tabId
            }, 120000);

            batchImported = Number(bgResponse?.count) || 0;
        }

        totalImported += batchImported;
        currentIndex += HISTORY_IMPORT_BATCH_SIZE;

        // Keep popup responsive during large imports.
        await new Promise((resolve) => setTimeout(resolve, 75));
    }

    return totalImported;
}

/**
 * Initialize custom dropdown components.
 */
function initializeCustomDropdowns() {
    document.querySelectorAll('.ytc-dropdown').forEach(dropdown => {
        const trigger = dropdown.querySelector('.ytc-dropdown-trigger');
        const menu = dropdown.querySelector('.ytc-dropdown-menu');
        const label = dropdown.querySelector('.ytc-dropdown-label');
        const hiddenSelect = getBoundDropdownControl(dropdown);
        const options = menu.querySelectorAll('.ytc-dropdown-option');
        
        if (!trigger || !menu || !label) return;
        
        const openDropdown = () => {
            trigger.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
            menu.classList.add('open');
        };
        
        const closeDropdown = () => {
            trigger.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            menu.classList.remove('open');
        };
        
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = trigger.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) {
                openDropdown();
            }
        });
        
        options.forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const value = option.dataset.value;
                const text = option.textContent;
                
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                label.textContent = text;
                dropdown.dataset.value = value;
                
                if (dropdown.id === 'cloudflareSyncIntervalDropdown') {
                    cloudflareSyncIntervalMinutes = Number(value) || 30;
                    subscriptionSyncIntervalMinutes = Number(value) || 30;
                }
                
                if (hiddenSelect) {
                    hiddenSelect.value = value;
                }
                
                closeDropdown();

                if (dropdown.id === 'maxQualityDropdown') {
                    saveSyncSettings(true);
                    return;
                }

                if (dropdown.id !== 'cloudflareSyncIntervalDropdown') {
                    return;
                }

                try {
                    await saveCloudflareSyncSettings();
                    await saveSubscriptionSyncSettings();

                    cloudflareSyncTriggered = false;
                    const intervalMs = cloudflareSyncIntervalMinutes * 60 * 1000;
                    const nextSyncAt = cloudflareLastSyncAt + intervalMs;
                    if (nextSyncAt <= Date.now()) {
                        await refreshCloudflareSyncStatus();
                        await syncToCloudflare();
                    } else {
                        await refreshCloudflareSyncStatus();
                    }

                    showStatus('Settings saved', 'success');
                } catch (error) {
                    showStatus(error?.message || 'Failed to save settings', 'error');
                }
            });
        });
    });
}

/**
 * Close all open dropdowns.
 */
function closeAllDropdowns() {
    document.querySelectorAll('.ytc-dropdown-trigger.open').forEach(trigger => {
        trigger.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.ytc-dropdown-menu.open').forEach(menu => {
        menu.classList.remove('open');
    });
}

/**
 * Update dropdown selected state from hidden select value.
 * @param {string} dropdownId
 * @param {string} value
 */
function updateDropdownSelection(dropdownId, value) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    const option = dropdown.querySelector(`.ytc-dropdown-option[data-value="${value}"]`);
    const label = dropdown.querySelector('.ytc-dropdown-label');
    const hiddenSelect = getBoundDropdownControl(dropdown);
    
    if (option && label) {
        dropdown.querySelectorAll('.ytc-dropdown-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        label.textContent = option.textContent;
        dropdown.dataset.value = value;
    }
    
    if (hiddenSelect) {
        hiddenSelect.value = value;
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', closeAllDropdowns);

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add(POPUP_UI_V2_CLASS);
    initializePopupUiV2Layout();
    initializeSettingsModalTabs();
    initializeCustomDropdowns();

    loadSettings();

    setupAudioSettingToggle();
    setupWindowedAutoToggle();
    setupDeleteVideosToggle();
    setupHideSubscribedToggle();
    setupCloudflareSyncControls();
    setupSubscriptionSyncControls();
    setupTokenVisibilityToggle('cloudflareSyncToken', 'cloudflareTokenToggle');
    setupPopupSettingsModal();
    setupPopupAboutModal();
    setupAutoSave();
    
    // History buttons
    const exportBtn = document.getElementById('exportHistory');
    if (exportBtn) exportBtn.addEventListener('click', exportHistory);
    const importBtn = document.getElementById('importHistory');
    if (importBtn) importBtn.addEventListener('click', importHistory);
    const sqlBtn = document.getElementById('exportSqlMigration');
    if (sqlBtn) sqlBtn.addEventListener('click', exportSqlMigration);
    setupSqlCopyButton();
    
    // Cloudflare sync buttons
    const syncBtn = document.getElementById('syncToCloudflare');
    if (syncBtn) syncBtn.addEventListener('click', syncToCloudflare);
    const downloadBtn = document.getElementById('downloadFromCloudflare');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadFromCloudflare);
    const lockBtn = document.getElementById('lockPrimarySyncAccount');
    if (lockBtn) lockBtn.addEventListener('click', lockPrimarySyncAccount);
    
    const historyFileInput = document.getElementById('historyFileInput');
    if (historyFileInput) historyFileInput.addEventListener('change', handleFileImport);
    const seedHistoryBtn = document.getElementById('seedHistoryLocalCloudflare');
    if (seedHistoryBtn) seedHistoryBtn.addEventListener('click', seedHistoryToLocalAndCloudflare);
    const historySeedFileInput = document.getElementById('historySeedFileInput');
    if (historySeedFileInput) {
        historySeedFileInput.addEventListener('change', () => {
            const selected = historySeedFileInput.files?.[0];
            if (selected) {
                showStatus(`Ready to seed: ${selected.name}`, 'info');
            }
        });
    }
    
    // Subscription buttons
    const exportCsvBtn = document.getElementById('exportSubscriptionCsv');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportSubscriptionCsvFromPopup);
    const importCsvBtn = document.getElementById('importSubscriptionCsv');
    if (importCsvBtn) importCsvBtn.addEventListener('click', () => {
        document.getElementById('subscriptionCsvInput')?.click();
    });
    const subscriptionCsvInput = document.getElementById('subscriptionCsvInput');
    if (subscriptionCsvInput) subscriptionCsvInput.addEventListener('change', handleSubscriptionCsvImport);
    const syncSubBtn = document.getElementById('syncSubscriptionsNow');
    if (syncSubBtn) syncSubBtn.addEventListener('click', syncSubscriptionsNow);
    const restoreSubBtn = document.getElementById('restoreSubscriptions');
    if (restoreSubBtn) restoreSubBtn.addEventListener('click', restoreSubscriptionsFromCloudflare);

    setInterval(loadWatchedHistoryStats, 5000);
    setInterval(refreshCloudflareSyncStatus, 30000);
    setInterval(refreshSubscriptionSyncStatus, 30000);
    setInterval(renderCloudflareNextSyncCountdown, 1000);
    setInterval(renderSubscriptionNextSyncCountdown, 1000);
    setInterval(renderAutomationNextRunCountdown, 1000);
    
    setupSubscriptionAutomationControls();
    loadAutomationSettings();
    loadAutomationStats();
});

