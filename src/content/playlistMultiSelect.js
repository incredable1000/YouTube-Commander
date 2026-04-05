/**
 * Playlist Multi-Select (Isolated World)
 * Select feed cards and save selected videos to playlists.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver, debounce } from './utils/events.js';
import {
    BRIDGE_SOURCE,
    REQUEST_TYPE,
    RESPONSE_TYPE,
    ACTIONS,
    FEED_RENDERER_SELECTOR,
    VIDEO_LINK_SELECTOR,
    VIDEO_ID_PATTERN,
    MASTHEAD_SLOT_CLASS,
    MASTHEAD_BUTTON_CLASS,
    MASTHEAD_BADGE_CLASS,
    HOST_CLASS,
    HOST_SELECTED_CLASS,
    OVERLAY_CLASS,
    ACTION_BAR_CLASS,
    PLAYLIST_PANEL_CLASS,
    CREATE_BACKDROP_CLASS,
    CREATE_MODAL_CLASS,
    ROOT_SELECTION_CLASS,
    REQUEST_TIMEOUT_MS,
    PROCESS_CHUNK_SIZE,
    STATUS_KIND,
    VISIBILITY_OPTIONS,
    PLAYLIST_ID_PATTERN,
} from './playlist-multi-select/constants.js';
import { ICONS } from '../shared/constants.js';
import {
    createSvgIcon,
    createMastheadIcon,
    createBookmarkIcon,
    createWatchLaterIcon,
    createCloseIcon,
    createPlusIcon,
    createPlaylistAddIcon,
    createChevronDownIcon,
    createCheckIcon,
    createRemoveIcon,
    createSelectAllIcon,
    createUnselectAllIcon,
    createSplitIcon,
} from './playlist-multi-select/icons.js';
import {
    extractVideoId,
    isEligiblePage,
    resolveMastheadMountPoint,
    getCurrentPlaylistId,
    isPlaylistCollectionPage,
    getRemoveActionLabel,
    isPlaylistsPage,
    collectRenderedPlaylistIds,
} from './playlist-multi-select/pageContext.js';
import { createBridgeClient } from './playlist-multi-select/bridge.js';
import { createSelectionRangeController } from './playlist-multi-select/selectionRange.js';
import { isVideoWatched } from './watchedHistory.js';
import { state, resetState } from './playlist-multi-select/state.js';
import { clamp, visibilityLabel, visibilityIconPath } from './playlist-multi-select/utils.js';
import {
    ensureMastheadButton,
    updateMastheadVisibility,
    updateMastheadButtonState,
} from './playlist-multi-select/masthead-ui.js';
import { ensureActionBar } from './playlist-multi-select/action-bar.js';
import { ensurePlaylistPanel } from './playlist-multi-select/playlist-panel.js';
import { ensureCreateModal } from './playlist-multi-select/create-modal.js';
import {
    ensureSplitModal,
    closeSplitModal as closeSplitModalFn,
    updateSplitModalState as updateSplitModalStateFn,
    setSplitStatus as setSplitStatusFn,
} from './playlist-multi-select/split-modal.js';

const logger = createLogger('PlaylistMultiSelect');
const bridgeClient = createBridgeClient({
    source: BRIDGE_SOURCE,
    requestType: REQUEST_TYPE,
    responseType: RESPONSE_TYPE,
    timeoutMs: REQUEST_TIMEOUT_MS,
    requestPrefix: 'ytc-playlist',
});

const DECORATE_MAX_RETRIES = 3;
const DECORATE_RETRY_DELAY_MS = 320;

/**
 * Generate a unique playlist title by finding the highest "Playlist N" number
 * among existing playlists and incrementing by 1.
 * @returns {Promise<string>}
 */
async function generateQuickPlaylistTitle() {
    try {
        const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, {});
        const playlists = Array.isArray(response?.playlists) ? response.playlists : [];

        let maxNum = 0;
        playlists.forEach((playlist) => {
            const title = playlist?.title || '';
            const match = title.match(/^Playlist\s+(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        });

        return `Playlist ${maxNum + 1}`;
    } catch (error) {
        logger.warn('Failed to get existing playlists for title generation', error);
        return `Playlist ${Date.now() % 10000}`;
    }
}

/**
 * Ensure all action UI elements exist.
 */
function ensureActionUi() {
    const actionBarHandlers = {
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleActionWatchLaterClick,
        handleActionSaveClick,
        handleActionQuickCreateClick,
        handleSplitClick,
        handleActionRemoveClick,
        handleActionRemoveWatchedClick,
        handleActionDeletePlaylistsClick,
        handleActionSelectAllClick,
        handleActionUnselectAllClick,
        handleOpenInNewTab,
        handleActionExitButtonClick,
    };
    const panelHandlers = {
        closePlaylistPanel,
        handlePlaylistListClick,
        handlePlaylistNewButtonClick,
    };
    const createModalHandlers = {
        handleCreateBackdropMouseDown,
        handleCreateTitleKeydown,
        handleCreateVisibilityButtonClick,
        handleCreateVisibilityMenuClick,
        closeCreateModal,
        handleCreateSubmitClick,
        renderCreateVisibilityOptions,
        updateCreateModalState,
    };
    ensureActionBar(state, actionBarHandlers);
    ensurePlaylistPanel(state, panelHandlers);
    ensureCreateModal(state, createModalHandlers, visibilityLabel);
}

/**
 * Position the playlist panel relative to the save action.
 */
function positionPlaylistPanel() {
    if (!state.playlistPanelVisible || !state.playlistPanel || !state.actionSaveButton) {
        return;
    }

    positionElementAboveAnchor(state.playlistPanel, state.actionSaveButton);
}

/**
 * Position a floating element above an anchor.
 * @param {HTMLElement} element
 * @param {HTMLElement} anchor
 */
function positionElementAboveAnchor(element, anchor) {
    if (!element || !anchor) {
        return;
    }

    const spacing = 10;
    const viewportGap = 10;
    const anchorRect = anchor.getBoundingClientRect();
    const rect = element.getBoundingClientRect();

    const maxLeft = Math.max(viewportGap, window.innerWidth - rect.width - viewportGap);
    const left = clamp(anchorRect.right - rect.width, viewportGap, maxLeft);

    let top = anchorRect.top - rect.height - spacing;
    if (top < viewportGap) {
        top = clamp(
            anchorRect.bottom + spacing,
            viewportGap,
            window.innerHeight - rect.height - viewportGap
        );
    }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
}

/**
 * Render visibility options for create modal.
 */
function renderCreateVisibilityOptions() {
    if (!state.createVisibilityMenu) {
        return;
    }

    state.createVisibilityMenu.innerHTML = '';

    VISIBILITY_OPTIONS.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'yt-commander-playlist-create-modal__visibility-option';
        button.setAttribute('role', 'option');
        button.setAttribute('data-visibility', option.value);

        const iconWrap = document.createElement('span');
        iconWrap.className = 'yt-commander-playlist-create-modal__visibility-option-icon';
        iconWrap.appendChild(createSvgIcon(visibilityIconPath(option.value)));

        const textWrap = document.createElement('span');
        textWrap.className = 'yt-commander-playlist-create-modal__visibility-option-text';

        const optionTitle = document.createElement('span');
        optionTitle.className = 'yt-commander-playlist-create-modal__visibility-option-title';
        optionTitle.textContent = option.label;

        const description = document.createElement('span');
        description.className = 'yt-commander-playlist-create-modal__visibility-option-desc';
        description.textContent = option.description;

        const check = document.createElement('span');
        check.className = 'yt-commander-playlist-create-modal__visibility-option-check';
        check.appendChild(createCheckIcon());

        textWrap.appendChild(optionTitle);
        textWrap.appendChild(description);

        button.appendChild(iconWrap);
        button.appendChild(textWrap);
        button.appendChild(check);
        state.createVisibilityMenu.appendChild(button);
    });
}

/**
 * Update create modal controls.
 */
