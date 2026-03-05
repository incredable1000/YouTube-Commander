/**
 * Playlist Multi-Select (Isolated World)
 * Select thumbnails via overlay and save selected videos to playlists.
 */

import { createLogger } from './utils/logger.js';
import { createThrottledObserver } from './utils/events.js';

const logger = createLogger('PlaylistMultiSelect');

const BRIDGE_SOURCE = 'yt-commander';
const REQUEST_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_REQUEST';
const RESPONSE_TYPE = 'YT_COMMANDER_PLAYLIST_BRIDGE_RESPONSE';

const ACTIONS = {
    GET_PLAYLISTS: 'GET_PLAYLISTS',
    ADD_TO_PLAYLISTS: 'ADD_TO_PLAYLISTS'
};

const FEED_RENDERER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-rich-grid-slim-media',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-shorts-lockup-view-model',
    'yt-lockup-view-model'
].join(', ');

const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href*="/shorts/"]';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{10,15}$/;

const MASTHEAD_SLOT_CLASS = 'yt-commander-playlist-masthead-slot';
const MASTHEAD_BUTTON_CLASS = 'yt-commander-playlist-masthead-button';
const MASTHEAD_BADGE_CLASS = 'yt-commander-playlist-masthead-badge';

const HOST_CLASS = 'yt-commander-playlist-host';
const HOST_SELECTED_CLASS = 'yt-commander-playlist-selected';
const OVERLAY_CLASS = 'yt-commander-playlist-overlay';

const POPUP_CLASS = 'yt-commander-save-popup';
const POPUP_VISIBLE_CLASS = 'is-visible';

const ROOT_SELECTION_CLASS = 'yt-commander-playlist-selection-mode';

const REQUEST_TIMEOUT_MS = 30000;
const PROCESS_CHUNK_SIZE = 120;

const STATUS_KIND = {
    INFO: 'info',
    SUCCESS: 'success',
    ERROR: 'error'
};

let isInitialized = false;
let isEnabled = true;
let selectionMode = false;
let popupVisible = false;
let loadingPlaylists = false;
let submitting = false;

let mastheadSlot = null;
let mastheadButton = null;
let mastheadBadge = null;

let popup = null;
let popupCount = null;
let popupList = null;
let popupStatus = null;
let popupDoneButton = null;
let popupExitButton = null;
let popupCloseButton = null;

let observer = null;
let pendingContainers = new Set();
let renderScheduled = false;

let lastKnownUrl = location.href;
let bridgeRequestCounter = 0;
let popupStatusTimer = null;
let lastPlaylistProbeVideoId = '';

const selectedVideoIds = new Set();
const selectedPlaylistIds = new Set();
const pendingBridgeRequests = new Map();
const cleanupCallbacks = [];

let playlistOptions = [];

/**
 * Extract YouTube video id from URL.
 * @param {string} url
 * @returns {string|null}
 */
function extractVideoId(url) {
    if (typeof url !== 'string' || !url) {
        return null;
    }

    try {
        const parsed = new URL(url, location.origin);
        const watchId = parsed.searchParams.get('v');
        if (watchId && VIDEO_ID_PATTERN.test(watchId)) {
            return watchId;
        }

        if (parsed.pathname.startsWith('/shorts/')) {
            const shortsId = parsed.pathname.split('/shorts/')[1]?.split('/')[0] || '';
            if (VIDEO_ID_PATTERN.test(shortsId)) {
                return shortsId;
            }
        }
    } catch (_error) {
        return null;
    }

    return null;
}

/**
 * Check whether page supports thumbnail selection.
 * @returns {boolean}
 */
function isEligiblePage() {
    const path = location.pathname || '';
    return path !== '/watch' && !path.startsWith('/shorts/');
}

/**
 * Build icon for masthead button.
 * @returns {SVGSVGElement}
 */
function createMastheadIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
        'd',
        'M4 5h11v2H4V5zm0 6h11v2H4v-2zm0 6h7v2H4v-2zm14.7-5.3L20 13l-4.7 4.7-2.3-2.3 1.4-1.4 0.9 0.9z'
    );
    svg.appendChild(path);
    return svg;
}

