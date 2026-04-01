/**
 * Playlist Multi-Select (Isolated World)
 * Select feed cards and save selected videos to playlists.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';
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
    PLAYLIST_ID_PATTERN
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
    createSplitIcon
} from './playlist-multi-select/icons.js';
import {
    extractVideoId,
    isEligiblePage,
    resolveMastheadMountPoint,
    getCurrentPlaylistId,
    isPlaylistCollectionPage,
    getRemoveActionLabel,
    isPlaylistsPage,
    collectRenderedPlaylistIds
} from './playlist-multi-select/pageContext.js';
import { createBridgeClient } from './playlist-multi-select/bridge.js';
import { createSelectionRangeController } from './playlist-multi-select/selectionRange.js';
import { isVideoWatched } from './watchedHistory.js';

const logger = createLogger('PlaylistMultiSelect');
const bridgeClient = createBridgeClient({
    source: BRIDGE_SOURCE,
    requestType: REQUEST_TYPE,
    responseType: RESPONSE_TYPE,
    timeoutMs: REQUEST_TIMEOUT_MS,
    requestPrefix: 'ytc-playlist'
});

let isInitialized = false;
let isEnabled = true;
let selectionMode = false;
let playlistPanelVisible = false;
let createModalVisible = false;
let createVisibilityMenuVisible = false;
let loadingPlaylists = false;
let submitting = false;
let createSubmitting = false;

let mastheadSlot = null;
let mastheadButton = null;
let mastheadBadge = null;

let actionBar = null;
let actionCount = null;
let actionTotalCount = null;
let actionWatchLaterButton = null;
let actionSaveButton = null;
let actionQuickCreateButton = null;
let actionSplitButton = null;
let actionRemoveButton = null;
let actionRemoveWatchedButton = null;
let actionDeletePlaylistsButton = null;
let actionSelectAllButton = null;
let actionUnselectAllButton = null;
let actionOpenAllButton = null;
let actionExitButton = null;
let progressBar = null;
let progressBarLabel = null;
let progressBarFill = null;
let progressBarCount = null;

let playlistPanel = null;
let playlistPanelCount = null;
let playlistPanelList = null;
let playlistPanelStatus = null;
let playlistPanelCloseButton = null;
let playlistPanelNewButton = null;

let createBackdrop = null;
let createModal = null;
let splitBackdrop = null;
let splitModal = null;
let splitCountInput = null;
let splitStatus = null;
let splitSubmitting = false;
let createTitleInput = null;
let createVisibilityButton = null;
let createVisibilityValue = null;
let createVisibilityMenu = null;
let createCollaborateInput = null;
let createCancelButton = null;
let createCreateButton = null;
let createStatus = null;

let observer = null;
let pendingContainers = new Set();
let renderScheduled = false;
let deferredRescanTimer = null;

let lastKnownUrl = location.href;
let statusTimer = null;
let postSaveResetTimer = null;
let lastPlaylistProbeVideoId = '';
let createVisibility = 'PRIVATE';
let selectAllMode = false;
const WATCH_LATER_PLAYLIST_ID = 'WL';

const selectedVideoIds = new Set();
const selectedPlaylistIds = new Set();
const cleanupCallbacks = [];
const playlistMap = new Map();
const selectionRangeController = createSelectionRangeController();
let decorateRetryCounts = new WeakMap();

const DECORATE_MAX_RETRIES = 3;
const DECORATE_RETRY_DELAY_MS = 320;

let playlistOptions = [];

/**
 * Clamp number to bounds.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Convert visibility enum to UI label.
 * @param {string} value
 * @returns {string}
 */
function visibilityLabel(value) {
    const option = VISIBILITY_OPTIONS.find((item) => item.value === value);
    return option ? option.label : 'Private';
}

function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return '';
    }
    return list[Math.floor(Math.random() * list.length)];
}

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
 * Resolve icon path for visibility option.
 * @param {string} value
 * @returns {string}
 */
function visibilityIconPath(value) {
    if (value === 'PUBLIC') {
        return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 9h-2.95a15.65 15.65 0 00-1.38-5.02A8.03 8.03 0 0118.93 11zM12 4.04c.83 1.2 1.5 2.95 1.9 4.96h-3.8c.4-2.01 1.07-3.76 1.9-4.96zM4.07 13h2.95c.12 1.83.59 3.56 1.38 5.02A8.03 8.03 0 014.07 13zm2.95-2H4.07a8.03 8.03 0 014.33-5.02A15.65 15.65 0 007.02 11zM12 19.96c-.83-1.2-1.5-2.95-1.9-4.96h3.8c-.4 2.01-1.07 3.76-1.9 4.96zM14.34 13H9.66c-.11-1.01-.16-2.01-.16-3s.05-1.99.16-3h4.68c.11 1.01.16 2.01.16 3s-.05 1.99-.16 3zm.26 5.02c.79-1.46 1.26-3.19 1.38-5.02h2.95a8.03 8.03 0 01-4.33 5.02z';
    }

    if (value === 'UNLISTED') {
        return 'M3.9 12a5 5 0 015-5h3v2h-3a3 3 0 000 6h3v2h-3a5 5 0 01-5-5zm7-1h2v2h-2v-2zm4.1-4h-3v2h3a3 3 0 010 6h-3v2h3a5 5 0 000-10z';
    }

    return 'M12 17a2 2 0 100-4 2 2 0 000 4zm6-8h-1V7a5 5 0 00-10 0v2H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2zm-9-2a3 3 0 116 0v2H9V7zm9 13H6v-9h12v9z';
}

/**
 * Ensure masthead slot + icon button exist and are mounted.
 */
function ensureMastheadButton() {
    if (!mastheadButton) {
        mastheadButton = document.createElement('button');
        mastheadButton.type = 'button';
        mastheadButton.className = MASTHEAD_BUTTON_CLASS;
        mastheadButton.title = 'Select videos';
        mastheadButton.setAttribute('aria-label', 'Select videos');
        mastheadButton.appendChild(createMastheadIcon());
        mastheadButton.addEventListener('click', handleMastheadButtonClick);
        cleanupCallbacks.push(() => mastheadButton?.removeEventListener('click', handleMastheadButtonClick));
    }

    if (!mastheadBadge) {
        mastheadBadge = document.createElement('span');
        mastheadBadge.className = MASTHEAD_BADGE_CLASS;
        mastheadBadge.textContent = '0';
        mastheadButton.appendChild(mastheadBadge);
    }

    if (!mastheadSlot) {
        mastheadSlot = document.createElement('div');
        mastheadSlot.className = MASTHEAD_SLOT_CLASS;
    }

    if (!mastheadButton.parentElement || mastheadButton.parentElement !== mastheadSlot) {
        mastheadSlot.appendChild(mastheadButton);
    }

    const mountPoint = resolveMastheadMountPoint();
    if (mountPoint && mastheadSlot.parentElement !== mountPoint.parent) {
        mountPoint.parent.insertBefore(mastheadSlot, mountPoint.anchor);
    } else if (!mountPoint && !mastheadSlot.isConnected) {
        document.body.appendChild(mastheadSlot);
    }

    updateMastheadButtonState();
    updateMastheadVisibility();
}

/**
 * Toggle masthead visibility by page eligibility + feature state.
 */
function updateMastheadVisibility() {
    const visible = isEnabled && isEligiblePage();
    if (mastheadSlot) {
        mastheadSlot.style.display = visible ? '' : 'none';
    }
}

/**
 * Build one icon button for action bar.
 * @param {SVGSVGElement} icon
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
function createActionIconButton(icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yt-commander-playlist-action-button';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('data-tooltip', label);
    button.appendChild(icon);
    return button;
}

/**
 * Ensure bottom action bar exists.
 */