function updateCreateModalState() {
    if (
        !state.createVisibilityValue ||
        !state.createVisibilityMenu ||
        !state.createVisibilityButton
    ) {
        return;
    }

    state.createVisibilityValue.textContent = visibilityLabel(state.createVisibility);
    state.createVisibilityButton.setAttribute(
        'aria-expanded',
        state.state.createVisibilityMenuVisible ? 'true' : 'false'
    );
    state.createVisibilityMenu.classList.toggle(
        'is-visible',
        state.state.createVisibilityMenuVisible
    );

    const options = state.createVisibilityMenu.querySelectorAll(
        '.yt-commander-playlist-create-modal__visibility-option'
    );
    options.forEach((option) => {
        const value = option.getAttribute('data-visibility') || '';
        const selected = value === state.createVisibility;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    const hasTitle = Boolean(state.createTitleInput?.value.trim());
    const hasSelection = state.selectedVideoIds.size > 0;

    if (state.createTitleInput) {
        state.createTitleInput.disabled = state.createSubmitting;
    }

    if (state.createVisibilityButton) {
        state.createVisibilityButton.disabled = state.createSubmitting;
    }

    if (state.createCollaborateInput) {
        state.createCollaborateInput.disabled = state.createSubmitting;
    }

    if (state.createCancelButton) {
        state.createCancelButton.disabled = state.createSubmitting;
    }

    if (state.createCreateButton) {
        state.createCreateButton.disabled = state.createSubmitting || !hasTitle || !hasSelection;
    }
}

/**
 * Toggle action bar visibility based on mode.
 */
function syncActionBarVisibility() {
    const visible = state.isEnabled && state.selectionMode && isEligiblePage();
    state.actionBar?.classList.toggle('is-visible', visible);

    if (!visible) {
        closePlaylistPanel();
        closeCreateModal(true);
        resetActionBarPosition();
    }
}

/**
 * Reset action bar position to default centered position.
 */
function resetActionBarPosition() {
    if (!state.actionBar) {
        return;
    }

    state.isDragPositioned = false;
    state.actionBar.style.left = '';
    state.actionBar.style.top = '';
    state.actionBar.style.bottom = '';
    state.actionBar.style.transform = '';
}

/**
 * Set message shown in playlist panel.
 * @param {string} message
 * @param {'info'|'success'|'error'} kind
 */
function setStatusMessage(message, kind = STATUS_KIND.INFO) {
    if (state.statusTimer) {
        clearTimeout(state.statusTimer);
        state.statusTimer = null;
    }

    const text = typeof message === 'string' ? message : '';
    if (!state.playlistPanelStatus) {
        return;
    }

    state.playlistPanelStatus.textContent = text;
    state.playlistPanelStatus.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');
    if (text) {
        state.playlistPanelStatus.classList.add('is-visible', `is-${kind}`);
    }

    if (!text) {
        return;
    }

    state.statusTimer = window.setTimeout(() => {
        clearStatusMessage();
    }, 4500);
}

async function confirmPlaylistSelection(playlistId, videoIds, attempts = 3) {
    const probeVideoId = Array.isArray(videoIds)
        ? videoIds.find((id) => VIDEO_ID_PATTERN.test(id))
        : '';
    if (!playlistId || !probeVideoId) {
        return false;
    }

    for (let i = 0; i < attempts; i += 1) {
        if (i > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        try {
            const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, {
                videoIds: [probeVideoId],
            });
            const playlists = Array.isArray(response?.playlists) ? response.playlists : [];
            const match = playlists.find((playlist) => playlist?.id === playlistId);
            if (match?.isSelected === true) {
                return true;
            }
        } catch (_error) {
            // Ignore probe errors and retry.
        }
    }

    return false;
}

/**
 * Clear all status texts.
 */
function clearStatusMessage() {
    if (state.statusTimer) {
        clearTimeout(state.statusTimer);
        state.statusTimer = null;
    }

    [state.playlistPanelStatus, state.createStatus].forEach((node) => {
        if (!node) {
            return;
        }
        node.textContent = '';
        node.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');
    });
}

/**
 * Show progress bar with current save progress.
 * @param {number} processed Number of videos processed
 * @param {number} total Total number of videos
 * @param {string} label Current operation label
 */
function showSaveProgress(processed, total, label) {
    if (
        !state.progressBar ||
        !state.progressBarFill ||
        !state.progressBarLabel ||
        !state.progressBarCount
    ) {
        return;
    }

    const percentage = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    state.progressBar.hidden = false;
    state.progressBarLabel.textContent = label || 'Saving...';
    state.progressBarFill.style.width = `${percentage}%`;
    state.progressBarCount.textContent = `${processed} / ${total}`;
}

/**
 * Hide progress bar.
 */
function hideSaveProgress() {
    if (!state.progressBar) {
        return;
    }

    console.log('[Progress] Hiding');
    state.progressBar.hidden = true;
}

function resolveActivePageRoot() {
    const pageManager = document.querySelector('ytd-page-manager');
    if (!pageManager) {
        return document;
    }

    const candidates = pageManager.querySelectorAll('ytd-browse, ytd-search, ytd-channel');
    for (const candidate of candidates) {
        if (!(candidate instanceof Element)) {
            continue;
        }
        if (candidate.hasAttribute('hidden') || candidate.getAttribute('hidden') === 'true') {
            continue;
        }
        const style = window.getComputedStyle(candidate);
        if (style.display === 'none' || style.visibility === 'hidden') {
            continue;
        }
        if (candidate.getClientRects().length === 0) {
            continue;
        }
        return candidate;
    }

    return pageManager;
}

/**
 * Collect currently rendered selectable video ids.
 * @returns {string[]}
 */
function collectRenderedVideoIds() {
    const ids = new Set();
    const root = resolveActivePageRoot();
    root.querySelectorAll(`.${HOST_CLASS}[data-yt-commander-video-id]`).forEach((host) => {
        const videoId = host.getAttribute('data-yt-commander-video-id') || '';
        if (VIDEO_ID_PATTERN.test(videoId)) {
            ids.add(videoId);
        }
    });
    return Array.from(ids);
}

/**
 * Reset action-bar counters to zero.
 */
function resetActionCounters() {
    if (state.actionCount) {
        state.actionCount.textContent = '0';
    }

    if (state.actionTotalCount) {
        state.actionTotalCount.textContent = '0';
    }

    state.cachedPageVideoCount = 0;
}

/**
 * Sync remove-action visibility/label based on current route.
 */
function syncRemoveActionButton() {
    const canRemove = isPlaylistCollectionPage();
    if (!state.actionRemoveButton) {
        return;
    }

    const label = getRemoveActionLabel();
    state.actionRemoveButton.hidden = !canRemove;
    state.actionRemoveButton.setAttribute('aria-label', label);
    state.actionRemoveButton.setAttribute('title', label);
    state.actionRemoveButton.setAttribute('data-tooltip', label);

    if (state.actionRemoveWatchedButton) {
        state.actionRemoveWatchedButton.hidden = !canRemove;
    }
}

/**
 * Update action controls based on selection and loading/state.submitting states.
 */
function updateActionUiState() {
    const isPlaylistPage = isPlaylistsPage();
    const selectedVideoCount = state.selectedVideoIds.size;
    const selectedPlaylistCount = state.selectedPlaylistIds.size;
    const pageVideoCount = state.cachedPageVideoCount;
    const pagePlaylistCount = collectRenderedPlaylistIds().length;

    const selectedCount = isPlaylistPage ? selectedPlaylistCount : selectedVideoCount;
    const pageCount = isPlaylistPage ? pagePlaylistCount : pageVideoCount;

    if (state.actionCount) {
        state.actionCount.textContent = selectedCount > 999 ? '999+' : String(selectedCount);
    }

    if (state.actionTotalCount) {
        state.actionTotalCount.textContent = pageCount > 9999 ? '9999+' : String(pageCount);
    }

    if (state.playlistPanelCount) {
        state.playlistPanelCount.textContent = `${selectedCount} selected`;
    }

    if (state.actionSaveButton) {
        state.actionSaveButton.hidden = isPlaylistPage;
        state.actionSaveButton.disabled =
            selectedCount === 0 ||
            state.loadingPlaylists ||
            state.submitting ||
            state.createSubmitting;
    }

    if (state.actionQuickCreateButton) {
        state.actionQuickCreateButton.hidden = isPlaylistPage;
        state.actionQuickCreateButton.disabled =
            selectedCount === 0 ||
            state.loadingPlaylists ||
            state.submitting ||
            state.createSubmitting;
    }

    if (state.actionSplitButton) {
        state.actionSplitButton.hidden = isPlaylistPage;
        state.actionSplitButton.disabled = selectedCount === 0 || state.submitting;
    }

    if (state.actionWatchLaterButton) {
        state.actionWatchLaterButton.hidden = isPlaylistPage;
        state.actionWatchLaterButton.disabled =
            selectedCount === 0 ||
            state.loadingPlaylists ||
            state.submitting ||
            state.createSubmitting;
    }

    if (state.actionSelectAllButton) {
        state.actionSelectAllButton.hidden = isPlaylistPage;
        state.actionSelectAllButton.disabled =
            pageCount === 0 || state.loadingPlaylists || state.submitting || state.createSubmitting;
        state.actionSelectAllButton.classList.toggle('is-active', state.selectAllMode);
    }

    if (state.actionUnselectAllButton) {
        state.actionUnselectAllButton.hidden = isPlaylistPage;
        state.actionUnselectAllButton.disabled =
            selectedCount === 0 ||
            state.loadingPlaylists ||
            state.submitting ||
            state.createSubmitting;
    }

    if (state.actionOpenAllButton) {
        state.actionOpenAllButton.hidden = isPlaylistPage;
        state.actionOpenAllButton.disabled = selectedCount === 0 || state.submitting;
    }

    syncRemoveActionButton();
    const isViewPlaylistPage = isPlaylistCollectionPage();
    if (state.actionRemoveButton) {
        state.actionRemoveButton.hidden = !isViewPlaylistPage;
        state.actionRemoveButton.disabled =
            selectedCount === 0 ||
            state.loadingPlaylists ||
            state.submitting ||
            state.createSubmitting;
    }

    if (state.actionRemoveWatchedButton) {
        state.actionRemoveWatchedButton.hidden = !isViewPlaylistPage;
        state.actionRemoveWatchedButton.disabled = state.submitting || state.loadingPlaylists;
    }

    if (state.actionDeletePlaylistsButton) {
        state.actionDeletePlaylistsButton.hidden = !isPlaylistPage;
        state.actionDeletePlaylistsButton.disabled =
            selectedPlaylistCount === 0 || state.submitting || state.loadingPlaylists;
    }

    if (state.playlistPanelCloseButton) {
        state.playlistPanelCloseButton.disabled = state.submitting;
    }

    if (state.playlistPanelNewButton) {
        state.playlistPanelNewButton.disabled =
            selectedCount === 0 ||
            state.submitting ||
            state.loadingPlaylists ||
            state.createSubmitting;
    }

    state.playlistPanel?.classList.toggle('is-busy', state.loadingPlaylists || state.submitting);

    if (selectedCount === 0) {
        closePlaylistPanel();
        closeCreateModal();
    }

    updateMastheadButtonState(state);
    updateCreateModalState();
}

/**
 * Open playlist panel above action bar.
 */
async function openPlaylistPanel() {
    if (!state.selectionMode || state.selectedVideoIds.size === 0 || state.createSubmitting) {
        return;
    }

    ensureActionUi();

    if (!state.playlistPanel || !state.actionSaveButton) {
        return;
    }

    state.playlistPanel.classList.add('is-visible');
    state.playlistPanelVisible = true;
    updateActionUiState();
    positionPlaylistPanel();
    renderPlaylistLoading();
    await loadPlaylistsForPanel();
}

/**
 * Close playlist panel.
 */
function closePlaylistPanel() {
    state.playlistPanelVisible = false;
    state.playlistPanel?.classList.remove('is-visible');
    state.lastPlaylistProbeVideoId = '';
    state.playlistOptions = [];
    state.playlistMap.clear();
    state.selectedPlaylistIds.clear();
}

/**
 * Render loading state in playlist panel.
 */
function renderPlaylistLoading() {
    if (!state.playlistPanelList) {
        return;
    }

    state.playlistPanelList.innerHTML =
        '<div class="yt-commander-playlist-panel__empty">Loading playlists...</div>';
    positionPlaylistPanel();
}

/**
 * Render empty/error message in playlist panel.
 * @param {string} message
 */
function renderPlaylistEmpty(message) {
    if (!state.playlistPanelList) {
        return;
    }

    state.playlistPanelList.innerHTML = `<div class="yt-commander-playlist-panel__empty">${message}</div>`;
    positionPlaylistPanel();
}

/**
 * Build thumbnail letter for playlist item.
 * @param {string} title
 * @returns {string}
 */
function readPlaylistInitial(title) {
    const safe = typeof title === 'string' ? title.trim() : '';
    if (!safe) {
        return 'P';
    }
    return safe.charAt(0).toUpperCase();
}

/**
 * Render playlist rows in panel.
 */
function renderPlaylistOptions() {
    if (!state.playlistPanelList) {
        return;
    }

    if (!Array.isArray(state.playlistOptions) || state.playlistOptions.length === 0) {
        renderPlaylistEmpty('No playlists found.');
        return;
    }

    state.playlistPanelList.innerHTML = '';

    state.playlistOptions.forEach((playlist) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'yt-commander-playlist-panel__item';
        row.setAttribute('role', 'option');
        row.setAttribute('data-playlist-id', playlist.id);

        const thumb = document.createElement('span');
        thumb.className = 'yt-commander-playlist-panel__item-thumb';
        const thumbnailUrl = typeof playlist.thumbnailUrl === 'string' ? playlist.thumbnailUrl : '';
        const titleInitial = readPlaylistInitial(playlist.title);
        if (thumbnailUrl) {
            const image = document.createElement('img');
            image.src = thumbnailUrl;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                image.remove();
                thumb.textContent = titleInitial;
            });
            thumb.appendChild(image);
        } else {
            thumb.textContent = titleInitial;
        }

        const body = document.createElement('span');
        body.className = 'yt-commander-playlist-panel__item-body';

        const rowTitle = document.createElement('span');
        rowTitle.className = 'yt-commander-playlist-panel__item-title';
        rowTitle.textContent = playlist.title || 'Untitled playlist';

        const meta = document.createElement('span');
        meta.className = 'yt-commander-playlist-panel__item-meta';
        meta.textContent = playlist.privacy || 'Private';

        body.appendChild(rowTitle);
        body.appendChild(meta);

        const bookmark = document.createElement('span');
        bookmark.className = 'yt-commander-playlist-panel__item-bookmark';
        bookmark.appendChild(createBookmarkIcon());

        row.appendChild(thumb);
        row.appendChild(body);
        row.appendChild(bookmark);
        state.playlistPanelList.appendChild(row);
    });

    syncPlaylistSelectionVisuals();
    positionPlaylistPanel();
}

