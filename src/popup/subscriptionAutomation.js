import {
    AUTOMATION_STORAGE_KEYS,
    showStatus,
    normalizeCategories,
    normalizeAssignments,
    createCategory,
    generateRandomCategoryColor,
    escapeCsvValue,
    downloadTextFile,
    parseSubscriptionCsv,
    readFileText,
    buildChannelIndexes,
    resolveChannelIdFromIdentity,
    extractChannelIdFromUrl,
    extractHandleFromUrl,
    resolveChannelUrl,
    markSubscriptionPending
} from './module.js';

export function setToggleState(toggle, enabled) {
    if (!toggle) return;
    toggle.classList.toggle('active', Boolean(enabled));
}

export function setupSubscriptionAutomationControls() {
    const toggle = document.getElementById('subscriptionAutomationToggle');
    const timeInput = document.getElementById('subscriptionAutomationTime');
    const lookbackDropdown = document.getElementById('automationLookbackDropdown');
    const videosModeDropdown = document.getElementById('automationVideosModeDropdown');
    const videosPlaylistRow = document.getElementById('automationVideosPlaylistRow');
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
        timeInput.addEventListener('change', async () => { await saveAutomationSettings(); });
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
        splitCountInput.addEventListener('change', async () => { await saveAutomationSettings(); });
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

export async function saveAutomationSettings() {
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

export async function loadAutomationSettings() {
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

    if (toggle) setToggleState(toggle, result[AUTOMATION_STORAGE_KEYS.ENABLED] === true);
    if (timeInput) timeInput.value = result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30';

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

    if (shortsPlaylistDropdown) shortsPlaylistDropdown.dataset.value = result[AUTOMATION_STORAGE_KEYS.SHORTS_PLAYLIST] || 'WL';

    if (videosModeDropdown) {
        const modeValue = result[AUTOMATION_STORAGE_KEYS.VIDEOS_MODE] || 'single';
        videosModeDropdown.dataset.value = modeValue;
        const option = videosModeDropdown.querySelector(`[data-value="${modeValue}"]`);
        videosModeDropdown.querySelectorAll('.ytc-dropdown-option').forEach(o => o.classList.remove('selected'));
        if (option) {
            option.classList.add('selected');
            videosModeDropdown.querySelector('.ytc-dropdown-label').textContent = option.textContent;
        }
        if (videosPlaylistRow) videosPlaylistRow.style.display = modeValue === 'split' ? 'none' : 'flex';
        if (splitCountRow) splitCountRow.style.display = modeValue === 'split' ? 'flex' : 'none';
    }

    if (videosPlaylistDropdown) videosPlaylistDropdown.dataset.value = result[AUTOMATION_STORAGE_KEYS.VIDEOS_PLAYLIST] || 'WL';
    if (splitCountInput) splitCountInput.value = result[AUTOMATION_STORAGE_KEYS.SPLIT_COUNT] || 20;
}

export async function loadAutomationStats() {
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
            const formatted = date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            lastRunEl.textContent = formatted;
        } else {
            lastRunEl.textContent = 'Never';
        }
    }

    if (statusEl) {
        const status = result[AUTOMATION_STORAGE_KEYS.LAST_STATUS];
        if (status === 'success') { statusEl.textContent = 'Success'; statusEl.style.color = 'var(--ytc-v2-green)'; }
        else if (status === 'partial') { statusEl.textContent = 'Partial'; statusEl.style.color = 'var(--ytc-v2-amber)'; }
        else if (status === 'failed') { statusEl.textContent = 'Failed'; statusEl.style.color = 'var(--ytc-v2-red)'; }
        else { statusEl.textContent = '-'; statusEl.style.color = 'var(--ytc-v2-text)'; }
    }

    if (videosEl) videosEl.textContent = result[AUTOMATION_STORAGE_KEYS.LAST_VIDEOS_COUNT] || 0;
    if (shortsEl) shortsEl.textContent = result[AUTOMATION_STORAGE_KEYS.LAST_SHORTS_COUNT] || 0;

    if (nextRunEl) {
        const now = new Date();
        const timeStr = result[AUTOMATION_STORAGE_KEYS.TIME] || '19:30';
        const [hours, minutes] = timeStr.split(':').map(Number);
        let nextRun = new Date(now);
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
        const todayOrTomorrow = nextRun.toDateString() === now.toDateString() ? 'Today' : 'Tomorrow';
        nextRunEl.textContent = `${todayOrTomorrow} ${timeStr}`;
    }
}

