/**
 * Event handlers module for subscription manager.
 */

export function handleOverlayClick(
    event,
    overlay,
    confirmBackdrop,
    closeConfirmDialog,
    closeModal
) {
    if (event.target === overlay) {
        if (confirmBackdrop?.classList.contains('is-visible')) {
            closeConfirmDialog(false);
            return;
        }
        closeModal();
    }
}

export function handleDocumentClick(event, picker, pickerAnchorEl) {
    const target = event.target instanceof Element ? event.target : null;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

    if (picker && picker.style.display === 'block') {
        const inPicker = (target && picker.contains(target)) || path.includes(picker);
        const inAnchor =
            (target && pickerAnchorEl && pickerAnchorEl.contains(target)) ||
            (pickerAnchorEl && path.includes(pickerAnchorEl));
        if (!inPicker && !inAnchor) {
            picker.style.display = 'none';
        }
    }
}

export function handleModalClick(event, params) {
    const {
        suppressNextClick,
        action,
        baseTarget,
        actionTarget,
        actionType,
        handleModalAction,
        handleChannelCardClick,
    } = params;

    if (suppressNextClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const base = event.target instanceof Element ? event.target : event.target?.parentElement;
    const actionEl = base?.closest('[data-action]');
    const actionName = actionEl?.getAttribute('data-action');

    if (actionName) {
        handleModalAction(event, actionName, base, params);
        return;
    }

    const interactive = base?.closest(
        'button, a, input, select, textarea, .yt-commander-sub-manager-categories, .yt-commander-sub-manager-picker'
    );
    if (interactive) return;

    const card = base?.closest('.yt-commander-sub-manager-card');
    if (card) {
        const channelId = card.getAttribute('data-channel-id') || '';
        handleChannelCardClick(channelId, { shiftKey: event.shiftKey }, params);
    }
}

export function handleModalAction(event, action, base, params) {
    const {
        closeModal,
        sortMode,
        persistViewState,
        renderList,
        loadSubscriptions,
        unsubscribeSelected,
        selectedChannelIds,
        selectionAnchorId,
        startSidebarCreate,
        scrollChipbarBy,
        sidebarCollapsed,
        applySidebarState,
        persistSidebarState,
        filterMode,
        sidebarCreating,
        sidebarEditingId,
        resetSidebarDraftState,
        removeCategory,
        openUrlInBackground,
    } = params;

    switch (action) {
        case 'close-modal':
            closeModal();
            break;
        case 'sort-toggle':
            params.sortMode = params.sortMode === 'subscribers' ? 'name' : 'subscribers';
            persistViewState().catch(() => undefined);
            renderList();
            break;
        case 'refresh-subscriptions':
            loadSubscriptions({ force: true })
                .then(() => renderList())
                .catch((e) =>
                    params.setStatus(e?.message || 'Failed to refresh subscriptions', 'error')
                );
            break;
        case 'unsubscribe-selected':
            unsubscribeSelected().catch((e) =>
                params.setStatus(e?.message || 'Failed to unsubscribe', 'error')
            );
            break;
        case 'clear-selection':
            selectedChannelIds = new Set();
            selectionAnchorId = '';
            renderList();
            break;
        case 'new-category':
            startSidebarCreate();
            break;
        case 'chipbar-prev':
            scrollChipbarBy(-240);
            break;
        case 'chipbar-next':
            scrollChipbarBy(240);
            break;
        case 'sidebar-toggle':
            sidebarCollapsed = !sidebarCollapsed;
            applySidebarState();
            persistSidebarState().catch(() => undefined);
            break;
        case 'category-color':
            break;
        case 'filter-select':
            handleFilterSelect(action, base, params);
            break;
        case 'filter-remove':
            const catId = base?.getAttribute('data-category-id') || '';
            removeCategory(catId).catch(() => undefined);
            break;
        case 'remove-category':
            const channelId = base?.getAttribute('data-channel-id') || '';
            const categoryId = base?.getAttribute('data-category-id') || '';
            if (channelId && categoryId) {
                params
                    .applyCategoryUpdate([channelId], categoryId, 'remove')
                    .catch(() => undefined);
            }
            break;
        case 'open-channel':
            const url = base?.getAttribute('data-channel-url') || '';
            openUrlInBackground(url);
            break;
    }
}

function handleFilterSelect(action, base, params) {
    const {
        filterMode,
        sidebarCreating,
        sidebarEditingId,
        resetSidebarDraftState,
        persistViewState,
        renderList,
        resetScrollPending,
    } = params;

    const nextFilter = base?.getAttribute('data-filter-id') || 'all';
    if (sidebarCreating || sidebarEditingId) {
        resetSidebarDraftState();
    }
    if (filterMode !== nextFilter) {
        params.filterMode = nextFilter;
        params.resetScrollPending = true;
        persistViewState().catch(() => undefined);
        renderList();
    }
}

export function handleChannelCardClick(channelId, options, params) {
    const {
        selectionAnchorId,
        currentPageIds,
        selectedChannelIds,
        applyChannelSelection,
        updateSelectionSummary,
        renderList,
    } = params;

    if (options.shiftKey && selectionAnchorId && currentPageIds.length > 0) {
        const startIndex = currentPageIds.indexOf(selectionAnchorId);
        const endIndex = currentPageIds.indexOf(channelId);
        if (startIndex !== -1 && endIndex !== -1) {
            const [from, to] =
                startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
            const range = currentPageIds.slice(from, to + 1);
            range.forEach((id) => {
                if (!selectedChannelIds.has(id)) {
                    applyChannelSelection(id, true, params);
                }
            });
            updateSelectionSummary(params);
            params.selectionAnchorId = channelId;
            return;
        }
    }
    toggleChannelSelection(channelId, params);
    params.selectionAnchorId = channelId;
}

export function toggleChannelSelection(channelId, params) {
    const { selectedChannelIds, applyChannelSelection, updateSelectionSummary } = params;
    const shouldSelect = !selectedChannelIds.has(channelId);
    applyChannelSelection(channelId, shouldSelect, params);
    updateSelectionSummary(params);
}

export function applyChannelSelection(channelId, shouldSelect, params) {
    const { selectedChannelIds, cardById } = params;
    if (shouldSelect) {
        selectedChannelIds.add(channelId);
    } else {
        selectedChannelIds.delete(channelId);
    }
    const card = cardById.get(channelId);
    if (card) {
        card.classList.toggle('is-selected', shouldSelect);
    }
}

export function handleModalMouseDown(event, params) {
    const {
        isCtrlPressed,
        lastCtrlDownAt,
        modal,
        openUrlInBackground,
        channels,
        resolveChannelUrl,
        suppressContextMenu,
        suppressNextClick,
        suppressContextMenuTimer,
        suppressNextClickTimer,
    } = params;

    const now = Date.now();
    const ctrlActive =
        event.ctrlKey ||
        isCtrlPressed ||
        event.getModifierState?.('Control') === true ||
        (lastCtrlDownAt && now - lastCtrlDownAt < 400);

    if (!ctrlActive || (event.button !== 2 && event.button !== 0)) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target || !modal?.contains(target)) return;

    const card = target.closest('.yt-commander-sub-manager-card');
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();

    const channelId = card.getAttribute('data-channel-id') || '';
    if (channelId) {
        const channel = channels.find((c) => c.channelId === channelId);
        const url = resolveChannelUrl(channel);
        openUrlInBackground(url);
    }

    params.suppressContextMenu = true;
    params.suppressNextClick = true;

    if (suppressContextMenuTimer) window.clearTimeout(suppressContextMenuTimer);
    params.suppressContextMenuTimer = window.setTimeout(() => {
        params.suppressContextMenu = false;
        params.suppressContextMenuTimer = 0;
    }, 500);

    if (suppressNextClickTimer) window.clearTimeout(suppressNextClickTimer);
    params.suppressNextClickTimer = window.setTimeout(() => {
        params.suppressNextClick = false;
        params.suppressNextClickTimer = 0;
    }, 500);
}

