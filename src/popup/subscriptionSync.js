import {
    SUBSCRIPTION_STORAGE_KEYS,
    SUBSCRIPTION_MANAGER_STORAGE_KEYS,
    AUTOMATION_STORAGE_KEYS,
    subscriptionLastSyncAt,
    subscriptionAutoEnabled,
    subscriptionSyncIntervalMinutes,
    showStatus,
    formatAccountKey,
    formatRemainingMinSec,
    sendRuntimeMessage,
    getUnifiedApiToken,
    normalizeWorkerBaseUrl,
    buildWorkerEndpoint,
    getUnifiedAutoSyncSettings
} from './module.js';

export function setToggleState(toggle, enabled) {
    if (!toggle) return;
    toggle.classList.toggle('active', Boolean(enabled));
}

export async function loadSubscriptionSyncSettings() {
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
        endpointInput.value = typeof result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] === 'string' ? result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] : '';
    }

    if (intervalSelect) {
        const interval = result[SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES] || 60;
        intervalSelect.value = String(interval);
        subscriptionSyncIntervalMinutes = interval;
    }

    setToggleState(autoToggle, result[SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED] !== false);
    await refreshSubscriptionSyncStatus();
}

export async function saveSubscriptionSyncSettings() {
    const endpointInput = document.getElementById('subscriptionSyncEndpoint');
    let baseUrl = normalizeWorkerBaseUrl(typeof endpointInput?.value === 'string' ? endpointInput.value : '');
    if (!baseUrl) {
        const stored = await chrome.storage.local.get([
            SUBSCRIPTION_MANAGER_STORAGE_KEYS.ENDPOINT,
            SUBSCRIPTION_STORAGE_KEYS.ENDPOINT
        ]);
        baseUrl = normalizeWorkerBaseUrl(stored[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] || '');
    }
    const endpointUrl = buildWorkerEndpoint(baseUrl, 'subscriptions');
    const apiToken = getUnifiedApiToken();
    const { autoEnabled, intervalMinutes } = getUnifiedAutoSyncSettings();

    await chrome.storage.local.set({
        [SUBSCRIPTION_STORAGE_KEYS.ENDPOINT]: endpointUrl,
        [SUBSCRIPTION_STORAGE_KEYS.API_TOKEN]: apiToken,
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

    if (!updateResponse?.success) throw new Error(updateResponse?.error || 'Failed to update subscription sync config');
    return { endpointUrl, apiToken, autoEnabled, intervalMinutes };
}

export function renderSubscriptionSyncStatus(status = {}) {
    const pendingEl = document.getElementById('subscriptionPendingCount');
    const lastSyncEl = document.getElementById('subscriptionLastSyncAt');
    const infoEl = document.getElementById('subscriptionLastSyncInfo');
    const primaryAccountEl = document.getElementById('subscriptionPrimaryAccount');
    subscriptionAutoEnabled = status.autoEnabled !== false;
    subscriptionLastSyncAt = Number(status.lastAt) || 0;

    if (pendingEl) pendingEl.textContent = String(Number(status.pendingCount) || 0);
    if (primaryAccountEl) primaryAccountEl.textContent = formatAccountKey(status.primaryAccountKey);
    if (lastSyncEl) {
        const timestamp = subscriptionLastSyncAt;
        lastSyncEl.textContent = timestamp > 0 ? new Date(timestamp).toLocaleString() : 'Never';
    }
    if (infoEl) {
        if (status.status === 'error') { infoEl.textContent = status.error || 'Error'; return; }
        if (status.status === 'success') { infoEl.textContent = `Success (${Number(status.syncedCount) || 0} channels)`; return; }
        infoEl.textContent = status.status || 'Idle';
    }
    renderSubscriptionNextSyncCountdown();
}

export function renderSubscriptionNextSyncCountdown() {
    const nextSyncEl = document.getElementById('subscriptionNextSyncIn');
    if (!nextSyncEl) return;

    if (!subscriptionAutoEnabled) {
        nextSyncEl.textContent = 'Off';
        return;
    }

    if (!Number.isFinite(subscriptionLastSyncAt) || subscriptionLastSyncAt <= 0) {
        nextSyncEl.textContent = '--:--:--';
        return;
    }

    const intervalMs = subscriptionSyncIntervalMinutes * 60 * 1000;
    const nextSyncAt = subscriptionLastSyncAt + intervalMs;
    const remainingMs = nextSyncAt - Date.now();
    nextSyncEl.textContent = formatRemainingMinSec(remainingMs);
}

export async function refreshSubscriptionSyncStatus() {
    try {
        const status = await sendRuntimeMessage({ type: 'GET_SUBSCRIPTION_SYNC_STATUS' }, 30000);
        if (status?.success) renderSubscriptionSyncStatus(status);
    } catch (_error) {
        // Keep existing UI values when background status is unavailable.
    }
}

export function setupSubscriptionSyncControls() {
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

export async function syncSubscriptionsNow() {
    const syncButton = document.getElementById('syncSubscriptionsNow');
    if (!syncButton) return;

    const initialLabel = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.textContent = 'Syncing...';

    try {
        showStatus('Syncing subscriptions to Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveSubscriptionSyncSettings();

        if (!endpointUrl) throw new Error('Cloudflare Worker URL is required');

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'SYNC_SUBSCRIPTIONS_TO_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 120000);

        if (!response?.success) throw new Error(response?.error || 'Subscription sync failed');

        const syncedCount = Number.isFinite(response.syncedCount) ? response.syncedCount : 0;
        const host = typeof response.endpointHost === 'string' && response.endpointHost ? response.endpointHost : 'Cloudflare';
        showStatus(`Synced ${syncedCount} channels to ${host}. Pending: ${Number(response.pendingCount) || 0}`, 'success');
        await refreshSubscriptionSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to sync subscriptions', 'error');
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = initialLabel;
    }
}

export async function restoreSubscriptionsFromCloudflare() {
    const restoreButton = document.getElementById('restoreSubscriptions');
    if (!restoreButton) return;

    const initialLabel = restoreButton.textContent;
    restoreButton.disabled = true;
    restoreButton.textContent = 'Restoring...';

    try {
        showStatus('Restoring subscriptions from Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveSubscriptionSyncSettings();

        if (!endpointUrl) throw new Error('Cloudflare Worker URL is required');

        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'RESTORE_SUBSCRIPTIONS_FROM_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 240000);

        if (!response?.success) throw new Error(response?.error || 'Subscription restore failed');

        const host = typeof response.endpointHost === 'string' && response.endpointHost ? response.endpointHost : 'Cloudflare';
        const channelCount = Number(response.channelCount) || 0;
        const categoryCount = Number(response.categoryCount) || 0;
        const assignmentCount = Number(response.assignmentCount) || 0;

        showStatus(`Restored ${channelCount} channels, ${categoryCount} categories, ${assignmentCount} assignments from ${host}.`, 'success');
        await refreshSubscriptionSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to restore subscriptions', 'error');
    } finally {
        restoreButton.disabled = false;
        restoreButton.textContent = initialLabel;
    }
}
