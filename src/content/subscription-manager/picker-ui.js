/**
 * Picker UI module for subscription manager.
 */

import { createIcon } from './icon-utils.js';
import { setTooltip } from './tooltip-utils.js';
import { ICONS, PICKER_CLASS } from './constants.js';

export function ensurePickerElement(picker) {
    picker.className = PICKER_CLASS;
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', 'Category picker');
    picker.style.display = 'none';
    document.body.appendChild(picker);
}

export function renderPickerUI(picker, params) {
    const {
        pickerMode,
        pickerTargetIds,
        pickerContextChannelId,
        categories,
        overlay,
        channels,
        setIconButton,
        updateOpenChannelButton,
        readChannelAssignments,
    } = params;

    picker.innerHTML = '';

    const contextId =
        pickerContextChannelId || (pickerTargetIds.length === 1 ? pickerTargetIds[0] : '');
    const channelForPicker = contextId ? channels.find((c) => c.channelId === contextId) : null;
    const openButton = buildPickerOpenChannelButton(channelForPicker, params);
    const divider = document.createElement('div');
    divider.className = 'yt-commander-sub-manager-picker-divider';

    const title = document.createElement('div');
    title.className = 'yt-commander-sub-manager-picker-title';
    title.textContent = getPickerTitle(pickerMode);

    const list = document.createElement('div');
    list.className = 'yt-commander-sub-manager-picker-list';
    const activeCategoryId = resolvePickerActiveCategoryId(pickerTargetIds, readChannelAssignments);

    addPickerItem(
        list,
        {
            id: 'uncategorized',
            label: 'Uncategorized',
            color: '#7c8698',
            isActive: activeCategoryId === 'uncategorized',
            isUncategorized: true,
            pickerMode,
        },
        params
    );

    if (categories.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-picker-empty';
        empty.textContent = 'No categories yet.';
        list.appendChild(empty);
    } else {
        categories.forEach((category) => {
            addPickerItem(
                list,
                {
                    id: category.id,
                    label: category.name,
                    color: category.color,
                    isActive: activeCategoryId === category.id,
                    isUncategorized: false,
                    pickerMode,
                },
                params
            );
        });
    }

    picker.appendChild(openButton);
    picker.appendChild(divider);
    picker.appendChild(title);
    picker.appendChild(list);

    if (overlay?.classList.contains('is-visible')) {
        const footer = document.createElement('div');
        footer.className = 'yt-commander-sub-manager-picker-footer';
        const newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.className = 'yt-commander-sub-manager-btn secondary';
        newButton.setAttribute('data-action', 'picker-new-category');
        setIconButton(newButton, ICONS.plus, 'New category');
        footer.appendChild(newButton);
        picker.appendChild(footer);
    }
}

function getPickerTitle(pickerMode) {
    switch (pickerMode) {
        case 'remove':
            return 'Remove from category';
        case 'add':
            return 'Add to category';
        case 'move':
            return 'Move to category';
        default:
            return 'Set category';
    }
}

function addPickerItem(list, options, params) {
    const { id, label, color, isActive, isUncategorized, pickerMode } = options;
    const { setIconButton } = params;

    if (pickerMode === 'remove' && id === 'uncategorized') {
        return;
    }

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
}

export function buildPickerOpenChannelButton(
    channel,
    params,
    emptyLabel = 'Select one channel to open'
) {
    const { setTooltip, updateOpenChannelButton } = params;

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

export function resolvePickerActiveCategoryId(pickerTargetIds, readChannelAssignments) {
    if (!Array.isArray(pickerTargetIds) || pickerTargetIds.length === 0) {
        return '';
    }
    const firstAssigned = readChannelAssignments(pickerTargetIds[0]);
    const firstId = firstAssigned[0] || '';
    const allMatch = pickerTargetIds.every((channelId) => {
        const assigned = readChannelAssignments(channelId);
        return (assigned[0] || '') === firstId;
    });
    if (!allMatch) {
        return '';
    }
    return firstId || 'uncategorized';
}

export function createPickerContextAnchorElement(x, y, pickerContextAnchor) {
    if (pickerContextAnchor && pickerContextAnchor.parentNode) {
        pickerContextAnchor.remove();
    }
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

export function positionPickerElement(picker, pickerAnchorEl) {
    if (!picker || !pickerAnchorEl) return;
    if (picker.style.display !== 'block') return;

    const rect = pickerAnchorEl.getBoundingClientRect();
    const list = picker.querySelector('.yt-commander-sub-manager-picker-list');
    if (list) list.style.maxHeight = '';

    const initialPickerRect = picker.getBoundingClientRect();
    const initialListRect = list ? list.getBoundingClientRect() : { height: 0 };
    const padding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const openAbove = spaceAbove > spaceBelow;
    const available = Math.max(openAbove ? spaceAbove : spaceBelow, 0);
    const nonListHeight = Math.max(0, initialPickerRect.height - initialListRect.height);

    if (list) {
        const maxListHeight = Math.max(0, Math.floor(available - nonListHeight));
        list.style.maxHeight = `${maxListHeight}px`;
    }

    const pickerRect = picker.getBoundingClientRect();
    let top = openAbove ? rect.top - pickerRect.height - padding : rect.bottom + padding;
    let left = rect.left;

    if (left + pickerRect.width > window.innerWidth - padding) {
        left = window.innerWidth - pickerRect.width - padding;
    }

    picker.style.top = `${Math.max(padding, top)}px`;
    picker.style.left = `${Math.max(padding, left)}px`;
}