/**
 * Resolve where to mount masthead button near search/voice controls.
 * @returns {{parent: Element, anchor: ChildNode|null}|null}
 */
function resolveMastheadMountPoint() {
    const center = document.querySelector('ytd-masthead #center');
    if (!center) {
        return null;
    }

    const voiceRenderer = center.querySelector('ytd-button-renderer#voice-search-button')
        || center.querySelector('#voice-search-button')?.closest('ytd-button-renderer')
        || center.querySelector('#voice-search-button');

    if (voiceRenderer && voiceRenderer.parentElement) {
        return {
            parent: voiceRenderer.parentElement,
            anchor: voiceRenderer.nextSibling
        };
    }

    const searchBox = center.querySelector('ytd-searchbox');
    if (searchBox && searchBox.parentElement) {
        return {
            parent: searchBox.parentElement,
            anchor: searchBox.nextSibling
        };
    }

    return null;
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
 * Update button active state and count badge.
 */
function updateMastheadButtonState() {
    if (!mastheadButton || !mastheadBadge) {
        return;
    }

    const selectedCount = selectedVideoIds.size;
    mastheadButton.classList.toggle('is-active', selectionMode);
    mastheadBadge.textContent = selectedCount > 99 ? '99+' : String(selectedCount);
    mastheadBadge.classList.toggle('is-visible', selectedCount > 0);

    if (!selectionMode) {
        mastheadButton.title = 'Select videos';
    } else if (selectedCount > 0) {
        mastheadButton.title = 'Save selected videos to playlist';
    } else {
        mastheadButton.title = 'Exit selection mode';
    }
}

/**
 * Create save popup UI.
 */
function ensureSavePopup() {
    if (popup && popup.isConnected) {
        return;
    }

    popup = document.createElement('div');
    popup.className = POPUP_CLASS;
    popup.innerHTML = `
        <div class="yt-commander-save-popup__header">
            <div class="yt-commander-save-popup__title">Save To Playlist</div>
            <button class="yt-commander-save-popup__close" type="button" aria-label="Close">�</button>
        </div>
        <div class="yt-commander-save-popup__subhead">
            <span class="yt-commander-save-popup__count">0 selected</span>
        </div>
        <div class="yt-commander-save-popup__list" role="listbox" aria-label="Playlists"></div>
        <div class="yt-commander-save-popup__status" aria-live="polite"></div>
        <div class="yt-commander-save-popup__footer">
            <button class="yt-commander-save-popup__action" data-action="done" type="button">Done</button>
            <button class="yt-commander-save-popup__action" data-action="exit" type="button">Exit</button>
        </div>
    `;

    document.body.appendChild(popup);

    popupCount = popup.querySelector('.yt-commander-save-popup__count');
    popupList = popup.querySelector('.yt-commander-save-popup__list');
    popupStatus = popup.querySelector('.yt-commander-save-popup__status');
    popupDoneButton = popup.querySelector('[data-action="done"]');
    popupExitButton = popup.querySelector('[data-action="exit"]');
    popupCloseButton = popup.querySelector('.yt-commander-save-popup__close');

    popupDoneButton?.addEventListener('click', handlePopupDoneClick);
    popupExitButton?.addEventListener('click', handlePopupExitClick);
    popupCloseButton?.addEventListener('click', closeSavePopup);

    cleanupCallbacks.push(() => popupDoneButton?.removeEventListener('click', handlePopupDoneClick));
    cleanupCallbacks.push(() => popupExitButton?.removeEventListener('click', handlePopupExitClick));
    cleanupCallbacks.push(() => popupCloseButton?.removeEventListener('click', closeSavePopup));
}

/**
 * Position popup below masthead button.
 */
function positionSavePopup() {
    if (!popup || !mastheadButton) {
        return;
    }

    const buttonRect = mastheadButton.getBoundingClientRect();
    const popupWidth = 340;
    const spacing = 8;
    const minLeft = 10;
    const maxLeft = Math.max(minLeft, window.innerWidth - popupWidth - 10);
    const left = Math.min(maxLeft, Math.max(minLeft, buttonRect.right - popupWidth));
    const top = buttonRect.bottom + spacing;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

/**
 * Open save popup and load playlists.
 */
async function openSavePopup() {
    if (!selectionMode || selectedVideoIds.size === 0) {
        return;
    }

    ensureSavePopup();
    positionSavePopup();
    popup.classList.add(POPUP_VISIBLE_CLASS);
    popupVisible = true;
    updatePopupCount();
    await loadPlaylistsForPopup();
}

/**
 * Close save popup.
 */
function closeSavePopup() {
    popupVisible = false;
    if (popup) {
        popup.classList.remove(POPUP_VISIBLE_CLASS);
    }
    clearPopupStatus();
}

/**
 * Toggle save popup.
 */
function toggleSavePopup() {
    if (popupVisible) {
        closeSavePopup();
    } else {
        void openSavePopup();
    }
}

/**
 * Set popup status message.
 * @param {string} message
 * @param {'info'|'success'|'error'} kind
 */
function setPopupStatus(message, kind = STATUS_KIND.INFO) {
    if (!popupStatus) {
        return;
    }

    if (popupStatusTimer) {
        clearTimeout(popupStatusTimer);
        popupStatusTimer = null;
    }

    popupStatus.textContent = message || '';
    popupStatus.className = 'yt-commander-save-popup__status';

    if (!message) {
        return;
    }

    popupStatus.classList.add(`is-${kind}`);
    popupStatusTimer = window.setTimeout(() => {
        clearPopupStatus();
    }, 4000);
}

/**
 * Clear popup status.
 */
function clearPopupStatus() {
    if (!popupStatus) {
        return;
    }

    if (popupStatusTimer) {
        clearTimeout(popupStatusTimer);
        popupStatusTimer = null;
    }

    popupStatus.textContent = '';
    popupStatus.className = 'yt-commander-save-popup__status';
}

/**
 * Update popup selected count text.
 */
function updatePopupCount() {
    if (!popupCount) {
        return;
    }

    popupCount.textContent = `${selectedVideoIds.size} selected`;
}

/**
 * Enable/disable popup actions.
 */
function updatePopupActionState() {
    if (popupDoneButton) {
        popupDoneButton.disabled = submitting || loadingPlaylists || selectedPlaylistIds.size === 0 || selectedVideoIds.size === 0;
    }

    if (popupExitButton) {
        popupExitButton.disabled = submitting;
    }
}

/**
 * Render loading view in playlist list.
 */
function renderPlaylistLoading() {
    if (!popupList) {
        return;
    }

    popupList.innerHTML = '<div class="yt-commander-save-popup__empty">Loading playlists...</div>';
}

/**
 * Render empty/error text.
 * @param {string} message
 */
function renderPlaylistEmpty(message) {
    if (!popupList) {
        return;
    }

    popupList.innerHTML = `<div class="yt-commander-save-popup__empty">${message}</div>`;
}

/**
 * Render playlist options with checkbox rows.
 */
function renderPlaylistOptions() {
    if (!popupList) {
        return;
    }

    if (!Array.isArray(playlistOptions) || playlistOptions.length === 0) {
        renderPlaylistEmpty('No playlists found.');
        updatePopupActionState();
        return;
    }

    popupList.innerHTML = '';

    playlistOptions.forEach((playlist) => {
        const row = document.createElement('label');
        row.className = 'yt-commander-save-popup__item';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', selectedPlaylistIds.has(playlist.id) ? 'true' : 'false');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'yt-commander-save-popup__item-input';
        input.value = playlist.id;
        input.checked = selectedPlaylistIds.has(playlist.id);

        const mark = document.createElement('span');
        mark.className = 'yt-commander-save-popup__item-mark';

        const text = document.createElement('span');
        text.className = 'yt-commander-save-popup__item-text';

        const title = document.createElement('span');
        title.className = 'yt-commander-save-popup__item-title';
        title.textContent = playlist.title || 'Untitled playlist';

        const meta = document.createElement('span');
        meta.className = 'yt-commander-save-popup__item-meta';
        meta.textContent = playlist.privacy || '';

        text.appendChild(title);
        text.appendChild(meta);

        row.appendChild(input);
        row.appendChild(mark);
        row.appendChild(text);

        input.addEventListener('change', () => {
            if (input.checked) {
                selectedPlaylistIds.add(playlist.id);
            } else {
                selectedPlaylistIds.delete(playlist.id);
            }
            row.setAttribute('aria-selected', input.checked ? 'true' : 'false');
            updatePopupActionState();
        });

        popupList.appendChild(row);
    });

    updatePopupActionState();
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
 * Load playlists from main-world API.
 */
async function loadPlaylistsForPopup() {
    if (!popupVisible || selectedVideoIds.size === 0 || loadingPlaylists) {
        return;
    }

    const selectedIds = Array.from(selectedVideoIds);
    const probeVideoId = selectedIds[0] || '';

    if (probeVideoId && probeVideoId === lastPlaylistProbeVideoId && playlistOptions.length > 0) {
        renderPlaylistOptions();
        return;
    }

    loadingPlaylists = true;
    selectedPlaylistIds.clear();
    renderPlaylistLoading();
    updatePopupActionState();

    try {
        const response = await sendBridgeRequest(ACTIONS.GET_PLAYLISTS, {
            videoIds: selectedIds
        });

        playlistOptions = Array.isArray(response?.playlists) ? response.playlists : [];
        lastPlaylistProbeVideoId = probeVideoId;
        playlistOptions.forEach((playlist) => {
            if (playlist?.isSelected && playlist.id) {
                selectedPlaylistIds.add(playlist.id);
            }
        });

        renderPlaylistOptions();
    } catch (error) {
        logger.warn('Failed to load playlists', error);
        renderPlaylistEmpty('Failed to load playlists.');
        setPopupStatus(error instanceof Error ? error.message : 'Failed to load playlists.', STATUS_KIND.ERROR);
    } finally {
        loadingPlaylists = false;
        updatePopupActionState();
    }
}

/**
 * Apply selected playlists for selected videos.
 */
async function applyPlaylistsToSelectedVideos() {
    if (!popupVisible || submitting) {
        return;
    }

    const videoIds = Array.from(selectedVideoIds);
    const playlistIds = Array.from(selectedPlaylistIds);

    if (videoIds.length === 0) {
        setPopupStatus('Select at least one video.', STATUS_KIND.ERROR);
        return;
    }

    if (playlistIds.length === 0) {
        setPopupStatus('Select at least one playlist.', STATUS_KIND.ERROR);
        return;
    }

    submitting = true;
    updatePopupActionState();
    setPopupStatus(`Saving ${videoIds.length} video(s)...`, STATUS_KIND.INFO);

    try {
        const response = await sendBridgeRequest(ACTIONS.ADD_TO_PLAYLISTS, {
            videoIds,
            playlistIds
        });

        const successCount = Number(response?.successCount) || 0;
        const failures = Array.isArray(response?.failures) ? response.failures : [];

        if (successCount > 0 && failures.length === 0) {
            setPopupStatus(`Saved to ${successCount} playlist(s).`, STATUS_KIND.SUCCESS);
        } else if (successCount > 0) {
            setPopupStatus(`Saved to ${successCount} playlist(s), ${failures.length} failed.`, STATUS_KIND.INFO);
        } else {
            setPopupStatus('No playlist was updated.', STATUS_KIND.ERROR);
        }

        clearSelectedVideos();
        closeSavePopup();
    } catch (error) {
        logger.warn('Failed to save selected videos', error);
        setPopupStatus(error instanceof Error ? error.message : 'Failed to save videos.', STATUS_KIND.ERROR);
    } finally {
        submitting = false;
        updatePopupActionState();
    }
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

    syncVideoSelectedState(videoId);
    updateMastheadButtonState();
    updatePopupCount();

    if (popupVisible && selectedVideoIds.size === 0) {
        closeSavePopup();
    }
}

/**
 * Clear selected videos and update visuals.
 */
function clearSelectedVideos() {
    selectedVideoIds.clear();
    document.querySelectorAll(`.${HOST_CLASS}`).forEach((host) => {
        const videoId = host.getAttribute('data-yt-commander-video-id') || '';
        applySelectedState(host, videoId);
    });

    updateMastheadButtonState();
    updatePopupCount();
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
 * Decorate one renderer container with click overlay.
 * @param {Element} container
 */
function decorateContainer(container) {
    if (!selectionMode || !container || !container.isConnected) {
        return;
    }

    const link = findVideoLink(container);
    if (!link || !link.href) {
        return;
    }

    const videoId = extractVideoId(link.href);
    if (!videoId) {
        return;
    }

    const host = findCardHost(container);
    if (!host) {
        return;
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
            const id = overlay?.getAttribute('data-yt-commander-video-id');
            if (id) {
                toggleVideoSelection(id);
            }
        });

        host.appendChild(overlay);
    }

    overlay.setAttribute('data-yt-commander-video-id', videoId);
    applySelectedState(host, videoId);
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
    document.querySelectorAll(FEED_RENDERER_SELECTOR).forEach((container) => {
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
    for (const container of pendingContainers) {
        pendingContainers.delete(container);
        batch.push(container);
        count += 1;
        if (count >= PROCESS_CHUNK_SIZE) {
            break;
        }
    }

    batch.forEach((container) => decorateContainer(container));

    if (pendingContainers.size > 0) {
        renderScheduled = true;
        window.requestAnimationFrame(processPendingContainers);
    }
}

/**
 * Post bridge request and await response.
 * @param {string} action
 * @param {object} payload
 * @returns {Promise<any>}
 */
function sendBridgeRequest(action, payload) {
    const requestId = `ytc-playlist-${Date.now()}-${++bridgeRequestCounter}`;

    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            pendingBridgeRequests.delete(requestId);
            reject(new Error('Playlist request timed out.'));
        }, REQUEST_TIMEOUT_MS);

        pendingBridgeRequests.set(requestId, { resolve, reject, timeoutId });

        window.postMessage({
            source: BRIDGE_SOURCE,
            type: REQUEST_TYPE,
            requestId,
            action,
            payload
        }, '*');
    });
}