/**
 * Update a playlist row thumbnail in-place.
 * @param {string} playlistId
 * @param {string} thumbnailUrl
 */
function updatePlaylistRowThumbnail(playlistId, thumbnailUrl) {
    if (!state.playlistPanelList || !playlistId || !thumbnailUrl) {
        return;
    }

    const row = state.playlistPanelList.querySelector(
        `.yt-commander-playlist-panel__item[data-playlist-id="${playlistId}"]`
    );
    if (!row) {
        return;
    }

    const thumb = row.querySelector('.yt-commander-playlist-panel__item-thumb');
    if (!(thumb instanceof Element)) {
        return;
    }

    const titleNode = row.querySelector('.yt-commander-playlist-panel__item-title');
    const titleInitial = readPlaylistInitial(titleNode?.textContent || '');

    while (thumb.firstChild) {
        thumb.removeChild(thumb.firstChild);
    }

    const image = document.createElement('img');
    image.src = thumbnailUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
        image.remove();
        thumb.textContent = titleInitial;
    });
    thumb.appendChild(image);
}

/**
 * Fetch missing thumbnails for playlists shown in the panel.
 */
async function loadPlaylistThumbnailsForPanel() {
    if (
        !state.playlistPanelVisible ||
        state.loadingPlaylists ||
        !Array.isArray(state.playlistOptions)
    ) {
        return;
    }

    const missing = state.playlistOptions
        .filter((playlist) => playlist?.id && !playlist.thumbnailUrl)
        .map((playlist) => playlist.id);

    if (missing.length === 0) {
        return;
    }

    try {
        const response = await sendBridgeRequest(ACTIONS.GET_PLAYLIST_THUMBNAILS, {
            playlistIds: missing,
        });
        const thumbnailsById = response?.thumbnailsById || {};
        Object.entries(thumbnailsById).forEach(([playlistId, thumbnailUrl]) => {
            if (typeof thumbnailUrl !== 'string' || !thumbnailUrl) {
                return;
            }
            const entry = state.playlistOptions.find((playlist) => playlist?.id === playlistId);
            if (entry) {
                entry.thumbnailUrl = thumbnailUrl;
            }
            updatePlaylistRowThumbnail(playlistId, thumbnailUrl);
        });
    } catch (error) {
        logger.debug('Failed to load playlist thumbnails', error);
    }
}

/**
 * Sync selected class for playlist rows.
 */