function ensureActionBar() {
    if (actionBar && actionBar.isConnected) {
        return;
    }

    actionBar = document.createElement('div');
    actionBar.className = ACTION_BAR_CLASS;

    const countWrap = document.createElement('div');
    countWrap.className = 'yt-commander-playlist-action-count';

    const countLabel = document.createElement('span');
    countLabel.className = 'yt-commander-playlist-action-count-label';
    countLabel.textContent = 'Selected';

    actionCount = document.createElement('span');
    actionCount.className = 'yt-commander-playlist-action-count-value';
    actionCount.textContent = '0';

    const totalLabel = document.createElement('span');
    totalLabel.className = 'yt-commander-playlist-action-count-label';
    totalLabel.textContent = 'of';

    actionTotalCount = document.createElement('span');
    actionTotalCount.className = 'yt-commander-playlist-action-count-total';
    actionTotalCount.textContent = '0';

    countWrap.appendChild(countLabel);
    countWrap.appendChild(actionCount);
    countWrap.appendChild(totalLabel);
    countWrap.appendChild(actionTotalCount);

    actionWatchLaterButton = createActionIconButton(createWatchLaterIcon(), 'Save to Watch later');
    actionSaveButton = createActionIconButton(createBookmarkIcon(), 'Save to playlist');
    actionQuickCreateButton = createActionIconButton(createPlaylistAddIcon(), 'Save to new playlist');
    actionSplitButton = createActionIconButton(createSplitIcon(), 'Split into playlists');
    actionRemoveButton = createActionIconButton(createRemoveIcon(), getRemoveActionLabel());
    actionRemoveWatchedButton = createActionIconButton(createRemoveIcon(), 'Remove watched');
    actionDeletePlaylistsButton = createActionIconButton(createRemoveIcon(), 'Delete selected playlists');
    actionSelectAllButton = createActionIconButton(createSelectAllIcon(), 'Select all');
    actionUnselectAllButton = createActionIconButton(createUnselectAllIcon(), 'Unselect all');

    actionOpenAllButton = document.createElement('button');
    actionOpenAllButton.type = 'button';
    actionOpenAllButton.className = 'yt-commander-playlist-action-button';
    actionOpenAllButton.setAttribute('aria-label', 'Open all in new tab');
    actionOpenAllButton.setAttribute('title', 'Open all in new tab');
    actionOpenAllButton.setAttribute('data-tooltip', 'Open all in new tab');
    const openIcon = createSvgIcon(ICONS.OPEN_NEW_TAB);
    actionOpenAllButton.appendChild(openIcon);

    actionExitButton = document.createElement('button');
    actionExitButton.type = 'button';
    actionExitButton.className = 'yt-commander-playlist-action-button yt-commander-playlist-action-exit';
    actionExitButton.setAttribute('aria-label', 'Exit selection mode');
    actionExitButton.setAttribute('title', 'Exit selection mode');
    actionExitButton.setAttribute('data-tooltip', 'Exit selection mode');
    actionExitButton.appendChild(createCloseIcon());

    actionBar.appendChild(countWrap);
    actionBar.appendChild(actionWatchLaterButton);
    actionBar.appendChild(actionSaveButton);
    actionBar.appendChild(actionQuickCreateButton);
    actionBar.appendChild(actionSplitButton);
    actionBar.appendChild(actionRemoveButton);
    actionBar.appendChild(actionRemoveWatchedButton);
    actionBar.appendChild(actionDeletePlaylistsButton);
    actionBar.appendChild(actionSelectAllButton);
    actionBar.appendChild(actionUnselectAllButton);
    actionBar.appendChild(actionOpenAllButton);
    actionBar.appendChild(actionExitButton);

    progressBar = document.createElement('div');
    progressBar.className = 'yt-commander-playlist-progress';
    progressBar.hidden = true;

    progressBarLabel = document.createElement('div');
    progressBarLabel.className = 'yt-commander-playlist-progress__label';
    progressBarLabel.textContent = 'Saving...';

    const progressBarElement = document.createElement('div');
    progressBarElement.className = 'yt-commander-playlist-progress__bar';

    progressBarFill = document.createElement('div');
    progressBarFill.className = 'yt-commander-playlist-progress__fill';

    progressBarCount = document.createElement('div');
    progressBarCount.className = 'yt-commander-playlist-progress__count';
    progressBarCount.textContent = '0 / 0';

    progressBarElement.appendChild(progressBarFill);
    progressBar.appendChild(progressBarLabel);
    progressBar.appendChild(progressBarElement);
    progressBar.appendChild(progressBarCount);

    document.body.appendChild(actionBar);
    document.body.appendChild(progressBar);

    actionWatchLaterButton.addEventListener('click', handleActionWatchLaterClick);
    actionSaveButton.addEventListener('click', handleActionSaveClick);
    actionQuickCreateButton.addEventListener('click', handleActionQuickCreateClick);
    actionSplitButton.addEventListener('click', handleSplitClick);
    actionRemoveButton.addEventListener('click', handleActionRemoveClick);
    actionRemoveWatchedButton.addEventListener('click', handleActionRemoveWatchedClick);
    actionDeletePlaylistsButton.addEventListener('click', handleActionDeletePlaylistsClick);
    actionSelectAllButton.addEventListener('click', handleActionSelectAllClick);
    actionUnselectAllButton.addEventListener('click', handleActionUnselectAllClick);
    actionOpenAllButton.addEventListener('click', handleOpenInNewTab);
    actionExitButton.addEventListener('click', handleActionExitButtonClick);

    cleanupCallbacks.push(() => actionWatchLaterButton?.removeEventListener('click', handleActionWatchLaterClick));
    cleanupCallbacks.push(() => actionSaveButton?.removeEventListener('click', handleActionSaveClick));
    cleanupCallbacks.push(() => actionQuickCreateButton?.removeEventListener('click', handleActionQuickCreateClick));
    cleanupCallbacks.push(() => actionSplitButton?.removeEventListener('click', handleSplitClick));
    cleanupCallbacks.push(() => actionRemoveButton?.removeEventListener('click', handleActionRemoveClick));
    cleanupCallbacks.push(() => actionRemoveWatchedButton?.removeEventListener('click', handleActionRemoveWatchedClick));
    cleanupCallbacks.push(() => actionDeletePlaylistsButton?.removeEventListener('click', handleActionDeletePlaylistsClick));
    cleanupCallbacks.push(() => actionSelectAllButton?.removeEventListener('click', handleActionSelectAllClick));
    cleanupCallbacks.push(() => actionUnselectAllButton?.removeEventListener('click', handleActionUnselectAllClick));
    cleanupCallbacks.push(() => actionOpenAllButton?.removeEventListener('click', handleOpenInNewTab));
    cleanupCallbacks.push(() => actionExitButton?.removeEventListener('click', handleActionExitButtonClick));
    syncRemoveActionButton();
}

/**
 * Ensure playlist panel exists.
 */
function ensurePlaylistPanel() {
    if (playlistPanel && playlistPanel.isConnected) {
        return;
    }

    playlistPanel = document.createElement('div');
    playlistPanel.className = PLAYLIST_PANEL_CLASS;
    playlistPanel.setAttribute('role', 'dialog');
    playlistPanel.setAttribute('aria-label', 'Save to playlist');

    const header = document.createElement('div');
    header.className = 'yt-commander-playlist-panel__header';

    const title = document.createElement('div');
    title.className = 'yt-commander-playlist-panel__title';
    title.textContent = 'Save to...';

    playlistPanelCloseButton = document.createElement('button');
    playlistPanelCloseButton.type = 'button';
    playlistPanelCloseButton.className = 'yt-commander-playlist-panel__close';
    playlistPanelCloseButton.setAttribute('aria-label', 'Close');
    playlistPanelCloseButton.appendChild(createCloseIcon());

    header.appendChild(title);
    header.appendChild(playlistPanelCloseButton);

    const subhead = document.createElement('div');
    subhead.className = 'yt-commander-playlist-panel__subhead';
    playlistPanelCount = document.createElement('span');
    playlistPanelCount.className = 'yt-commander-playlist-panel__count';
    playlistPanelCount.textContent = '0 selected';
    subhead.appendChild(playlistPanelCount);

    playlistPanelList = document.createElement('div');
    playlistPanelList.className = 'yt-commander-playlist-panel__list';
    playlistPanelList.setAttribute('role', 'listbox');
    playlistPanelList.setAttribute('aria-label', 'Playlists');

    playlistPanelStatus = document.createElement('div');
    playlistPanelStatus.className = 'yt-commander-playlist-panel__status';
    playlistPanelStatus.setAttribute('aria-live', 'polite');

    const footer = document.createElement('div');
    footer.className = 'yt-commander-playlist-panel__footer';

    playlistPanelNewButton = document.createElement('button');
    playlistPanelNewButton.type = 'button';
    playlistPanelNewButton.className = 'yt-commander-playlist-panel__new';
    const plus = document.createElement('span');
    plus.className = 'yt-commander-playlist-panel__new-icon';
    plus.appendChild(createPlusIcon());
    const newLabel = document.createElement('span');
    newLabel.textContent = 'New playlist';
    playlistPanelNewButton.appendChild(plus);
    playlistPanelNewButton.appendChild(newLabel);

    footer.appendChild(playlistPanelNewButton);

    playlistPanel.appendChild(header);
    playlistPanel.appendChild(subhead);
    playlistPanel.appendChild(playlistPanelList);
    playlistPanel.appendChild(playlistPanelStatus);
    playlistPanel.appendChild(footer);

    document.body.appendChild(playlistPanel);

    playlistPanelCloseButton.addEventListener('click', closePlaylistPanel);
    playlistPanelList.addEventListener('click', handlePlaylistListClick);
    playlistPanelNewButton.addEventListener('click', handlePlaylistNewButtonClick);

    cleanupCallbacks.push(() => playlistPanelCloseButton?.removeEventListener('click', closePlaylistPanel));
    cleanupCallbacks.push(() => playlistPanelList?.removeEventListener('click', handlePlaylistListClick));
    cleanupCallbacks.push(() => playlistPanelNewButton?.removeEventListener('click', handlePlaylistNewButtonClick));
}