export function renderAutomationNextRunCountdown() {
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
        if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);

        const diff = nextRun - now;
        const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
        const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        nextRunEl.textContent = `in ${hoursLeft}h ${minutesLeft}m`;
        nextRunEl.style.color = 'var(--ytc-v2-amber)';
    });
}

export async function exportSubscriptionCsvFromPopup() {
    const button = document.getElementById('exportSubscriptionCsv');
    if (!button) return;
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
        if (!channels.length) throw new Error('Open the subscription manager in a YouTube tab first to fetch channels.');
        const categories = normalizeCategories(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES]);
        const assignments = normalizeAssignments(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS]);
        const categoryLookup = new Map(categories.map((category) => [category.id, category.name]));

        const rows = [];
        const rowMap = new Map();
        channels.forEach((channel) => {
            const channelId = channel?.channelId || '';
            if (!channelId) return;
            const url = resolveChannelUrl(channel);
            if (!url) return;
            const assigned = Array.isArray(assignments[channelId]) ? assignments[channelId] : [];
            if (assigned.length === 0) {
                if (!rowMap.has(url)) rowMap.set(url, new Set());
                return;
            }
            const set = rowMap.get(url) || new Set();
            assigned.forEach((categoryId) => {
                const name = categoryLookup.get(categoryId);
                if (name) set.add(name);
            });
            if (!rowMap.has(url)) rowMap.set(url, set);
        });

        rowMap.forEach((set, url) => {
            const categoryList = Array.isArray(set) ? set : Array.from(set || []);
            const category = categoryList.length > 0 ? categoryList.sort().join('; ') : '';
            rows.push({ url, category });
        });

        if (rows.length === 0) throw new Error('No channels found to export.');

        const lines = ['channel_url,category'];
        rows.forEach((row) => lines.push(`${escapeCsvValue(row.url)},${escapeCsvValue(row.category)}`));

        downloadTextFile(lines.join('\n'), 'yt-commander-subscriptions.csv', 'text/csv;charset=utf-8');
        showStatus(`Exported ${rows.length} row(s).`, 'success');
    } catch (error) {
        showStatus(error?.message || 'Failed to export CSV', 'error');
    } finally {
        button.disabled = false;
        button.textContent = initialLabel;
    }
}

export async function importSubscriptionCsvFromPopup(file) {
    if (!file) return;
    showStatus('Importing CSV...', 'info');

    const stored = await chrome.storage.local.get([
        SUBSCRIPTION_MANAGER_STORAGE_KEYS.SNAPSHOT,
        SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES,
        SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS
    ]);
    const snapshot = stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.SNAPSHOT];
    const channels = Array.isArray(snapshot?.channels) ? snapshot.channels : [];
    if (!channels.length) throw new Error('Open the subscription manager in a YouTube tab first to fetch channels.');

    const categories = normalizeCategories(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.CATEGORIES]);
    const assignments = normalizeAssignments(stored[SUBSCRIPTION_MANAGER_STORAGE_KEYS.ASSIGNMENTS]);
    const indexes = buildChannelIndexes(channels);

    const text = await readFileText(file);
    const { rows, skipped } = parseSubscriptionCsv(text);
    if (rows.length === 0) throw new Error('No valid rows found in CSV.');

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
        if (!channelId) { missingChannels += 1; return; }
        if (!rawCategory) return;

        const categoryNames = rawCategory.split(/[;|]+/).map((name) => name.trim()).filter(Boolean);
        if (categoryNames.length === 0) return;

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
    if (newCategoryIds.length > 0) summary.push(`Added ${newCategoryIds.length} category(s)`);
    if (missingChannels > 0) summary.push(`${missingChannels} channel(s) not found`);
    if (skipped > 0) summary.push(`${skipped} invalid row(s) skipped`);
    showStatus(`${summary.join('. ')}.`, 'success');
}

export function handleSubscriptionCsvImport(event) {
    const input = event.target;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file) return;
    importSubscriptionCsvFromPopup(file).catch((error) => {
        showStatus(error?.message || 'Failed to import CSV.', 'error');
    });
}

export { refreshSubscriptionSyncStatus } from './subscriptionSync.js';