function syncPlaylistSelectionVisuals() {
    if (!state.playlistPanelList) {
        return;
    }

    const rows = state.playlistPanelList.querySelectorAll('.yt-commander-playlist-panel__item');
    rows.forEach((row) => {
        const playlistId = row.getAttribute('data-playlist-id') || '';
        const selected = state.selectedPlaylistIds.has(playlistId);
        row.classList.toggle('is-selected', selected);
        row.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
}

/**
 * Load playlists from main-world API for panel.
 */
async function loadPlaylistsForPanel() {
    if (
        !state.playlistPanelVisible ||
        state.selectedVideoIds.size === 0 ||
        state.loadingPlaylists
    ) {
        return;
    }

    const selectedIds = Array.from(state.selectedVideoIds);
    const probeVideoId = selectedIds[0] || '';

    if (
        probeVideoId &&
        probeVideoId === state.lastPlaylistProbeVideoId &&
        state.playlistOptions.length > 0
    ) {
        state.lastPlaylistProbeVideoId = '';
    }

    state.loadingPlaylists = true;
    updateActionUiState();
    renderPlaylistLoading();

    try {
        const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, {
            videoIds: selectedIds,
        });

        state.playlistOptions = Array.isArray(response?.playlists) ? response.playlists : [];
        state.playlistMap.clear();
        state.selectedPlaylistIds.clear();
        state.lastPlaylistProbeVideoId = probeVideoId;

        state.playlistOptions.forEach((playlist) => {
            if (!playlist?.id) {
                return;
            }
            state.playlistMap.set(playlist.id, playlist);
            if (playlist.isSelected === true) {
                state.selectedPlaylistIds.add(playlist.id);
            }
        });

        renderPlaylistOptions();
        void loadPlaylistThumbnailsForPanel();
    } catch (error) {
        logger.warn('Failed to load playlists', error);
        renderPlaylistEmpty('Failed to load playlists.');
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to load playlists.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.loadingPlaylists = false;
        updateActionUiState();
    }
}

/**
 * Save selected videos to one playlist.
 * @param {string} playlistId
 */
async function saveSelectionToPlaylist(playlistId) {
    if (!playlistId || state.submitting || state.createSubmitting) {
        return;
    }

    const videoIds = Array.from(state.selectedVideoIds);
    if (videoIds.length === 0) {
        setStatusMessage('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    state.submitting = true;
    updateActionUiState();
    closePlaylistPanel();

    const playlistTitle =
        playlistId === state.WATCH_LATER_PLAYLIST_ID
            ? 'Watch later'
            : state.playlistMap.get(playlistId)?.title || 'playlist';
    showSaveProgress(0, videoIds.length, playlistTitle);

    try {
        const response = await sendBridgeRequest(
            ACTIONS.ADD_TO_PLAYLISTS,
            {
                videoIds,
                playlistIds: [playlistId],
                playlistTitles: [playlistTitle],
            },
            (progress) => {
                if (progress) {
                    showSaveProgress(
                        progress.processed,
                        progress.total,
                        progress.label || playlistTitle
                    );
                }
            }
        );

        hideSaveProgress();
        const successCount = Number(response?.successCount) || 0;
        if (successCount > 0) {
            state.selectedPlaylistIds.add(playlistId);
            syncPlaylistSelectionVisuals();
            setStatusMessage(`Saved to ${playlistTitle}.`, STATUS_KIND.SUCCESS);
            resetSelectionOnly();
            return;
        }

        setStatusMessage('No playlist was updated.', STATUS_KIND.ERROR);
    } catch (error) {
        logger.warn('Failed to save selected videos', error);
        hideSaveProgress();
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to save videos.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.submitting = false;
        updateActionUiState();
    }
}

/**
 * Create a new playlist with a random title and save selected videos to it.
 */
async function createQuickPlaylistAndSave() {
    if (state.createSubmitting || state.submitting) {
        return;
    }

    const videoIds = Array.from(state.selectedVideoIds);
    if (videoIds.length === 0) {
        setStatusMessage('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    state.createSubmitting = true;
    updateActionUiState();
    hideSaveProgress();

    try {
        const title = await generateQuickPlaylistTitle();
        setStatusMessage(`Creating "${title}"...`, STATUS_KIND.INFO);

        const response = await sendBridgeRequest(
            ACTIONS.CREATE_PLAYLIST_AND_ADD,
            {
                title,
                privacyStatus: state.createVisibility || 'PRIVATE',
                collaborate: false,
                videoIds,
            },
            (progress) => {
                if (progress) {
                    showSaveProgress(progress.processed, progress.total, progress.label || title);
                }
            }
        );

        hideSaveProgress();
        const addedCount = Number(response?.addedCount) || 0;
        const requestedCount = Number(response?.requestedVideoCount) || videoIds.length;
        const failureCount = Array.isArray(response?.failures) ? response.failures.length : 0;

        state.lastPlaylistProbeVideoId = '';
        state.playlistOptions = [];
        state.selectedPlaylistIds.clear();

        if (failureCount > 0) {
            const savedLabel = `${addedCount}/${requestedCount}`;
            setStatusMessage(`Created "${title}". Saved ${savedLabel} video(s).`, STATUS_KIND.INFO);
        } else {
            setStatusMessage(
                `Created "${title}" and saved ${addedCount} video(s).`,
                STATUS_KIND.SUCCESS
            );
        }

        resetSelectionOnly();
    } catch (error) {
        logger.warn('Failed to create quick playlist', error);
        hideSaveProgress();
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to create playlist.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.createSubmitting = false;
        updateActionUiState();
    }
}

function schedulePostSaveReset() {
    if (state.postSaveResetTimer) {
        clearTimeout(state.postSaveResetTimer);
        state.postSaveResetTimer = null;
    }
    state.postSaveResetTimer = window.setTimeout(() => {
        state.postSaveResetTimer = null;
        setSelectionMode(false);
    }, 650);
}

function resetSelectionOnly() {
    clearPostSaveResetTimer();
    clearSelectedVideos();
    resetActionCounters();
    clearStatusMessage();
    clearDeferredRescanTimer();
    state.pendingContainers.clear();
    state.renderScheduled = false;
    state.decorateRetryCounts = new WeakMap();
    state.playlistOptions = [];
    state.playlistMap.clear();
    state.selectedPlaylistIds.clear();
    state.lastPlaylistProbeVideoId = '';
    state.selectAllMode = false;
}

/**
 * Remove selected card renderers from the DOM.
 * @param {string[]} videoIds
 * @returns {number}
 */
function removeSelectedCardsFromDom(videoIds) {
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
        return 0;
    }

    const nodesToRemove = new Set();
    videoIds.forEach((videoId) => {
        if (!VIDEO_ID_PATTERN.test(videoId)) {
            return;
        }

        state.selectedVideoIds.delete(videoId);
        document
            .querySelectorAll(`.${HOST_CLASS}[data-yt-commander-video-id="${videoId}"]`)
            .forEach((host) => {
                if (!(host instanceof Element)) {
                    return;
                }

                const renderer = host.closest(FEED_RENDERER_SELECTOR) || host;
                nodesToRemove.add(renderer);
            });
    });

    let removedCount = 0;
    nodesToRemove.forEach((node) => {
        if (node instanceof Element && node.isConnected) {
            node.remove();
            removedCount += 1;
        }
    });

    updateActionUiState();
    return removedCount;
}

/**
 * Remove selected videos from the currently opened playlist page.
 */
async function removeSelectionFromCurrentPlaylist() {
    if (state.submitting || state.createSubmitting) {
        return;
    }

    if (!isPlaylistCollectionPage()) {
        setStatusMessage('Open a playlist page to remove selected videos.', STATUS_KIND.ERROR);
        return;
    }

    const playlistId = getCurrentPlaylistId();
    if (!playlistId) {
        setStatusMessage('Could not detect current playlist.', STATUS_KIND.ERROR);
        return;
    }

    const videoIds = Array.from(state.selectedVideoIds);
    if (videoIds.length === 0) {
        setStatusMessage('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    state.submitting = true;
    updateActionUiState();

    const playlistLabel = playlistId === 'WL' ? 'Watch later' : 'playlist';
    showSaveProgress(0, videoIds.length, `Removing from ${playlistLabel}`);

    try {
        const response = await sendBridgeRequest(
            ACTIONS.REMOVE_FROM_PLAYLIST,
            {
                playlistId,
                videoIds,
            },
            (progress) => {
                if (progress) {
                    showSaveProgress(
                        progress.processed,
                        progress.total,
                        `Removing from ${playlistLabel}`
                    );
                }
            }
        );

        hideSaveProgress();
        const removedVideoIds = Array.isArray(response?.removedVideoIds)
            ? response.removedVideoIds.filter((videoId) => VIDEO_ID_PATTERN.test(videoId))
            : [];
        const removedCount = Number(response?.removedCount) || removedVideoIds.length;

        if (removedCount <= 0) {
            setStatusMessage('No videos were removed.', STATUS_KIND.ERROR);
            return;
        }

        setStatusMessage(
            `Removed ${removedCount} video(s) from ${playlistLabel}. Refreshing page...`,
            STATUS_KIND.SUCCESS
        );

        resetSelectionOnly();
        window.location.reload();
    } catch (error) {
        logger.warn('Failed to remove selected videos from playlist', error);
        hideSaveProgress();
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to remove videos.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.submitting = false;
        updateActionUiState();
    }
}

/**
 * Set create modal status text.
 * @param {string} message
 * @param {'info'|'success'|'error'} kind
 */
function setCreateStatus(message, kind = STATUS_KIND.INFO) {
    if (!state.createStatus) {
        return;
    }

    const text = typeof message === 'string' ? message : '';
    state.createStatus.textContent = text;
    state.createStatus.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');

    if (!text) {
        return;
    }

    state.createStatus.classList.add('is-visible', `is-${kind}`);
}

/**
 * Open create-playlist modal.
 */
function openCreateModal() {
    if (state.selectedVideoIds.size === 0 || state.createSubmitting) {
        return;
    }

    ensureActionUi();

    state.createVisibility = 'PRIVATE';
    state.state.createVisibilityMenuVisible = false;
    if (state.createTitleInput) {
        state.createTitleInput.value = '';
    }
    if (state.createCollaborateInput) {
        state.createCollaborateInput.checked = false;
    }
    setCreateStatus('');
    updateCreateModalState();

    state.createBackdrop?.classList.add('is-visible');
    state.createModalVisible = true;

    window.setTimeout(() => {
        state.createTitleInput?.focus();
    }, 0);
}

/**
 * Close create-playlist modal.
 * @param {boolean} [force]
 */
function closeCreateModal(force = false) {
    if (state.createSubmitting && !force) {
        return;
    }

    state.createModalVisible = false;
    state.state.createVisibilityMenuVisible = false;
    state.createBackdrop?.classList.remove('is-visible');
    updateCreateModalState();
    setCreateStatus('');
}

/**
 * Handle create playlist submission.
 */
async function submitCreatePlaylist() {
    if (state.createSubmitting) {
        return;
    }

    const title = state.createTitleInput?.value.trim() || '';
    if (!title) {
        setCreateStatus('Playlist title is required.', STATUS_KIND.ERROR);
        return;
    }

    const videoIds = Array.from(state.selectedVideoIds);
    if (videoIds.length === 0) {
        setCreateStatus('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    state.createSubmitting = true;
    updateActionUiState();
    updateCreateModalState();
    setCreateStatus('Creating playlist...', STATUS_KIND.INFO);
    showSaveProgress(0, videoIds.length, title);

    try {
        const response = await sendBridgeRequest(
            ACTIONS.CREATE_PLAYLIST_AND_ADD,
            {
                title,
                privacyStatus: state.createVisibility,
                collaborate: state.createCollaborateInput?.checked === true,
                videoIds,
            },
            (progress) => {
                if (progress) {
                    showSaveProgress(progress.processed, progress.total, title);
                }
            }
        );

        const addedCount = Number(response?.addedCount) || 0;
        const requestedCount = Number(response?.requestedVideoCount) || videoIds.length;
        const failureCount = Array.isArray(response?.failures) ? response.failures.length : 0;

        state.lastPlaylistProbeVideoId = '';
        state.playlistOptions = [];
        state.selectedPlaylistIds.clear();

        closeCreateModal(true);

        if (failureCount > 0) {
            const savedLabel = `${addedCount}/${requestedCount}`;
            setStatusMessage(`Created "${title}". Saved ${savedLabel} video(s).`, STATUS_KIND.INFO);
            return;
        }

        setStatusMessage(
            `Created "${title}" and saved ${addedCount} video(s).`,
            STATUS_KIND.SUCCESS
        );
        resetSelectionOnly();
    } catch (error) {
        logger.warn('Failed to create playlist', error);
        setCreateStatus(
            error instanceof Error ? error.message : 'Failed to create playlist.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.createSubmitting = false;
        updateActionUiState();
        updateCreateModalState();
    }
}

/**
 * Resolve the best video link inside a renderer.
 * @param {Element} container
 * @returns {HTMLAnchorElement|null}
 */
function findVideoLink(container) {
    if (!container || typeof container.querySelectorAll !== 'function') {
        return null;
    }

    const links = Array.from(container.querySelectorAll(VIDEO_LINK_SELECTOR));
    if (links.length === 0) {
        return null;
    }

    for (const link of links) {
        if (!(link instanceof HTMLAnchorElement) || !link.href) {
            continue;
        }

        if (
            link.id === 'thumbnail' ||
            link.querySelector('ytd-thumbnail, yt-thumbnail-view-model, yt-image, img')
        ) {
            return link;
        }
    }

    return links.find((link) => link instanceof HTMLAnchorElement && Boolean(link.href)) || null;
}

/**
 * Resolve card-level host element for overlay insertion.
 * @param {Element} container
 * @returns {Element|null}
 */
function findCardHost(container) {
    if (!container || !container.isConnected) {
        return null;
    }

    return container;
}

/**
 * Update selected visual state on one host.
 * @param {Element} host
 * @param {string} videoId
 */
function applySelectedState(host, videoId) {
    const selected = state.selectedVideoIds.has(videoId);
    host.classList.toggle(HOST_SELECTED_CLASS, selected);

    const overlay = host.querySelector(`.${OVERLAY_CLASS}`);
    if (overlay) {
        overlay.setAttribute('aria-pressed', selected ? 'true' : 'false');
        overlay.setAttribute('data-state', selected ? 'selected' : 'idle');

        const hint = overlay.querySelector('.yt-commander-playlist-overlay__hint');
        if (hint) {
            hint.textContent = selected ? 'Selected' : 'Select';
        }
    }
}

/**
 * Apply selected visual state to every copy of a video id.
 * @param {string} videoId
 */
function syncVideoSelectedState(videoId) {
    document
        .querySelectorAll(`.${HOST_CLASS}[data-yt-commander-video-id="${videoId}"]`)
        .forEach((host) => applySelectedState(host, videoId));
}

/**
 * Apply visual + UI updates after selection set changes.
 * @param {string[]} changedVideoIds
 */
function commitSelectionMutation(changedVideoIds) {
    if (!Array.isArray(changedVideoIds) || changedVideoIds.length === 0) {
        return;
    }

    changedVideoIds.forEach((videoId) => syncVideoSelectedState(videoId));
    updateActionUiState();

    if (state.playlistPanelVisible && state.loadPlaylistsDebounced) {
        state.loadPlaylistsDebounced().catch((error) => {
            logger.warn('Failed to refresh playlists', error);
        });
    }
}

/**
 * Toggle selected state for one video id.
 * @param {string} videoId
 */
function toggleVideoSelection(videoId) {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return;
    }

    if (state.selectedVideoIds.has(videoId)) {
        state.selectedVideoIds.delete(videoId);
    } else {
        state.selectedVideoIds.add(videoId);
    }

    commitSelectionMutation([videoId]);
}

/**
 * Ensure a batch of ids is selected.
 * @param {string[]} videoIds
 */
function selectVideoIds(videoIds) {
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
        return;
    }

    const changed = [];
    const seen = new Set();

    videoIds.forEach((videoId) => {
        if (!VIDEO_ID_PATTERN.test(videoId) || seen.has(videoId)) {
            return;
        }

        seen.add(videoId);
        if (!state.selectedVideoIds.has(videoId)) {
            state.selectedVideoIds.add(videoId);
            changed.push(videoId);
        }
    });

    commitSelectionMutation(changed);
}

/**
 * Handle one card selection interaction.
 * Supports Windows-style Shift+click range selection.
 * @param {{
 *   videoId: string,
 *   host?: Element|null,
 *   shiftKey?: boolean
 * }} options
 */
function handleVideoSelectionInteraction(options) {
    const videoId = options?.videoId || '';
    if (!VIDEO_ID_PATTERN.test(videoId)) {
        return;
    }

    if (state.selectAllMode) {
        state.selectAllMode = false;
    }

    const host = options?.host instanceof Element ? options.host : null;
    const shiftKey = Boolean(options?.shiftKey);

    if (shiftKey) {
        const rangeIds = state.selectionRangeController.resolveRange(videoId, host);
        if (rangeIds.length > 0) {
            selectVideoIds(rangeIds);
        } else {
            selectVideoIds([videoId]);
        }
    } else {
        toggleVideoSelection(videoId);
    }

    state.selectionRangeController.setAnchor(videoId, host);
}

/**
 * Handle playlist selection interaction on playlists page.
 * @param {string} playlistId
 * @param {Element} renderer
 */
function handlePlaylistSelectionInteraction(playlistId, renderer) {
    logger.debug('handlePlaylistSelectionInteraction called', {
        playlistId,
        hasRenderer: !!renderer,
    });
    logger.debug(
        'PLAYLIST_ID_PATTERN.test result:',
        PLAYLIST_ID_PATTERN.test(playlistId),
        'for ID:',
        playlistId
    );
    if (!PLAYLIST_ID_PATTERN.test(playlistId)) {
        logger.debug('Playlist ID pattern failed', playlistId);
        return;
    }

    logger.debug('Calling togglePlaylistSelection for', playlistId);
    togglePlaylistSelection(playlistId);
    applyPlaylistSelectedState(renderer, playlistId);
}

/**
 * Toggle playlist selection state.
 * @param {string} playlistId
 */
function togglePlaylistSelection(playlistId) {
    if (state.selectedPlaylistIds.has(playlistId)) {
        state.selectedPlaylistIds.delete(playlistId);
        logger.debug('Playlist deselected', playlistId, 'count:', state.selectedPlaylistIds.size);
    } else {
        state.selectedPlaylistIds.add(playlistId);
        logger.debug('Playlist selected', playlistId, 'count:', state.selectedPlaylistIds.size);
    }
    updateActionUiState();
}

const playlistStateTimers = new WeakMap();
let playlistObserver = null;
let playlistObserverActive = false;

function getPlaylistObserver() {
    if (!playlistObserver) {
        playlistObserver = new MutationObserver(() => {
            if (!playlistObserverActive) return;

            playlistObserverActive = false;
            requestAnimationFrame(() => {
                if (state.selectionMode && isPlaylistsPage()) {
                    state.selectedPlaylistIds.forEach((playlistId) => {
                        const link = document.querySelector(`a[href*="list=${playlistId}"]`);
                        if (link) {
                            const renderer = link.closest('ytd-rich-item-renderer');
                            if (renderer) {
                                applyPlaylistSelectedStateToRenderer(renderer, playlistId);
                            }
                        }
                    });
                }
                playlistObserverActive = true;
            });
        });
    }
    return playlistObserver;
}

function observePlaylistsPage() {
    if (!state.selectionMode || !isPlaylistsPage()) return;

    const playlistObserver = getPlaylistObserver();
    const container = document.querySelector('ytd-rich-grid-renderer, #content, body');
    if (container) {
        try {
            state.observer.observe(container, { childList: true, subtree: true });
            playlistObserverActive = true;
        } catch (e) {}
    }
}

function applyPlaylistSelectedStateToRenderer(renderer, playlistId) {
    if (!renderer || !renderer.isConnected) return;

    const isSelected = state.selectedPlaylistIds.has(playlistId);

    renderer.classList.toggle('yt-commander-playlist-selected', isSelected);

    const overlay = renderer.querySelector(`.${OVERLAY_CLASS}`);
    if (overlay) {
        overlay.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        overlay.setAttribute('data-state', isSelected ? 'selected' : 'idle');

        const hint = overlay.querySelector('.yt-commander-playlist-overlay__hint');
        if (hint) {
            hint.textContent = isSelected ? 'Selected' : 'Select';
        }
    }
}

function schedulePlaylistStateUpdate(renderer, playlistId) {
    if (playlistStateTimers.has(renderer)) {
        clearTimeout(playlistStateTimers.get(renderer));
    }

    const timer = setTimeout(() => {
        if (!renderer.isConnected) return;
        applyPlaylistSelectedStateToRenderer(renderer, playlistId);
        playlistStateTimers.delete(renderer);
    }, 100);

    playlistStateTimers.set(renderer, timer);
}

function restorePlaylistSelectionState() {
    if (!state.selectionMode || !isPlaylistsPage()) return;

    state.selectedPlaylistIds.forEach((playlistId) => {
        const link = document.querySelector(`a[href*="list=${playlistId}"]`);
        if (link) {
            const renderer = link.closest('ytd-rich-item-renderer');
            if (renderer) {
                applyPlaylistSelectedStateToRenderer(renderer, playlistId);
            }
        }
    });
}

/**
 * Apply selected visual state to playlist renderer.
 * @param {Element} renderer
 * @param {string} playlistId
 */
function applyPlaylistSelectedState(renderer, playlistId) {
    if (!renderer || !renderer.isConnected) {
        return;
    }

    playlistObserverActive = false;
    applyPlaylistSelectedStateToRenderer(renderer, playlistId);
    playlistObserverActive = true;
}

/**
 * Clear selected videos and update visuals.
 */
function clearSelectedVideos() {
    state.selectedVideoIds.clear();
    state.selectedPlaylistIds.clear();
    state.selectionRangeController.reset();
    state.selectAllMode = false;

    document.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => {
        const videoId = host.getAttribute('data-yt-commander-video-id') || '';
        applySelectedState(host, videoId);
    });

    document.querySelectorAll('.yt-commander-playlist-selected').forEach((renderer) => {
        renderer.classList.remove('yt-commander-playlist-selected');
        const overlay = renderer.querySelector(`.${OVERLAY_CLASS}`);
        if (overlay) {
            overlay.setAttribute('aria-pressed', 'false');
            overlay.setAttribute('data-state', 'idle');
            const hint = overlay.querySelector('.yt-commander-playlist-overlay__hint');
            if (hint) {
                hint.textContent = 'Select';
            }
        }
    });

    updateActionUiState();
}

/**
 * Clear delayed fallback rescan timer.
 */
function clearDeferredRescanTimer() {
    if (!state.deferredRescanTimer) {
        return;
    }

    window.clearTimeout(state.deferredRescanTimer);
    state.deferredRescanTimer = null;
}

/**
 * Schedule one delayed full rescan for cards that hydrate after insertion.
 */
function scheduleDeferredRescan() {
    if (!state.isEnabled || !state.selectionMode || !isEligiblePage()) {
        return;
    }

    if (state.deferredRescanTimer) {
        return;
    }

    state.deferredRescanTimer = window.setTimeout(() => {
        state.deferredRescanTimer = null;
        queueFullRescan();
    }, DECORATE_RETRY_DELAY_MS);
}

/**
 * Remove overlay artifacts from all hosts.
 */
function cleanupDecorations() {
    document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => {
        host.classList.remove(HOST_CLASS, HOST_SELECTED_CLASS);
        host.removeAttribute('data-yt-commander-video-id');
    });
}

/**
 * @param {string} action
 * @param {object} payload
 * @param {function} [onProgress]
 * @returns {Promise<any>}
 */
function sendBridgeRequest(action, payload, onProgress) {
    return bridgeClient.sendRequest(action, payload, onProgress);
}

/**
 * Decorate one renderer container with click overlay.
 * @param {Element} container
 * @returns {boolean}
 */
function decorateContainer(container) {
    if (!state.selectionMode || !container || !container.isConnected) {
        return false;
    }

    const link = findVideoLink(container);
    if (!link || !link.href) {
        return false;
    }

    const videoId = extractVideoId(link.href);
    if (!videoId) {
        return false;
    }

    const host = findCardHost(container);
    if (!host) {
        return false;
    }

    host.classList.add(HOST_CLASS);
    host.setAttribute('data-yt-commander-video-id', videoId);

    let overlay = host.querySelector(`.${OVERLAY_CLASS}`);
    if (!overlay) {
        overlay = document.createElement('button');
        overlay.type = 'button';
        overlay.className = OVERLAY_CLASS;
        overlay.setAttribute('aria-label', 'Toggle video selection');
        overlay.setAttribute('aria-pressed', 'false');
        overlay.setAttribute('data-state', 'idle');

        const hint = document.createElement('span');
        hint.className = 'yt-commander-playlist-overlay__hint';
        hint.textContent = 'Select';
        overlay.appendChild(hint);

        overlay.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (isPlaylistsPage()) {
                const link = host.querySelector('a[href*="list="]');
                if (link) {
                    try {
                        const url = new URL(link.href, location.origin);
                        const playlistId = url.searchParams.get('list');
                        if (playlistId && PLAYLIST_ID_PATTERN.test(playlistId)) {
                            handlePlaylistSelectionInteraction(playlistId, host);
                        }
                    } catch (_e) {}
                }
                return;
            }

            const id = overlay?.getAttribute('data-yt-commander-video-id');
            if (id) {
                handleVideoSelectionInteraction({
                    videoId: id,
                    host,
                    shiftKey: event.shiftKey,
                });
            }
        });

        host.appendChild(overlay);
    }

    overlay.setAttribute('data-yt-commander-video-id', videoId);
    applySelectedState(host, videoId);
    state.decorateRetryCounts.delete(container);
    return true;
}

/**
 * Collect renderer containers from added node.
 * @param {Node} node
 * @param {Set<Element>} output
 */
function collectRenderers(node, output) {
    if (!(node instanceof Element)) {
        return;
    }

    if (node.matches(FEED_RENDERER_SELECTOR)) {
        output.add(node);
    }

    const nested = node.querySelectorAll?.(FEED_RENDERER_SELECTOR);
    if (!nested || nested.length === 0) {
        return;
    }

    nested.forEach((item) => output.add(item));
}

/**
 * Queue containers for chunked processing.
 * @param {Set<Element>} containers
 */
function queueContainers(containers) {
    if (!containers || containers.size === 0) {
        return;
    }

    containers.forEach((container) => {
        if (container?.isConnected) {
            state.pendingContainers.add(container);
        }
    });

    if (!state.renderScheduled) {
        state.renderScheduled = true;
        window.requestAnimationFrame(processPendingContainers);
    }
}

/**
 * Queue full-page renderer scan.
 */
function queueFullRescan() {
    if (!state.isEnabled || !state.selectionMode || !isEligiblePage()) {
        return;
    }

    const all = new Set();
    const root = resolveActivePageRoot();
    root.querySelectorAll(FEED_RENDERER_SELECTOR).forEach((container) => {
        all.add(container);
    });
    queueContainers(all);
}

/**
 * Process queued containers.
 */
function processPendingContainers() {
    state.renderScheduled = false;

    if (!state.isEnabled || !state.selectionMode || !isEligiblePage()) {
        state.pendingContainers.clear();
        return;
    }

    const batch = [];
    let count = 0;
    const autoSelectedIds = new Set();
    let decoratedCount = 0;

    for (const container of state.pendingContainers) {
        state.pendingContainers.delete(container);
        batch.push(container);
        count += 1;
        if (count >= PROCESS_CHUNK_SIZE) {
            break;
        }
    }

    let hasRetryableHydrationMiss = false;
    batch.forEach((container) => {
        const decorated = decorateContainer(container);
        if (decorated || !container?.isConnected) {
            if (decorated) {
                decoratedCount += 1;
                const videoId = container.getAttribute('data-yt-commander-video-id') || '';
                if (
                    state.selectAllMode &&
                    VIDEO_ID_PATTERN.test(videoId) &&
                    !state.selectedVideoIds.has(videoId)
                ) {
                    state.selectedVideoIds.add(videoId);
                    autoSelectedIds.add(videoId);
                }
            }
            state.decorateRetryCounts.delete(container);
            return;
        }

        const retryCount = state.decorateRetryCounts.get(container) || 0;
        if (retryCount < DECORATE_MAX_RETRIES) {
            state.decorateRetryCounts.set(container, retryCount + 1);
            state.pendingContainers.add(container);
            hasRetryableHydrationMiss = true;
            return;
        }

        state.decorateRetryCounts.delete(container);
    });

    if (autoSelectedIds.size > 0) {
        commitSelectionMutation(Array.from(autoSelectedIds));
    } else if (decoratedCount > 0) {
        state.cachedPageVideoCount += decoratedCount;
        updateActionUiState();
    }

    if (hasRetryableHydrationMiss) {
        scheduleDeferredRescan();
    }

    if (state.pendingContainers.size > 0) {
        state.renderScheduled = true;
        window.requestAnimationFrame(processPendingContainers);
    }
}

/**
 * Handle bridge responses.
 * @param {MessageEvent} event
 */
function handleBridgeResponse(event) {
    bridgeClient.handleResponse(event);
}

/**
 * Handle bridge progress updates.
 * @param {MessageEvent} event
 */
function handleBridgeProgress(event) {
    bridgeClient.handleProgress(event);
}

/**
 * Reject pending bridge requests.
 * @param {string} message
 */
function rejectPendingRequests(message) {
    bridgeClient.rejectAll(message);
}

/**
 * Toggle selection mode.
 * @param {boolean} active
 */
function setSelectionMode(active) {
    clearPostSaveResetTimer();
    if (!state.isEnabled && active) {
        return;
    }

    const next = Boolean(active) && isEligiblePage() && state.isEnabled;
    if (state.selectionMode === next) {
        return;
    }

    logger.debug('Selection mode changing', {
        from: state.selectionMode,
        to: next,
        isPlaylistsPage: isPlaylistsPage(),
    });
    state.selectionMode = next;
    document.documentElement.classList.toggle(ROOT_SELECTION_CLASS, state.selectionMode);

    if (!state.selectionMode) {
        closePlaylistPanel();
        closeCreateModal(true);
        clearSelectedVideos();
        cleanupDecorations();
        resetActionCounters();
        clearStatusMessage();
        clearDeferredRescanTimer();
        state.pendingContainers.clear();
        state.renderScheduled = false;
        state.decorateRetryCounts = new WeakMap();
        state.playlistOptions = [];
        state.playlistMap.clear();
        state.selectedPlaylistIds.clear();
        state.lastPlaylistProbeVideoId = '';
        state.selectAllMode = false;
        playlistStateTimers.forEach((timer) => clearTimeout(timer));
        playlistStateTimers = new WeakMap();
        if (playlistObserver) {
            playlistObserver.disconnect();
        }
    } else {
        queueFullRescan();
        if (isPlaylistsPage()) {
            observePlaylistsPage();
        }
    }

    updateMastheadButtonState(state);
    syncActionBarVisibility();

    if (state.selectionMode) {
        updateActionUiState();
    }
}

function clearPostSaveResetTimer() {
    if (state.postSaveResetTimer) {
        clearTimeout(state.postSaveResetTimer);
        state.postSaveResetTimer = null;
    }
}

/**
 * Handle masthead icon button click.
 * @param {MouseEvent} event
 */
function handleMastheadButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!state.isEnabled || !isEligiblePage()) {
        return;
    }

    setSelectionMode(!state.selectionMode);
}

/**
 * Handle action bar exit click.
 * @param {MouseEvent} event
 */
function handleActionExitButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    closePlaylistPanel();
    state.actionBar?.classList.remove('is-visible');
    setSelectionMode(false);
}