/**
 * Ensure create-playlist modal exists.
 */
function ensureCreateModal() {
    if (createBackdrop && createBackdrop.isConnected) {
        return;
    }

    createBackdrop = document.createElement('div');
    createBackdrop.className = CREATE_BACKDROP_CLASS;

    createModal = document.createElement('div');
    createModal.className = CREATE_MODAL_CLASS;
    createModal.setAttribute('role', 'dialog');
    createModal.setAttribute('aria-modal', 'true');
    createModal.setAttribute('aria-label', 'New playlist');

    const modalTitle = document.createElement('h3');
    modalTitle.className = 'yt-commander-playlist-create-modal__title';
    modalTitle.textContent = 'New playlist';

    createTitleInput = document.createElement('input');
    createTitleInput.type = 'text';
    createTitleInput.className = 'yt-commander-playlist-create-modal__input';
    createTitleInput.placeholder = 'Choose a title';
    createTitleInput.maxLength = 150;

    const visibilityWrap = document.createElement('div');
    visibilityWrap.className = 'yt-commander-playlist-create-modal__visibility';

    createVisibilityButton = document.createElement('button');
    createVisibilityButton.type = 'button';
    createVisibilityButton.className = 'yt-commander-playlist-create-modal__visibility-button';
    createVisibilityButton.setAttribute('aria-haspopup', 'listbox');
    createVisibilityButton.setAttribute('aria-expanded', 'false');

    const visibilityTextWrap = document.createElement('span');
    visibilityTextWrap.className = 'yt-commander-playlist-create-modal__visibility-text';

    const visibilityLabelText = document.createElement('span');
    visibilityLabelText.className = 'yt-commander-playlist-create-modal__visibility-label';
    visibilityLabelText.textContent = 'Visibility';

    createVisibilityValue = document.createElement('span');
    createVisibilityValue.className = 'yt-commander-playlist-create-modal__visibility-value';
    createVisibilityValue.textContent = visibilityLabel(createVisibility);

    visibilityTextWrap.appendChild(visibilityLabelText);
    visibilityTextWrap.appendChild(createVisibilityValue);
    createVisibilityButton.appendChild(visibilityTextWrap);
    createVisibilityButton.appendChild(createChevronDownIcon());

    createVisibilityMenu = document.createElement('div');
    createVisibilityMenu.className = 'yt-commander-playlist-create-modal__visibility-menu';
    createVisibilityMenu.setAttribute('role', 'listbox');

    visibilityWrap.appendChild(createVisibilityButton);
    visibilityWrap.appendChild(createVisibilityMenu);

    const collaborateRow = document.createElement('div');
    collaborateRow.className = 'yt-commander-playlist-create-modal__collaborate';

    const collaborateLabel = document.createElement('span');
    collaborateLabel.className = 'yt-commander-playlist-create-modal__collaborate-label';
    collaborateLabel.textContent = 'Collaborate';

    const switchLabel = document.createElement('label');
    switchLabel.className = 'yt-commander-playlist-create-modal__switch';
    createCollaborateInput = document.createElement('input');
    createCollaborateInput.type = 'checkbox';
    createCollaborateInput.className = 'yt-commander-playlist-create-modal__switch-input';
    const slider = document.createElement('span');
    slider.className = 'yt-commander-playlist-create-modal__switch-slider';
    switchLabel.appendChild(createCollaborateInput);
    switchLabel.appendChild(slider);

    collaborateRow.appendChild(collaborateLabel);
    collaborateRow.appendChild(switchLabel);

    createStatus = document.createElement('div');
    createStatus.className = 'yt-commander-playlist-create-modal__status';
    createStatus.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'yt-commander-playlist-create-modal__actions';

    createCancelButton = document.createElement('button');
    createCancelButton.type = 'button';
    createCancelButton.className = 'yt-commander-playlist-create-modal__button';
    createCancelButton.textContent = 'Cancel';

    createCreateButton = document.createElement('button');
    createCreateButton.type = 'button';
    createCreateButton.className = 'yt-commander-playlist-create-modal__button yt-commander-playlist-create-modal__button--primary';
    createCreateButton.textContent = 'Create';

    actions.appendChild(createCancelButton);
    actions.appendChild(createCreateButton);

    createModal.appendChild(modalTitle);
    createModal.appendChild(createTitleInput);
    createModal.appendChild(visibilityWrap);
    createModal.appendChild(collaborateRow);
    createModal.appendChild(createStatus);
    createModal.appendChild(actions);
    createBackdrop.appendChild(createModal);

    document.body.appendChild(createBackdrop);

    createBackdrop.addEventListener('mousedown', handleCreateBackdropMouseDown);
    createTitleInput.addEventListener('input', updateCreateModalState);
    createTitleInput.addEventListener('keydown', handleCreateTitleKeydown);
    createVisibilityButton.addEventListener('click', handleCreateVisibilityButtonClick);
    createVisibilityMenu.addEventListener('click', handleCreateVisibilityMenuClick);
    createCancelButton.addEventListener('click', closeCreateModal);
    createCreateButton.addEventListener('click', handleCreateSubmitClick);

    cleanupCallbacks.push(() => createBackdrop?.removeEventListener('mousedown', handleCreateBackdropMouseDown));
    cleanupCallbacks.push(() => createTitleInput?.removeEventListener('input', updateCreateModalState));
    cleanupCallbacks.push(() => createTitleInput?.removeEventListener('keydown', handleCreateTitleKeydown));
    cleanupCallbacks.push(() => createVisibilityButton?.removeEventListener('click', handleCreateVisibilityButtonClick));
    cleanupCallbacks.push(() => createVisibilityMenu?.removeEventListener('click', handleCreateVisibilityMenuClick));
    cleanupCallbacks.push(() => createCancelButton?.removeEventListener('click', closeCreateModal));
    cleanupCallbacks.push(() => createCreateButton?.removeEventListener('click', handleCreateSubmitClick));

    renderCreateVisibilityOptions();
    updateCreateModalState();
}

/**
 * Ensure all action UI elements exist.
 */
function ensureActionUi() {
    ensureActionBar();
    ensurePlaylistPanel();
    ensureCreateModal();
}

/**
 * Position the playlist panel relative to the save action.
 */
function positionPlaylistPanel() {
    if (!playlistPanelVisible || !playlistPanel || !actionSaveButton) {
        return;
    }

    positionElementAboveAnchor(playlistPanel, actionSaveButton);
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
        top = clamp(anchorRect.bottom + spacing, viewportGap, window.innerHeight - rect.height - viewportGap);
    }

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
}

/**
 * Render visibility options for create modal.
 */
function renderCreateVisibilityOptions() {
    if (!createVisibilityMenu) {
        return;
    }

    createVisibilityMenu.innerHTML = '';

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
        createVisibilityMenu.appendChild(button);
    });
}

/**
 * Update masthead state.
 */
function updateMastheadButtonState() {
    if (!mastheadButton || !mastheadBadge) {
        return;
    }

    const selectedCount = selectedVideoIds.size;
    mastheadButton.classList.toggle('is-active', selectionMode);
    mastheadBadge.textContent = selectedCount > 99 ? '99+' : String(selectedCount);
    mastheadBadge.classList.toggle('is-visible', selectedCount > 0);
    mastheadButton.title = selectionMode ? 'Exit selection mode' : 'Select videos';
}

