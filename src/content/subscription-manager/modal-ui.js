/**
 * Modal UI module for subscription manager.
 */

import { createIcon } from './icon-utils.js';
import { setTooltip } from './tooltip-utils.js';
import {
    ICONS,
    OVERLAY_CLASS,
    MODAL_CLASS,
    CARDS_CLASS,
    STATUS_CLASS,
    MODAL_VERSION,
} from './constants.js';

export function createModalElements(elements, callbacks) {
    const {
        overlay,
        modal,
        sidebar,
        cardsWrap,
        mainWrap,
        selectionHeaderEl,
        floatingStackEl,
        selectionGroupEl,
        selectionBadgeEl,
        selectionCountEl,
        clearSelectionButton,
        sortButton,
        unsubscribeButton,
        refreshButton,
        sidebarAddButton,
        sidebarCountEl,
        sidebarList,
        chipbarPrevButton,
        chipbarNextButton,
        statusEl,
    } = elements;

    overlay.className = OVERLAY_CLASS;
    overlay.dataset.ytcVersion = MODAL_VERSION;

    modal.className = MODAL_CLASS;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Subscription manager');

    const header = document.createElement('div');
    header.className = 'yt-commander-sub-manager-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'yt-commander-sub-manager-title-wrap';

    const titleRow = document.createElement('div');
    titleRow.className = 'yt-commander-sub-manager-title-row';

    const title = document.createElement('div');
    title.className = 'yt-commander-sub-manager-title';
    title.textContent = 'Subscription Manager';
    titleRow.appendChild(title);

    selectionBadgeEl.className = 'yt-commander-sub-manager-selected-badge';
    selectionBadgeEl.setAttribute('aria-live', 'polite');
    selectionBadgeEl.style.display = 'none';
    const selectionIcon = createIcon(ICONS.check);
    selectionIcon.classList.add('yt-commander-sub-manager-icon');
    selectionIcon.classList.add('yt-commander-sub-manager-selected-icon');
    selectionCountEl.className = 'yt-commander-sub-manager-selected-count';
    selectionBadgeEl.appendChild(selectionIcon);
    selectionBadgeEl.appendChild(selectionCountEl);

    clearSelectionButton.type = 'button';
    clearSelectionButton.className = 'yt-commander-sub-manager-clear-selection';
    clearSelectionButton.setAttribute('data-action', 'clear-selection');
    callbacks.setIconButton(clearSelectionButton, ICONS.close, 'Clear selection');
    clearSelectionButton.style.display = 'none';

    selectionGroupEl.className = 'yt-commander-sub-manager-selection-group';
    selectionGroupEl.style.display = 'none';
    selectionGroupEl.appendChild(selectionBadgeEl);
    selectionGroupEl.appendChild(clearSelectionButton);

    const subtitle = document.createElement('div');
    subtitle.className = 'yt-commander-sub-manager-subtitle';

    titleWrap.appendChild(titleRow);
    titleWrap.appendChild(subtitle);

    const headerActions = document.createElement('div');
    headerActions.className = 'yt-commander-sub-manager-header-actions';

    unsubscribeButton.type = 'button';
    unsubscribeButton.className = 'yt-commander-sub-manager-btn danger';
    unsubscribeButton.setAttribute('data-action', 'unsubscribe-selected');
    callbacks.setIconButton(unsubscribeButton, ICONS.trash, 'Unsubscribe selected');

    refreshButton.type = 'button';
    refreshButton.className = 'yt-commander-sub-manager-toggle';
    refreshButton.setAttribute('data-action', 'refresh-subscriptions');
    callbacks.setIconButton(refreshButton, ICONS.refresh, 'Refresh subscriptions');

    sortButton.type = 'button';
    sortButton.className = 'yt-commander-sub-manager-toggle';
    sortButton.setAttribute('data-action', 'sort-toggle');

    const actionGroup = document.createElement('div');
    actionGroup.className = 'yt-commander-sub-manager-action-group';
    actionGroup.appendChild(unsubscribeButton);

    const headerDivider = document.createElement('div');
    headerDivider.className = 'yt-commander-sub-manager-header-divider';

    headerActions.appendChild(refreshButton);
    headerActions.appendChild(sortButton);
    headerActions.appendChild(headerDivider);
    headerActions.appendChild(actionGroup);

    header.appendChild(titleWrap);
    header.appendChild(headerActions);

    sidebar.className = 'yt-commander-sub-manager-chipbar';

    const chipbarLead = document.createElement('div');
    chipbarLead.className = 'yt-commander-sub-manager-chipbar-lead';

    sidebarAddButton.type = 'button';
    sidebarAddButton.className = 'yt-commander-sub-manager-chipbar-btn';
    sidebarAddButton.setAttribute('data-action', 'new-category');
    callbacks.setIconButton(sidebarAddButton, ICONS.plus, 'Add category');
    setTooltip(sidebarAddButton, 'Add category');

    sidebarCountEl.className = 'yt-commander-sub-manager-chipbar-count';
    sidebarCountEl.textContent = '0';

    chipbarLead.appendChild(sidebarAddButton);
    chipbarLead.appendChild(sidebarCountEl);

    chipbarPrevButton.type = 'button';
    chipbarPrevButton.className = 'yt-commander-sub-manager-chipbar-nav';
    chipbarPrevButton.setAttribute('data-action', 'chipbar-prev');
    callbacks.setIconButton(chipbarPrevButton, ICONS.prev, 'Scroll categories left');

    sidebarList.className = 'yt-commander-sub-manager-chip-list';

    chipbarNextButton.type = 'button';
    chipbarNextButton.className = 'yt-commander-sub-manager-chipbar-nav';
    chipbarNextButton.setAttribute('data-action', 'chipbar-next');
    callbacks.setIconButton(chipbarNextButton, ICONS.next, 'Scroll categories right');

    sidebar.appendChild(chipbarLead);
    sidebar.appendChild(chipbarPrevButton);
    sidebar.appendChild(sidebarList);
    sidebar.appendChild(chipbarNextButton);

    cardsWrap.className = CARDS_CLASS;

    mainWrap.className = 'yt-commander-sub-manager-main';
    selectionHeaderEl.className = 'yt-commander-sub-manager-main-header';
    selectionHeaderEl.style.display = 'none';
    floatingStackEl.className = 'yt-commander-sub-manager-float-stack';
    floatingStackEl.appendChild(selectionGroupEl);
    selectionHeaderEl.appendChild(floatingStackEl);
    mainWrap.appendChild(sidebar);
    mainWrap.appendChild(selectionHeaderEl);
    mainWrap.appendChild(cardsWrap);

    const content = document.createElement('div');
    content.className = 'yt-commander-sub-manager-content';
    content.appendChild(mainWrap);

    statusEl.className = STATUS_CLASS;
    statusEl.setAttribute('aria-live', 'polite');
    floatingStackEl.appendChild(statusEl);

    modal.appendChild(header);
    modal.appendChild(content);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return { header, content, subtitle };
}

