import { normalizeShortcutKey } from '../shared/shortcutKey.js';
import { normalizeQualityId } from '../shared/quality.js';

// Modern YouTube Commander Popup Script
const defaultSettings = {
    // Popup-managed settings
    deleteVideosEnabled: false,
    autoSwitchToOriginal: true,
    rotationShortcut: 'r',
    windowedFullscreenShortcut: 'Enter',
    windowedFullscreenAuto: false,
    
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
let cloudflareNextSyncAt = 0;
let cloudflareAutoEnabled = true;
const CLOUDFLARE_STORAGE_KEYS = {
    ENDPOINT: 'cloudflareSyncEndpoint',
    API_TOKEN: 'cloudflareSyncApiToken',
    AUTO_ENABLED: 'cloudflareSyncAutoEnabled',
    INTERVAL_MINUTES: 'cloudflareSyncIntervalMinutes'
};
const SQL_EXPORT_TABLE_NAME = 'watched_videos';
const SQL_EXPORT_IDS_PER_FILE = 200000;
const SQL_EXPORT_VALUES_PER_STATEMENT = 300;
const SQL_EXPORT_DOWNLOAD_DELAY_MS = 250;
const POPUP_UI_V2_CLASS = 'yt-commander-popup-v2';
const POPUP_UI_V2_DEFAULT_FEATURE = 'history';
const POPUP_UI_V2_TONES = ['red', 'cyan', 'green', 'amber'];
const POPUP_UI_V2_NAV_ITEMS = [
    { feature: 'history', label: 'Watched history' },
    { feature: 'seek', label: 'Seek controls' },
    { feature: 'quality', label: 'Quality' },
    { feature: 'audio', label: 'Audio' },
    { feature: 'playlist', label: 'Multi select' },
    { feature: 'windowedFullscreen', label: 'Windowed fullscreen' },
    { feature: 'rotation', label: 'Rotate video' },
    { feature: 'shorts', label: 'Shorts counter' },
    { feature: 'shortsUploadAge', label: 'Shorts upload age' },
    { feature: 'subscriptions', label: 'Subscriptions label' },
    { feature: 'scroll', label: 'Scroll to top' }
];

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
    const cards = Array.from(document.querySelectorAll('.feature-card'));
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
    const container = document.querySelector('.container');
    const firstCard = container?.querySelector('.feature-card');
    if (!container || !firstCard || container.querySelector('.ytc-v2-nav')) {
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
    container.insertBefore(navWrap, firstCard);

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
 * Move node that contains selector match into pane.
 * @param {Element} scope
 * @param {string} selector
 * @param {Element} pane
 * @param {string} [extraClass]
 */
function moveHistoryNodeToPane(scope, selector, pane, extraClass = '') {
    const source = scope.querySelector(selector);
    if (!source) {
        return;
    }

    const host = source.closest('.action-buttons, .setting-row, .stats-grid, .status') || source;
    if (extraClass) {
        host.classList.add(extraClass);
    }
    pane.appendChild(host);
}

/**
 * Initialize Local/Cloud tabs inside history card for compact v2.
 */
function initializePopupUiV2HistoryTabs() {
    const historyCard = findFeatureCard('history');
    const historyContent = historyCard?.querySelector('.feature-content');
    if (!historyContent || historyContent.querySelector('.ytc-v2-history-tabs')) {
        return;
    }

    const tabs = document.createElement('div');
    tabs.className = 'ytc-v2-history-tabs';

    const localTab = document.createElement('button');
    localTab.type = 'button';
    localTab.className = 'ytc-v2-history-tab active';
    localTab.setAttribute('data-pane', 'local');
    localTab.textContent = 'Local';

    const cloudTab = document.createElement('button');
    cloudTab.type = 'button';
    cloudTab.className = 'ytc-v2-history-tab';
    cloudTab.setAttribute('data-pane', 'cloud');
    cloudTab.textContent = 'Cloud';

    const settingsTab = document.createElement('button');
    settingsTab.type = 'button';
    settingsTab.className = 'ytc-v2-history-tab';
    settingsTab.setAttribute('data-pane', 'settings');
    settingsTab.textContent = 'Settings';

    tabs.appendChild(localTab);
    tabs.appendChild(cloudTab);
    tabs.appendChild(settingsTab);

    const localPane = document.createElement('div');
    localPane.className = 'ytc-v2-history-pane active';
    localPane.setAttribute('data-pane', 'local');

    const cloudPane = document.createElement('div');
    cloudPane.className = 'ytc-v2-history-pane';
    cloudPane.setAttribute('data-pane', 'cloud');

    const settingsPane = document.createElement('div');
    settingsPane.className = 'ytc-v2-history-pane';
    settingsPane.setAttribute('data-pane', 'settings');

    moveHistoryNodeToPane(historyContent, '.stats-grid', localPane);
    moveHistoryNodeToPane(historyContent, '#exportHistory', localPane);
    moveHistoryNodeToPane(historyContent, '#exportSqlMigration', localPane);
    moveHistoryNodeToPane(historyContent, '#importHistory', localPane);
    moveHistoryNodeToPane(historyContent, '#deleteVideosToggle', localPane);
    moveHistoryNodeToPane(historyContent, '#historyStatus', localPane);

    moveHistoryNodeToPane(historyContent, '#syncToCloudflare', cloudPane);
    moveHistoryNodeToPane(historyContent, '#downloadFromCloudflare', cloudPane);
    moveHistoryNodeToPane(historyContent, '#cloudflareAutoSyncToggle', cloudPane);
    moveHistoryNodeToPane(historyContent, '#cloudflareSyncInterval', cloudPane);
    moveHistoryNodeToPane(historyContent, '#cloudflarePendingCount', cloudPane, 'ytc-v2-cloud-meta');

    moveHistoryNodeToPane(historyContent, '#lockPrimarySyncAccount', settingsPane);
    moveHistoryNodeToPane(historyContent, '#cloudflareSyncEndpoint', settingsPane);
    moveHistoryNodeToPane(historyContent, '#cloudflareSyncToken', settingsPane);

    const note = historyContent.querySelector('.note');

    historyContent.insertBefore(tabs, historyContent.firstChild);
    historyContent.appendChild(localPane);
    historyContent.appendChild(cloudPane);
    historyContent.appendChild(settingsPane);
    if (note) {
        historyContent.appendChild(note);
    }

    tabs.addEventListener('click', (event) => {
        const tab = event.target.closest('.ytc-v2-history-tab');
        if (!tab) {
            return;
        }

        const paneName = tab.getAttribute('data-pane');
        tabs.querySelectorAll('.ytc-v2-history-tab').forEach((item) => {
            item.classList.toggle('active', item === tab);
        });
        historyContent.querySelectorAll('.ytc-v2-history-pane').forEach((pane) => {
            pane.classList.toggle('active', pane.getAttribute('data-pane') === paneName);
        });
    });
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
        playlist: 'M4 6h10v2H4V6zm0 5h10v2H4v-2zm0 5h6v2H4v-2zm13-8h3v3h-3v-3zm0 5h3v3h-3v-3z',
        windowedFullscreen: 'M5 6h14v12H5V6zm2 2v8h10V8H7z',
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

    initializePopupUiV2HistoryTabs();
    initializePopupUiV2Navigator();
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

// Load saved settings
function loadSettings() {
    chrome.storage.sync.get(defaultSettings, (settings) => {
        currentSettings = sanitizeSettings(settings);

        document.getElementById('shortSeek').value = currentSettings.shortSeek;
        document.getElementById('mediumSeek').value = currentSettings.mediumSeek;
        document.getElementById('longSeek').value = currentSettings.longSeek;
        document.getElementById('maxQuality').value = normalizeQualityId(
            currentSettings.maxQuality,
            defaultSettings.maxQuality
        );
        document.getElementById('rotationShortcut').value = currentSettings.rotationShortcut || defaultSettings.rotationShortcut;
        document.getElementById('windowedFullscreenShortcut').value = currentSettings.windowedFullscreenShortcut || defaultSettings.windowedFullscreenShortcut;

        setToggleState(document.getElementById('deleteVideosToggle'), currentSettings.deleteVideosEnabled === true);
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
        shortSeekKey: defaultSettings.shortSeekKey,
        mediumSeekKey: defaultSettings.mediumSeekKey,
        longSeekKey: defaultSettings.longSeekKey
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
    ['shortSeek', 'mediumSeek', 'longSeek', 'rotationShortcut', 'windowedFullscreenShortcut'].forEach((id) => {
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
    if (value.length <= 22) {
        return value;
    }
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

/**
 * Format remaining milliseconds to mm:ss.
 * @param {number} remainingMs
 * @returns {string}
 */
function formatRemainingMinSec(remainingMs) {
    const safeMs = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Render live "Next Sync In" countdown.
 */
function renderNextSyncCountdown() {
    const nextSyncEl = document.getElementById('cloudflareNextSyncIn');
    if (!nextSyncEl) {
        return;
    }

    if (!cloudflareAutoEnabled) {
        nextSyncEl.textContent = 'Off';
        return;
    }

    if (!Number.isFinite(cloudflareNextSyncAt) || cloudflareNextSyncAt <= 0) {
        nextSyncEl.textContent = '--:--';
        return;
    }

    const remainingMs = cloudflareNextSyncAt - Date.now();
    nextSyncEl.textContent = formatRemainingMinSec(remainingMs);
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
 * Load Cloudflare sync settings from local storage.
 */
async function loadCloudflareSyncSettings() {
    const result = await chrome.storage.local.get([
        CLOUDFLARE_STORAGE_KEYS.ENDPOINT,
        CLOUDFLARE_STORAGE_KEYS.API_TOKEN,
        CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED,
        CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES
    ]);

    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');

    if (endpointInput) {
        endpointInput.value = typeof result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] === 'string'
            ? result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT]
            : '';
    }

    if (tokenInput) {
        tokenInput.value = typeof result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN] === 'string'
            ? result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN]
            : '';
    }

    if (intervalSelect) {
        const interval = Number.parseInt(result[CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES], 10);
        intervalSelect.value = Number.isFinite(interval) ? String(interval) : '30';
    }

    setToggleState(autoToggle, result[CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED] !== false);

    await refreshCloudflareSyncStatus();
}

/**
 * Persist Cloudflare sync settings from inputs.
 * @returns {Promise<{ endpointUrl: string, apiToken: string, autoEnabled: boolean, intervalMinutes: number }>}
 */
async function saveCloudflareSyncSettings() {
    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    const tokenInput = document.getElementById('cloudflareSyncToken');
    const autoToggle = document.getElementById('cloudflareAutoSyncToggle');
    const intervalSelect = document.getElementById('cloudflareSyncInterval');

    const endpointUrl = typeof endpointInput?.value === 'string' ? endpointInput.value.trim() : '';
    const apiToken = typeof tokenInput?.value === 'string' ? tokenInput.value.trim() : '';
    const autoEnabled = !autoToggle || autoToggle.classList.contains('active');
    const intervalValue = Number.parseInt(intervalSelect?.value || '30', 10);
    const intervalMinutes = Number.isFinite(intervalValue) ? intervalValue : 30;

    await chrome.storage.local.set({
        [CLOUDFLARE_STORAGE_KEYS.ENDPOINT]: endpointUrl,
        [CLOUDFLARE_STORAGE_KEYS.API_TOKEN]: apiToken,
        [CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED]: autoEnabled,
        [CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES]: intervalMinutes
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
 * Render cloud sync status in popup.
 * @param {object} status
 */
function renderCloudflareSyncStatus(status = {}) {
    const pendingEl = document.getElementById('cloudflarePendingCount');
    const lastSyncEl = document.getElementById('cloudflareLastSyncAt');
    const infoEl = document.getElementById('cloudflareLastSyncInfo');
    const primaryAccountEl = document.getElementById('cloudflarePrimaryAccount');
    cloudflareAutoEnabled = status.autoEnabled !== false;
    cloudflareNextSyncAt = Number(status.nextSyncAt) || 0;

    if (pendingEl) {
        pendingEl.textContent = String(Number(status.pendingCount) || 0);
    }

    if (primaryAccountEl) {
        primaryAccountEl.textContent = formatAccountKey(status.primaryAccountKey);
    }

    if (lastSyncEl) {
        const timestamp = Number(status.lastAt) || 0;
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

    renderNextSyncCountdown();
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
                await refreshCloudflareSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to save Cloudflare settings', 'error');
            }
        });
    }

    if (intervalSelect) {
        intervalSelect.addEventListener('change', async () => {
            try {
                await saveCloudflareSyncSettings();
                await refreshCloudflareSyncStatus();
            } catch (error) {
                showStatus(error?.message || 'Failed to update sync interval', 'error');
            }
        });
    }

    const saveOnBlur = async () => {
        try {
            await saveCloudflareSyncSettings();
            await refreshCloudflareSyncStatus();
        } catch (error) {
            showStatus(error?.message || 'Failed to update Cloudflare settings', 'error');
        }
    };

    endpointInput?.addEventListener('blur', saveOnBlur);
    tokenInput?.addEventListener('blur', saveOnBlur);
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
 * Trigger browser download for text content.
 * @param {string} content
 * @param {string} filename
 */
function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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

            downloadTextFile(sqlContent, filename);
            exportedIds += idsChunk.length;

            if (partIndex < totalParts) {
                await new Promise((resolve) => setTimeout(resolve, SQL_EXPORT_DOWNLOAD_DELAY_MS));
            }
        }

        showStatus(`Exported ${exportedIds} IDs as ${totalParts} SQL file(s)`, 'success');
    } catch (error) {
        showStatus(error?.message || 'Failed to export SQL migration', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

/**
 * Sync watched history to Cloudflare worker endpoint.
 */
async function syncToCloudflare() {
    const syncButton = document.getElementById('syncToCloudflare');
    if (!syncButton) {
        return;
    }

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
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = initialLabel;
    }
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
        const response = await sendRuntimeMessage({
            type: 'LOCK_PRIMARY_SYNC_ACCOUNT',
            tabId: activeTab.id
        }, 30000);

        if (!response?.success) {
            throw new Error(response?.error || 'Failed to lock sync account');
        }

        renderCloudflareSyncStatus(response);
        showStatus('Sync account locked to current YouTube tab', 'success');
    } catch (error) {
        showStatus(error?.message || 'Failed to lock sync account', 'error');
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
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
        
        // Parse video IDs based on file type
        let videoIds = [];
        const fileName = file.name.toLowerCase();
        
        console.log('Import file:', fileName, 'Content length:', content.length);
        console.log('First 200 chars:', content.substring(0, 200));
        
        if (fileName.endsWith('.csv')) {
            // Parse CSV format
            const lines = content.split('\n').filter(line => line.trim());
            // Skip header if present
            const dataLines = lines[0].includes('Video ID') ? lines.slice(1) : lines;
            
            videoIds = dataLines.map(line => {
                // Extract video ID from first column (handle quoted values)
                const match = line.match(/^"?([^",]+)"?/);
                return match ? match[1].trim() : null;
            }).filter(id => id && id.length === 11); // YouTube video IDs are 11 characters
            
        } else {
            // Parse TXT format (legacy - one video ID per line)
            videoIds = content.split('\n')
                .map(line => line.trim())
                .filter(id => id && id.length >= 10 && id.length <= 12); // Be more flexible with ID length
        }
        
        console.log('Parsed video IDs:', videoIds.length, videoIds.slice(0, 5));
        
        if (videoIds.length === 0) {
            showStatus('No valid video IDs found in file', 'error');
            console.log('No video IDs found. File content:', content);
            return;
        }
        
        // Get the active tab specifically for better permission handling
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || !activeTab.url.includes('youtube.com')) {
            showStatus('Please make sure you are on a YouTube page and try again', 'error');
            return;
        }
        
        // For large imports, process in smaller batches to avoid memory issues
        const batchSize = 5000; // Process 5k at a time to avoid memory issues
        let totalImported = 0;
        let currentIndex = 0;
        
        showStatus(`Processing ${videoIds.length} video IDs in batches...`, 'info');
        
        while (currentIndex < videoIds.length) {
            const batch = videoIds.slice(currentIndex, currentIndex + batchSize);
            const progress = Math.round((currentIndex / videoIds.length) * 100);
            
            showStatus(`Processing batch ${Math.floor(currentIndex/batchSize) + 1}... (${progress}%)`, 'info');
            
            try {
                let batchImported = 0;
                
                // Use content script message approach since script injection is blocked
                console.log(`[Import] Processing batch ${Math.floor(currentIndex / batchSize) + 1} with ${batch.length} IDs via content script`);
                
                try {
                    // Try content script first
                    const response = await chrome.tabs.sendMessage(activeTab.id, {
                        type: 'IMPORT_WATCHED_VIDEOS',
                        videoIds: batch
                    });
                    
                    if (response && response.success) {
                        batchImported = response.count || 0;
                        console.log(`[Import] Batch ${Math.floor(currentIndex / batchSize) + 1} imported ${batchImported} videos via content script`);
                    } else {
                        throw new Error(response?.error || 'Content script import failed');
                    }
                } catch (messageError) {
                    console.warn('Content script import failed, trying storage fallback:', messageError);
                    
                    // Fallback: Store in chrome.storage and let background script handle it
                    const storageKey = `import_batch_${Date.now()}_${Math.random()}`;
                    await chrome.storage.local.set({
                        [storageKey]: {
                            videoIds: batch,
                            timestamp: Date.now()
                        }
                    });
                    
                    // Notify background script to process the batch
                    const bgResponse = await chrome.runtime.sendMessage({
                        type: 'PROCESS_IMPORT_BATCH',
                        storageKey: storageKey,
                        tabId: activeTab.id
                    });
                    
                    batchImported = bgResponse?.count || 0;
                    console.log(`[Import] Batch ${Math.floor(currentIndex / batchSize) + 1} imported ${batchImported} videos via background script`);
                }
                console.log(`[Import] Batch ${Math.floor(currentIndex / batchSize) + 1} imported ${batchImported} videos`);
                
                totalImported += batchImported;
                currentIndex += batchSize;
                
                // Small delay between batches to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error('Error processing batch:', error);
                showStatus(`Error processing batch at ${currentIndex}. Continuing...`, 'warning');
                currentIndex += batchSize; // Skip this batch and continue
            }
        }
        
        showStatus(`Successfully imported ${totalImported} videos!`, 'success');
        loadWatchedHistoryStats(); // Refresh stats
        
    } catch (error) {
        console.error('Import error:', error);
        showStatus('Error importing file', 'error');
    }
}


// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add(POPUP_UI_V2_CLASS);
    initializePopupUiV2Layout();

    loadSettings();

    setupAudioSettingToggle();
    setupWindowedAutoToggle();
    setupDeleteVideosToggle();
    setupCloudflareSyncControls();
    setupAutoSave();
    document.getElementById('exportHistory').addEventListener('click', exportHistory);
    document.getElementById('importHistory').addEventListener('click', importHistory);
    document.getElementById('exportSqlMigration').addEventListener('click', exportSqlMigration);
    document.getElementById('syncToCloudflare').addEventListener('click', syncToCloudflare);
    document.getElementById('downloadFromCloudflare').addEventListener('click', downloadFromCloudflare);
    document.getElementById('lockPrimarySyncAccount').addEventListener('click', lockPrimarySyncAccount);
    document.getElementById('historyFileInput').addEventListener('change', handleFileImport);

    setInterval(loadWatchedHistoryStats, 5000);
    setInterval(refreshCloudflareSyncStatus, 30000);
    setInterval(renderNextSyncCountdown, 1000);
});