/**
 * Handle drag start on action bar.
 * @param {MouseEvent} event
 */
function handleDragStart(event) {
    if (!state.actionBar || !state.actionBar.classList.contains('is-visible')) {
        return;
    }

    const target = event.target;
    if (!target.closest('.yt-commander-playlist-action-drag-handle')) {
        return;
    }

    state.isDragging = true;
    state.actionBar.classList.add('is-dragging');

    const rect = state.actionBar.getBoundingClientRect();
    state.dragOffsetX = event.clientX - rect.left;
    state.dragOffsetY = event.clientY - rect.top;

    state.actionBar.style.left = `${rect.left}px`;
    state.actionBar.style.transform = 'none';
    state.actionBar.style.bottom = 'auto';
    state.isDragPositioned = true;
}

/**
 * Handle drag move.
 * @param {MouseEvent} event
 */
function handleDragMove(event) {
    if (!state.isDragging) {
        return;
    }

    const x = event.clientX - state.dragOffsetX;
    const y = event.clientY - state.dragOffsetY;

    state.actionBar.style.left = `${Math.max(0, x)}px`;
    state.actionBar.style.top = `${Math.max(0, y)}px`;
}

/**
 * Handle drag end.
 * @param {MouseEvent} event
 */
function handleDragEnd(event) {
    if (!state.isDragging) {
        return;
    }

    state.isDragging = false;
    state.actionBar?.classList.remove('is-dragging');
}

