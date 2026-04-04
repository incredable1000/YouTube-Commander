import {
    defaultSettings,
    LEGACY_FEATURE_KEYS,
    currentSettings,
    normalizeShortcutKey,
    normalizeQualityId
} from './module.js';

export function setToggleState(toggle, enabled) {
    if (!toggle) return;
    toggle.classList.toggle('active', Boolean(enabled));
}

export function parseNumberInput(id, fallback) {
    const input = document.getElementById(id);
    const parsed = Number.parseInt(input?.value || '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseShortcutInput(id, fallback) {
    const input = document.getElementById(id);
    const rawValue = typeof input?.value === 'string' ? input.value.trim() : '';
    return normalizeShortcutKey(rawValue, fallback);
}

export function parseShortcutComboInput(id, fallback) {
    const input = document.getElementById(id);
    const rawValue = typeof input?.value === 'string' ? input.value.trim() : '';
    return parseShortcutCombo(rawValue, fallback);
}

export function parseSeekShortcutComboInput(id, fallback) {
    const parsed = parseShortcutComboInput(id, fallback);
    return { ...parsed, key: fallback.key };
}

export function parseShortcutCombo(rawValue, fallback) {
    if (!rawValue) return { ...fallback };

    const parts = rawValue.split('+').map((part) => part.trim()).filter(Boolean);
    let ctrl = false;
    let shift = false;
    let alt = false;
    let key = '';

    parts.forEach((part) => {
        const normalized = part.toLowerCase();
        if (normalized === 'ctrl' || normalized === 'control') { ctrl = true; return; }
        if (normalized === 'shift') { shift = true; return; }
        if (normalized === 'alt' || normalized === 'option') { alt = true; return; }
        if (normalized === 'cmd' || normalized === 'meta') { ctrl = true; return; }
        key = part;
    });

    const normalizedKey = normalizeShortcutKey(key || fallback.key, fallback.key);
    if (!ctrl && !shift && !alt && normalizedKey === 'Enter') return { ...fallback };
    return { ctrl, shift, alt, key: normalizedKey };
}

export function formatShortcutCombo(value, fallback) {
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

export function formatSeekShortcutCombo(value, fallback) {
    const normalized = (!value || typeof value !== 'object') ? { ...fallback } : value;
    return formatShortcutCombo({ ...normalized, key: fallback.key }, fallback);
}

export function sanitizeSettings(settings) {
    const sanitized = { ...settings };
    LEGACY_FEATURE_KEYS.forEach((key) => { delete sanitized[key]; });
    sanitized.maxQuality = normalizeQualityId(sanitized.maxQuality, defaultSettings.maxQuality);
    return sanitized;
}

export function loadSettings(onLoaded) {
    chrome.storage.sync.get(defaultSettings, (settings) => {
        currentSettings = sanitizeSettings(settings);

        document.getElementById('shortSeek').value = currentSettings.shortSeek;
        document.getElementById('mediumSeek').value = currentSettings.mediumSeek;
        document.getElementById('longSeek').value = currentSettings.longSeek;
        document.getElementById('shortSeekKey').value = formatSeekShortcutCombo(currentSettings.shortSeekKey, defaultSettings.shortSeekKey);
        document.getElementById('mediumSeekKey').value = formatSeekShortcutCombo(currentSettings.mediumSeekKey, defaultSettings.mediumSeekKey);
        document.getElementById('longSeekKey').value = formatSeekShortcutCombo(currentSettings.longSeekKey, defaultSettings.longSeekKey);
        document.getElementById('maxQuality').value = normalizeQualityId(currentSettings.maxQuality, defaultSettings.maxQuality);
        updateDropdownSelection('maxQualityDropdown', document.getElementById('maxQuality').value);
        document.getElementById('rotationShortcut').value = currentSettings.rotationShortcut || defaultSettings.rotationShortcut;
        document.getElementById('windowedFullscreenShortcut').value = currentSettings.windowedFullscreenShortcut || defaultSettings.windowedFullscreenShortcut;
        document.getElementById('openVideoNewTabShortcut').value = formatShortcutCombo(currentSettings.openVideoNewTabShortcut, defaultSettings.openVideoNewTabShortcut);
        document.getElementById('openChannelNewTabShortcut').value = formatShortcutCombo(currentSettings.openChannelNewTabShortcut, defaultSettings.openChannelNewTabShortcut);

        setToggleState(document.getElementById('deleteVideosToggle'), currentSettings.deleteVideosEnabled === true);
        setToggleState(document.getElementById('hideSubscribedToggle'), currentSettings.hideSubscribedVideosEnabled === true);
        setToggleState(document.getElementById('autoSwitchToOriginalToggle'), currentSettings.autoSwitchToOriginal !== false);
        setToggleState(document.getElementById('windowedFullscreenAutoToggle'), currentSettings.windowedFullscreenAuto === true);

        cleanupLegacyFeatureFlags();
        if (onLoaded) onLoaded();
    });
}

export function cleanupLegacyFeatureFlags() {
    chrome.storage.sync.remove(LEGACY_FEATURE_KEYS, () => {
        if (chrome.runtime.lastError) console.warn('Failed to cleanup legacy feature keys:', chrome.runtime.lastError.message);
    });
}

export function saveSyncSettings(showMessage = false) {
    const settings = sanitizeSettings({
        ...currentSettings,
        shortSeek: parseNumberInput('shortSeek', defaultSettings.shortSeek),
        mediumSeek: parseNumberInput('mediumSeek', defaultSettings.mediumSeek),
        longSeek: parseNumberInput('longSeek', defaultSettings.longSeek),
        maxQuality: document.getElementById('maxQuality')?.value || defaultSettings.maxQuality,
        rotationShortcut: parseShortcutInput('rotationShortcut', defaultSettings.rotationShortcut),
        windowedFullscreenShortcut: parseShortcutInput('windowedFullscreenShortcut', defaultSettings.windowedFullscreenShortcut),
        windowedFullscreenAuto: currentSettings.windowedFullscreenAuto === true,
        openVideoNewTabShortcut: parseShortcutComboInput('openVideoNewTabShortcut', defaultSettings.openVideoNewTabShortcut),
        openChannelNewTabShortcut: parseShortcutComboInput('openChannelNewTabShortcut', defaultSettings.openChannelNewTabShortcut),
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
        if (showMessage) showStatus('Settings saved', 'success');
    });
}

export function broadcastSettings(settings) {
    chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }, () => {
                if (chrome.runtime.lastError) return;
            });
        });
    });
}