export function attachModalEvents(modal, mainWrap, callbacks) {
    const {
        overlay,
        handleOverlayClick,
        handleModalClick,
        handleModalMouseDown,
        handleModalContextMenu,
        handleModalDoubleClick,
        handleModalChange,
        handleModalInput,
        handleModalKeydown,
        handleMainScroll,
        handleVirtualResize,
        ensurePicker,
        ensureTooltipPortal,
        ensureConfirmDialog,
        attachChipbarWheelScroll,
        updateChipbarNavButtons,
        updateSortButton,
    } = callbacks;

    overlay.addEventListener('click', handleOverlayClick);
    modal.addEventListener('click', handleModalClick);
    document.addEventListener('mousedown', handleModalMouseDown, true);
    document.addEventListener('contextmenu', handleModalContextMenu, true);
    modal.addEventListener('dblclick', handleModalDoubleClick);
    modal.addEventListener('change', handleModalChange);
    modal.addEventListener('input', handleModalInput);
    modal.addEventListener('keydown', handleModalKeydown);
    mainWrap.addEventListener('scroll', handleMainScroll, { passive: true });
    window.addEventListener('resize', handleVirtualResize);
    window.addEventListener('blur', () => {
        callbacks.isCtrlPressed = false;
    });

    ensurePicker();
    ensureTooltipPortal();
    ensureConfirmDialog();
    attachChipbarWheelScroll();
    updateChipbarNavButtons();
    updateSortButton();
}
