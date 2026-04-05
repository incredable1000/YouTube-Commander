import { createIcon } from './icon-utils.js';
import { ICONS } from './constants.js';

export function buildModalHeader(params) {
    const {
        selectionBadgeEl,
        selectionCountEl,
        clearSelectionButton,
        selectionGroupEl,
        sortButton,
        unsubscribeButton,
        refreshButton,
        setIconButton,
        setTooltip,
    } = params;

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
    setIconButton(clearSelectionButton, ICONS.close, 'Clear selection');
    clearSelectionButton.style.display = 'none';

    selectionGroupEl.className = 'yt-commander-sub-manager-selection-group';
    selectionGroupEl.style.display = 'none';
    selectionGroupEl.appendChild(selectionBadgeEl);
    selectionGroupEl.appendChild(clearSelectionButton);

    const subtitle = document.createElement('div');
    subtitle.className = 'yt-commander-sub-manager-subtitle';
    subtitle.textContent = '';

    titleWrap.appendChild(titleRow);
    titleWrap.appendChild(subtitle);

    const headerActions = document.createElement('div');
    headerActions.className = 'yt-commander-sub-manager-header-actions';

    unsubscribeButton.type = 'button';
    unsubscribeButton.className = 'yt-commander-sub-manager-btn danger';
    unsubscribeButton.setAttribute('data-action', 'unsubscribe-selected');
    setIconButton(unsubscribeButton, ICONS.trash, 'Unsubscribe selected');

    refreshButton.type = 'button';
    refreshButton.className = 'yt-commander-sub-manager-toggle';
    refreshButton.setAttribute('data-action', 'refresh-subscriptions');
    setIconButton(refreshButton, ICONS.refresh, 'Refresh subscriptions');

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

    return header;
}

export function buildSidebar(params) {
    const {
        sidebar,
        sidebarList,
        sidebarAddButton,
        sidebarCountEl,
        sidebarToggleButton,
        chipbarPrevButton,
        chipbarNextButton,
        setIconButton,
        setTooltip,
    } = params;

    sidebar.className = 'yt-commander-sub-manager-chipbar';

    const chipbarLead = document.createElement('div');
    chipbarLead.className = 'yt-commander-sub-manager-chipbar-lead';

    sidebarAddButton.type = 'button';
    sidebarAddButton.className = 'yt-commander-sub-manager-chipbar-btn';
    sidebarAddButton.setAttribute('data-action', 'new-category');
    setIconButton(sidebarAddButton, ICONS.plus, 'Add category');
    setTooltip(sidebarAddButton, 'Add category');

    sidebarCountEl.className = 'yt-commander-sub-manager-chipbar-count';
    sidebarCountEl.textContent = '0';

    chipbarLead.appendChild(sidebarAddButton);
    chipbarLead.appendChild(sidebarCountEl);

    chipbarPrevButton.type = 'button';
    chipbarPrevButton.className = 'yt-commander-sub-manager-chipbar-nav';
    chipbarPrevButton.setAttribute('data-action', 'chipbar-prev');
    setIconButton(chipbarPrevButton, ICONS.prev, 'Scroll categories left');

    sidebarList.className = 'yt-commander-sub-manager-chip-list';

    chipbarNextButton.type = 'button';
    chipbarNextButton.className = 'yt-commander-sub-manager-chipbar-nav';
    chipbarNextButton.setAttribute('data-action', 'chipbar-next');
    setIconButton(chipbarNextButton, ICONS.next, 'Scroll categories right');

    sidebar.appendChild(chipbarLead);
    sidebar.appendChild(chipbarPrevButton);
    sidebar.appendChild(sidebarList);
    sidebar.appendChild(chipbarNextButton);

    return sidebar;
}

export function buildConfirmDialog(params) {
    const { confirmBackdrop, confirmTitleEl, confirmMessageEl } = params;

    confirmBackdrop.className = 'yt-commander-sub-manager-confirm-backdrop';
    confirmBackdrop.setAttribute('aria-hidden', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'yt-commander-sub-manager-confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    confirmTitleEl.className = 'yt-commander-sub-manager-confirm-title';
    confirmTitleEl.textContent = 'Confirm action';

    confirmMessageEl.className = 'yt-commander-sub-manager-confirm-message';

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

    dialog.appendChild(confirmTitleEl);
    dialog.appendChild(confirmMessageEl);
    dialog.appendChild(actions);

    confirmBackdrop.appendChild(dialog);
}

export function createPickerContextAnchor(x, y) {
    const anchor = document.createElement('div');
    anchor.className = 'yt-commander-sub-manager-context-anchor';
    anchor.style.position = 'fixed';
    anchor.style.left = `${Math.max(0, x)}px`;
    anchor.style.top = `${Math.max(0, y)}px`;
    anchor.style.width = '0px';
    anchor.style.height = '0px';
    anchor.style.pointerEvents = 'none';
    anchor.style.zIndex = '2147483647';
    document.body.appendChild(anchor);
    return anchor;
}

export function buildPicker(params) {
    const { picker } = params;

    picker.className = 'yt-commander-sub-manager-picker';
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', 'Category picker');
    picker.style.display = 'none';

    return picker;
}

export function renderPickerItem(params) {
    const { list, options } = params;
    const { id, label, color, isActive, isUncategorized } = options;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yt-commander-sub-manager-picker-item';
    button.setAttribute('data-category-id', id);

    const dot = document.createElement('span');
    dot.className = 'yt-commander-sub-manager-picker-dot';
    dot.style.backgroundColor = color || '#788195';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    button.appendChild(dot);
    button.appendChild(labelEl);

    if (isUncategorized) {
        button.classList.add('is-uncategorized');
    }
    if (isActive) {
        button.classList.add('is-active');
        const check = createIcon(ICONS.check);
        check.classList.add('yt-commander-sub-manager-icon');
        check.classList.add('yt-commander-sub-manager-picker-check');
        button.appendChild(check);
    }

    list.appendChild(button);
    return button;
}