export function setupAutoSave() {
    const inputIds = [
        'shortSeek', 'mediumSeek', 'longSeek',
        'shortSeekKey', 'mediumSeekKey', 'longSeekKey',
        'rotationShortcut', 'windowedFullscreenShortcut',
        'openVideoNewTabShortcut', 'openChannelNewTabShortcut'
    ];

    inputIds.forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => saveSyncSettings());
            input.addEventListener('change', () => saveSyncSettings());
        }
    });

    const qualitySelect = document.getElementById('maxQuality');
    if (qualitySelect) qualitySelect.addEventListener('change', () => saveSyncSettings());
}

export function setupDeleteVideosToggle() {
    const deleteVideosToggle = document.getElementById('deleteVideosToggle');
    if (deleteVideosToggle) {
        deleteVideosToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const enabled = !deleteVideosToggle.classList.contains('active');
            setToggleState(deleteVideosToggle, enabled);
            currentSettings.deleteVideosEnabled = enabled;
            showStatus(enabled ? 'Delete videos enabled - removing watched cards' : 'Delete videos disabled - showing markers', 'success');
            saveSyncSettings();
        });
    }
}

export function setupHideSubscribedToggle() {
    const hideSubscribedToggle = document.getElementById('hideSubscribedToggle');
    if (!hideSubscribedToggle) return;

    hideSubscribedToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const enabled = !hideSubscribedToggle.classList.contains('active');
        setToggleState(hideSubscribedToggle, enabled);
        currentSettings.hideSubscribedVideosEnabled = enabled;
        saveSyncSettings();
    });
}

