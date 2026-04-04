import {
    CLOUDFLARE_STORAGE_KEYS,
    SUBSCRIPTION_STORAGE_KEYS,
    cloudflareLastSyncAt,
    cloudflareAutoEnabled,
    cloudflareSyncIntervalMinutes,
    cloudflareSyncTriggered,
    subscriptionLastSyncAt,
    subscriptionAutoEnabled,
    subscriptionSyncIntervalMinutes,
    subscriptionSyncTriggered,
    showStatus,
    formatAccountKey,
    formatRemainingMinSec,
    sendRuntimeMessage,
    getUnifiedApiToken,
    normalizeWorkerBaseUrl,
    buildWorkerEndpoint,
    getUnifiedAutoSyncSettings,
    resolveYouTubeTabForHistory,
    downloadTextFile,
    SQL_EXPORT_TABLE_NAME,
    SQL_EXPORT_IDS_PER_FILE,
    SQL_EXPORT_DOWNLOAD_DELAY_MS,
    buildSqlMigrationFile,
    copyToClipboard
} from './module.js';

export function setToggleState(toggle, enabled) {
    if (!toggle) return;
    toggle.classList.toggle('active', Boolean(enabled));
}

export function renderCloudflareNextSyncCountdown() {
    const nextSyncEl = document.getElementById('cloudflareNextSyncIn');
    if (!nextSyncEl) return;

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

    if (remainingMs > 0) cloudflareSyncTriggered = false;
}

export function renderSubscriptionNextSyncCountdown() {
    const nextSyncEl = document.getElementById('subscriptionNextSyncIn');
    if (!nextSyncEl) return;

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

    if (remainingMs > 0) subscriptionSyncTriggered = false;
}

export async function loadCloudflareSyncSettings() {
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
        const cloudEndpoint = typeof result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] === 'string' ? result[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] : '';
        const subscriptionEndpoint = typeof result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] === 'string' ? result[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] : '';
        const baseUrl = normalizeWorkerBaseUrl(cloudEndpoint || subscriptionEndpoint);
        endpointInput.value = baseUrl;
    }

    if (tokenInput) {
        const cloudToken = typeof result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN] === 'string' ? result[CLOUDFLARE_STORAGE_KEYS.API_TOKEN] : '';
        const subscriptionToken = typeof result[SUBSCRIPTION_STORAGE_KEYS.API_TOKEN] === 'string' ? result[SUBSCRIPTION_STORAGE_KEYS.API_TOKEN] : '';
        tokenInput.value = cloudToken || subscriptionToken || '';
    }

    if (intervalSelect) {
        const cloudInterval = result[CLOUDFLARE_STORAGE_KEYS.INTERVAL_MINUTES];
        const subscriptionInterval = result[SUBSCRIPTION_STORAGE_KEYS.INTERVAL_MINUTES];
        const interval = Number.isFinite(cloudInterval) ? cloudInterval : (Number.isFinite(subscriptionInterval) ? subscriptionInterval : 30);
        intervalSelect.value = String(interval);
        cloudflareSyncIntervalMinutes = interval;
        subscriptionSyncIntervalMinutes = interval;
        updateDropdownSelection('cloudflareSyncIntervalDropdown', intervalSelect.value);
    }

    const cloudAutoEnabled = result[CLOUDFLARE_STORAGE_KEYS.AUTO_ENABLED];
    const subAutoEnabled = result[SUBSCRIPTION_STORAGE_KEYS.AUTO_ENABLED];
    const resolvedAutoEnabled = cloudAutoEnabled === undefined ? subAutoEnabled !== false : cloudAutoEnabled !== false;
    setToggleState(autoToggle, resolvedAutoEnabled);

    await refreshCloudflareSyncStatus();
}