/**
 * Handle "save to Watch later" action click.
 * @param {MouseEvent} event
 */
function handleActionWatchLaterClick(event) {
    event.preventDefault();
    event.stopPropagation();
    saveSelectionToPlaylist(state.WATCH_LATER_PLAYLIST_ID).catch((error) => {
        logger.warn('Failed to save to Watch later', error);
    });
}

/**
 * Handle "save to playlist" action click.
 * @param {MouseEvent} event
 */
function handleActionSaveClick(event) {
    event.preventDefault();
    event.stopPropagation();
    openPlaylistPanel().catch((error) => {
        logger.warn('Failed to open playlist panel', error);
    });
}

/**
 * Handle "save to new playlist" action click.
 * @param {MouseEvent} event
 */
function handleActionQuickCreateClick(event) {
    event.preventDefault();
    event.stopPropagation();
    createQuickPlaylistAndSave().catch((error) => {
        logger.warn('Failed to create quick playlist', error);
    });
}

/**
 * Handle "split" click - opens split modal.
 * @param {MouseEvent} event
 */
function handleSplitClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const videoIds = Array.from(state.selectedVideoIds);
    if (videoIds.length === 0) {
        return;
    }
    const splitHandlers = {
        submitSplit,
        closeSplitModal,
        updateSplitModalState,
    };
    ensureSplitModal(state, splitHandlers);
    state.splitBackdrop.classList.add('is-visible');
    if (state.splitCountInput) {
        state.splitCountInput.value = '';
        state.splitCountInput.focus();
    }
    updateSplitModalState(state);
}