/**
 * Update create modal controls.
 */
function updateCreateModalState() {
    if (!createVisibilityValue || !createVisibilityMenu || !createVisibilityButton) {
        return;
    }

    createVisibilityValue.textContent = visibilityLabel(createVisibility);
    createVisibilityButton.setAttribute('aria-expanded', createVisibilityMenuVisible ? 'true' : 'false');
    createVisibilityMenu.classList.toggle('is-visible', createVisibilityMenuVisible);

    const options = createVisibilityMenu.querySelectorAll('.yt-commander-playlist-create-modal__visibility-option');
    options.forEach((option) => {
        const value = option.getAttribute('data-visibility') || '';
        const selected = value === createVisibility;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    const hasTitle = Boolean(createTitleInput?.value.trim());
    const hasSelection = selectedVideoIds.size > 0;

    if (createTitleInput) {
        createTitleInput.disabled = createSubmitting;
    }

    if (createVisibilityButton) {
        createVisibilityButton.disabled = createSubmitting;
    }

    if (createCollaborateInput) {
        createCollaborateInput.disabled = createSubmitting;
    }

    if (createCancelButton) {
        createCancelButton.disabled = createSubmitting;
    }

    if (createCreateButton) {
        createCreateButton.disabled = createSubmitting || !hasTitle || !hasSelection;
    }
}

/**
 * Toggle action bar visibility based on mode.
 */
function syncActionBarVisibility() {
    const visible = isEnabled && selectionMode && isEligiblePage();
    actionBar?.classList.toggle('is-visible', visible);

    if (!visible) {
        closePlaylistPanel();
        closeCreateModal(true);
    }
}

/**
 * Set message shown in playlist panel.
 * @param {string} message
 * @param {'info'|'success'|'error'} kind
 */
function setStatusMessage(message, kind = STATUS_KIND.INFO) {
    if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
    }

    const text = typeof message === 'string' ? message : '';
    if (!playlistPanelStatus) {
        return;
    }

    playlistPanelStatus.textContent = text;
    playlistPanelStatus.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');
    if (text) {
        playlistPanelStatus.classList.add('is-visible', `is-${kind}`);
    }

    if (!text) {
        return;
    }

    statusTimer = window.setTimeout(() => {
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
                videoIds: [probeVideoId]
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
    if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
    }

    [playlistPanelStatus, createStatus].forEach((node) => {
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
    if (!progressBar || !progressBarFill || !progressBarLabel || !progressBarCount) {
        return;
    }

    const percentage = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    progressBar.hidden = false;
    progressBarLabel.textContent = label || 'Saving...';
    progressBarFill.style.width = `${percentage}%`;
    progressBarCount.textContent = `${processed} / ${total}`;
}

/**
 * Hide progress bar.
 */
function hideSaveProgress() {
    if (!progressBar) {
        return;
    }

    console.log('[Progress] Hiding');
    progressBar.hidden = true;
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
    if (actionCount) {
        actionCount.textContent = '0';
    }

    if (actionTotalCount) {
        actionTotalCount.textContent = '0';
    }
}

/**
 * Sync remove-action visibility/label based on current route.
 */
function syncRemoveActionButton() {
    const canRemove = isPlaylistCollectionPage();
    if (!actionRemoveButton) {
        return;
    }

    const label = getRemoveActionLabel();
    actionRemoveButton.hidden = !canRemove;
    actionRemoveButton.setAttribute('aria-label', label);
    actionRemoveButton.setAttribute('title', label);
    actionRemoveButton.setAttribute('data-tooltip', label);

    if (actionRemoveWatchedButton) {
        actionRemoveWatchedButton.hidden = !canRemove;
    }
}

/**
 * Update action controls based on selection and loading/submitting states.
 */
function updateActionUiState() {
    const isPlaylistPage = isPlaylistsPage();
    const selectedVideoCount = selectedVideoIds.size;
    const selectedPlaylistCount = selectedPlaylistIds.size;
    const pageVideoCount = collectRenderedVideoIds().length;
    const pagePlaylistCount = collectRenderedPlaylistIds().length;

    const selectedCount = isPlaylistPage ? selectedPlaylistCount : selectedVideoCount;
    const pageCount = isPlaylistPage ? pagePlaylistCount : pageVideoCount;

    if (actionCount) {
        actionCount.textContent = selectedCount > 999 ? '999+' : String(selectedCount);
    }

    if (actionTotalCount) {
        actionTotalCount.textContent = pageCount > 9999 ? '9999+' : String(pageCount);
    }

    if (playlistPanelCount) {
        playlistPanelCount.textContent = `${selectedCount} selected`;
    }

    if (actionSaveButton) {
        actionSaveButton.hidden = isPlaylistPage;
        actionSaveButton.disabled = selectedCount === 0 || loadingPlaylists || submitting || createSubmitting;
    }

    if (actionQuickCreateButton) {
        actionQuickCreateButton.hidden = isPlaylistPage;
        actionQuickCreateButton.disabled = selectedCount === 0 || loadingPlaylists || submitting || createSubmitting;
    }

    if (actionSplitButton) {
        actionSplitButton.hidden = isPlaylistPage;
        actionSplitButton.disabled = selectedCount === 0 || submitting;
    }

    if (actionWatchLaterButton) {
        actionWatchLaterButton.hidden = isPlaylistPage;
        actionWatchLaterButton.disabled = selectedCount === 0 || loadingPlaylists || submitting || createSubmitting;
    }

    if (actionSelectAllButton) {
        actionSelectAllButton.hidden = isPlaylistPage;
        actionSelectAllButton.disabled = pageCount === 0 || loadingPlaylists || submitting || createSubmitting;
        actionSelectAllButton.classList.toggle('is-active', selectAllMode);
    }

    if (actionUnselectAllButton) {
        actionUnselectAllButton.hidden = isPlaylistPage;
        actionUnselectAllButton.disabled = selectedCount === 0 || loadingPlaylists || submitting || createSubmitting;
    }

    if (actionOpenAllButton) {
        actionOpenAllButton.hidden = isPlaylistPage;
        actionOpenAllButton.disabled = selectedCount === 0 || submitting;
    }

    syncRemoveActionButton();
    if (actionRemoveButton) {
        actionRemoveButton.hidden = isPlaylistPage;
        actionRemoveButton.disabled = selectedCount === 0 || loadingPlaylists || submitting || createSubmitting;
    }

    if (actionRemoveWatchedButton) {
        actionRemoveWatchedButton.hidden = isPlaylistPage;
        actionRemoveWatchedButton.disabled = submitting || loadingPlaylists;
    }

    if (actionDeletePlaylistsButton) {
        actionDeletePlaylistsButton.classList.toggle('is-visible', isPlaylistPage);
        actionDeletePlaylistsButton.disabled = selectedPlaylistCount === 0 || submitting || loadingPlaylists;
    }

    if (playlistPanelCloseButton) {
        playlistPanelCloseButton.disabled = submitting;
    }

    if (playlistPanelNewButton) {
        playlistPanelNewButton.disabled = selectedCount === 0 || submitting || loadingPlaylists || createSubmitting;
    }

    playlistPanel?.classList.toggle('is-busy', loadingPlaylists || submitting);

    if (selectedCount === 0) {
        closePlaylistPanel();
        closeCreateModal();
    }

    updateMastheadButtonState();
    updateCreateModalState();
}

/**
 * Open playlist panel above action bar.
 */
async function openPlaylistPanel() {
    if (!selectionMode || selectedVideoIds.size === 0 || createSubmitting) {
        return;
    }

    ensureActionUi();

    if (!playlistPanel || !actionSaveButton) {
        return;
    }

    playlistPanel.classList.add('is-visible');
    playlistPanelVisible = true;
    updateActionUiState();
    positionPlaylistPanel();
    renderPlaylistLoading();
    await loadPlaylistsForPanel();
}

/**
 * Close playlist panel.
 */
function closePlaylistPanel() {
    playlistPanelVisible = false;
    playlistPanel?.classList.remove('is-visible');
    lastPlaylistProbeVideoId = '';
    playlistOptions = [];
    playlistMap.clear();
    selectedPlaylistIds.clear();
}

/**
 * Render loading state in playlist panel.
 */
function renderPlaylistLoading() {
    if (!playlistPanelList) {
        return;
    }

    playlistPanelList.innerHTML = '<div class="yt-commander-playlist-panel__empty">Loading playlists...</div>';
    positionPlaylistPanel();
}

/**
 * Render empty/error message in playlist panel.
 * @param {string} message
 */
function renderPlaylistEmpty(message) {
    if (!playlistPanelList) {
        return;
    }

    playlistPanelList.innerHTML = `<div class="yt-commander-playlist-panel__empty">${message}</div>`;
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
    if (!playlistPanelList) {
        return;
    }

    if (!Array.isArray(playlistOptions) || playlistOptions.length === 0) {
        renderPlaylistEmpty('No playlists found.');
        return;
    }

    playlistPanelList.innerHTML = '';

    playlistOptions.forEach((playlist) => {
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
        playlistPanelList.appendChild(row);
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
    if (!playlistPanelList || !playlistId || !thumbnailUrl) {
        return;
    }

    const row = playlistPanelList.querySelector(
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
    if (!playlistPanelVisible || loadingPlaylists || !Array.isArray(playlistOptions)) {
        return;
    }

    const missing = playlistOptions
        .filter((playlist) => playlist?.id && !playlist.thumbnailUrl)
        .map((playlist) => playlist.id);

    if (missing.length === 0) {
        return;
    }

    try {
        const response = await sendBridgeRequest(ACTIONS.GET_PLAYLIST_THUMBNAILS, {
            playlistIds: missing
        });
        const thumbnailsById = response?.thumbnailsById || {};
        Object.entries(thumbnailsById).forEach(([playlistId, thumbnailUrl]) => {
            if (typeof thumbnailUrl !== 'string' || !thumbnailUrl) {
                return;
            }
            const entry = playlistOptions.find((playlist) => playlist?.id === playlistId);
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
    if (!playlistPanelList) {
        return;
    }

    const rows = playlistPanelList.querySelectorAll('.yt-commander-playlist-panel__item');
    rows.forEach((row) => {
        const playlistId = row.getAttribute('data-playlist-id') || '';
        const selected = selectedPlaylistIds.has(playlistId);
        row.classList.toggle('is-selected', selected);
        row.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
}

/**
 * Load playlists from main-world API for panel.
 */
async function loadPlaylistsForPanel() {
    if (!playlistPanelVisible || selectedVideoIds.size === 0 || loadingPlaylists) {
        return;
    }

    const selectedIds = Array.from(selectedVideoIds);
    const probeVideoId = selectedIds[0] || '';

    if (probeVideoId && probeVideoId === lastPlaylistProbeVideoId && playlistOptions.length > 0) {
        lastPlaylistProbeVideoId = '';
    }

    loadingPlaylists = true;
    updateActionUiState();
    renderPlaylistLoading();

    try {
        const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, {
            videoIds: selectedIds
        });

        playlistOptions = Array.isArray(response?.playlists) ? response.playlists : [];
        playlistMap.clear();
        selectedPlaylistIds.clear();
        lastPlaylistProbeVideoId = probeVideoId;

        playlistOptions.forEach((playlist) => {
            if (!playlist?.id) {
                return;
            }
            playlistMap.set(playlist.id, playlist);
            if (playlist.isSelected === true) {
                selectedPlaylistIds.add(playlist.id);
            }
        });

        renderPlaylistOptions();
        void loadPlaylistThumbnailsForPanel();
    } catch (error) {
        logger.warn('Failed to load playlists', error);
        renderPlaylistEmpty('Failed to load playlists.');
        setStatusMessage(error instanceof Error ? error.message : 'Failed to load playlists.', STATUS_KIND.ERROR);
    } finally {
        loadingPlaylists = false;
        updateActionUiState();
    }
}

/**
 * Save selected videos to one playlist.
 * @param {string} playlistId
 */
async function saveSelectionToPlaylist(playlistId) {
    if (!playlistId || submitting || createSubmitting) {
        return;
    }

    const videoIds = Array.from(selectedVideoIds);
    if (videoIds.length === 0) {
        setStatusMessage('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    submitting = true;
    updateActionUiState();
    closePlaylistPanel();

    const playlistTitle = playlistId === WATCH_LATER_PLAYLIST_ID
        ? 'Watch later'
        : (playlistMap.get(playlistId)?.title || 'playlist');
    showSaveProgress(0, videoIds.length, playlistTitle);

    try {
        const response = await sendBridgeRequest(ACTIONS.ADD_TO_PLAYLISTS, {
            videoIds,
            playlistIds: [playlistId],
            playlistTitles: [playlistTitle]
        }, (progress) => {
            if (progress) {
                showSaveProgress(progress.processed, progress.total, progress.label || playlistTitle);
            }
        });

        hideSaveProgress();
        const successCount = Number(response?.successCount) || 0;
        if (successCount > 0) {
            selectedPlaylistIds.add(playlistId);
            syncPlaylistSelectionVisuals();
            setStatusMessage(`Saved to ${playlistTitle}.`, STATUS_KIND.SUCCESS);
            resetSelectionOnly();
            return;
        }

        setStatusMessage('No playlist was updated.', STATUS_KIND.ERROR);
    } catch (error) {
        logger.warn('Failed to save selected videos', error);
        hideSaveProgress();
        setStatusMessage(error instanceof Error ? error.message : 'Failed to save videos.', STATUS_KIND.ERROR);
    } finally {
        submitting = false;
        updateActionUiState();
    }
}

/**
 * Create a new playlist with a random title and save selected videos to it.
 */
async function createQuickPlaylistAndSave() {
    if (createSubmitting || submitting) {
        return;
    }

    const videoIds = Array.from(selectedVideoIds);
    if (videoIds.length === 0) {
        setStatusMessage('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    createSubmitting = true;
    updateActionUiState();
    hideSaveProgress();

    try {
        const title = await generateQuickPlaylistTitle();
        setStatusMessage(`Creating "${title}"...`, STATUS_KIND.INFO);

        const response = await sendBridgeRequest(ACTIONS.CREATE_PLAYLIST_AND_ADD, {
            title,
            privacyStatus: createVisibility || 'PRIVATE',
            collaborate: false,
            videoIds
        }, (progress) => {
            if (progress) {
                showSaveProgress(progress.processed, progress.total, progress.label || title);
            }
        });

        hideSaveProgress();
        const addedCount = Number(response?.addedCount) || 0;
        const requestedCount = Number(response?.requestedVideoCount) || videoIds.length;
        const failureCount = Array.isArray(response?.failures) ? response.failures.length : 0;

        lastPlaylistProbeVideoId = '';
        playlistOptions = [];
        selectedPlaylistIds.clear();

        if (failureCount > 0) {
            const savedLabel = `${addedCount}/${requestedCount}`;
            setStatusMessage(`Created "${title}". Saved ${savedLabel} video(s).`, STATUS_KIND.INFO);
        } else {
            setStatusMessage(`Created "${title}" and saved ${addedCount} video(s).`, STATUS_KIND.SUCCESS);
        }

        resetSelectionOnly();
    } catch (error) {
        logger.warn('Failed to create quick playlist', error);
        hideSaveProgress();
        setStatusMessage(error instanceof Error ? error.message : 'Failed to create playlist.', STATUS_KIND.ERROR);
    } finally {
        createSubmitting = false;
        updateActionUiState();
    }
}

function schedulePostSaveReset() {
    if (postSaveResetTimer) {
        clearTimeout(postSaveResetTimer);
        postSaveResetTimer = null;
    }
    postSaveResetTimer = window.setTimeout(() => {
        postSaveResetTimer = null;
        setSelectionMode(false);
    }, 650);
}

function resetSelectionOnly() {
    clearPostSaveResetTimer();
    clearSelectedVideos();
    resetActionCounters();
    clearStatusMessage();
    clearDeferredRescanTimer();
    pendingContainers.clear();
    renderScheduled = false;
    decorateRetryCounts = new WeakMap();
    playlistOptions = [];
    playlistMap.clear();
    selectedPlaylistIds.clear();
    lastPlaylistProbeVideoId = '';
    selectAllMode = false;
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

        selectedVideoIds.delete(videoId);
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
    if (submitting || createSubmitting) {
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

    const videoIds = Array.from(selectedVideoIds);
    if (videoIds.length === 0) {
        setStatusMessage('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    submitting = true;
    updateActionUiState();

    const playlistLabel = playlistId === 'WL' ? 'Watch later' : 'playlist';
    showSaveProgress(0, videoIds.length, `Removing from ${playlistLabel}`);

    try {
        const response = await sendBridgeRequest(ACTIONS.REMOVE_FROM_PLAYLIST, {
            playlistId,
            videoIds
        }, (progress) => {
            if (progress) {
                showSaveProgress(progress.processed, progress.total, `Removing from ${playlistLabel}`);
            }
        });

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
        setStatusMessage(error instanceof Error ? error.message : 'Failed to remove videos.', STATUS_KIND.ERROR);
    } finally {
        submitting = false;
        updateActionUiState();
    }
}

/**
 * Set create modal status text.
 * @param {string} message
 * @param {'info'|'success'|'error'} kind
 */
function setCreateStatus(message, kind = STATUS_KIND.INFO) {
    if (!createStatus) {
        return;
    }

    const text = typeof message === 'string' ? message : '';
    createStatus.textContent = text;
    createStatus.classList.remove('is-visible', 'is-info', 'is-success', 'is-error');

    if (!text) {
        return;
    }

    createStatus.classList.add('is-visible', `is-${kind}`);
}

/**
 * Open create-playlist modal.
 */
function openCreateModal() {
    if (selectedVideoIds.size === 0 || createSubmitting) {
        return;
    }

    ensureActionUi();

    createVisibility = 'PRIVATE';
    createVisibilityMenuVisible = false;
    if (createTitleInput) {
        createTitleInput.value = '';
    }
    if (createCollaborateInput) {
        createCollaborateInput.checked = false;
    }
    setCreateStatus('');
    updateCreateModalState();

    createBackdrop?.classList.add('is-visible');
    createModalVisible = true;

    window.setTimeout(() => {
        createTitleInput?.focus();
    }, 0);
}

/**
 * Close create-playlist modal.
 * @param {boolean} [force]
 */
function closeCreateModal(force = false) {
    if (createSubmitting && !force) {
        return;
    }

    createModalVisible = false;
    createVisibilityMenuVisible = false;
    createBackdrop?.classList.remove('is-visible');
    updateCreateModalState();
    setCreateStatus('');
}

/**
 * Handle create playlist submission.
 */
async function submitCreatePlaylist() {
    if (createSubmitting) {
        return;
    }

    const title = createTitleInput?.value.trim() || '';
    if (!title) {
        setCreateStatus('Playlist title is required.', STATUS_KIND.ERROR);
        return;
    }

    const videoIds = Array.from(selectedVideoIds);
    if (videoIds.length === 0) {
        setCreateStatus('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    createSubmitting = true;
    updateActionUiState();
    updateCreateModalState();
    setCreateStatus('Creating playlist...', STATUS_KIND.INFO);
    showSaveProgress(0, videoIds.length, title);

    try {
        const response = await sendBridgeRequest(ACTIONS.CREATE_PLAYLIST_AND_ADD, {
            title,
            privacyStatus: createVisibility,
            collaborate: createCollaborateInput?.checked === true,
            videoIds
        }, (progress) => {
            if (progress) {
                showSaveProgress(progress.processed, progress.total, title);
            }
        });

        const addedCount = Number(response?.addedCount) || 0;
        const requestedCount = Number(response?.requestedVideoCount) || videoIds.length;
        const failureCount = Array.isArray(response?.failures) ? response.failures.length : 0;

        lastPlaylistProbeVideoId = '';
        playlistOptions = [];
        selectedPlaylistIds.clear();

        closeCreateModal(true);

        if (failureCount > 0) {
            const savedLabel = `${addedCount}/${requestedCount}`;
            setStatusMessage(`Created "${title}". Saved ${savedLabel} video(s).`, STATUS_KIND.INFO);
            return;
        }

        setStatusMessage(`Created "${title}" and saved ${addedCount} video(s).`, STATUS_KIND.SUCCESS);
        resetSelectionOnly();
    } catch (error) {
        logger.warn('Failed to create playlist', error);
        setCreateStatus(error instanceof Error ? error.message : 'Failed to create playlist.', STATUS_KIND.ERROR);
    } finally {
        createSubmitting = false;
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
            link.id === 'thumbnail'
            || link.querySelector('ytd-thumbnail, yt-thumbnail-view-model, yt-image, img')
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
    const selected = selectedVideoIds.has(videoId);
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

    if (playlistPanelVisible) {
        loadPlaylistsForPanel().catch((error) => {
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

    if (selectedVideoIds.has(videoId)) {
        selectedVideoIds.delete(videoId);
    } else {
        selectedVideoIds.add(videoId);
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
        if (!selectedVideoIds.has(videoId)) {
            selectedVideoIds.add(videoId);
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

    if (selectAllMode) {
        selectAllMode = false;
    }

    const host = options?.host instanceof Element ? options.host : null;
    const shiftKey = Boolean(options?.shiftKey);

    if (shiftKey) {
        const rangeIds = selectionRangeController.resolveRange(videoId, host);
        if (rangeIds.length > 0) {
            selectVideoIds(rangeIds);
        } else {
            selectVideoIds([videoId]);
        }
    } else {
        toggleVideoSelection(videoId);
    }

    selectionRangeController.setAnchor(videoId, host);
}

/**
 * Handle playlist selection interaction on playlists page.
 * @param {string} playlistId
 * @param {Element} renderer
 */
function handlePlaylistSelectionInteraction(playlistId, renderer) {
    logger.debug('handlePlaylistSelectionInteraction called', { playlistId, hasRenderer: !!renderer });
    logger.debug('PLAYLIST_ID_PATTERN.test result:', PLAYLIST_ID_PATTERN.test(playlistId), 'for ID:', playlistId);
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
    if (selectedPlaylistIds.has(playlistId)) {
        selectedPlaylistIds.delete(playlistId);
        logger.debug('Playlist deselected', playlistId, 'count:', selectedPlaylistIds.size);
    } else {
        selectedPlaylistIds.add(playlistId);
        logger.debug('Playlist selected', playlistId, 'count:', selectedPlaylistIds.size);
    }
    updateActionUiState();
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

    const isSelected = selectedPlaylistIds.has(playlistId);
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

/**
 * Clear selected videos and update visuals.
 */
function clearSelectedVideos() {
    selectedVideoIds.clear();
    selectedPlaylistIds.clear();
    selectionRangeController.reset();
    selectAllMode = false;

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
    if (!deferredRescanTimer) {
        return;
    }

    window.clearTimeout(deferredRescanTimer);
    deferredRescanTimer = null;
}

/**
 * Schedule one delayed full rescan for cards that hydrate after insertion.
 */
function scheduleDeferredRescan() {
    if (!isEnabled || !selectionMode || !isEligiblePage()) {
        return;
    }

    if (deferredRescanTimer) {
        return;
    }

    deferredRescanTimer = window.setTimeout(() => {
        deferredRescanTimer = null;
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
    if (!selectionMode || !container || !container.isConnected) {
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
                    shiftKey: event.shiftKey
                });
            }
        });

        host.appendChild(overlay);
    }

    overlay.setAttribute('data-yt-commander-video-id', videoId);
    applySelectedState(host, videoId);
    decorateRetryCounts.delete(container);
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
            pendingContainers.add(container);
        }
    });

    if (!renderScheduled) {
        renderScheduled = true;
        window.requestAnimationFrame(processPendingContainers);
    }
}

/**
 * Queue full-page renderer scan.
 */
function queueFullRescan() {
    if (!isEnabled || !selectionMode || !isEligiblePage()) {
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
    renderScheduled = false;

    if (!isEnabled || !selectionMode || !isEligiblePage()) {
        pendingContainers.clear();
        return;
    }

    const batch = [];
    let count = 0;
    const autoSelectedIds = new Set();
    let decoratedCount = 0;

    for (const container of pendingContainers) {
        pendingContainers.delete(container);
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
                if (selectAllMode && VIDEO_ID_PATTERN.test(videoId) && !selectedVideoIds.has(videoId)) {
                    selectedVideoIds.add(videoId);
                    autoSelectedIds.add(videoId);
                }
            }
            decorateRetryCounts.delete(container);
            return;
        }

        const retryCount = decorateRetryCounts.get(container) || 0;
        if (retryCount < DECORATE_MAX_RETRIES) {
            decorateRetryCounts.set(container, retryCount + 1);
            pendingContainers.add(container);
            hasRetryableHydrationMiss = true;
            return;
        }

        decorateRetryCounts.delete(container);
    });

    if (autoSelectedIds.size > 0) {
        commitSelectionMutation(Array.from(autoSelectedIds));
    } else if (decoratedCount > 0) {
        updateActionUiState();
    }

    if (hasRetryableHydrationMiss) {
        scheduleDeferredRescan();
    }

    if (pendingContainers.size > 0) {
        renderScheduled = true;
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
    if (!isEnabled && active) {
        return;
    }

    const next = Boolean(active) && isEligiblePage() && isEnabled;
    if (selectionMode === next) {
        return;
    }

    logger.debug('Selection mode changing', { from: selectionMode, to: next, isPlaylistsPage: isPlaylistsPage() });
    selectionMode = next;
    document.documentElement.classList.toggle(ROOT_SELECTION_CLASS, selectionMode);

    if (!selectionMode) {
        closePlaylistPanel();
        closeCreateModal(true);
        clearSelectedVideos();
        cleanupDecorations();
        resetActionCounters();
        clearStatusMessage();
        clearDeferredRescanTimer();
        pendingContainers.clear();
        renderScheduled = false;
        decorateRetryCounts = new WeakMap();
        playlistOptions = [];
        playlistMap.clear();
        selectedPlaylistIds.clear();
        lastPlaylistProbeVideoId = '';
        selectAllMode = false;
    } else {
        queueFullRescan();
    }

    updateMastheadButtonState();
    syncActionBarVisibility();

    if (selectionMode) {
        updateActionUiState();
    }
}

function clearPostSaveResetTimer() {
    if (postSaveResetTimer) {
        clearTimeout(postSaveResetTimer);
        postSaveResetTimer = null;
    }
}

/**
 * Handle masthead icon button click.
 * @param {MouseEvent} event
 */
function handleMastheadButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!isEnabled || !isEligiblePage()) {
        return;
    }

    setSelectionMode(!selectionMode);
}

/**
 * Handle action bar exit click.
 * @param {MouseEvent} event
 */
function handleActionExitButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();
    setSelectionMode(false);
}

/**
 * Handle "save to Watch later" action click.
 * @param {MouseEvent} event
 */
function handleActionWatchLaterClick(event) {
    event.preventDefault();
    event.stopPropagation();
    saveSelectionToPlaylist(WATCH_LATER_PLAYLIST_ID).catch((error) => {
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
    const videoIds = Array.from(selectedVideoIds);
    if (videoIds.length === 0) {
        return;
    }
    ensureSplitModal();
    splitBackdrop.classList.add('is-visible');
    if (splitCountInput) {
        splitCountInput.value = '';
        splitCountInput.focus();
    }
    updateSplitModalState();
}

function ensureSplitModal() {
    if (splitBackdrop && splitBackdrop.isConnected) {
        return;
    }

    splitBackdrop = document.createElement('div');
    splitBackdrop.className = 'yt-commander-split-backdrop';

    splitModal = document.createElement('div');
    splitModal.className = 'yt-commander-split-modal';
    splitModal.setAttribute('role', 'dialog');
    splitModal.setAttribute('aria-modal', 'true');
    splitModal.setAttribute('aria-label', 'Split into playlists');

    const modalTitle = document.createElement('h3');
    modalTitle.className = 'yt-commander-split-modal__title';
    modalTitle.textContent = 'Split into playlists';

    const infoText = document.createElement('p');
    infoText.className = 'yt-commander-split-modal__info';
    infoText.textContent = 'Videos per playlist:';

    splitCountInput = document.createElement('input');
    splitCountInput.type = 'number';
    splitCountInput.className = 'yt-commander-split-modal__input';
    splitCountInput.min = '1';
    splitCountInput.placeholder = 'e.g. 20';
    splitCountInput.addEventListener('input', updateSplitModalState);
    splitCountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitSplit();
        }
    });

    splitStatus = document.createElement('div');
    splitStatus.className = 'yt-commander-split-modal__status';
    splitStatus.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'yt-commander-split-modal__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'yt-commander-split-modal__button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeSplitModal);

    const splitBtn = document.createElement('button');
    splitBtn.type = 'button';
    splitBtn.className = 'yt-commander-split-modal__button yt-commander-split-modal__button--primary';
    splitBtn.textContent = 'Split';
    splitBtn.addEventListener('click', submitSplit);

    actions.appendChild(cancelBtn);
    actions.appendChild(splitBtn);

    splitModal.appendChild(modalTitle);
    splitModal.appendChild(infoText);
    splitModal.appendChild(splitCountInput);
    splitModal.appendChild(splitStatus);
    splitModal.appendChild(actions);

    splitBackdrop.appendChild(splitModal);
    document.body.appendChild(splitBackdrop);

    splitBackdrop.addEventListener('click', (e) => {
        if (e.target === splitBackdrop) {
            closeSplitModal();
        }
    });
}

function closeSplitModal() {
    if (splitBackdrop) {
        splitBackdrop.classList.remove('is-visible');
    }
    if (splitStatus) {
        splitStatus.textContent = '';
        splitStatus.className = 'yt-commander-split-modal__status';
    }
    splitSubmitting = false;
    updateSplitModalState();
}

function updateSplitModalState() {
    const videoIds = Array.from(selectedVideoIds);
    const count = parseInt(splitCountInput?.value, 10) || 0;
    const canSplit = videoIds.length > 0 && count > 0 && !splitSubmitting;
    const modal = splitModal?.querySelector('.yt-commander-split-modal__button--primary');
    if (modal) {
        modal.disabled = !canSplit;
    }
}

async function submitSplit() {
    if (splitSubmitting) {
        return;
    }

    const videoIds = Array.from(selectedVideoIds);
    const perPlaylist = parseInt(splitCountInput?.value, 10) || 0;

    if (videoIds.length === 0) {
        setSplitStatus('Select videos first.', 'error');
        return;
    }

    if (perPlaylist <= 0) {
        setSplitStatus('Enter videos per playlist.', 'error');
        return;
    }

    splitSubmitting = true;
    updateSplitModalState();
    setSplitStatus(`Creating ${Math.ceil(videoIds.length / perPlaylist)} playlist(s)...`, 'info');

    try {
        const numPlaylists = Math.ceil(videoIds.length / perPlaylist);
        
        let maxNum = 0;
        try {
            const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, { videoIds: [videoIds[0]] });
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
                videoIds: batch
            });

            const addedCount = Number(playlistResponse?.addedCount) || 0;
            totalAdded += addedCount;
            created++;

            setSplitStatus(`Created ${created}/${numPlaylists} playlists...`, 'info');
        }

        setSplitStatus(`Created ${created} playlists with ${totalAdded} videos.`, 'success');
        resetSelectionOnly();

        setTimeout(() => {
            closeSplitModal();
        }, 1500);

    } catch (error) {
        logger.warn('Failed to split playlists', error);
        setSplitStatus(error instanceof Error ? error.message : 'Failed to split playlists.', 'error');
    } finally {
        splitSubmitting = false;
        updateSplitModalState();
    }
}

function setSplitStatus(message, kind = 'info') {
    if (!splitStatus) {
        return;
    }
    splitStatus.textContent = message;
    splitStatus.className = `yt-commander-split-modal__status is-${kind}`;
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

    submitting = true;
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

        const response = await sendBridgeRequest(ACTIONS.REMOVE_FROM_PLAYLIST, {
            playlistId: currentPlaylistId,
            videoIds: watchedIds
        }, (progress) => {
            if (progress) {
                showSaveProgress(progress.processed, progress.total, 'Removing watched videos');
            }
        });

        hideSaveProgress();
        const removedCount = Number(response?.removedCount) || 0;
        
        if (removedCount > 0) {
            setStatusMessage(`Removed ${removedCount} watched video(s). Refreshing page...`, STATUS_KIND.SUCCESS);
            window.location.reload();
        } else {
            setStatusMessage('No videos were removed.', STATUS_KIND.INFO);
        }

    } catch (error) {
        logger.warn('Failed to remove watched videos', error);
        hideSaveProgress();
        setStatusMessage(error instanceof Error ? error.message : 'Failed to remove watched videos.', STATUS_KIND.ERROR);
    } finally {
        submitting = false;
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

    if (submitting) {
        return;
    }

    const playlistIds = Array.from(selectedPlaylistIds);
    if (playlistIds.length === 0) {
        setStatusMessage('Select playlists to delete.', STATUS_KIND.ERROR);
        return;
    }

    submitting = true;
    updateActionUiState();
    showSaveProgress(0, playlistIds.length, 'Deleting playlists');

    try {
        const response = await sendBridgeRequest(ACTIONS.DELETE_PLAYLISTS, {
            playlistIds
        }, (progress) => {
            if (progress) {
                showSaveProgress(progress.processed, progress.total, 'Deleting playlists');
            }
        });

        hideSaveProgress();
        const deletedCount = Number(response?.deletedCount) || 0;
        const failedCount = Number(response?.failedCount) || 0;

        selectedPlaylistIds.clear();

        if (failedCount > 0) {
            setStatusMessage(`Deleted ${deletedCount} playlist(s). ${failedCount} failed.`, STATUS_KIND.ERROR);
        } else {
            setStatusMessage(`Deleted ${deletedCount} playlist(s). Refreshing...`, STATUS_KIND.SUCCESS);
            window.location.reload();
        }

    } catch (error) {
        logger.warn('Failed to delete playlists', error);
        hideSaveProgress();
        setStatusMessage(error instanceof Error ? error.message : 'Failed to delete playlists.', STATUS_KIND.ERROR);
    } finally {
        submitting = false;
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

    const videoIds = Array.from(selectedVideoIds);
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

    selectAllMode = true;
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

    selectAllMode = false;
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
    if (!row || !playlistPanelList?.contains(row)) {
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
    if (event.target === createBackdrop) {
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

    createVisibilityMenuVisible = !createVisibilityMenuVisible;
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
    if (!option || !createVisibilityMenu?.contains(option)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const value = option.getAttribute('data-visibility') || 'PRIVATE';
    if (value === 'PUBLIC' || value === 'UNLISTED' || value === 'PRIVATE') {
        createVisibility = value;
    } else {
        createVisibility = 'PRIVATE';
    }

    createVisibilityMenuVisible = false;
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

    if (createModalVisible) {
        if (createModal?.contains(target)) {
            if (
                createVisibilityMenuVisible
                && !createVisibilityButton?.contains(target)
                && !createVisibilityMenu?.contains(target)
            ) {
                createVisibilityMenuVisible = false;
                updateCreateModalState();
            }
            return;
        }

        closeCreateModal();
        return;
    }

    if (playlistPanelVisible) {
        if (
            playlistPanel?.contains(target)
            || actionBar?.contains(target)
            || mastheadButton?.contains(target)
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
    if (!selectionMode || !isEnabled || !isEligiblePage()) {
        return;
    }
    logger.debug('handleSelectionClickCapture called');

    const target = event.target;
    if (!target || !(target instanceof Element)) {
        return;
    }

    if (
        actionBar?.contains(target)
        || playlistPanel?.contains(target)
        || createModal?.contains(target)
        || mastheadButton?.contains(target)
    ) {
        return;
    }

    if (target.closest(`.${OVERLAY_CLASS}`)) {
        return;
    }

    if (isPlaylistsPage()) {
        logger.debug('Playlists page click detected', { targetTag: target.tagName, targetClass: target.className });
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
        shiftKey: event.shiftKey
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

    if (createModalVisible) {
        event.preventDefault();
        closeCreateModal();
        return;
    }

    if (playlistPanelVisible) {
        event.preventDefault();
        closePlaylistPanel();
        return;
    }

    if (selectionMode) {
        event.preventDefault();
        setSelectionMode(false);
    }
}

/**
 * Handle route transitions.
 */
function handleRouteChange() {
    if (location.href === lastKnownUrl) {
        return;
    }

    lastKnownUrl = location.href;
    setSelectionMode(false);
    updateMastheadVisibility();
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
 * Setup observer for SPA + feed updates.
 */
function setupObserver() {
    if (observer || !document.body) {
        return;
    }

    observer = createThrottledObserver((mutations) => {
        ensureMastheadButton();
        ensureActionUi();
        handleRouteChange();

        if (!isEnabled || !selectionMode || !isEligiblePage()) {
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

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href', 'video-id', 'data-video-id']
    });
}

/**
 * Setup listeners.
 */
function setupListeners() {
    const onNavigate = () => {
        ensureMastheadButton();
        ensureActionUi();
        handleRouteChange();

        if (selectionMode && isEnabled && isEligiblePage()) {
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

    cleanupCallbacks.push(() => window.removeEventListener('message', handleBridgeResponse));
    cleanupCallbacks.push(() => window.removeEventListener('message', handleBridgeProgress));
    cleanupCallbacks.push(() => document.removeEventListener('yt-navigate-finish', onNavigate));
    cleanupCallbacks.push(() => document.removeEventListener('yt-page-data-updated', onNavigate));
    cleanupCallbacks.push(() => window.removeEventListener('popstate', onNavigate));
    cleanupCallbacks.push(() => window.removeEventListener('resize', handleResize));
    cleanupCallbacks.push(() => document.removeEventListener('mousedown', handleDocumentMouseDown, true));
    cleanupCallbacks.push(() => document.removeEventListener('click', handleSelectionClickCapture, true));
    cleanupCallbacks.push(() => document.removeEventListener('keydown', handleDocumentKeydown, true));
}

/**
 * Initialize module.
 */
function initPlaylistMultiSelect() {
    if (isInitialized) {
        return;
    }

    ensureMastheadButton();
    ensureActionUi();
    setupListeners();
    setupObserver();

    updateMastheadVisibility();
    updateMastheadButtonState();
    updateActionUiState();
    syncActionBarVisibility();

    isInitialized = true;
    logger.info('Playlist multi-select initialized');
}

/**
 * Enable feature.
 */
function enable() {
    isEnabled = true;
    ensureMastheadButton();
    ensureActionUi();
    updateMastheadVisibility();
    syncActionBarVisibility();
    updateActionUiState();
    setupObserver();
}

/**
 * Disable feature.
 */
function disable() {
    setSelectionMode(false);
    isEnabled = false;
    updateMastheadVisibility();
    syncActionBarVisibility();
    rejectPendingRequests('Playlist request cancelled.');

    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

/**
 * Cleanup module resources.
 */
function cleanup() {
    disable();

    while (cleanupCallbacks.length > 0) {
        const teardown = cleanupCallbacks.pop();
        try {
            teardown();
        } catch (_error) {
            // Ignore teardown errors.
        }
    }

    pendingContainers.clear();
    renderScheduled = false;
    clearDeferredRescanTimer();
    decorateRetryCounts = new WeakMap();

    clearStatusMessage();

    if (actionBar) {
        actionBar.remove();
    }
    if (playlistPanel) {
        playlistPanel.remove();
    }
    if (createBackdrop) {
        createBackdrop.remove();
    }

    actionBar = null;
    actionCount = null;
    actionTotalCount = null;
    actionSaveButton = null;
    actionRemoveButton = null;
    actionSelectAllButton = null;
    actionUnselectAllButton = null;
    actionExitButton = null;

    playlistPanel = null;
    playlistPanelCount = null;
    playlistPanelList = null;
    playlistPanelStatus = null;
    playlistPanelCloseButton = null;
    playlistPanelNewButton = null;

    createBackdrop = null;
    createModal = null;
    createTitleInput = null;
    createVisibilityButton = null;
    createVisibilityValue = null;
    createVisibilityMenu = null;
    createCollaborateInput = null;
    createCancelButton = null;
    createCreateButton = null;
    createStatus = null;

    if (mastheadSlot) {
        mastheadSlot.remove();
    }
    mastheadSlot = null;
    mastheadButton = null;
    mastheadBadge = null;

    selectedVideoIds.clear();
    selectedPlaylistIds.clear();
    playlistMap.clear();
    playlistOptions = [];

    playlistPanelVisible = false;
    createModalVisible = false;
    createVisibilityMenuVisible = false;
    loadingPlaylists = false;
    submitting = false;
    createSubmitting = false;
    createVisibility = 'PRIVATE';
    selectAllMode = false;

    lastPlaylistProbeVideoId = '';

    document.documentElement.classList.remove(ROOT_SELECTION_CLASS);

    isInitialized = false;
    logger.info('Playlist multi-select cleaned up');
}

export {
    initPlaylistMultiSelect,
    enable,
    disable,
    cleanup
};