/**
 * Handle bridge responses.
 * @param {MessageEvent} event
 */
function handleBridgeResponse(event) {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
        return;
    }

    const message = event.data;
    if (message.source !== BRIDGE_SOURCE || message.type !== RESPONSE_TYPE || !message.requestId) {
        return;
    }

    const pending = pendingBridgeRequests.get(message.requestId);
    if (!pending) {
        return;
    }

    pendingBridgeRequests.delete(message.requestId);
    clearTimeout(pending.timeoutId);

    if (message.success) {
        pending.resolve(message.data || {});
    } else {
        pending.reject(new Error(message.error || 'Playlist action failed.'));
    }
}

/**
 * Reject pending bridge requests.
 * @param {string} message
 */
function rejectPendingRequests(message) {
    pendingBridgeRequests.forEach((pending) => {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(message));
    });
    pendingBridgeRequests.clear();
}

/**
 * Toggle selection mode.
 * @param {boolean} active
 */
function setSelectionMode(active) {
    if (!isEnabled) {
        return;
    }

    const next = Boolean(active) && isEligiblePage();
    if (selectionMode === next) {
        return;
    }

    selectionMode = next;
    document.documentElement.classList.toggle(ROOT_SELECTION_CLASS, selectionMode);

    if (!selectionMode) {
        closeSavePopup();
        clearSelectedVideos();
        cleanupDecorations();
        pendingContainers.clear();
        renderScheduled = false;
        selectedPlaylistIds.clear();
    } else {
        queueFullRescan();
    }

    updateMastheadButtonState();
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

    if (!selectionMode) {
        setSelectionMode(true);
        return;
    }

    if (selectedVideoIds.size === 0) {
        setSelectionMode(false);
        return;
    }

    toggleSavePopup();
}