async function submitSplit() {
    if (state.splitSubmitting) {
        return;
    }

    const videoIds = Array.from(state.selectedVideoIds);
    const perPlaylist = parseInt(state.splitCountInput?.value, 10) || 0;

    if (videoIds.length === 0) {
        setSplitStatusFn(state, 'Select videos first.', 'error');
        return;
    }

    if (perPlaylist <= 0) {
        setSplitStatusFn(state, 'Enter videos per playlist.', 'error');
        return;
    }

    const numPlaylists = Math.ceil(videoIds.length / perPlaylist);
    state.splitSubmitting = true;
    updateSplitModalStateFn(state);
    closeSplitModalFn(state);

    showSaveProgress(0, numPlaylists, 'Splitting into playlists...');

    try {
        let maxNum = 0;
        try {
            const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, {
                videoIds: [videoIds[0]],
            });
            const playlists = Array.isArray(response?.playlists) ? response.playlists : [];
            playlists.forEach((playlist) => {
                const title = playlist?.title || '';
                const match = title.match(/^Playlist\s+(\d+)$/i);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            });
        } catch (e) {
            logger.warn('Could not fetch existing playlists for naming', e);
        }

        let created = 0;
        let totalAdded = 0;

        for (let i = 0; i < numPlaylists; i++) {
            const start = i * perPlaylist;
            const end = Math.min(start + perPlaylist, videoIds.length);
            const batch = videoIds.slice(start, end);

            const title = `Playlist ${maxNum + 1 + i}`;

            const playlistResponse = await sendBridgeRequest(ACTIONS.CREATE_PLAYLIST_AND_ADD, {
                title,
                privacyStatus: 'PRIVATE',
                collaborate: false,
                videoIds: batch,
            });

            const addedCount = Number(playlistResponse?.addedCount) || 0;
            totalAdded += addedCount;
            created++;

            showSaveProgress(created, numPlaylists, `Creating playlists...`);
        }

        hideSaveProgress();
        setStatusMessage(
            `Split into ${created} playlists with ${totalAdded} videos.`,
            STATUS_KIND.SUCCESS
        );
        resetSelectionOnly();
    } catch (error) {
        logger.warn('Failed to split playlists', error);
        hideSaveProgress();
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to split playlists.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.splitSubmitting = false;
        updateActionUiState();
    }
}

function closeSplitModal() {
    closeSplitModalFn(state);
    updateSplitModalStateFn(state);
}

/**
 * Handle "remove from playlist" action click.
 * @param {MouseEvent} event
 */
function handleActionRemoveClick(event) {
    event.preventDefault();
    event.stopPropagation();
    removeSelectionFromCurrentPlaylist().catch((error) => {
        logger.warn('Failed to remove selected playlist videos', error);
    });
}

/**
 * Handle "remove watched" click - removes all watched videos from current playlist.
 * @param {MouseEvent} event
 */
async function handleActionRemoveWatchedClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const currentPlaylistId = getCurrentPlaylistId();
    if (!currentPlaylistId) {
        setStatusMessage('No playlist detected.', STATUS_KIND.ERROR);
        return;
    }

    state.submitting = true;
    updateActionUiState();
    setStatusMessage('Scanning playlist for watched videos...', STATUS_KIND.INFO);

    try {
        const allVideoIds = collectRenderedVideoIds();
        if (allVideoIds.length === 0) {
            setStatusMessage('No videos found in playlist.', STATUS_KIND.INFO);
            return;
        }

        const watchedIds = [];
        for (const videoId of allVideoIds) {
            const watched = await isVideoWatched(videoId);
            if (watched) {
                watchedIds.push(videoId);
            }
        }

        if (watchedIds.length === 0) {
            setStatusMessage('No watched videos in playlist.', STATUS_KIND.INFO);
            return;
        }

        showSaveProgress(0, watchedIds.length, 'Removing watched videos');

        const response = await sendBridgeRequest(
            ACTIONS.REMOVE_FROM_PLAYLIST,
            {
                playlistId: currentPlaylistId,
                videoIds: watchedIds,
            },
            (progress) => {
                if (progress) {
                    showSaveProgress(progress.processed, progress.total, 'Removing watched videos');
                }
            }
        );

        hideSaveProgress();
        const removedCount = Number(response?.removedCount) || 0;

        if (removedCount > 0) {
            setStatusMessage(
                `Removed ${removedCount} watched video(s). Refreshing page...`,
                STATUS_KIND.SUCCESS
            );
            window.location.reload();
        } else {
            setStatusMessage('No videos were removed.', STATUS_KIND.INFO);
        }
    } catch (error) {
        logger.warn('Failed to remove watched videos', error);
        hideSaveProgress();
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to remove watched videos.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.submitting = false;
        updateActionUiState();
    }
}

/**
 * Handle "delete playlists" click - deletes selected playlists.
 * @param {MouseEvent} event
 */
async function handleActionDeletePlaylistsClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (state.submitting) {
        return;
    }

    const playlistIds = Array.from(state.selectedPlaylistIds);
    if (playlistIds.length === 0) {
        setStatusMessage('Select playlists to delete.', STATUS_KIND.ERROR);
        return;
    }

    state.submitting = true;
    updateActionUiState();
    showSaveProgress(0, playlistIds.length, 'Deleting playlists');

    try {
        const response = await sendBridgeRequest(
            ACTIONS.DELETE_PLAYLISTS,
            {
                playlistIds,
            },
            (progress) => {
                if (progress) {
                    showSaveProgress(progress.processed, progress.total, 'Deleting playlists');
                }
            }
        );

        hideSaveProgress();
        const deletedCount = Number(response?.deletedCount) || 0;
        const failedCount = Number(response?.failedCount) || 0;

        state.selectedPlaylistIds.clear();

        if (failedCount > 0) {
            setStatusMessage(
                `Deleted ${deletedCount} playlist(s). ${failedCount} failed.`,
                STATUS_KIND.ERROR
            );
        } else {
            setStatusMessage(
                `Deleted ${deletedCount} playlist(s). Refreshing...`,
                STATUS_KIND.SUCCESS
            );
            window.location.reload();
        }
    } catch (error) {
        logger.warn('Failed to delete playlists', error);
        hideSaveProgress();
        setStatusMessage(
            error instanceof Error ? error.message : 'Failed to delete playlists.',
            STATUS_KIND.ERROR
        );
    } finally {
        state.submitting = false;
        updateActionUiState();
    }
}

/**
 * Handle "open in new tab" click - opens all selected videos in new tabs.
 * @param {MouseEvent} event
 */
function handleOpenInNewTab(event) {
    event.preventDefault();
    event.stopPropagation();

    const videoIds = Array.from(state.selectedVideoIds);
    if (videoIds.length === 0) {
        return;
    }

    videoIds.forEach((videoId) => {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    });

    resetSelectionOnly();
}

/**
 * Select all rendered videos and keep selecting newly loaded cards.
 * @param {MouseEvent} event
 */
function handleActionSelectAllClick(event) {
    event.preventDefault();
    event.stopPropagation();

    state.selectAllMode = true;
    selectVideoIds(collectRenderedVideoIds());
    updateActionUiState();
}

/**
 * Clear selection and disable auto-select-all mode.
 * @param {MouseEvent} event
 */
function handleActionUnselectAllClick(event) {
    event.preventDefault();
    event.stopPropagation();

    state.selectAllMode = false;
    clearSelectedVideos();
}

/**
 * Handle click on playlist rows.
 * @param {MouseEvent} event
 */
function handlePlaylistListClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const row = target.closest('.yt-commander-playlist-panel__item');
    if (!row || !state.playlistPanelList?.contains(row)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const playlistId = row.getAttribute('data-playlist-id') || '';
    if (!playlistId) {
        return;
    }

    saveSelectionToPlaylist(playlistId).catch((error) => {
        logger.warn('Failed to save playlist selection', error);
    });
}

/**
 * Handle panel "new playlist" click.
 * @param {MouseEvent} event
 */
function handlePlaylistNewButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    openCreateModal();
}

/**
 * Handle backdrop mousedown for create modal.
 * @param {MouseEvent} event
 */
function handleCreateBackdropMouseDown(event) {
    if (event.target === state.createBackdrop) {
        closeCreateModal();
    }
}

/**
 * Handle Enter key inside create-title input.
 * @param {KeyboardEvent} event
 */
function handleCreateTitleKeydown(event) {
    if (event.key !== 'Enter') {
        return;
    }

    event.preventDefault();
    submitCreatePlaylist().catch((error) => {
        logger.warn('Create playlist submit failed', error);
    });
}

/**
 * Toggle visibility menu in create modal.
 * @param {MouseEvent} event
 */
function handleCreateVisibilityButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    state.state.createVisibilityMenuVisible = !state.state.createVisibilityMenuVisible;
    updateCreateModalState();
}

/**
 * Handle visibility option click in create modal.
 * @param {MouseEvent} event
 */
function handleCreateVisibilityMenuClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const option = target.closest('.yt-commander-playlist-create-modal__visibility-option');
    if (!option || !state.createVisibilityMenu?.contains(option)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const value = option.getAttribute('data-visibility') || 'PRIVATE';
    if (value === 'PUBLIC' || value === 'UNLISTED' || value === 'PRIVATE') {
        state.createVisibility = value;
    } else {
        state.createVisibility = 'PRIVATE';
    }

    state.state.createVisibilityMenuVisible = false;
    updateCreateModalState();
}

/**
 * Handle create button click.
 * @param {MouseEvent} event
 */
function handleCreateSubmitClick(event) {
    event.preventDefault();
    event.stopPropagation();

    submitCreatePlaylist().catch((error) => {
        logger.warn('Failed to submit create playlist action', error);
    });
}

/**
 * Handle document mousedown for outside-click close.
 * @param {MouseEvent} event
 */
function handleDocumentMouseDown(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    if (state.createModalVisible) {
        if (state.createModal?.contains(target)) {
            if (
                state.state.createVisibilityMenuVisible &&
                !state.createVisibilityButton?.contains(target) &&
                !state.createVisibilityMenu?.contains(target)
            ) {
                state.state.createVisibilityMenuVisible = false;
                updateCreateModalState();
            }
            return;
        }

        closeCreateModal();
        return;
    }

    if (state.playlistPanelVisible) {
        if (
            state.playlistPanel?.contains(target) ||
            state.actionBar?.contains(target) ||
            state.mastheadButton?.contains(target)
        ) {
            return;
        }

        closePlaylistPanel();
    }
}