export function setupAudioSettingToggle() {
    const toggle = document.getElementById('autoSwitchToOriginalToggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const enabled = !toggle.classList.contains('active');
        setToggleState(toggle, enabled);
        currentSettings.autoSwitchToOriginal = enabled;
        saveSyncSettings();
        showStatus(enabled ? 'Auto switch to original audio enabled' : 'Auto switch to original audio disabled', 'success');
    });
}

export function setupWindowedAutoToggle() {
    const toggle = document.getElementById('windowedFullscreenAutoToggle');
    if (!toggle) return;

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const enabled = !toggle.classList.contains('active');
        setToggleState(toggle, enabled);
        currentSettings.windowedFullscreenAuto = enabled;
        saveSyncSettings();
        showStatus(enabled ? 'Auto windowed mode enabled' : 'Auto windowed mode disabled', 'success');
    });
}

export function updateDropdownSelection(dropdownId, value) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const option = dropdown.querySelector(`.ytc-dropdown-option[data-value="${value}"]`);
    const label = dropdown.querySelector('.ytc-dropdown-label');
    const hiddenSelect = dropdown.querySelector('select');

    if (option && label) {
        dropdown.querySelectorAll('.ytc-dropdown-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        label.textContent = option.textContent;
        dropdown.dataset.value = value;
    }

    if (hiddenSelect) hiddenSelect.value = value;
}

export function initializeCustomDropdowns() {
    document.querySelectorAll('.ytc-dropdown').forEach(dropdown => {
        const trigger = dropdown.querySelector('.ytc-dropdown-trigger');
        const menu = dropdown.querySelector('.ytc-dropdown-menu');
        const label = dropdown.querySelector('.ytc-dropdown-label');
        const hiddenSelect = dropdown.querySelector('select');
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
            if (!isOpen) openDropdown();
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
                    const { cloudflareSyncIntervalMinutes, subscriptionSyncIntervalMinutes } = await import('./module.js');
                }

                if (hiddenSelect) hiddenSelect.value = value;

                closeDropdown();
                showStatus('Settings saved', 'success');
            });
        });
    });
}

export function closeAllDropdowns() {
    document.querySelectorAll('.ytc-dropdown-trigger.open').forEach(trigger => {
        trigger.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.ytc-dropdown-menu.open').forEach(menu => menu.classList.remove('open'));
}

export function setupTokenVisibilityToggle(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;

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

export function initializeSettingsModalTabs() {
    const modal = document.getElementById('popupSettingsModal');
    if (!modal || modal.dataset.tabsInitialized === 'true') return;
    modal.dataset.tabsInitialized = 'true';

    modal.addEventListener('click', (event) => {
        const tab = event.target.closest('.ytc-v2-settings-tab');
        if (!tab) return;

        const paneName = tab.getAttribute('data-pane');
        modal.querySelectorAll('.ytc-v2-settings-tab').forEach((item) => {
            item.classList.toggle('active', item === tab);
        });
        modal.querySelectorAll('.ytc-v2-settings-pane').forEach((pane) => {
            pane.classList.toggle('active', pane.getAttribute('data-pane') === paneName);
        });
    });
}

export function setupPopupSettingsModal() {
    const modal = document.getElementById('popupSettingsModal');
    const openButton = document.getElementById('popupSettingsButton');
    if (!modal || !openButton) return;

    const openModal = () => {
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
    };

    openButton.addEventListener('click', () => openModal());

    modal.addEventListener('click', (event) => {
        const action = event.target?.closest('[data-action="close-settings"]');
        if (action) closeModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-visible')) closeModal();
    });
}

export function setupPopupAboutModal() {
    const modal = document.getElementById('popupAboutModal');
    const openButton = document.getElementById('popupAboutButton');
    if (!modal || !openButton) return;

    const openModal = () => {
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
    };

    const closeModal = () => {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
    };

    openButton.addEventListener('click', () => openModal());

    modal.addEventListener('click', (event) => {
        const action = event.target?.closest('[data-action="close-about"]');
        if (action) closeModal();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('is-visible')) closeModal();
    });
}

export { showStatus } from './module.js';