/**
 * Done button in popup.
 */
function handlePopupDoneClick() {
    void applyPlaylistsToSelectedVideos();
}

/**
 * Exit button in popup.
 */
function handlePopupExitClick() {
    setSelectionMode(false);
}

/**
 * Handle document mousedown for outside-click close.
 * @param {MouseEvent} event
 */
function handleDocumentMouseDown(event) {
    if (!popupVisible) {
        return;
    }

    const target = event.target;
    if (popup?.contains(target) || mastheadButton?.contains(target)) {
        return;
    }

    closeSavePopup();
}

/**
 * Intercept thumbnail clicks during selection mode so navigation never wins.
 * @param {MouseEvent} event
 */
function handleSelectionClickCapture(event) {
    if (!selectionMode || !isEnabled || !isEligiblePage()) {
        return;
    }

    const target = event.target;
    if (!target || !(target instanceof Element)) {
        return;
    }

    if (popup?.contains(target) || mastheadButton?.contains(target)) {
        return;
    }

    if (target.closest(`.${OVERLAY_CLASS}`)) {
        return;
    }

    const link = target.closest(VIDEO_LINK_SELECTOR);
    if (!(link instanceof HTMLAnchorElement) || !link.href) {
        return;
    }

    const container = link.closest(FEED_RENDERER_SELECTOR);
    if (!container) {
        return;
    }

    const videoId = extractVideoId(link.href);
    if (!videoId) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
    }

    toggleVideoSelection(videoId);
}

