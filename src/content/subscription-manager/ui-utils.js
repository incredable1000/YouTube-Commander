/**
 * General UI utilities for subscription manager.
 */

import { ICONS, BADGE_CLASS, BADGE_REMOVE_CLASS } from './constants.js';
import { createIcon } from './icon-utils.js';
import { setTooltip } from './tooltip-utils.js';
import { resolveChannelUrl } from './data-utils.js';
import { state } from './state.js';

export function setIconButton(button, iconPath, label) {
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

export function updateOpenChannelButton(button, channel) {
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

export function buildPickerOpenChannelButton(channel, emptyLabel = 'Select one channel to open') {
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

export function openUrlInBackground(url, logger) {
    if (!url) {
        return;
    }
    try {
        chrome.runtime.sendMessage({ type: 'OPEN_NEW_TAB', url });
    } catch (error) {
        if (logger) {
            logger.warn('Failed to open tab', error);
        }
    }
}

export function buildCategoryBadges(channelId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'yt-commander-sub-manager-categories';
    const assigned = state.assignments[channelId] || [];
    assigned.forEach((categoryId) => {
        const category = state.categories.find((item) => item.id === categoryId);
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

export function resetModalElements() {
    const existingOverlay = document.querySelector('.yt-commander-sub-manager-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    const strayFilterMenu = document.querySelector('.yt-commander-sub-manager-filter-menu');
    if (strayFilterMenu) {
        strayFilterMenu.remove();
    }
    if (state.picker && state.picker.isConnected) {
        state.picker.remove();
    }
    const strayPicker = document.querySelector('.yt-commander-sub-manager-picker');
    if (strayPicker) {
        strayPicker.remove();
    }
    if (state.tooltipPortal && state.tooltipPortal.isConnected) {
        state.tooltipPortal.remove();
    }
    state.overlay = null;
    state.modal = null;
    state.cardsWrap = null;
    state.mainWrap = null;
    state.statusEl = null;
    state.selectionBadgeEl = null;
    state.clearSelectionButton = null;
    state.selectionGroupEl = null;
    state.selectionHeaderEl = null;
    state.selectionCountEl = null;
    state.floatingStackEl = null;
    state.sortButton = null;
    state.sidebar = null;
    state.sidebarList = null;
    state.sidebarToggleButton = null;
    state.sidebarAddButton = null;
    state.sidebarCountEl = null;
    state.chipbarPrevButton = null;
    state.chipbarNextButton = null;
    state.addCategoryButton = null;
    state.removeCategoryButton = null;
    state.unsubscribeButton = null;
    state.picker = null;
    state.pickerAnchorEl = null;
    state.pickerTargetIds = [];
    state.pickerMode = 'toggle';
    state.confirmBackdrop = null;
    state.confirmTitleEl = null;
    state.confirmMessageEl = null;
    state.confirmResolve = null;
    state.tooltipPortal = null;
    state.tooltipPortalTarget = null;
    state.resetScrollPending = false;
    state.selectionAnchorId = '';
    state.currentPageIds = [];
    state.cardById.clear();
    state.filteredChannelsCache = [];
    state.lastCardRange = null;
    state.cardRowHeight = 312;
    state.cardColumns = 1;
    state.virtualScrollRaf = 0;
    state.pendingVirtualForce = false;
}

export function isSameRange(a, b) {
    if (!a || !b) {
        return false;
    }
    return a.startIndex === b.startIndex && a.endIndex === b.endIndex && a.columns === b.columns;
}

let filterMenuEl = null;

export function closeFilterMenu() {
    if (filterMenuEl && filterMenuEl.isConnected) {
        filterMenuEl.remove();
        filterMenuEl = null;
    }
}

export function updateCard(card, channel) {
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
    const subscribers = card.querySelector('[data-field="subscribers"]');
    if (subscribers) {
        const { resolveChannelCounts } = require('./channel-utils.js');
        const counts = resolveChannelCounts(channel);
        subscribers.textContent = counts.subscribers;
    }
}
