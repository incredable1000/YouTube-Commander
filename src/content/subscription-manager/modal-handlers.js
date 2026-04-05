/**
 * Modal event handlers.
 */

import { state } from './state.js';
import { resolveChannelUrl } from './data-utils.js';
import { setStatus } from './status-utils.js';
import { closeConfirmDialog } from './modal-utils.js';
import {
    ensurePickerAll,
    openPickerAll,
    closePickerAll,
    createPickerContextAnchorAll,
} from './picker-utils.js';
import {
    resetSidebarDraftState,
    commitSidebarInput,
    updateCategoryColor,
} from './sidebar-utils.js';
import { updateChipbarNavButtons } from './sidebar-ui.js';
import { startSidebarEdit } from './sidebar-utils.js';
import { generateRandomCategoryColor } from './data-utils.js';
import { toggleChannelSelection } from './selection-utils.js';
import { filterChannels } from './card-utils.js';
import {
    openPickerAll as openPickerAllFn,
    closePickerAll as closePickerAllFn,
} from './picker-utils.js';

export function handleOverlayClick(event) {
    if (event.target === state.overlay) {
        if (state.confirmBackdrop?.classList.contains('is-visible')) {
            closeConfirmDialog(false);
            return;
        }
        window.ytcCloseModal?.();
    }
}

export function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null,
        path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (state.picker && state.picker.style.display === 'block') {
        const inPicker = (target && state.picker.contains(target)) || path.includes(state.picker),
            inAnchor =
                (target && state.pickerAnchorEl && state.pickerAnchorEl.contains(target)) ||
                (state.pickerAnchorEl && path.includes(state.pickerAnchorEl));
        if (!inPicker && !inAnchor) closePickerAll();
    }
}

export function handleModalClick(event) {
    if (state.suppressNextClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    const base = event.target instanceof Element ? event.target : event.target?.parentElement,
        actionEl = base?.closest('[data-action]'),
        action = actionEl?.getAttribute('data-action');
    if (action) {
        handleModalAction(action, base);
        return;
    }
    const interactive = base?.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-picker'
    );
    if (interactive) return;
    const card = base?.closest('.yt-commander-sub-manager-card');
    if (card) {
        const channelId = card.getAttribute('data-channel-id') || '';
        handleChannelCardClick(channelId, { shiftKey: event.shiftKey });
    }
}

export function handleModalAction(action, base) {
    switch (action) {
        case 'close-modal':
            window.ytcCloseModal?.();
            break;
        case 'sort-toggle':
            state.sortMode = state.sortMode === 'subscribers' ? 'name' : 'subscribers';
            window.ytcPersistViewState?.();
            window.ytcRenderListAll?.();
            break;
        case 'refresh-subscriptions':
            window
                .ytcLoadSubscriptions?.({ force: true })
                .then(() => window.ytcRenderListAll?.())
                .catch((e) => setStatus(e?.message || 'Failed', 'error'));
            break;
        case 'unsubscribe-selected':
            window
                .ytcUnsubscribeSelected?.()
                .catch((e) => setStatus(e?.message || 'Failed', 'error'));
            break;
        case 'clear-selection':
            state.selectedChannelIds = new Set();
            state.selectionAnchorId = '';
            window.ytcRenderListAll?.();
            break;
        case 'new-category':
            window.ytcStartSidebarCreate?.(generateRandomCategoryColor);
            break;
        case 'chipbar-prev':
            window.ytcScrollChipbarBy?.(-240);
            break;
        case 'chipbar-next':
            window.ytcScrollChipbarBy?.(240);
            break;
        case 'sidebar-toggle':
            state.sidebarCollapsed = !state.sidebarCollapsed;
            window.ytcApplySidebarState?.();
            window.ytcPersistSidebarState?.();
            break;
        case 'filter-select':
            handleFilterSelect(base?.getAttribute('data-filter-id') || 'all');
            break;
        case 'filter-remove':
            const catId = base?.getAttribute('data-category-id') || '';
            window.ytcRemoveCategory?.(catId).catch(() => {});
            break;
        case 'remove-category':
            const channelId = base?.getAttribute('data-channel-id') || '';
            const catId2 = base?.getAttribute('data-category-id') || '';
            if (channelId && catId2) window.ytcApplyCategoryUpdate?.([channelId], catId2, 'remove');
            break;
        case 'open-channel':
            window.ytcOpenUrl?.(base?.getAttribute('data-channel-url') || '');
            break;
    }
}

export function handleFilterSelect(nextFilter) {
    if (state.sidebarCreating || state.sidebarEditingId) resetSidebarDraftState();
    if (state.filterMode !== nextFilter) {
        state.filterMode = nextFilter;
        state.resetScrollPending = true;
        window.ytcPersistViewState?.();
        window.ytcRenderListAll?.();
    }
}

export function handleChannelCardClick(channelId, options) {
    if (options.shiftKey && state.selectionAnchorId && state.currentPageIds.length > 0) {
        const startIndex = state.currentPageIds.indexOf(state.selectionAnchorId),
            endIndex = state.currentPageIds.indexOf(channelId);
        if (startIndex !== -1 && endIndex !== -1) {
            const [from, to] =
                startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
            state.currentPageIds.slice(from, to + 1).forEach((id) => {
                if (!state.selectedChannelIds.has(id)) window.ytcApplyChannelSelection?.(id, true);
            });
            window.ytcUpdateSelectionSummary?.();
            state.selectionAnchorId = channelId;
            return;
        }
    }
    toggleChannelSelection(channelId);
    state.selectionAnchorId = channelId;
}