/**
 * Handle keyboard shortcuts.
 * @param {KeyboardEvent} event
 */
function handleDocumentKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }

    if (popupVisible) {
        event.preventDefault();
        closeSavePopup();
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
    closeSavePopup();
    setSelectionMode(false);
    updateMastheadVisibility();
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
        handleRouteChange();

        if (!isEnabled || !selectionMode || !isEligiblePage()) {
            return;
        }

        const found = new Set();
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => collectRenderers(node, found));
        });

        queueContainers(found);
    }, 250);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Setup listeners.
 */
function setupListeners() {
    const onNavigate = () => {
        ensureMastheadButton();
        handleRouteChange();
    };

    const onResize = () => {
        if (popupVisible) {
            positionSavePopup();
        }
    };

    window.addEventListener('message', handleBridgeResponse);
    document.addEventListener('yt-navigate-finish', onNavigate);
    document.addEventListener('yt-page-data-updated', onNavigate);
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    document.addEventListener('click', handleSelectionClickCapture, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);

    cleanupCallbacks.push(() => window.removeEventListener('message', handleBridgeResponse));
    cleanupCallbacks.push(() => document.removeEventListener('yt-navigate-finish', onNavigate));
    cleanupCallbacks.push(() => document.removeEventListener('yt-page-data-updated', onNavigate));
    cleanupCallbacks.push(() => window.removeEventListener('popstate', onNavigate));
    cleanupCallbacks.push(() => window.removeEventListener('resize', onResize));
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
    ensureSavePopup();
    closeSavePopup();
    setupListeners();
    setupObserver();

    updateMastheadVisibility();
    updateMastheadButtonState();

    isInitialized = true;
    logger.info('Playlist multi-select initialized');
}

/**
 * Enable feature.
 */
function enable() {
    isEnabled = true;
    ensureMastheadButton();
    updateMastheadVisibility();
    setupObserver();
}

/**
 * Disable feature.
 */
function disable() {
    setSelectionMode(false);
    isEnabled = false;
    updateMastheadVisibility();
    rejectPendingRequests('Playlist request cancelled.');
    closeSavePopup();

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

    if (popupStatusTimer) {
        clearTimeout(popupStatusTimer);
        popupStatusTimer = null;
    }

    if (popup) {
        popup.remove();
    }
    popup = null;
    popupCount = null;
    popupList = null;
    popupStatus = null;
    popupDoneButton = null;
    popupExitButton = null;
    popupCloseButton = null;

    if (mastheadSlot) {
        mastheadSlot.remove();
    }
    mastheadSlot = null;
    mastheadButton = null;
    mastheadBadge = null;

    selectedVideoIds.clear();
    selectedPlaylistIds.clear();
    playlistOptions = [];
    lastPlaylistProbeVideoId = '';
    popupVisible = false;
    selectionMode = false;

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
