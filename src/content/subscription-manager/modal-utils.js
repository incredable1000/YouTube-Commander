/**
 * Modal utilities for subscription manager.
 */

import {
    OVERLAY_CLASS,
    MODAL_CLASS,
    CARDS_CLASS,
    STATUS_CLASS,
    MODAL_VERSION,
    ICONS,
} from './constants.js';
import { createIcon } from './icon-utils.js';
import { setTooltip } from './tooltip-utils.js';
import { state } from './state.js';

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
}

export function ensureConfirmDialog() {
    if (state.confirmBackdrop && state.confirmBackdrop.isConnected) return;
    state.confirmBackdrop = document.createElement('div');
    state.confirmBackdrop.className = 'yt-commander-sub-manager-confirm-backdrop';
    state.confirmBackdrop.setAttribute('aria-hidden', 'true');
    const dialog = document.createElement('div');
    dialog.className = 'yt-commander-sub-manager-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    state.confirmTitleEl = document.createElement('div');
    state.confirmTitleEl.className = 'yt-commander-sub-manager-confirm-title';
    state.confirmTitleEl.textContent = 'Confirm action';
    state.confirmMessageEl = document.createElement('div');
    state.confirmMessageEl.className = 'yt-commander-sub-manager-confirm-message';
    const actions = document.createElement('div');
    actions.className = 'yt-commander-sub-manager-confirm-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'yt-commander-sub-manager-btn secondary';
    cancelButton.setAttribute('data-action', 'confirm-cancel');
    cancelButton.textContent = 'Cancel';
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'yt-commander-sub-manager-btn danger';
    confirmButton.setAttribute('data-action', 'confirm-accept');
    confirmButton.textContent = 'Confirm';
    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    dialog.appendChild(state.confirmTitleEl);
    dialog.appendChild(state.confirmMessageEl);
    dialog.appendChild(actions);
    state.confirmBackdrop.appendChild(dialog);
    state.modal.appendChild(state.confirmBackdrop);
    state.confirmBackdrop.addEventListener('click', (event) => {
        if (event.target === state.confirmBackdrop) closeConfirmDialog(false);
    });
    state.confirmBackdrop.addEventListener('click', (event) => {
        const action = event.target?.closest('[data-action]');
        const actionType = action?.getAttribute('data-action');
        if (actionType === 'confirm-accept') closeConfirmDialog(true);
        else if (actionType === 'confirm-cancel') closeConfirmDialog(false);
    });
}

export function showConfirmDialog(options = {}) {
    ensureConfirmDialog();
    if (!state.confirmBackdrop) return Promise.resolve(false);
    const { title, message, confirmLabel, cancelLabel } = options;
    if (state.confirmTitleEl && title) state.confirmTitleEl.textContent = title;
    if (state.confirmMessageEl && message) state.confirmMessageEl.textContent = message;
    const confirmButton = state.confirmBackdrop.querySelector('[data-action="confirm-accept"]');
    const cancelButton = state.confirmBackdrop.querySelector('[data-action="confirm-cancel"]');
    if (confirmButton && confirmLabel) confirmButton.textContent = confirmLabel;
    if (cancelButton && cancelLabel) cancelButton.textContent = cancelLabel;
    state.confirmBackdrop.classList.add('is-visible');
    state.confirmBackdrop.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => {
        state.confirmResolve = resolve;
    });
}

export function closeConfirmDialog(accepted) {
    if (!state.confirmBackdrop) return;
    state.confirmBackdrop.classList.remove('is-visible');
    state.confirmBackdrop.setAttribute('aria-hidden', 'true');
    if (state.confirmResolve) {
        const resolve = state.confirmResolve;
        state.confirmResolve = null;
        resolve(Boolean(accepted));
    }
}

export function ensureTooltipPortal() {
    if (state.tooltipPortal && state.tooltipPortal.isConnected) return;
    state.tooltipPortal = document.createElement('div');
    state.tooltipPortal.className = 'yt-commander-sub-manager-tooltip-portal';
    state.tooltipPortal.setAttribute('role', 'tooltip');
    state.tooltipPortal.setAttribute('aria-hidden', 'true');
    document.body.appendChild(state.tooltipPortal);
    state.modal.addEventListener('mouseover', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const tooltipTarget = target?.closest('.yt-commander-sub-manager-tooltip');
        if (!tooltipTarget || !state.modal?.contains(tooltipTarget)) return;
        const label =
            tooltipTarget.getAttribute('data-tooltip') || tooltipTarget.getAttribute('title') || '';
        if (!label) return;
        state.tooltipPortalTarget = tooltipTarget;
        state.tooltipPortal.textContent = label;
        state.tooltipPortal.setAttribute('data-placement', 'top');
        state.tooltipPortal.setAttribute('aria-hidden', 'false');
        state.tooltipPortal.classList.add('is-visible');
        positionTooltipPortal();
    });
    state.modal.addEventListener('mouseout', (event) => {
        if (!state.tooltipPortalTarget) return;
        const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (
            related &&
            (state.tooltipPortalTarget.contains(related) || state.tooltipPortal.contains(related))
        )
            return;
        hideTooltipPortal();
    });
    state.modal.addEventListener('focusin', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const tooltipTarget = target?.closest('.yt-commander-sub-manager-tooltip');
        if (!tooltipTarget || !state.modal?.contains(tooltipTarget)) return;
        const label =
            tooltipTarget.getAttribute('data-tooltip') || tooltipTarget.getAttribute('title') || '';
        if (!label) return;
        state.tooltipPortalTarget = tooltipTarget;
        state.tooltipPortal.textContent = label;
        state.tooltipPortal.setAttribute('data-placement', 'top');
        state.tooltipPortal.setAttribute('aria-hidden', 'false');
        state.tooltipPortal.classList.add('is-visible');
        positionTooltipPortal();
    });
    state.modal.addEventListener('focusout', (event) => {
        if (!state.tooltipPortalTarget) return;
        const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (
            related &&
            (state.tooltipPortalTarget.contains(related) || state.tooltipPortal.contains(related))
        )
            return;
        hideTooltipPortal();
    });
    window.addEventListener('scroll', () => hideTooltipPortal(), true);
    window.addEventListener('resize', () => hideTooltipPortal());
}

export function positionTooltipPortal() {
    if (!state.tooltipPortal || !state.tooltipPortalTarget) return;
    const rect = state.tooltipPortalTarget.getBoundingClientRect();
    state.tooltipPortal.style.left = '0px';
    state.tooltipPortal.style.top = '0px';
    state.tooltipPortal.style.transform = 'translate(-50%, -100%)';
    const tooltipRect = state.tooltipPortal.getBoundingClientRect();
    const padding = 8;
    let left = rect.left + rect.width / 2;
    let top = rect.top - 10;
    let placement = 'top';
    if (top - tooltipRect.height < padding) {
        top = rect.bottom + 10;
        placement = 'bottom';
        state.tooltipPortal.style.transform = 'translate(-50%, 0)';
    }
    left = Math.max(
        padding + tooltipRect.width / 2,
        Math.min(window.innerWidth - padding - tooltipRect.width / 2, left)
    );
    state.tooltipPortal.style.left = `${left}px`;
    state.tooltipPortal.style.top = `${top}px`;
    state.tooltipPortal.setAttribute('data-placement', placement);
}

export function hideTooltipPortal() {
    if (!state.tooltipPortal) return;
    state.tooltipPortal.classList.remove('is-visible');
    state.tooltipPortal.setAttribute('aria-hidden', 'true');
    state.tooltipPortalTarget = null;
}