export function handleModalMouseDown(event) {
    const now = Date.now(),
        ctrlActive =
            event.ctrlKey ||
            state.isCtrlPressed ||
            event.getModifierState?.('Control') === true ||
            (state.lastCtrlDownAt && now - state.lastCtrlDownAt < 400);
    if (!ctrlActive || (event.button !== 2 && event.button !== 0)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !state.modal?.contains(target)) return;
    const card = target.closest('.yt-commander-sub-manager-card');
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const chId = card.getAttribute('data-channel-id') || '';
    if (chId) {
        const channel = state.channels.find((c) => c.channelId === chId);
        window.ytcOpenUrl?.(resolveChannelUrl(channel));
    }
    state.suppressContextMenu = true;
    state.suppressNextClick = true;
    if (state.suppressContextMenuTimer) window.clearTimeout(state.suppressContextMenuTimer);
    state.suppressContextMenuTimer = window.setTimeout(() => {
        state.suppressContextMenu = false;
        state.suppressContextMenuTimer = 0;
    }, 500);
    if (state.suppressNextClickTimer) window.clearTimeout(state.suppressNextClickTimer);
    state.suppressNextClickTimer = window.setTimeout(() => {
        state.suppressNextClick = false;
        state.suppressNextClickTimer = 0;
    }, 500);
}

export function handleGlobalKeydown(event) {
    if (event.key === 'Control') {
        state.isCtrlPressed = true;
        state.lastCtrlDownAt = Date.now();
    }
}

export function handleGlobalKeyup(event) {
    if (event.key === 'Control') state.isCtrlPressed = false;
}

export function handleModalContextMenu(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !state.modal?.contains(target)) return;
    if (state.suppressContextMenu) {
        event.preventDefault();
        event.stopPropagation();
        state.suppressContextMenu = false;
        if (state.suppressContextMenuTimer) {
            window.clearTimeout(state.suppressContextMenuTimer);
            state.suppressContextMenuTimer = 0;
        }
        return;
    }
    const now = Date.now(),
        ctrlActive =
            event.ctrlKey ||
            state.isCtrlPressed ||
            event.getModifierState?.('Control') === true ||
            (state.lastCtrlDownAt && now - state.lastCtrlDownAt < 400);
    const ctrlCard = ctrlActive ? target.closest('.yt-commander-sub-manager-card') : null;
    if (ctrlCard) {
        event.preventDefault();
        event.stopPropagation();
        const chId = ctrlCard.getAttribute('data-channel-id') || '';
        if (chId) {
            const channel = state.channels.find((c) => c.channelId === chId);
            window.ytcOpenUrl?.(resolveChannelUrl(channel));
        }
        return;
    }
    const interactive = target.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-picker'
    );
    if (interactive) return;
    const card = target.closest('.yt-commander-sub-manager-card');
    if (event.ctrlKey && card) {
        event.preventDefault();
        event.stopPropagation();
        const chId = card.getAttribute('data-channel-id') || '';
        if (chId) {
            const channel = state.channels.find((c) => c.channelId === chId);
            window.ytcOpenUrl?.(resolveChannelUrl(channel));
        }
        return;
    }
    if (!card) return;
    const chId = card.getAttribute('data-channel-id') || '';
    if (!chId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!state.selectedChannelIds.has(chId) || state.selectedChannelIds.size <= 1) {
        state.selectedChannelIds = new Set([chId]);
        state.selectionAnchorId = chId;
        window.ytcRenderListAll?.();
    }
    state.pickerContextChannelId = chId;
    const ids = Array.from(state.selectedChannelIds);
    if (ids.length === 0) return;
    ensurePickerAll();
    createPickerContextAnchorAll(event.clientX, event.clientY);
    openPickerAll(state.pickerContextAnchor, 'move', ids);
}

export function handleModalDoubleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const nameEl = target.closest('.yt-commander-sub-manager-filter-name');
    if (!nameEl) return;
    const categoryId = nameEl.getAttribute('data-category-id') || '';
    if (!categoryId) return;
    event.preventDefault();
    event.stopPropagation();
    startSidebarEdit(categoryId);
}

export function handleModalChange(event) {
    const target = event.target instanceof Element ? event.target : null,
        colorInput = target?.closest('input[type="color"][data-action="category-color"]');
    if (colorInput) {
        const mode = colorInput.getAttribute('data-mode') || '';
        if (mode === 'create') {
            state.sidebarDraftColor = colorInput.value;
            return;
        }
        const categoryId = colorInput.getAttribute('data-category-id') || '';
        if (categoryId) {
            window.ytcCaptureSidebarDraftState?.();
            updateCategoryColor(categoryId, colorInput.value);
        }
    }
}

export function handleModalInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.classList.contains('yt-commander-sub-manager-sidebar-input')) return;
    if (target.getAttribute('data-mode') === 'create') {
        state.sidebarDraftName = target.value;
        return;
    }
    if (state.sidebarEditingId) state.sidebarEditingName = target.value;
}

export function handleModalKeydown(event) {
    const target = event.target,
        isSidebarInput =
            target instanceof HTMLInputElement &&
            target.classList.contains('yt-commander-sub-manager-sidebar-input');
    if (event.key === 'Escape' && (state.sidebarCreating || state.sidebarEditingId)) {
        event.preventDefault();
        event.stopPropagation();
        resetSidebarDraftState();
        window.ytcRenderSidebarCategories?.();
        return;
    }
    if (!isSidebarInput) return;
    if (event.key === 'Enter') {
        event.preventDefault();
        commitSidebarInput(target, 'enter');
    }
}

export function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    if (state.confirmBackdrop?.classList.contains('is-visible')) {
        closeConfirmDialog(false);
        return;
    }
    if (state.picker && state.picker.style.display === 'block') {
        closePickerAll();
        return;
    }
    if (state.overlay?.classList.contains('is-visible')) window.ytcCloseModal?.();
}
