import { createLogger } from './utils/logger.js';
import { createBridgeClient } from './playlist-multi-select/bridge.js';
import { resolveMastheadMountPoint, isEligiblePage } from './playlist-multi-select/pageContext.js';
import { MASTHEAD_SLOT_CLASS, MASTHEAD_BUTTON_CLASS } from './playlist-multi-select/constants.js';
import {
    BRIDGE_SOURCE,
    REQUEST_TYPE,
    RESPONSE_TYPE,
    ACTIONS,
    STORAGE_KEYS,
    SUBSCRIPTION_BUTTON_CLASS,
    QUICK_ADD_PAGES,
    QUICK_ADD_CONTEXT_SELECTOR,
    QUICK_ADD_HOST_SELECTOR,
    SUBSCRIBE_RENDERER_SELECTOR,
    DEFAULT_QUICK_ADD_LABEL,
    OVERLAY_CLASS,
    MODAL_CLASS,
    CARDS_CLASS,
    BADGE_CLASS,
    BADGE_REMOVE_CLASS,
    STATUS_CLASS,
    PICKER_CLASS,
    FILTER_ITEM_CLASS,
    FILTER_DOT_CLASS,
    FILTER_COUNT_CLASS,
    QUICK_ADD_CLASS,
    CARD_ROW_HEIGHT_ESTIMATE,
    CARD_MIN_WIDTH,
    CARD_GAP,
    VIRTUAL_OVERSCAN,
    SNAPSHOT_TTL_MS,
    ICONS,
} from './subscription-manager/constants.js';
import { state } from './subscription-manager/state.js';
import { setTooltip, clearTooltip } from './subscription-manager/tooltip-utils.js';
import { storageGet, storageSet } from './subscription-manager/storage-utils.js';
import {
    createIcon,
    createSubscriptionIcon,
    createQuickAddIcon,
} from './subscription-manager/icon-utils.js';
import {
    normalizeHandle,
    normalizeChannelUrl,
    resolveChannelUrl,
    normalizeColorToHex,
    pickCategoryColor,
    parseHexColor,
    computeLuminance,
    computeCategoryContrast,
    applyCategoryItemColors,
    clearCategoryItemColors,
    generateRandomCategoryColor,
    normalizeCategories,
    normalizeAssignments,
} from './subscription-manager/data-utils.js';
import {
    resolveChannelCounts,
    buildChannelMeta,
    sortChannelsByName,
    sortChannelsBySubscribers,
    computeSnapshotHash,
    rebuildChannelIndexes,
} from './subscription-manager/channel-utils.js';
import {
    parseCountValue,
    formatSubscriptionError,
    formatCountLabel,
    extractChannelIdFromUrl,
    extractHandleFromUrl,
    createVirtualSpacer,
} from './subscription-manager/parse-utils.js';
import {
    markCategoriesDirty,
    markAssignmentsDirty,
    getCategoryCounts,
    readChannelAssignments,
    writeChannelAssignments,
    loadLocalState,
    persistLocalState,
    persistViewState,
    persistSidebarState,
    persistSnapshot,
    hydrateSnapshotFromStorage,
    markPending,
} from './subscription-manager/channel-storage.js';
import {
    resetSidebarDraftState,
    captureSidebarDraftState,
    startSidebarCreate,
    startSidebarEdit,
    commitSidebarInput,
    updateCategoryColor,
    removeCategory,
    getCategoryLabel,
} from './subscription-manager/sidebar-utils.js';
import {
    renderSidebarCategories,
    updateSidebarToggleButton,
    updateSortButton,
    updateChipbarNavButtons,
    attachChipbarWheelScroll,
    scrollChipbarBy,
    applySidebarState,
} from './subscription-manager/sidebar-ui.js';
import {
    buildQuickAddButton,
    getQuickAddIdentityFromButton,
    updateQuickAddButtonState,
    refreshQuickAddButtons,
    resolveSubscribeRendererForQuickAdd,
    ensureQuickAddButtons,
    scheduleQuickAddScan,
    startQuickAddObserver,
    isQuickAddPage,
} from './subscription-manager/quick-add.js';
import {
    resolveChannelIdentityFromContext,
    resolveChannelIdFromIdentity,
    resolveAssignmentKeyForWrite,
    readChannelIdFromElement,
    getHandleAssignmentKey,
    getUrlAssignmentKey,
    resolveAssignmentKeyForRead,
    migrateAssignmentKeyIfNeeded,
} from './subscription-manager/channel-identity.js';
import {
    filterChannels,
    buildCard,
    renderCards,
    renderVirtualizedList,
    queueVirtualRender,
} from './subscription-manager/card-utils.js';
import {
    createModalElements,
    ensureConfirmDialog,
    showConfirmDialog,
    closeConfirmDialog,
    ensureTooltipPortal,
    hideTooltipPortal,
} from './subscription-manager/modal-utils.js';
import {
    updateSelectionSummary,
    applyChannelSelection,
    toggleChannelSelection,
} from './subscription-manager/selection-utils.js';
import {
    ensurePickerAll,
    openPickerAll,
    closePickerAll,
    createPickerContextAnchorAll,
    positionPickerAll,
} from './subscription-manager/picker-utils.js';
import { setStatus } from './subscription-manager/status-utils.js';
import { applyCategoryUpdate } from './subscription-manager/category-ops.js';