/**
 * Intercept card clicks during selection mode so navigation never wins.
 * @param {MouseEvent} event
 */
function handleSelectionClickCapture(event) {
    if (!state.selectionMode || !state.isEnabled || !isEligiblePage()) {
        return;
    }
    logger.debug('handleSelectionClickCapture called');

    const target = event.target;
    if (!target || !(target instanceof Element)) {
        return;
    }

    if (
        state.actionBar?.contains(target) ||
        state.playlistPanel?.contains(target) ||
        state.createModal?.contains(target) ||
        state.mastheadButton?.contains(target)
    ) {
        return;
    }

    if (target.closest(`.${OVERLAY_CLASS}`)) {
        return;
    }

    if (isPlaylistsPage()) {
        logger.debug('Playlists page click detected', {
            targetTag: target.tagName,
            targetClass: target.className,
        });
        const playlistRenderer = target.closest('ytd-rich-item-renderer, yt-lockup-view-model');
        if (playlistRenderer) {
            logger.debug('Found playlist renderer');
            const link = playlistRenderer.querySelector('a[href*="list="]');
            if (link) {
                try {
                    const url = new URL(link.href, location.origin);
                    const playlistId = url.searchParams.get('list');
                    logger.debug('Got link with list param', { playlistId });
                    if (playlistId) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (typeof event.stopImmediatePropagation === 'function') {
                            event.stopImmediatePropagation();
                        }
                        handlePlaylistSelectionInteraction(playlistId, playlistRenderer);
                        return;
                    }
                } catch (_e) {}
            }
        }
        return;
    }

    let videoId = '';
    const host = target.closest(`.${HOST_CLASS}`);
    if (host) {
        videoId = host.getAttribute('data-yt-commander-video-id') || '';
    }

    if (!videoId) {
        const link = target.closest(VIDEO_LINK_SELECTOR);
        if (!(link instanceof HTMLAnchorElement) || !link.href) {
            return;
        }
        videoId = extractVideoId(link.href) || '';
    }

    if (!videoId) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
    }

    handleVideoSelectionInteraction({
        videoId,
        host,
        shiftKey: event.shiftKey,
    });
}

/**
 * Handle keyboard shortcuts.
 * @param {KeyboardEvent} event
 */
function handleDocumentKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }

    if (state.createModalVisible) {
        event.preventDefault();
        closeCreateModal();
        return;
    }

    if (state.playlistPanelVisible) {
        event.preventDefault();
        closePlaylistPanel();
        return;
    }

    if (state.selectionMode) {
        event.preventDefault();
        closePlaylistPanel();
        state.actionBar?.classList.remove('is-visible');
        setSelectionMode(false);
    }
}

/**
 * Handle route transitions.
 */
function handleRouteChange() {
    if (location.href === state.lastKnownUrl) {
        return;
    }

    state.lastKnownUrl = location.href;
    setSelectionMode(false);
    updateMastheadVisibility(state, isEligiblePage);
    syncActionBarVisibility();
    syncRemoveActionButton();
}

/**
 * Handle viewport resize.
 */
function handleResize() {
    positionPlaylistPanel();
}

/**
 * Setup state.observer for SPA + feed updates.
 */
function setupObserver() {
    if (state.observer || !document.body) {
        return;
    }

    state.observer = createThrottledObserver((mutations) => {
        ensureMastheadButton(state, handleMastheadButtonClick);
        ensureActionUi();
        handleRouteChange();

        if (!state.isEnabled || !state.selectionMode || !isEligiblePage()) {
            return;
        }

        const found = new Set();
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                if (mutation.target instanceof Element) {
                    const targetRenderer = mutation.target.matches(FEED_RENDERER_SELECTOR)
                        ? mutation.target
                        : mutation.target.closest(FEED_RENDERER_SELECTOR);
                    if (targetRenderer) {
                        found.add(targetRenderer);
                    }
                }
                mutation.addedNodes.forEach((node) => collectRenderers(node, found));
                return;
            }

            if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                const targetRenderer = mutation.target.matches(FEED_RENDERER_SELECTOR)
                    ? mutation.target
                    : mutation.target.closest(FEED_RENDERER_SELECTOR);
                if (targetRenderer) {
                    found.add(targetRenderer);
                }
            }
        });

        queueContainers(found);
    }, 250);

    state.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'video-id', 'data-video-id'],
    });
}

/**
 * Setup listeners.
 */
function setupListeners() {
    const onNavigate = () => {
        ensureMastheadButton(state, handleMastheadButtonClick);
        ensureActionUi();
        handleRouteChange();

        if (state.selectionMode && state.isEnabled && isEligiblePage()) {
            queueFullRescan();
        }
    };

    window.addEventListener('message', handleBridgeResponse);
    window.addEventListener('message', handleBridgeProgress);
    document.addEventListener('yt-navigate-finish', onNavigate);
    document.addEventListener('yt-page-data-updated', onNavigate);
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    document.addEventListener('click', handleSelectionClickCapture, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);

    let playlistScrollThrottle = null;
    const handlePlaylistScroll = () => {
        if (!playlistScrollThrottle) {
            playlistScrollThrottle = setTimeout(() => {
                restorePlaylistSelectionState();
                playlistScrollThrottle = null;
            }, 200);
        }
    };
    window.addEventListener('scroll', handlePlaylistScroll, { passive: true });

    state.cleanupCallbacks.push(() => window.removeEventListener('message', handleBridgeResponse));
    state.cleanupCallbacks.push(() => window.removeEventListener('message', handleBridgeProgress));
    state.cleanupCallbacks.push(() =>
        document.removeEventListener('yt-navigate-finish', onNavigate)
    );
    state.cleanupCallbacks.push(() =>
        document.removeEventListener('yt-page-data-updated', onNavigate)
    );
    state.cleanupCallbacks.push(() => window.removeEventListener('popstate', onNavigate));
    state.cleanupCallbacks.push(() => window.removeEventListener('resize', handleResize));
    state.cleanupCallbacks.push(() =>
        document.removeEventListener('mousedown', handleDocumentMouseDown, true)
    );
    state.cleanupCallbacks.push(() =>
        document.removeEventListener('click', handleSelectionClickCapture, true)
    );
    state.cleanupCallbacks.push(() =>
        document.removeEventListener('keydown', handleDocumentKeydown, true)
    );
    state.cleanupCallbacks.push(() => {
        clearTimeout(playlistScrollThrottle);
        window.removeEventListener('scroll', handlePlaylistScroll);
    });
}

/**
 * Initialize module.
 */
function initPlaylistMultiSelect() {
    if (state.isInitialized) {
        return;
    }

    state.loadPlaylistsDebounced = debounce(loadPlaylistsForPanel, 300);

    ensureMastheadButton(state, handleMastheadButtonClick);
    ensureActionUi();
    setupListeners();
    setupObserver();

    updateMastheadVisibility(state, isEligiblePage);
    updateMastheadButtonState(state);
    updateActionUiState();
    syncActionBarVisibility();

    state.isInitialized = true;
    logger.info('Playlist multi-select initialized');
}

/**
 * Enable feature.
 */
function enable() {
    state.isEnabled = true;
    ensureMastheadButton(state, handleMastheadButtonClick);
    ensureActionUi();
    updateMastheadVisibility(state, isEligiblePage);
    syncActionBarVisibility();
    updateActionUiState();
    setupObserver();
}

/**
 * Disable feature.
 */
function disable() {
    setSelectionMode(false);
    state.isEnabled = false;
    updateMastheadVisibility(state, isEligiblePage);
    syncActionBarVisibility();
    rejectPendingRequests('Playlist request cancelled.');

    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }
}

/**
 * Cleanup module resources.
 */
function cleanup() {
    disable();

    while (state.cleanupCallbacks.length > 0) {
        const teardown = state.cleanupCallbacks.pop();
        try {
            teardown();
        } catch (_error) {
            // Ignore teardown errors.
        }
    }

    state.pendingContainers.clear();
    state.renderScheduled = false;
    clearDeferredRescanTimer();
    state.decorateRetryCounts = new WeakMap();

    clearStatusMessage();

    if (state.actionBar) {
        state.actionBar.remove();
    }
    if (state.playlistPanel) {
        state.playlistPanel.remove();
    }
    if (state.createBackdrop) {
        state.createBackdrop.remove();
    }

    state.actionBar = null;
    state.actionCount = null;
    state.actionTotalCount = null;
    state.actionSaveButton = null;
    state.actionRemoveButton = null;
    state.actionSelectAllButton = null;
    state.actionUnselectAllButton = null;
    state.actionExitButton = null;

    state.playlistPanel = null;
    state.playlistPanelCount = null;
    state.playlistPanelList = null;
    state.playlistPanelStatus = null;
    state.playlistPanelCloseButton = null;
    state.playlistPanelNewButton = null;

    state.createBackdrop = null;
    state.createModal = null;
    state.createTitleInput = null;
    state.createVisibilityButton = null;
    state.createVisibilityValue = null;
    state.createVisibilityMenu = null;
    state.createCollaborateInput = null;
    state.createCancelButton = null;
    state.createCreateButton = null;
    state.createStatus = null;

    if (state.mastheadSlot) {
        state.mastheadSlot.remove();
    }
    state.mastheadSlot = null;
    state.mastheadButton = null;
    state.mastheadBadge = null;

    state.selectedVideoIds.clear();
    state.selectedPlaylistIds.clear();
    state.playlistMap.clear();
    state.playlistOptions = [];

    state.playlistPanelVisible = false;
    state.createModalVisible = false;
    state.state.createVisibilityMenuVisible = false;
    state.loadingPlaylists = false;
    state.submitting = false;
    state.createSubmitting = false;
    state.createVisibility = 'PRIVATE';
    state.selectAllMode = false;

    state.lastPlaylistProbeVideoId = '';

    document.documentElement.classList.remove(ROOT_SELECTION_CLASS);

    state.isInitialized = false;
    logger.info('Playlist multi-select cleaned up');
}

export { initPlaylistMultiSelect, enable, disable, cleanup };
