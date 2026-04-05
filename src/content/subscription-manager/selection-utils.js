/**
 * Selection utilities for subscription manager.
 */

import { state } from './state.js';

export function updateSelectionSummary() {
    const count = state.selectedChannelIds.size;
    if (state.selectionBadgeEl) {
        if (count > 0) {
            if (state.selectionCountEl) state.selectionCountEl.textContent = String(count);
            else state.selectionBadgeEl.textContent = String(count);
            const tooltipLabel = buildSelectionTooltip() || `${count} selected`;
            state.selectionBadgeEl.setAttribute('aria-label', `${count} selected`);
            state.selectionBadgeEl.setAttribute('title', tooltipLabel);
            state.selectionBadgeEl.setAttribute('data-tooltip', tooltipLabel);
            state.selectionBadgeEl.classList.add('yt-commander-sub-manager-tooltip');
            state.selectionBadgeEl.style.display = 'inline-flex';
        } else {
            if (state.selectionCountEl) state.selectionCountEl.textContent = '';
            else state.selectionBadgeEl.textContent = '';
            state.selectionBadgeEl.style.display = 'none';
        }
    }
    if (state.selectedChannelIds.size === 0) state.selectionAnchorId = '';
    const disabled = state.selectedChannelIds.size === 0;
    if (state.unsubscribeButton) state.unsubscribeButton.disabled = disabled;
    if (state.addCategoryButton) state.addCategoryButton.disabled = disabled;
    if (state.clearSelectionButton)
        state.clearSelectionButton.style.display = disabled ? 'none' : 'inline-flex';
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

export function buildSelectionTooltip() {
    if (state.selectedChannelIds.size === 0) return '';
    const nameById = new Map(state.categories.map((c) => [c.id, c.name]));
    const countsById = new Map();
    let uncategorizedCount = 0,
        otherCount = 0;
    state.selectedChannelIds.forEach((channelId) => {
        const assigned = readChannelAssignments(channelId);
        if (!assigned || assigned.length === 0) {
            uncategorizedCount++;
            return;
        }
        assigned.forEach((categoryId) => {
            if (!nameById.has(categoryId)) {
                otherCount++;
                return;
            }
            countsById.set(categoryId, (countsById.get(categoryId) || 0) + 1);
        });
    });
    const lines = [];
    state.categories.forEach((category) => {
        const count = countsById.get(category.id);
        if (count) lines.push(`${category.name}: ${count}`);
    });
    if (uncategorizedCount) lines.push(`Uncategorized: ${uncategorizedCount}`);
    if (otherCount) lines.push(`Other: ${otherCount}`);
    return lines.join('\n');
}

export function updateFloatingHeaderVisibility() {
    const hasSelection = state.selectedChannelIds.size > 0;
    const hasStatus = Boolean(state.statusEl && state.statusEl.textContent);
    if (state.selectionGroupEl)
        state.selectionGroupEl.style.display = hasSelection ? 'inline-flex' : 'none';
    if (state.selectionHeaderEl)
        state.selectionHeaderEl.style.display = hasSelection || hasStatus ? 'flex' : 'none';
}

export function applyChannelSelection(channelId, shouldSelect) {
    if (shouldSelect) state.selectedChannelIds.add(channelId);
    else state.selectedChannelIds.delete(channelId);
    const card = state.cardById.get(channelId);
    if (card) card.classList.toggle('is-selected', shouldSelect);
}

export function toggleChannelSelection(channelId) {
    const shouldSelect = !state.selectedChannelIds.has(channelId);
    applyChannelSelection(channelId, shouldSelect);
    updateSelectionSummary();
}