const logger = createLogger('SubscriptionManager');

const bridgeClient = createBridgeClient({
    source: BRIDGE_SOURCE,
    requestType: REQUEST_TYPE,
    responseType: RESPONSE_TYPE,
    timeoutMs: 30000,
    requestPrefix: 'ytc-subscription',
});

let isInitialized = false;
let mastheadSlot = null;
let mastheadButton = null;

let overlay = null;
let modal = null;
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
let sortButton = null;
let sidebar = null;
let sidebarList = null;
let sidebarToggleButton = null;
let sidebarAddButton = null;
let sidebarCountEl = null;
let chipbarWheelTarget = null;
let chipbarWheelHandler = null;
let chipbarScrollTarget = null;
let chipbarScrollHandler = null;
let chipbarPrevButton = null;
let chipbarNextButton = null;
let addCategoryButton = null;
let removeCategoryButton = null;
let unsubscribeButton = null;

let picker = null;
let pickerMode = 'toggle';
let pickerTargetIds = [];
let pickerAnchorEl = null;
let pickerContextAnchor = null;
let pickerContextChannelId = '';
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

let refreshButton = null;
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
let filterMode = 'all';
let sortMode = 'name';
let selectedChannelIds = new Set();
let resetScrollPending = false;
let selectionAnchorId = '';
let currentPageIds = [];
let cardById = new Map();
let quickAddRetryTimer = 0;
let suppressContextMenu = false;
let suppressContextMenuTimer = 0;
let isCtrlPressed = false;
let lastCtrlDownAt = 0;
let suppressNextClick = false;
let suppressNextClickTimer = 0;

let quickAddObserver = null;
let quickAddPending = false;
let filteredChannelsCache = [];
let cardRowHeight = CARD_ROW_HEIGHT_ESTIMATE;
let cardColumns = 1;
let lastCardRange = null;
let virtualScrollRaf = 0;
let pendingVirtualForce = false;

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
    if (chipbarScrollTarget && chipbarScrollHandler) {
        chipbarScrollTarget.removeEventListener('scroll', chipbarScrollHandler);
    }
    window.removeEventListener('resize', handleVirtualResize);

    overlay = null;
    modal = null;
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
    sortButton = null;
    sidebar = null;
    sidebarList = null;
    sidebarToggleButton = null;
    sidebarAddButton = null;
    sidebarCountEl = null;
    chipbarWheelTarget = null;
    chipbarWheelHandler = null;
    chipbarScrollTarget = null;
    chipbarScrollHandler = null;
    chipbarPrevButton = null;
    chipbarNextButton = null;
    addCategoryButton = null;
    removeCategoryButton = null;
    unsubscribeButton = null;
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
    cardById.clear();
    filteredChannelsCache = [];
    lastCardRange = null;
    cardRowHeight = CARD_ROW_HEIGHT_ESTIMATE;
    cardColumns = 1;
    virtualScrollRaf = 0;
    pendingVirtualForce = false;
    resetSidebarDraftState();
}

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
 * Build open-channel button for picker context menu.
 * @param {object|null} channel
 * @param {string} [emptyLabel]
 * @returns {HTMLButtonElement}
 */