export async function saveCloudflareSyncSettings() {
    const endpointInput = document.getElementById('cloudflareSyncEndpoint');
    let baseUrl = normalizeWorkerBaseUrl(typeof endpointInput?.value === 'string' ? endpointInput.value : '');
    if (!baseUrl && !endpointInput) {
        const stored = await chrome.storage.local.get([CLOUDFLARE_STORAGE_KEYS.ENDPOINT, SUBSCRIPTION_STORAGE_KEYS.ENDPOINT]);
        baseUrl = normalizeWorkerBaseUrl(stored[CLOUDFLARE_STORAGE_KEYS.ENDPOINT] || stored[SUBSCRIPTION_STORAGE_KEYS.ENDPOINT] || '');
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

    if (!updateResponse?.success) throw new Error(updateResponse?.error || 'Failed to update Cloudflare sync config');
    return { endpointUrl, apiToken, autoEnabled, intervalMinutes };
}

export function renderCloudflareSyncStatus(status = {}) {
    const pendingEl = document.getElementById('cloudflarePendingCount');
    const lastSyncEl = document.getElementById('cloudflareLastSyncAt');
    const infoEl = document.getElementById('cloudflareLastSyncInfo');
    const primaryAccountEl = document.getElementById('cloudflarePrimaryAccount');
    cloudflareAutoEnabled = status.autoEnabled !== false;
    cloudflareLastSyncAt = Number(status.lastAt) || 0;

    if (pendingEl) pendingEl.textContent = String(Number(status.pendingCount) || 0);
    if (primaryAccountEl) primaryAccountEl.textContent = formatAccountKey(status.primaryAccountKey);
    if (lastSyncEl) {
        const timestamp = cloudflareLastSyncAt;
        lastSyncEl.textContent = timestamp > 0 ? new Date(timestamp).toLocaleString() : 'Never';
    }
    if (infoEl) {
        if (status.status === 'error') { infoEl.textContent = status.error || 'Error'; return; }
        if (status.status === 'success') { infoEl.textContent = `Success (${Number(status.syncedCount) || 0} ids)`; return; }
        infoEl.textContent = status.status || 'Idle';
    }
    renderCloudflareNextSyncCountdown();
}

export async function refreshCloudflareSyncStatus() {
    try {
        const status = await sendRuntimeMessage({ type: 'GET_CLOUDFLARE_SYNC_STATUS' }, 30000);
        if (status?.success) renderCloudflareSyncStatus(status);
    } catch (_error) {
        // Keep existing UI values when background status is unavailable.
    }
}

export function setupCloudflareSyncControls() {
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

export async function syncToCloudflare() {
    const syncButton = document.getElementById('syncToCloudflare');
    if (!syncButton) {
        showStatus('Sync button not found', 'error');
        return;
    }

    const initialLabel = syncButton.textContent;
    syncButton.disabled = true;
    syncButton.textContent = 'Syncing...';

    try {
        showStatus('Syncing watched history to Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        if (!endpointUrl) throw new Error('Cloudflare Worker URL is required');

        showStatus('Uploading pending unsynced IDs to Cloudflare...', 'info');
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.youtube.com/*' });
        const response = await sendRuntimeMessage({
            type: 'SYNC_TO_CLOUDFLARE',
            endpointUrl,
            apiToken,
            activeTabId: activeTab?.id
        }, 90000);

        if (!response?.success) throw new Error(response?.error || 'Cloudflare sync failed');

        const syncedCount = Number.isFinite(response.syncedCount) ? response.syncedCount : 0;
        const host = typeof response.endpointHost === 'string' && response.endpointHost ? response.endpointHost : 'Cloudflare';
        showStatus(`Synced ${syncedCount} IDs to ${host}. Pending: ${Number(response.pendingCount) || 0}`, 'success');
        await refreshCloudflareSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to sync watched history', 'error');
        cloudflareSyncTriggered = false;
    } finally {
        syncButton.disabled = false;
        syncButton.textContent = initialLabel;
    }
}

export async function downloadFromCloudflare() {
    const button = document.getElementById('downloadFromCloudflare');
    if (!button) return;

    const initialLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Downloading...';

    try {
        showStatus('Downloading IDs from Cloudflare...', 'info');
        const { endpointUrl, apiToken } = await saveCloudflareSyncSettings();

        if (!endpointUrl) throw new Error('Cloudflare Worker URL is required');

        const response = await sendRuntimeMessage({
            type: 'DOWNLOAD_FROM_CLOUDFLARE',
            endpointUrl,
            apiToken
        }, 240000);

        if (!response?.success) throw new Error(response?.error || 'Cloudflare download failed');

        showStatus(`Downloaded ${Number(response.pulledCount) || 0} IDs, imported ${Number(response.importedCount) || 0} new IDs`, 'success');
        await refreshCloudflareSyncStatus();
    } catch (error) {
        showStatus(error?.message || 'Failed to download from Cloudflare', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

export async function lockPrimarySyncAccount() {
    const button = document.getElementById('lockPrimarySyncAccount');
    if (!button) return;

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

        try {
            cloudResponse = await sendRuntimeMessage({ type: 'LOCK_PRIMARY_SYNC_ACCOUNT', tabId: activeTab.id }, 30000);
            if (!cloudResponse?.success) throw new Error(cloudResponse?.error || 'Failed to lock watched history account');
            renderCloudflareSyncStatus(cloudResponse);
        } catch (error) {
            errors.push(error?.message || 'Failed to lock watched history account');
        }

        try {
            const subscriptionResponse = await sendRuntimeMessage({ type: 'LOCK_SUBSCRIPTION_SYNC_ACCOUNT', tabId: activeTab.id }, 30000);
            if (!subscriptionResponse?.success) throw new Error(subscriptionResponse?.error || 'Failed to lock subscription account');
            renderSubscriptionSyncStatus(subscriptionResponse);
        } catch (error) {
            errors.push(error?.message || 'Failed to lock subscription account');
        }

        if (errors.length > 0) showStatus(errors[0], 'error');
        else showStatus('Sync accounts locked to current YouTube tab', 'success');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

export async function exportSqlMigration() {
    const button = document.getElementById('exportSqlMigration');
    if (!button) return;

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
            if (!idsChunk.length) continue;

            const partIndex = part + 1;
            const sqlContent = buildSqlMigrationFile(idsChunk, partIndex, totalParts);
            const filename = totalParts === 1 ? 'youtube-watched-history-d1.sql' : `youtube-watched-history-d1-part-${String(partIndex).padStart(3, '0')}-of-${String(totalParts).padStart(3, '0')}.sql`;

            downloadTextFile(sqlContent, filename, 'application/sql;charset=utf-8');
            exportedIds += idsChunk.length;

            if (partIndex < totalParts) await new Promise((resolve) => setTimeout(resolve, SQL_EXPORT_DOWNLOAD_DELAY_MS));
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

export function setupSqlCopyButton() {
    const button = document.getElementById('copySqlDefaultCmd');
    if (!button) return;

    button.addEventListener('click', async () => {
        const code = document.getElementById('sqlDefaultCmd');
        if (!code) return;

        const copied = await copyToClipboard(code.textContent);
        if (copied) {
            button.classList.add('copied');
            button.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>Copied!`;
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>Copy`;
            }, 2000);
        }
    });
}

export { saveSubscriptionSyncSettings, renderSubscriptionSyncStatus, refreshSubscriptionSyncStatus, updateDropdownSelection };