export function handleGlobalKeydown(event, params) {
    if (event.key === 'Control') {
        params.isCtrlPressed = true;
        params.lastCtrlDownAt = Date.now();
    }
}

export function handleGlobalKeyup(event, params) {
    if (event.key === 'Control') {
        params.isCtrlPressed = false;
    }
}

export function handleModalContextMenu(event, params) {
    const {
        suppressContextMenu,
        suppressContextMenuTimer,
        modal,
        isCtrlPressed,
        lastCtrlDownAt,
        channels,
        resolveChannelUrl,
        openUrlInBackground,
        selectedChannelIds,
        selectionAnchorId,
        renderList,
        ensurePicker,
        createPickerContextAnchor,
        openPicker,
    } = params;

    const target = event.target instanceof Element ? event.target : null;
    if (!target || !modal?.contains(target)) return;

    if (suppressContextMenu) {
        event.preventDefault();
        event.stopPropagation();
        params.suppressContextMenu = false;
        if (suppressContextMenuTimer) {
            window.clearTimeout(suppressContextMenuTimer);
            params.suppressContextMenuTimer = 0;
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
            const channel = channels.find((c) => c.channelId === channelId);
            const url = resolveChannelUrl(channel);
            openUrlInBackground(url);
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
        const channelId = card.getAttribute('data-channel-id') || '';
        if (channelId) {
            const channel = channels.find((c) => c.channelId === channelId);
            const url = resolveChannelUrl(channel);
            openUrlInBackground(url);
        }
        return;
    }

    const anchorItem = card;
    if (!anchorItem) return;

    const channelId = anchorItem.getAttribute('data-channel-id') || '';
    if (!channelId) return;

    event.preventDefault();
    event.stopPropagation();

    if (!selectedChannelIds.has(channelId) || selectedChannelIds.size <= 1) {
        params.selectedChannelIds = new Set([channelId]);
        params.selectionAnchorId = channelId;
        renderList();
    }
    params.pickerContextChannelId = channelId;

    const ids = Array.from(selectedChannelIds);
    if (ids.length === 0) return;

    ensurePicker(params);
    const contextAnchor = createPickerContextAnchor(event.clientX, event.clientY, params);
    openPicker(contextAnchor, 'move', ids, params);
}

export function handleModalDoubleClick(event, params) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const nameEl = target.closest('.yt-commander-sub-manager-filter-name');
    if (!nameEl) return;

    const categoryId = nameEl.getAttribute('data-category-id') || '';
    if (!categoryId) return;

    event.preventDefault();
    event.stopPropagation();
    params.startSidebarEdit(categoryId);
}