function buildPickerOpenChannelButton(channel, emptyLabel = 'Select one channel to open') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yt-commander-sub-manager-picker-open';
    button.setAttribute('data-action', 'open-channel');
    const icon = createIcon(ICONS.openNewTab);
    icon.classList.add('yt-commander-sub-manager-icon');
    const label = document.createElement('span');
    label.className = 'yt-commander-sub-manager-picker-open-label';
    label.textContent = 'Open channel in new tab';
    button.appendChild(icon);
    button.appendChild(label);

    if (channel) {
        updateOpenChannelButton(button, channel);
        return button;
    }

    button.disabled = true;
    setTooltip(button, emptyLabel);
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

    const assignmentKey = resolveAssignmentKeyForWrite(
        { channelId, handle: identity.handle, url: identity.url },
        channelId
    );
    if (!assignmentKey) {
        if (isQuickAddPage()) {
            setStatus('Select a category to retry channel lookup.', 'info');
            pickerContextChannelId = channelId || '';
            ensurePickerAll();
            openPickerAll(button, 'toggle', []);
            if (quickAddRetryTimer) {
                window.clearTimeout(quickAddRetryTimer);
            }
            quickAddRetryTimer = window.setTimeout(() => {
                quickAddRetryTimer = 0;
                closePickerAll();
            }, 5000);
            return;
        }
        setStatus('Unable to resolve channel for category.', 'error');
        return;
    }

    button.setAttribute('data-channel-key', assignmentKey);
    updateQuickAddButtonState(button, { channelId, handle: identity.handle, url: identity.url });
    pickerContextChannelId = channelId || '';
    ensurePickerAll();
    openPickerAll(button, 'toggle', [assignmentKey]);
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
            const [from, to] =
                startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
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
        const inAnchor =
            (target && pickerAnchorEl && pickerAnchorEl.contains(target)) ||
            (pickerAnchorEl && path.includes(pickerAnchorEl));
        if (!inPicker && !inAnchor) {
            closePickerAll();
        }
    }
}

/**
 * Handle modal button clicks.
 * @param {MouseEvent} event
 */
