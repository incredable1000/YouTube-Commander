/**
 * Card rendering and virtual scrolling utilities for subscription manager.
 */

import { CARD_MIN_WIDTH, CARD_GAP, VIRTUAL_OVERSCAN } from './constants.js';
import { createVirtualSpacer } from './parse-utils.js';
import { setTooltip } from './tooltip-utils.js';
import { resolveChannelCounts } from './channel-utils.js';
import { state } from './state.js';

export function computeCardRange(totalCount) {
    if (!state.cardsWrap || totalCount === 0)
        return {
            startIndex: 0,
            endIndex: 0,
            columns: 1,
            topSpacerHeight: 0,
            bottomSpacerHeight: 0,
        };
    const containerWidth = state.cardsWrap.clientWidth || 800;
    const columns = Math.max(
        1,
        Math.floor((containerWidth + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP))
    );
    const rowHeight = state.cardRowHeight;
    const viewportHeight = state.mainWrap ? state.mainWrap.clientHeight : 600;
    const scrollTop = state.mainWrap ? state.mainWrap.scrollTop : 0;
    const overscan = VIRTUAL_OVERSCAN;
    const rowsInViewport = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const startIndex = Math.max(0, startRow * columns);
    const endRow = startRow + rowsInViewport;
    const endIndex = Math.min(totalCount, endRow * columns);
    const totalRows = Math.ceil(totalCount / columns);
    const topSpacerHeight = startRow * rowHeight;
    const bottomSpacerHeight = Math.max(0, (totalRows - endRow) * rowHeight);
    return { startIndex, endIndex, columns, topSpacerHeight, bottomSpacerHeight };
}

export function filterChannels() {
    let list = state.channels;
    if (state.filterMode === 'all') list = state.channels;
    else if (state.filterMode === 'uncategorized')
        list = state.channels.filter((c) => readChannelAssignments(c.channelId).length === 0);
    else
        list = state.channels.filter((c) =>
            readChannelAssignments(c.channelId).includes(state.filterMode)
        );
    return list;
}

export function buildCard(channel) {
    const card = document.createElement('div');
    card.className = 'yt-commander-sub-manager-card';
    card.setAttribute('data-channel-id', channel.channelId || '');
    if (state.selectedChannelIds.has(channel.channelId)) card.classList.add('is-selected');
    const media = document.createElement('div');
    media.className = 'yt-commander-sub-manager-card-media';
    const avatar = document.createElement('img');
    avatar.className = 'yt-commander-sub-manager-card-image';
    avatar.alt = channel.title || 'Channel';
    avatar.loading = 'lazy';
    if (channel.avatar) avatar.src = channel.avatar;
    media.appendChild(avatar);
    card.appendChild(media);
    const stats = document.createElement('div');
    stats.className = 'yt-commander-sub-manager-card-stats';
    const name = document.createElement('div');
    name.className = 'yt-commander-sub-manager-name yt-commander-sub-manager-card-name';
    name.setAttribute('data-field', 'name');
    name.textContent = channel.title || 'Untitled channel';
    setTooltip(name, channel.title || 'Untitled channel');
    const counts = resolveChannelCounts(channel);
    const subscribers = document.createElement('div');
    subscribers.className = 'yt-commander-sub-manager-card-metric';
    subscribers.setAttribute('data-field', 'subscribers');
    subscribers.textContent = counts.subscribers;
    const nameRow = document.createElement('div');
    nameRow.className = 'yt-commander-sub-manager-card-title-row';
    nameRow.appendChild(name);
    nameRow.appendChild(subscribers);
    stats.appendChild(nameRow);
    card.appendChild(stats);
    return card;
}

export function renderCards(pageItems, options = {}) {
    if (!state.cardsWrap) return;
    state.cardsWrap.innerHTML = '';
    state.cardById.clear();
    const totalCount = Number.isFinite(options.totalCount) ? options.totalCount : pageItems.length;
    const topSpacerHeight = Number.isFinite(options.topSpacerHeight) ? options.topSpacerHeight : 0;
    const bottomSpacerHeight = Number.isFinite(options.bottomSpacerHeight)
        ? options.bottomSpacerHeight
        : 0;
    if (totalCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'yt-commander-sub-manager-empty';
        empty.textContent = 'No channels found.';
        state.cardsWrap.appendChild(empty);
        return;
    }
    const fragment = document.createDocumentFragment();
    if (topSpacerHeight > 0) fragment.appendChild(createVirtualSpacer(topSpacerHeight));
    pageItems.forEach((channel) => {
        const card = buildCard(channel);
        if (channel.channelId) state.cardById.set(channel.channelId, card);
        fragment.appendChild(card);
    });
    if (bottomSpacerHeight > 0) fragment.appendChild(createVirtualSpacer(bottomSpacerHeight));
    state.cardsWrap.appendChild(fragment);
}

export function measureCardMetrics() {
    if (!state.cardsWrap || !state.cardsWrap.firstChild) return false;
    const firstCard = state.cardsWrap.querySelector('.yt-commander-sub-manager-card');
    if (!firstCard) return false;
    const height = firstCard.offsetHeight;
    if (height > 0 && height !== state.measuredCardHeight) {
        state.cardRowHeight = height + CARD_GAP;
        state.measuredCardHeight = height;
        return true;
    }
    return false;
}

export function renderVirtualizedList(force = false) {
    if (!state.modal) {
        refreshQuickAddButtonsAll();
        return;
    }
    if (force) state.lastCardRange = null;
    const totalCount = state.filteredChannelsCache.length;
    const range = computeCardRange(totalCount);
    if (!force && isSameRange(range, state.lastCardRange)) return;
    state.cardColumns = range.columns || state.cardColumns;
    state.lastCardRange = range;
    const pageItems = state.filteredChannelsCache.slice(range.startIndex, range.endIndex);
    state.currentPageIds = pageItems
        .map((c) => c?.channelId)
        .filter((id) => typeof id === 'string' && id);
    renderCards(pageItems, {
        totalCount,
        topSpacerHeight: range.topSpacerHeight,
        bottomSpacerHeight: range.bottomSpacerHeight,
    });
    if (measureCardMetrics()) queueVirtualRender(true);
}

function isSameRange(a, b) {
    if (!a || !b) return false;
    return a.startIndex === b.startIndex && a.endIndex === b.endIndex && a.columns === b.columns;
}

export function queueVirtualRender(force = false) {
    if (force) state.pendingVirtualForce = true;
    if (state.virtualScrollRaf) return;
    state.virtualScrollRaf = window.requestAnimationFrame(() => {
        state.virtualScrollRaf = 0;
        const shouldForce = state.pendingVirtualForce;
        state.pendingVirtualForce = false;
        renderVirtualizedList(shouldForce);
    });
}

function readChannelAssignments(channelId) {
    if (!channelId) return [];
    if (state.assignmentCache.has(channelId)) return state.assignmentCache.get(channelId);
    const list = state.assignments[channelId];
    const normalized = Array.isArray(list) ? list : [];
    const singleton = normalized.length > 0 ? [normalized[0]] : [];
    state.assignmentCache.set(channelId, singleton);
    return singleton;
}

function refreshQuickAddButtonsAll() {
    const { refreshQuickAddButtons } = require('./quick-add.js');
    refreshQuickAddButtons();
}