export function handleModalChange(event, params) {
    const target = event.target instanceof Element ? event.target : null;
    const colorInput = target?.closest('input[type="color"][data-action="category-color"]');

    if (colorInput) {
        const mode = colorInput.getAttribute('data-mode') || '';
        if (mode === 'create') {
            params.sidebarDraftColor = colorInput.value;
            return;
        }
        const categoryId = colorInput.getAttribute('data-category-id') || '';
        if (categoryId) {
            params.captureSidebarDraftState();
            params.updateCategoryColor(categoryId, colorInput.value).catch(() => undefined);
        }
    }
}

export function handleModalInput(event, params) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (!target.classList.contains('yt-commander-sub-manager-sidebar-input')) return;

    if (target.getAttribute('data-mode') === 'create') {
        params.sidebarDraftName = target.value;
        return;
    }
    if (params.sidebarEditingId) {
        params.sidebarEditingName = target.value;
    }
}

export function handleModalKeydown(event, params) {
    const target = event.target;
    const isSidebarInput =
        target instanceof HTMLInputElement &&
        target.classList.contains('yt-commander-sub-manager-sidebar-input');

    if (event.key === 'Escape' && (params.sidebarCreating || params.sidebarEditingId)) {
        event.preventDefault();
        event.stopPropagation();
        params.resetSidebarDraftState();
        params.renderSidebarCategories(params);
        return;
    }

    if (!isSidebarInput) return;

    if (event.key === 'Enter') {
        event.preventDefault();
        params.commitSidebarInput(target, 'enter').catch(() => undefined);
    }
}

export function handleKeydown(event, params) {
    const { confirmBackdrop, closeConfirmDialog, picker, closePicker, overlay, closeModal } =
        params;

    if (event.key !== 'Escape') return;

    if (confirmBackdrop?.classList.contains('is-visible')) {
        closeConfirmDialog(false);
        return;
    }
    if (picker && picker.style.display === 'block') {
        closePicker(params);
        return;
    }
    if (overlay?.classList.contains('is-visible')) {
        closeModal();
    }
}