function handleModalClick(event) {
    if (suppressNextClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    const baseTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const actionTarget = baseTarget?.closest('[data-action]');
    const action = actionTarget?.getAttribute('data-action');
    if (action) {
        if (action === 'close-modal') {
            closeModal();
            return;
        }

        if (action === 'sort-toggle') {
            sortMode = sortMode === 'subscribers' ? 'name' : 'subscribers';
            persistViewState().catch(() => undefined);
            renderList();
            return;
        }

        if (action === 'refresh-subscriptions') {
            loadSubscriptions({ force: true })
                .then(() => {
                    renderList();
                })
                .catch((error) => {
                    setStatus(error?.message || 'Failed to refresh subscriptions', 'error');
                });
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

        if (action === 'chipbar-prev') {
            scrollChipbarBy(-240);
            return;
        }

        if (action === 'chipbar-next') {
            scrollChipbarBy(240);
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

    const card = baseTarget?.closest('.yt-commander-sub-manager-card');
    if (card) {
        const channelId = card.getAttribute('data-channel-id') || '';
        handleChannelSelectionInteraction(channelId, { shiftKey: event.shiftKey });
    }
}

/**
 * Handle ctrl+right-click before the native context menu opens.
 * @param {MouseEvent} event
 */
function handleModalMouseDown(event) {
    const now = Date.now();
    const ctrlActive =
        event.ctrlKey ||
        isCtrlPressed ||
        event.getModifierState?.('Control') === true ||
        (lastCtrlDownAt && now - lastCtrlDownAt < 400);
    if (!ctrlActive || (event.button !== 2 && event.button !== 0)) {
        return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !modal?.contains(target)) {
        return;
    }
    const card = target.closest('.yt-commander-sub-manager-card');
    if (!card) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const channelId = card.getAttribute('data-channel-id') || '';
    if (channelId) {
        const channel = channels.find((item) => item.channelId === channelId);
        const url = resolveChannelUrl(channel);
        openUrlInBackground(url);
    }

    suppressContextMenu = true;
    suppressNextClick = true;
    if (suppressContextMenuTimer) {
        window.clearTimeout(suppressContextMenuTimer);
    }
    suppressContextMenuTimer = window.setTimeout(() => {
        suppressContextMenu = false;
        suppressContextMenuTimer = 0;
    }, 500);
    if (suppressNextClickTimer) {
        window.clearTimeout(suppressNextClickTimer);
    }
    suppressNextClickTimer = window.setTimeout(() => {
        suppressNextClick = false;
        suppressNextClickTimer = 0;
    }, 500);
}

/**
 * Track control key state for contextmenu edge-cases.
 * @param {KeyboardEvent} event
 */
function handleGlobalKeydown(event) {
    if (event.key === 'Control') {
        isCtrlPressed = true;
        lastCtrlDownAt = Date.now();
    }
}

/**
 * Track control key release.
 * @param {KeyboardEvent} event
 */
function handleGlobalKeyup(event) {
    if (event.key === 'Control') {
        isCtrlPressed = false;
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
    if (suppressContextMenu) {
        event.preventDefault();
        event.stopPropagation();
        suppressContextMenu = false;
        if (suppressContextMenuTimer) {
            window.clearTimeout(suppressContextMenuTimer);
            suppressContextMenuTimer = 0;
        }
        return;
    }

    const now = Date.now();
    const ctrlActive =
        event.ctrlKey ||
        isCtrlPressed ||
        event.getModifierState?.('Control') === true ||
        (lastCtrlDownAt && now - lastCtrlDownAt < 400);
    const ctrlCard = ctrlActive ? target.closest('.yt-commander-sub-manager-card') : null;
    if (ctrlCard) {
        event.preventDefault();
        event.stopPropagation();
        const channelId = ctrlCard.getAttribute('data-channel-id') || '';
        if (channelId) {
            const channel = channels.find((item) => item.channelId === channelId);
            const url = resolveChannelUrl(channel);
            openUrlInBackground(url);
        }
        return;
    }
    const card = target.closest('.yt-commander-sub-manager-card');
    if (event.ctrlKey && card) {
        event.preventDefault();
        event.stopPropagation();
        const channelId = card.getAttribute('data-channel-id') || '';
        if (channelId) {
            const channel = channels.find((item) => item.channelId === channelId);
            const url = resolveChannelUrl(channel);
            openUrlInBackground(url);
        }
        return;
    }

    const interactive = target.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-picker'
    );
    if (interactive) {
        return;
    }

    const anchorItem = card;
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
    pickerContextChannelId = channelId;

    const ids = Array.from(selectedChannelIds);
    if (ids.length === 0) {
        return;
    }

    ensurePickerAll();
    const contextAnchor = createPickerContextAnchorAll(event.clientX, event.clientY);
    openPickerAll(contextAnchor, 'move', ids);
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

    return;
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
    const isSidebarInput =
        target instanceof HTMLInputElement &&
        target.classList.contains('yt-commander-sub-manager-sidebar-input');

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
            const identity =
                anchorIdentity &&
                (anchorIdentity.channelId || anchorIdentity.handle || anchorIdentity.url)
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
            closePickerAll();
            return;
        }
        if (pickerMode === 'remove') {
            applyCategoryUpdate(targetIds, categoryId, 'remove').catch(() => undefined);
        } else if (pickerMode === 'add' || pickerMode === 'move') {
            applyCategoryUpdate(targetIds, categoryId, 'add').catch(() => undefined);
        } else {
            applyCategoryUpdate(targetIds, categoryId, 'toggle').catch(() => undefined);
        }
        closePickerAll();
        return;
    }

    const action = baseTarget?.closest('[data-action]')?.getAttribute('data-action');
    if (action === 'open-channel') {
        const url =
            baseTarget?.closest('[data-channel-url]')?.getAttribute('data-channel-url') || '';
        openUrlInBackground(url);
        closePickerAll();
        return;
    }
    if (action === 'picker-new-category') {
        closePickerAll();
        startSidebarCreate();
    }
}

/**
 * Load subscriptions list from main world.
 * @param {boolean | {force?: boolean, background?: boolean}} [options]
 * @returns {Promise<{status: 'skipped' | 'fetched' | 'error'}>}
 */
async function loadSubscriptions(options = {}) {
    const resolved = typeof options === 'boolean' ? { force: options } : options || {};
    const force = Boolean(resolved.force);
    const background = Boolean(resolved.background);
    const now = Date.now();
    const stored = await storageGet([STORAGE_KEYS.SNAPSHOT]);
    const prevSnapshot = stored?.[STORAGE_KEYS.SNAPSHOT];
    const lastSnapshotAt = Number(prevSnapshot?.fetchedAt) || 0;
    const lastCallAt = Math.max(channelsFetchedAt, lastSnapshotAt, lastFetchAttemptAt);

    if (!force && channels.length > 0 && now - lastCallAt < SNAPSHOT_TTL_MS) {
        return { status: 'skipped' };
    }

    const shouldUpdateStatus = !background || overlay?.classList.contains('is-visible');
    lastFetchAttemptAt = now;
    if (shouldUpdateStatus) {
        setStatus(background ? 'Refreshing subscriptions...' : 'Loading subscriptions...', 'info');
    }

    try {
        const response = await bridgeClient.sendRequest(ACTIONS.GET_SUBSCRIPTIONS, {
            limit: 60000,
        });
        const list = Array.isArray(response?.channels) ? response.channels : [];
        list.sort((a, b) =>
            (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        );

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

/**
 * Sort channels based on active mode.
 * @param {Array<object>} list
 * @returns {Array<object>}
 */
function sortChannels(list) {
    if (sortMode === 'subscribers') {
        return sortChannelsBySubscribers(list);
    }
    return sortChannelsByName(list);
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

let filterMenuEl = null;

function closeFilterMenu() {
    if (filterMenuEl && filterMenuEl.isConnected) {
        filterMenuEl.remove();
        filterMenuEl = null;
    }
}

function isSameRange(a, b) {
    if (!a || !b) {
        return false;
    }
    return a.startIndex === b.startIndex && a.endIndex === b.endIndex && a.columns === b.columns;
}

let measuredCardHeight = 0;

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

    cardsWrap.style.display = 'grid';
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
    closePickerAll();
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
    renderList();
    if (!hydrated) {
        setStatus('No cached subscriptions yet. Click refresh to load.', 'info');
    }
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
        cancelLabel: 'Cancel',
    });
    if (!confirmed) {
        return;
    }

    setStatus('Unsubscribing...', 'info');
    const result = await bridgeClient.sendRequest(ACTIONS.UNSUBSCRIBE_CHANNELS, {
        channelIds: ids,
    });
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
        closePickerAll();
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
        positionPickerAll();
    });

    window.addEventListener('message', bridgeClient.handleResponse);
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keydown', handleGlobalKeydown, true);
    window.addEventListener('keyup', handleGlobalKeyup, true);
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
    if (snapshot && Array.isArray(snapshot.channels) && now - fetchedAt < SNAPSHOT_TTL_MS) {
        return snapshot;
    }

    await loadSubscriptions({ force: true, background: true });
    const nextStored = await storageGet([STORAGE_KEYS.SNAPSHOT]);
    return nextStored?.[STORAGE_KEYS.SNAPSHOT] || { channels: [], fetchedAt: Date.now(), hash: '' };
}
